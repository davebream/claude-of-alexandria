import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const VALID_COMMENTARIES = [
  'adam-clarke', 'jamieson-fausset-brown', 'john-gill',
  'keil-delitzsch', 'matthew-henry', 'tyndale',
] as const;

const TYNDALE_ATTRIBUTION = 'Tyndale Open Study Notes, CC BY-SA 4.0, Tyndale House Publishers';
const LARGE_RANGE_THRESHOLD = 15;

export const CommentaryLookupInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "1 Cor")'),
  range: z.string().describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28"'),
  commentary: z.enum(VALID_COMMENTARIES).optional().describe(
    `Filter to a specific commentary. Omit for all available. Options: ${VALID_COMMENTARIES.join(', ')}`
  ),
});

export type CommentaryLookupInput = z.output<typeof CommentaryLookupInputSchema>;

export const CommentaryLookupOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  range: z.string(),
  entries: z.array(z.strictObject({
    commentary: z.string(),
    attribution: z.string().nullable(),
    chapter: z.number().int().positive(),
    verse_start: z.number().int().positive(),
    verse_end: z.number().int().positive(),
    text: z.string(),
    source_ids: z.array(z.string()).min(1),
  })),
  range_warning: z.string().optional(),
});

export async function commentaryLookup(args: CommentaryLookupInput): Promise<CallToolResult> {
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

  let sql = `
    SELECT commentary, chapter, verse_start, verse_end, text
    FROM commentary_entries
    WHERE book = ?
      AND (chapter > ? OR (chapter = ? AND verse_end >= ?))
      AND (chapter < ? OR (chapter = ? AND verse_start <= ?))
  `;
  const params: unknown[] = [
    bookInfo.canonical,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  if (args.commentary) {
    sql += ' AND commentary = ?';
    params.push(args.commentary);
  }

  sql += ' ORDER BY commentary, chapter, verse_start, verse_end, id';

  const rows = await query(sql, params);

  // Group by commentary
  const commentaryMap = new Map<string, {
    commentary: string;
    attribution: string | null;
    entries: { chapter: number; verse_start: number; verse_end: number; text: string }[];
  }>();

  for (const row of rows) {
    const cid = row.commentary as string;
    if (!commentaryMap.has(cid)) {
      commentaryMap.set(cid, {
        commentary: cid,
        attribution: cid === 'tyndale' ? TYNDALE_ATTRIBUTION : null,
        entries: [],
      });
    }
    commentaryMap.get(cid)!.entries.push({
      chapter: row.chapter as number,
      verse_start: row.verse_start as number,
      verse_end: row.verse_end as number,
      text: row.text as string,
    });
  }

  const commentaries = [...commentaryMap.values()];

  // Estimate verse count for range warning
  const verseSpan = (verseRange.endChapter - verseRange.startChapter) * 30
    + (verseRange.endVerse - verseRange.startVerse) + 1;

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    range: args.range,
    commentaries,
  };

  if (!args.commentary && verseSpan > LARGE_RANGE_THRESHOLD) {
    result.range_warning = `Large range (${verseSpan}+ verses) across all commentaries. Consider filtering to a specific commentary for focused results.`;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
