import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const CHARACTER_LIMIT = 25_000;

export const CrossReferencesInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "Psalms")'),
  range: z.string().optional().describe('Verse range: "8:28" (single verse) or "8:28-8:39" (range). Omit for entire book.'),
  min_votes: z.number().optional().describe('Minimum vote count to include (default: 2)'),
  limit: z.number().optional().describe('Maximum results returned (default: 100, max: 500)'),
  direction: z.enum(['from', 'to', 'both']).optional().describe(
    '"from" = references FROM this passage, "to" = references TO this passage, "both" = bidirectional (default)'
  ),
};

export type CrossReferencesInput = z.output<z.ZodObject<typeof CrossReferencesInputSchema>>;

export const CrossReferencesOutputSchema = {
  book: z.string(),
  range: z.string().optional(),
  cross_references: z.array(z.object({
    from_ref: z.string(),
    to_ref: z.string(),
    votes: z.number(),
    direction: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    avg_votes: z.number().optional(),
  }),
};

export async function queryCrossReferences(args: CrossReferencesInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) }
      }) }],
      isError: true,
    };
  }

  const minVotes = args.min_votes ?? 2;
  const limit = Math.min(args.limit ?? 100, 500);
  const direction = args.direction ?? 'both';
  const bookName = bookInfo.displayName;

  // Parse verse range if provided
  let verseRange: { startChapter: number; startVerse: number; endChapter: number; endVerse: number } | null = null;
  if (args.range) {
    const parsed = parseVerseRange(args.range);
    if ('error' in parsed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: parsed.error } }) }],
        isError: true,
      };
    }
    verseRange = parsed;
  }

  // Build queries based on direction — two separate indexed queries, never OR
  interface RefRow {
    from_book: string;
    from_chapter: number;
    from_verse: number;
    to_book: string;
    to_chapter: number;
    to_verse_start: number;
    to_verse_end: number;
    votes: number;
    direction: 'from' | 'to';
  }

  const results: RefRow[] = [];

  if (direction === 'from' || direction === 'both') {
    let sql = 'SELECT * FROM cross_references WHERE from_book = ? AND votes >= ?';
    const params: unknown[] = [bookName, minVotes];

    if (verseRange) {
      sql += ' AND from_chapter >= ? AND from_chapter <= ?';
      params.push(verseRange.startChapter, verseRange.endChapter);

      if (verseRange.startChapter === verseRange.endChapter) {
        sql += ' AND from_verse >= ? AND from_verse <= ?';
        params.push(verseRange.startVerse, verseRange.endVerse);
      }
    }

    sql += ' ORDER BY votes DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    for (const r of rows) {
      results.push({ ...r as unknown as Omit<RefRow, 'direction'>, direction: 'from' });
    }
  }

  if (direction === 'to' || direction === 'both') {
    let sql = 'SELECT * FROM cross_references WHERE to_book = ? AND votes >= ?';
    const params: unknown[] = [bookName, minVotes];

    if (verseRange) {
      sql += ' AND to_chapter >= ? AND to_chapter <= ?';
      params.push(verseRange.startChapter, verseRange.endChapter);

      if (verseRange.startChapter === verseRange.endChapter) {
        sql += ' AND to_verse_start >= ? AND to_verse_start <= ?';
        params.push(verseRange.startVerse, verseRange.endVerse);
      }
    }

    sql += ' ORDER BY votes DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    for (const r of rows) {
      results.push({ ...r as unknown as Omit<RefRow, 'direction'>, direction: 'to' });
    }
  }

  // Deduplicate (same from+to pair) and sort by votes desc
  const seen = new Set<string>();
  const deduped: RefRow[] = [];
  for (const r of results) {
    const key = `${r.from_book}:${r.from_chapter}:${r.from_verse}→${r.to_book}:${r.to_chapter}:${r.to_verse_start}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Sort by votes descending, then cap at limit
  deduped.sort((a, b) => b.votes - a.votes);
  const capped = deduped.slice(0, limit);

  // Format output
  const crossRefs = capped.map(r => {
    const toEnd = r.to_verse_end !== r.to_verse_start ? `-${r.to_verse_end}` : '';
    return {
      from_ref: `${r.from_book} ${r.from_chapter}:${r.from_verse}`,
      to_ref: `${r.to_book} ${r.to_chapter}:${r.to_verse_start}${toEnd}`,
      votes: r.votes,
      direction: r.direction,
    };
  });

  // Character limit guard
  let finalRefs = crossRefs;
  let jsonStr = JSON.stringify(crossRefs);
  if (jsonStr.length > CHARACTER_LIMIT) {
    // Truncate
    while (finalRefs.length > 1 && JSON.stringify(finalRefs).length > CHARACTER_LIMIT) {
      finalRefs = finalRefs.slice(0, Math.floor(finalRefs.length * 0.8));
    }
  }

  const avgVotes = finalRefs.length > 0
    ? Math.round(finalRefs.reduce((sum, r) => sum + r.votes, 0) / finalRefs.length)
    : undefined;

  const result = {
    book: bookName,
    range: args.range,
    cross_references: finalRefs,
    summary: {
      total: finalRefs.length,
      avg_votes: avgVotes,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
