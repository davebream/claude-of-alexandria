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

export const MorphologyOutputSchema = {
  book: z.string(),
  range: z.string(),
  testament: z.string(),
  words: z.array(z.object({
    verse: z.string(),
    position: z.number(),
    text: z.string(),
    normalized: z.string().nullable(),
    lemma: z.string(),
    pos: z.string(),
    parsing: z.record(z.string(), z.string()).nullable(),
    // Present when fields='syntax' or 'full' — omitted otherwise
    clause_id: z.string().nullable().optional(),
    clause_type: z.string().nullable().optional(),
    strongs: z.string().nullable().optional(),
    // Present when fields='full' — omitted otherwise
    gloss: z.string().nullable().optional(),
    semantic_frame: z.string().nullable().optional(),
    subject_ref: z.string().nullable().optional(),
    participant_ref: z.string().nullable().optional(),
  })),
  summary: z.object({
    total_words: z.number(),
    by_pos: z.record(z.string(), z.number()),
  }),
};

// ─── Column selection by fields level ─────────────────────────────────────────
const BASIC_COLS = 'chapter, verse, word_position, text, normalized, lemma, pos, parsing';
const SYNTAX_COLS = `${BASIC_COLS}, clause_id, clause_type, strongs`;
const FULL_COLS = `${SYNTAX_COLS}, gloss, semantic_frame, subject_ref, participant_ref`;
const LEXICAL_COLS = 'chapter, verse, word_position, text, lemma, strongs, gloss';

function selectColumns(fields: string | undefined): string {
  switch (fields) {
    case 'full': return FULL_COLS;
    case 'syntax': return SYNTAX_COLS;
    case 'lexical': return LEXICAL_COLS;
    default: return BASIC_COLS;
  }
}

const DEFAULT_MORPHOLOGY_LIMIT = 5000;

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

  let sql = `
    SELECT ${columns}
    FROM morphology
    WHERE book = ? AND testament = ?
    AND (chapter > ? OR (chapter = ? AND verse >= ?))
    AND (chapter < ? OR (chapter = ? AND verse <= ?))
  `;
  const params: unknown[] = [
    bookInfo.canonical, testament,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  if (posFilter) {
    sql += ' AND pos = ?';
    params.push(posFilter);
  }

  if (wordFilter) {
    sql += ' AND (text = ? OR normalized = ? OR lemma = ?)';
    params.push(wordFilter, wordFilter, wordFilter);
  }

  if (args.strongs_filter) {
    sql += ' AND strongs = ?';
    params.push(args.strongs_filter);
  }

  sql += ' ORDER BY chapter, verse, word_position LIMIT ?';
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

    if (isLexical) {
      // Lexical: text, lemma, strongs, gloss only
      word.lemma = r.lemma as string;
      word.strongs = r.strongs as string | null;
      word.gloss = r.gloss as string | null;
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
      }

      // Full fields — include only if value is non-null
      if (includesFull) {
        if (r.gloss != null) word.gloss = r.gloss as string;
        if (r.semantic_frame != null) word.semantic_frame = r.semantic_frame as string;
        if (r.subject_ref != null) word.subject_ref = r.subject_ref as string;
        if (r.participant_ref != null) word.participant_ref = r.participant_ref as string;
      }
    }

    return word;
  });

  const byPos: Record<string, number> = {};
  for (const w of words) {
    const pos = (w.pos as string) ?? 'unknown';
    byPos[pos] = (byPos[pos] ?? 0) + 1;
  }

  const result = {
    book: bookInfo.displayName,
    range: rangeInput,
    testament,
    words,
    summary: { total_words: words.length, by_pos: byPos },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
