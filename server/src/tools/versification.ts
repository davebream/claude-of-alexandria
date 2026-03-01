import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

export const VersificationInputSchema = {
  book: z.string().describe('OT book name in any common form (e.g., "Genesis", "Gen", "Psalms")'),
  chapter: z.number().optional().describe('Filter to a specific chapter'),
  verse: z.number().optional().describe('Filter to a specific verse'),
  verse_end: z.number().optional().describe('End verse for range queries'),
};

export type VersificationInput = z.output<z.ZodObject<typeof VersificationInputSchema>>;

export const VersificationOutputSchema = {
  book: z.string(),
  differences: z.array(z.object({
    english: z.string(),
    hebrew: z.string(),
    mapping_type: z.string(),
  })),
  summary: z.object({
    total_differences: z.number(),
    mapping_types: z.record(z.string(), z.number()),
  }),
};

export async function checkVersification(args: VersificationInput): Promise<CallToolResult> {
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

  if (bookInfo.testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'OT_ONLY', message: 'Versification differences are tracked for OT books only. NT versification is uniform across traditions.' }
      }) }],
      isError: true,
    };
  }

  // Build query based on provided parameters
  let sql = 'SELECT * FROM versification WHERE book = ?';
  const params: unknown[] = [bookInfo.displayName];

  if (args.chapter !== undefined) {
    sql += ' AND english_chapter = ?';
    params.push(args.chapter);
  }

  if (args.verse !== undefined) {
    if (args.verse_end !== undefined) {
      // Range query: find mappings overlapping with the verse range
      sql += ' AND english_verse_start <= ? AND (english_verse_end >= ? OR (english_verse_end IS NULL AND english_verse_start >= ?))';
      params.push(args.verse_end, args.verse, args.verse);
    } else {
      // Single verse: find mappings containing this verse
      sql += ' AND ((english_verse_start = ? AND english_verse_end IS NULL) OR (english_verse_start <= ? AND english_verse_end >= ?))';
      params.push(args.verse, args.verse, args.verse);
    }
  }

  sql += ' ORDER BY english_chapter, english_verse_start';

  const rows = await query(sql, params);

  const differences = rows.map(r => {
    const engEnd = r.english_verse_end !== null ? `-${r.english_verse_end}` : '';
    const hebEnd = r.hebrew_verse_end !== null ? `-${r.hebrew_verse_end}` : '';
    return {
      english: `${r.english_chapter}:${r.english_verse_start}${engEnd}`,
      hebrew: `${r.hebrew_chapter}:${r.hebrew_verse_start}${hebEnd}`,
      mapping_type: r.mapping_type as string,
    };
  });

  // Summary
  const mappingTypes: Record<string, number> = {};
  for (const d of differences) {
    mappingTypes[d.mapping_type] = (mappingTypes[d.mapping_type] || 0) + 1;
  }

  const result = {
    book: bookInfo.displayName,
    differences,
    summary: {
      total_differences: differences.length,
      mapping_types: mappingTypes,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
