import { z } from 'zod';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const VALID_TRANSLATIONS = ['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY'] as const;
const DEFAULT_TRANSLATION = 'BSB';

export const BibleLookupInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "1 Cor")'),
  range: z.string().describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28"'),
  translation: z.enum(VALID_TRANSLATIONS).default(DEFAULT_TRANSLATION).describe(
    `Bible translation (default: ${DEFAULT_TRANSLATION}). Options: ${VALID_TRANSLATIONS.join(', ')}`
  ),
});

export type BibleLookupInput = z.output<typeof BibleLookupInputSchema>;

export const BibleLookupOutputSchema = z.strictObject({
  page: PageSchema,
  translation: z.string(),
  book: z.string(),
  range: z.string(),
  verses: z.array(z.strictObject({
    chapter: z.number(),
    verse: z.number(),
    text: z.string(),
  })),
  versification_note: z.string().optional(),
});

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
  `;
  const params = [
    translation,
    bookInfo.canonical,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
