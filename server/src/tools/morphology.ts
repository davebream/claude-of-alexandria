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
  })),
  summary: z.object({
    total_words: z.number(),
    by_pos: z.record(z.string(), z.number()),
  }),
};

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

  const testament = args.testament ?? bookInfo.testament;
  const posFilter = args.pos_filter;
  const wordFilter = args.word_filter;

  let sql = `
    SELECT chapter, verse, word_position, text, normalized, lemma, pos, parsing
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

  sql += ' ORDER BY chapter, verse, word_position LIMIT ?';
  params.push(DEFAULT_MORPHOLOGY_LIMIT);

  const rows = await query(sql, params);

  const words = rows.map(r => ({
    verse: `${r.chapter}:${r.verse}`,
    position: r.word_position as number,
    text: r.text as string,
    normalized: r.normalized as string | null,
    lemma: r.lemma as string,
    pos: r.pos as string,
    parsing: expandParsing(r.parsing as string | null),
  }));

  const byPos: Record<string, number> = {};
  for (const w of words) {
    byPos[w.pos] = (byPos[w.pos] ?? 0) + 1;
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
