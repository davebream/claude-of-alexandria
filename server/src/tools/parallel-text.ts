import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';
import { jsonArray } from './json-array.js';

const VALID_TRANSLATIONS = ['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY'] as const;
const ALL_TRANSLATIONS = [...VALID_TRANSLATIONS];
const MAX_VERSES = 30;
const CHARACTER_LIMIT = 25_000;

export const ParallelTextInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "1 Cor")'),
  range: z.string().describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28". Hard cap: 30 verses. For larger ranges, make multiple calls.'),
  translations: jsonArray(z.array(z.enum(VALID_TRANSLATIONS)).min(1).max(6)).optional().describe(
    `Translations to include (default: all 6). Options: ${VALID_TRANSLATIONS.join(', ')}`
  ),
};

export type ParallelTextInput = z.output<z.ZodObject<typeof ParallelTextInputSchema>>;

export const ParallelTextOutputSchema = {
  book: z.string(),
  range: z.string(),
  verses: z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    translations: z.record(z.string(), z.string()),
  })),
  missing_verses: z.record(z.string(), z.array(z.string())).optional(),
  truncated: z.boolean(),
  versification_note: z.string().optional(),
  truncation_message: z.string().optional(),
};

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
  // SQL LIMIT prevents unbounded row fetch on pathological ranges
  const placeholders = translations.map(() => '?').join(',');
  const sql = `
    SELECT translation, chapter, verse, text FROM bible_verses
    WHERE book = ? AND translation IN (${placeholders})
      AND (chapter > ? OR (chapter = ? AND verse >= ?))
      AND (chapter < ? OR (chapter = ? AND verse <= ?))
    ORDER BY chapter, verse, translation
    LIMIT ?
  `;
  const params = [
    bookInfo.canonical,
    ...translations,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
    MAX_VERSES * translations.length,
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

  // Apply verse cap
  const allVerses = [...verseMap.values()];
  const truncated = allVerses.length > MAX_VERSES;
  const verses = allVerses.slice(0, MAX_VERSES);

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
    truncated,
  };

  if (Object.keys(missing).length > 0) {
    result.missing_verses = missing;
  }

  if (bookInfo.testament === 'ot') {
    result.versification_note = 'English Protestant versification (may differ from MT/LXX numbering)';
  }

  // Character limit guard — reduce verse count until under limit
  const serialized = JSON.stringify(result);
  if (serialized.length > CHARACTER_LIMIT && verses.length > 1) {
    let lo = 1, hi = verses.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const probe = JSON.stringify({ ...result, verses: verses.slice(0, mid), truncated: true });
      if (probe.length <= CHARACTER_LIMIT) lo = mid; else hi = mid - 1;
    }
    const truncatedVerses = verses.slice(0, lo);
    // Recompute missing_verses for truncated set
    const truncMissing: Record<string, string[]> = {};
    for (const v of truncatedVerses) {
      for (const t of translations) {
        if (!(t in v.translations)) {
          if (!truncMissing[t]) truncMissing[t] = [];
          truncMissing[t].push(`${v.chapter}:${v.verse}`);
        }
      }
    }
    const truncatedResult = {
      ...result,
      verses: truncatedVerses,
      truncated: true,
      ...(Object.keys(truncMissing).length > 0 ? { missing_verses: truncMissing } : {}),
      truncation_message: `Response truncated from ${verses.length} to ${truncatedVerses.length} verses (character limit). Use a narrower range or fewer translations.`,
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
