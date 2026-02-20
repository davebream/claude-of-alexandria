import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

export const ParagraphsInputSchema = {
  book: z.string().describe('OT book name (any common form, e.g., "Genesis", "Gen", "Psalms")'),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
};

export type ParagraphsInput = z.output<z.ZodObject<typeof ParagraphsInputSchema>>;

export const ParagraphsOutputSchema = {
  book: z.string(),
  chapter_range: z.string(),
  markers: z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    type: z.string(),
  })),
  summary: z.object({
    petuchot: z.number(),
    setumot: z.number(),
    total: z.number(),
  }),
};

export async function queryParagraphBreaks(args: ParagraphsInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }
  if (bookInfo.testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `Paragraph markers are OT only. '${bookInfo.displayName}' is an NT book.` } }) }],
      isError: true,
    };
  }

  const chapterRange = args.chapter_range;
  const rangeResult = parseChapterRange(chapterRange);
  if ('error' in rangeResult) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: rangeResult.error } }) }],
      isError: true,
    };
  }

  let sql = 'SELECT chapter, verse, marker_type FROM paragraph_markers WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
  }

  sql += ' ORDER BY chapter, verse';

  const rows = await query(sql, params);

  const markers = rows.map(r => ({
    chapter: r.chapter as number,
    verse: r.verse as number,
    type: r.marker_type as string,
  }));

  const petuchot = markers.filter(m => m.type === 'petuchah').length;
  const setumot = markers.filter(m => m.type === 'setumah').length;

  const result = {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    markers,
    summary: { petuchot, setumot, total: petuchot + setumot },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
