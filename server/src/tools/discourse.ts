import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';
import { jsonArray } from './json-array.js';

export const DiscourseInputSchema = {
  book: z.string().describe('NT book name (any common form, e.g., "John", "1 Cor", "Romans")'),
  features: jsonArray(z.array(z.string())).optional().describe(
    'Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage'
  ),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
};

export type DiscourseInput = z.output<z.ZodObject<typeof DiscourseInputSchema>>;

export const DiscourseOutputSchema = {
  book: z.string(),
  chapter_range: z.string(),
  features: z.record(z.string(), z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    word: z.string().nullable(),
    feature_description: z.string().nullable(),
  }))),
  summary: z.record(z.string(), z.number()),
  available_features: z.array(z.string()),
};

const DEFAULT_FEATURES = [
  'historical_present', 'left_dislocation', 'referential_pod',
  'situational_pod', 'reported_speech', 'tail_head_linkage',
];

export async function queryDiscourseFeatures(args: DiscourseInput): Promise<CallToolResult> {
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
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `Discourse features are NT only. '${bookInfo.displayName}' is an OT book.` } }) }],
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

  const requestedFeatures = args.features ?? DEFAULT_FEATURES;

  let sql = 'SELECT chapter, verse, feature, feature_description, word FROM discourse_features WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
  }

  if (requestedFeatures.length > 0) {
    sql += ` AND feature IN (${requestedFeatures.map(() => '?').join(',')})`;
    params.push(...requestedFeatures);
  }

  sql += ' ORDER BY chapter, verse';

  const rows = await query(sql, params);

  const allFeaturesRows = await query(
    'SELECT DISTINCT feature FROM discourse_features WHERE book = ? ORDER BY feature',
    [bookInfo.canonical]
  );
  const availableFeatures = allFeaturesRows.map(r => r.feature as string);

  const features: Record<string, { chapter: number; verse: number; word: string | null; feature_description: string | null }[]> = {};
  const summary: Record<string, number> = {};

  for (const row of rows) {
    const feature = row.feature as string;
    if (!features[feature]) features[feature] = [];
    features[feature].push({
      chapter: row.chapter as number,
      verse: row.verse as number,
      word: row.word as string | null,
      feature_description: row.feature_description as string | null,
    });
    summary[feature] = (summary[feature] ?? 0) + 1;
  }

  const result = {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    features,
    summary,
    available_features: availableFeatures,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
