import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

export const SyntaxInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('NT book name (any common form, e.g., "Romans", "John", "1 Cor")'),
  chapter_range: z.string().optional().describe('Chapter range: "8" (single), "1-3" (range), or omit for entire book'),
  clause_type: z.string().optional().describe('Filter by clause type (e.g., "primary", "secondary")'),
});

export type SyntaxInput = z.output<typeof SyntaxInputSchema>;

export const SyntaxOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  chapter_range: z.string(),
  annotations: z.array(z.strictObject({
    chapter: z.number(),
    verse: z.number(),
    clause_id: z.string().nullable(),
    clause_type: z.string(),
    clause_relation: z.string().nullable(),
    clause_text: z.string().nullable(),
    parent_clause_id: z.string().nullable(),
  })),
  summary: z.strictObject({
    total: z.number(),
    by_clause_type: z.record(z.string(), z.number()),
  }),
  framework_note: z.string(),
});

export async function querySyntax(args: SyntaxInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }
  if (bookInfo.testament !== 'nt') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `Syntax annotations are NT only. '${bookInfo.displayName}' is an OT book.` } }) }],
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

  let sql = 'SELECT chapter, verse, clause_id, clause_type, clause_relation, clause_text, parent_clause_id FROM syntax_annotations WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
  }

  if (args.clause_type) {
    sql += ' AND clause_type = ?';
    params.push(args.clause_type);
  }

  sql += ' ORDER BY chapter, verse, clause_id, id';

  const rows = await query(sql, params);

  const annotations = rows.map(r => ({
    chapter: r.chapter as number,
    verse: r.verse as number,
    clause_id: r.clause_id as string | null,
    clause_type: r.clause_type as string,
    clause_relation: r.clause_relation as string | null,
    clause_text: r.clause_text as string | null,
    parent_clause_id: r.parent_clause_id as string | null,
  }));

  const byClauseType: Record<string, number> = {};
  for (const a of annotations) {
    byClauseType[a.clause_type] = (byClauseType[a.clause_type] ?? 0) + 1;
  }

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    annotations,
    summary: { total: annotations.length, by_clause_type: byClauseType },
    framework_note: 'OpenText follows Porter\'s Systemic Functional Linguistics framework. Levinsohn\'s discourse grammar (query_discourse_features) offers competing analyses. Disagreements are theoretically informative, not errors.',
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
