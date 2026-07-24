import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const VALID_TRANSLATIONS = ['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY'] as const;
const ALL_TRANSLATIONS = [...VALID_TRANSLATIONS];

export const ParallelTextInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "1 Cor")'),
  range: z.string().describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28".'),
  translations: z.array(z.enum(VALID_TRANSLATIONS)).min(1).max(6).default(ALL_TRANSLATIONS).describe(
    `Translations to include (default: all 6). Options: ${VALID_TRANSLATIONS.join(', ')}`
  ),
});

export type ParallelTextInput = z.output<typeof ParallelTextInputSchema>;

export const ParallelTextOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  range: z.string(),
  verses: z.array(z.strictObject({
    chapter: z.number(),
    verse: z.number(),
    translations: z.record(z.string(), z.string()),
  })),
  missing_verses: z.record(z.string(), z.array(z.string())).optional(),
  versification_note: z.string().optional(),
});

export async function parallelText(args: ParallelTextInput): Promise<CallToolResult> {
  const bookInfo = lookupBook(args.book);
  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.book}' not found.`, suggestions: suggestBooks(args.book) } }) }],
      isError: true,
    };
  }

  const verseRange = parseVerseRange(args.range);
  if ('error' in verseRange) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
      isError: true,
    };
  }

  // Zod enum validation handles INVALID_TRANSLATION at schema level
  const translations = args.translations ?? ALL_TRANSLATIONS;

  // Single query for all translations (design C6)
  const placeholders = translations.map(() => '?').join(',');
  const sql = `
    SELECT translation, chapter, verse, text FROM bible_verses
    WHERE book = ? AND translation IN (${placeholders})
      AND (chapter > ? OR (chapter = ? AND verse >= ?))
      AND (chapter < ? OR (chapter = ? AND verse <= ?))
    ORDER BY chapter, verse, translation
  `;
  const params = [
    bookInfo.canonical,
    ...translations,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  const rows = await query(sql, params);

  // Pivot: group by (chapter, verse), collect translations
  const verseMap = new Map<string, { chapter: number; verse: number; translations: Record<string, string> }>();
  for (const row of rows) {
    const key = `${row.chapter}:${row.verse}`;
    if (!verseMap.has(key)) {
      verseMap.set(key, {
        chapter: row.chapter as number,
        verse: row.verse as number,
        translations: {},
      });
    }
    verseMap.get(key)!.translations[row.translation as string] = row.text as string;
  }

  const verses = [...verseMap.values()];

  // Detect missing verses per translation
  const missing: Record<string, string[]> = {};
  for (const v of verses) {
    for (const t of translations) {
      if (!(t in v.translations)) {
        if (!missing[t]) missing[t] = [];
        missing[t].push(`${v.chapter}:${v.verse}`);
      }
    }
  }

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    range: args.range,
    verses,
  };

  if (Object.keys(missing).length > 0) {
    result.missing_verses = missing;
  }

  if (bookInfo.testament === 'ot') {
    result.versification_note = 'English Protestant versification (may differ from MT/LXX numbering)';
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
