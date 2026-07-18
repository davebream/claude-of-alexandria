import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { expandParsing } from '../db/parsing.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange, type VerseRange } from './utils.js';

export const MorphologyInputSchema = {
  book: z.string().describe('Book name (any common form, e.g., "John", "Gen", "Hebrews")'),
  range: z.string().describe('Verse range: "1:1-1:11" (multi-verse) or "1:6" (single verse). Format: chapter:verse-chapter:verse'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
  pos_filter: z.string().optional().describe('Filter by part of speech (e.g., "verb", "noun", "adjective", "preposition")'),
  word_filter: z.string().optional().describe('Filter by exact word form — matches against text, normalized form, or lemma'),
  fields: z.enum(['basic', 'syntax', 'full', 'lexical']).optional()
    .describe(
      'Level of detail: "basic" (default) = text, normalized, lemma, pos, parsing; '
      + '"syntax" adds clause_id, clause_type, strongs; '
      + '"full" = all available fields; '
      + '"lexical" = text, lemma, strongs, gloss (compact word-study set)'
    ),
  strongs_filter: z.string().optional().describe(
    "Filter words by Strong's number within the verse range (e.g., 'H7225a' for OT, 'G2316' for NT)"
  ),
};

export type MorphologyInput = z.output<z.ZodObject<typeof MorphologyInputSchema>>;

export const MorphologyWordEntry = z.object({
  verse: z.string(),
  position: z.number(),
  text: z.string(),
  normalized: z.string().nullable().optional(),
  lemma: z.string().optional(),
  pos: z.string().optional(),
  parsing: z.record(z.string(), z.string()).nullable().optional(),
  // Present when fields='syntax' or 'full' — omitted otherwise
  clause_id: z.string().nullable().optional(),
  clause_type: z.string().nullable().optional(),
  strongs: z.string().nullable().optional(),
  // Present when fields='full' — omitted otherwise
  gloss: z.string().nullable().optional(),
  semantic_frame: z.string().nullable().optional(),
  subject_ref: z.string().nullable().optional(),
  participant_ref: z.string().nullable().optional(),
  // NT-specific (OpenGNT) — present when fields='full' for NT passages
  gloss_tbesg: z.string().nullable().optional(),
  louw_nida: z.string().nullable().optional(),
  louw_nida_domain: z.string().nullable().optional(),
  // SBL transliteration siblings — present-and-null when unpopulated, never omitted (AC-10).
  // text_translit: all levels. lemma_translit: syntax/full/lexical only (absent at basic — no join).
  text_translit: z.string().nullable().optional(),
  lemma_translit: z.string().nullable().optional().describe(
    "Transliteration of the lemma. Hebrew (OT): derived — deterministic SBL "
    + "rendering of the pointed lemma, keyed by the pointed lemma itself "
    + "(decisions/0007). Greek (NT): source-read from OpenGNT. "
    + "May be null: for OT when the lemma is unpointed (a consonantal skeleton "
    + "with no niqqud), which cannot be rendered without guessing; for NT when the "
    + "lexicon has no match. (Absent — not null — at fields='basic', which performs "
    + "no lexicon join.) Null is a defined honest boundary, not an error, and does "
    + "not mean the word is absent from the text."
  ),
});

export const MorphologyOutputSchema = {
  book: z.string(),
  range: z.string(),
  testament: z.string(),
  words: z.array(MorphologyWordEntry),
  summary: z.object({
    total_words: z.number(),
    by_pos: z.record(z.string(), z.number()),
  }),
};

// ─── Column selection by fields level ─────────────────────────────────────────
// All columns are qualified with `m.` — the table is aliased below because the
// joined lemma_translit source shares column names with morphology, and an
// unqualified reference would be ambiguous under the join. Both join targets are
// aliased `lx`: NT joins lexicon_lsj (shares transliteration, gloss); OT joins
// lemma_translit_he (shares lemma, transliteration).
//
// text_translit (m.transliteration) is basic-level — it needs no join, since it
// lives on morphology itself. lemma_translit (lx.transliteration) is a syntax+
// field, so it is only selected — and only joined — at syntax/full/lexical. Its
// source is testament-conditional (see the lexiconJoin construction below):
// NT reads it from lexicon_lsj by Strong's number; OT reads the derived Hebrew
// rendering from lemma_translit_he by the pointed lemma.
const BASIC_COLS = 'm.chapter, m.verse, m.word_position, m.text, m.normalized, m.lemma, m.pos, m.parsing, m.transliteration AS text_translit';
const SYNTAX_COLS = `${BASIC_COLS}, m.clause_id, m.clause_type, m.strongs, lx.transliteration AS lemma_translit`;
const FULL_COLS = `${SYNTAX_COLS}, m.gloss, m.semantic_frame, m.subject_ref, m.participant_ref, m.gloss_tbesg, m.louw_nida, m.louw_nida_domain`;
const LEXICAL_COLS = 'm.chapter, m.verse, m.word_position, m.text, m.lemma, m.strongs, m.gloss, m.louw_nida, m.transliteration AS text_translit, lx.transliteration AS lemma_translit';

function selectColumns(fields: string | undefined): string {
  switch (fields) {
    case 'full': return FULL_COLS;
    case 'syntax': return SYNTAX_COLS;
    case 'lexical': return LEXICAL_COLS;
    default: return BASIC_COLS;
  }
}

// lemma_translit requires a lexicon join at syntax/full/lexical. Which table is
// joined is testament-conditional (see lexiconJoin below): lexicon_lsj for NT,
// lemma_translit_he for OT. This predicate governs only *whether* to join.
// NB: this predicate deliberately does NOT reuse `includesSyntax` further down
// (fields === 'syntax' || fields === 'full') — that predicate excludes 'lexical',
// and lemma_translit must reach 'lexical' too.
function needsLexiconJoin(fields: string | undefined): boolean {
  return fields === 'syntax' || fields === 'full' || fields === 'lexical';
}

const DEFAULT_MORPHOLOGY_LIMIT = 5000;
const CHARACTER_LIMIT = 25_000;

export async function queryMorphology(args: MorphologyInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }

  const rangeInput = args.range;
  const verseRange = parseVerseRange(rangeInput);
  if ('error' in verseRange) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
      isError: true,
    };
  }

  // Validate strongs_filter requires range
  if (args.strongs_filter && !args.range) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'INVALID_FILTER', message: 'strongs_filter requires a range parameter.' }
      }) }],
      isError: true,
    };
  }

  const testament = args.testament ?? bookInfo.testament;
  const posFilter = args.pos_filter;
  const wordFilter = args.word_filter;
  const fields = args.fields;
  const columns = selectColumns(fields);
  const lexiconJoin = needsLexiconJoin(fields)
    ? (testament === 'ot'
        ? 'LEFT JOIN lemma_translit_he lx ON m.lemma = lx.lemma'
        : 'LEFT JOIN lexicon_lsj lx ON m.strongs = lx.strongs_id')
    : '';

  let sql = `
    SELECT ${columns}
    FROM morphology m
    ${lexiconJoin}
    WHERE m.book = ? AND m.testament = ?
    AND (m.chapter > ? OR (m.chapter = ? AND m.verse >= ?))
    AND (m.chapter < ? OR (m.chapter = ? AND m.verse <= ?))
  `;
  const params: unknown[] = [
    bookInfo.canonical, testament,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  if (posFilter) {
    sql += ' AND m.pos = ?';
    params.push(posFilter);
  }

  if (wordFilter) {
    sql += ' AND (m.text = ? OR m.normalized = ? OR m.lemma = ?)';
    params.push(wordFilter, wordFilter, wordFilter);
  }

  if (args.strongs_filter) {
    // Normalize Strong's number: H430 → H0430, G316 → G0316 (4-digit zero-padded)
    const match = args.strongs_filter.match(/^([HG])0*(\d+)([a-z]?)$/);
    if (match) {
      const normalized = `${match[1]}${match[2].padStart(4, '0')}${match[3]}`;
      sql += ' AND m.strongs = ?';
      params.push(normalized);
    } else {
      sql += ' AND m.strongs = ?';
      params.push(args.strongs_filter);
    }
  }

  sql += ' ORDER BY m.chapter, m.verse, m.word_position LIMIT ?';
  params.push(DEFAULT_MORPHOLOGY_LIMIT);

  const rows = await query(sql, params);

  const isLexical = fields === 'lexical';
  const includesSyntax = fields === 'syntax' || fields === 'full';
  const includesFull = fields === 'full';

  const words = rows.map(r => {
    const word: Record<string, unknown> = {
      verse: `${r.chapter}:${r.verse}`,
      position: r.word_position as number,
      text: r.text as string,
    };

    // SBL transliteration siblings — present-and-null uniformly whenever the
    // column is selected, never omitted (AC-10). text_translit is selected at
    // every level; lemma_translit only at syntax/full/lexical (needsLexiconJoin).
    // This deliberately diverges from the omit-when-null convention used below
    // for the pre-existing syntax/full enrichment fields — do not "fix" it back.
    word.text_translit = r.text_translit as string | null;

    if (isLexical) {
      // Lexical: text, lemma, strongs, gloss, louw_nida
      word.lemma = r.lemma as string;
      word.strongs = r.strongs as string | null;
      word.gloss = r.gloss as string | null;
      if (r.louw_nida != null) word.louw_nida = r.louw_nida as string;
      word.lemma_translit = r.lemma_translit as string | null;
    } else {
      // Basic fields always present
      word.normalized = r.normalized as string | null;
      word.lemma = r.lemma as string;
      word.pos = r.pos as string;
      word.parsing = expandParsing(r.parsing as string | null);

      // Syntax fields — include only if value is non-null (omit null-only enrichment)
      if (includesSyntax) {
        if (r.clause_id != null) word.clause_id = r.clause_id as string;
        if (r.clause_type != null) word.clause_type = r.clause_type as string;
        if (r.strongs != null) word.strongs = r.strongs as string;
        word.lemma_translit = r.lemma_translit as string | null;
      }

      // Full fields — include only if value is non-null
      if (includesFull) {
        if (r.gloss != null) word.gloss = r.gloss as string;
        if (r.semantic_frame != null) word.semantic_frame = r.semantic_frame as string;
        if (r.subject_ref != null) word.subject_ref = r.subject_ref as string;
        if (r.participant_ref != null) word.participant_ref = r.participant_ref as string;
        // NT-specific enrichment (OpenGNT)
        if (r.gloss_tbesg != null) word.gloss_tbesg = r.gloss_tbesg as string;
        if (r.louw_nida != null) word.louw_nida = r.louw_nida as string;
        if (r.louw_nida_domain != null) word.louw_nida_domain = r.louw_nida_domain as string;
      }
    }

    return word;
  });

  const byPos: Record<string, number> = {};
  for (const w of words) {
    const pos = (w.pos as string) ?? 'unknown';
    byPos[pos] = (byPos[pos] ?? 0) + 1;
  }

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    range: rangeInput,
    testament,
    words,
    summary: { total_words: words.length, by_pos: byPos },
  };

  // Scholarly provenance for NT enrichment fields
  if (testament === 'nt' && (includesFull || isLexical)) {
    result.note = 'NT morphology uses OGNT v3 (compiled eclectic text, not an independent critical edition). '
      + 'Louw-Nida domain labels are classification tags, not full semantic analyses (see published UBS lexicon). '
      + 'OGNT glosses are single-scholar translations (Eliran Wong) — treat as Tier 3, not Tier 1-2 evidence.';
  }

  // CHARACTER_LIMIT guard — truncate words if response too large
  let json = JSON.stringify(result);
  if (json.length > CHARACTER_LIMIT && words.length > 1) {
    const truncatedWords = [];
    let approxSize = json.length - JSON.stringify(words).length + 100; // overhead
    for (const w of words) {
      const wordJson = JSON.stringify(w);
      if (approxSize + wordJson.length + 1 > CHARACTER_LIMIT) break;
      approxSize += wordJson.length + 1;
      truncatedWords.push(w);
    }
    result.words = truncatedWords;
    (result.summary as Record<string, unknown>).truncated = true;
    (result.summary as Record<string, unknown>).returned_words = truncatedWords.length;
    json = JSON.stringify(result);
  }

  return {
    content: [{ type: 'text', text: json }],
    structuredContent: result,
  };
}
