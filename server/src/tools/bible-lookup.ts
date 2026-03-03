import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const VALID_TRANSLATIONS = ['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY'] as const;
const DEFAULT_TRANSLATION = 'BSB';
const MAX_VERSES = 50;
const CHARACTER_LIMIT = 25_000;

export const BibleLookupInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "1 Cor")'),
  range: z.string().describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28"'),
  translation: z.enum(VALID_TRANSLATIONS).optional().describe(
    `Bible translation (default: ${DEFAULT_TRANSLATION}). Options: ${VALID_TRANSLATIONS.join(', ')}`
  ),
};

export type BibleLookupInput = z.output<z.ZodObject<typeof BibleLookupInputSchema>>;

export const BibleLookupOutputSchema = {
  translation: z.string(),
  book: z.string(),
  range: z.string(),
  verses: z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    text: z.string(),
  })),
  versification_note: z.string().optional(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

export async function bibleLookup(args: BibleLookupInput): Promise<CallToolResult> {
  const bookInfo = lookupBook(args.book);
  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.book}' not found.`, suggestions: suggestBooks(args.book) } }) }],
      isError: true,
    };
  }

  const translation = args.translation ?? DEFAULT_TRANSLATION;

  const verseRange = parseVerseRange(args.range);
  if ('error' in verseRange) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
      isError: true,
    };
  }

  const sql = `
    SELECT chapter, verse, text FROM bible_verses
    WHERE translation = ? AND book = ?
      AND (chapter > ? OR (chapter = ? AND verse >= ?))
      AND (chapter < ? OR (chapter = ? AND verse <= ?))
    ORDER BY chapter, verse
    LIMIT ?
  `;
  const params = [
    translation,
    bookInfo.canonical,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
    MAX_VERSES,
  ];

  const rows = await query(sql, params);

  const verses = rows.map(row => ({
    chapter: row.chapter as number,
    verse: row.verse as number,
    text: row.text as string,
  }));

  const result: Record<string, unknown> = {
    translation,
    book: bookInfo.displayName,
    range: args.range,
    verses,
  };

  // Versification note for OT passages
  if (bookInfo.testament === 'ot') {
    result.versification_note = 'English Protestant versification (may differ from MT/LXX numbering)';
  }

  // Character limit guard (matches vocabulary.ts / lemmas.ts pattern)
  const serialized = JSON.stringify(result);
  if (serialized.length > CHARACTER_LIMIT && verses.length > 1) {
    const truncatedVerses = verses.slice(0, Math.ceil(verses.length / 2));
    const truncatedResult = {
      ...result,
      verses: truncatedVerses,
      truncated: true,
      truncation_message: `Response truncated from ${verses.length} to ${truncatedVerses.length} verses (character limit). Use a narrower range.`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
      structuredContent: truncatedResult,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
