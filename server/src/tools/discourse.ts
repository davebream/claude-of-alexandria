import { z } from 'zod';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

export const DiscourseInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('NT book name (any common form, e.g., "John", "1 Cor", "Romans")'),
  features: z.array(z.string()).optional().describe(
    'Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage'
  ),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
});

export type DiscourseInput = z.output<typeof DiscourseInputSchema>;

export const DiscourseFeatureRow = z.strictObject({
  chapter: z.number(),
  verse: z.number(),
  word: z.string().nullable(),
  feature_description: z.string().nullable(),
  // SBL transliteration sibling — present-and-null when unpopulated, never
  // omitted (AC-10).
  word_translit: z.string().nullable().optional(),
});

const DiscourseRecordSchema = z.discriminatedUnion('record_type', [
  DiscourseFeatureRow.extend({ record_type: z.literal('feature'), feature: z.string() }),
  z.strictObject({
    record_type: z.literal('boundary'),
    chapter: z.number().int().positive(),
    verse: z.number().int().positive(),
    word_position: z.number().int().nonnegative(),
    boundary_type: z.string(),
    clause_id: z.string().nullable(),
    clause_marker: z.string().nullable(),
    note_text: z.string().nullable(),
  }),
]);

export const DiscourseOutputSchema = z.strictObject({
  page: PageSchema,
  book: z.string(),
  chapter_range: z.string(),
  records: z.array(DiscourseRecordSchema),
  summary: z.record(z.string(), z.number()),
  available_features: z.array(z.string()),
  word_level_summary: z.strictObject({
    total: z.number(),
    by_boundary_type: z.record(z.string(), z.number()),
  }).optional(),
});

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

  // WHERE clause built once and reused for both the primary rows query and the
  // lexicon transliteration lookup below — same filters, so the lexicon lookup
  // sees exactly the same word set the primary query already selected.
  let whereClause = 'book = ?';
  const whereParams: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    whereClause += ' AND chapter >= ? AND chapter <= ?';
    whereParams.push(rangeResult.min, rangeResult.max);
  }

  if (requestedFeatures.length > 0) {
    whereClause += ` AND feature IN (${requestedFeatures.map(() => '?').join(',')})`;
    whereParams.push(...requestedFeatures);
  }

  const sql = `SELECT chapter, verse, feature, feature_description, word FROM discourse_features WHERE ${whereClause} ORDER BY chapter, verse, feature, word, id`;

  const rows = await query(sql, whereParams);

  const allFeaturesRows = await query(
    'SELECT DISTINCT feature FROM discourse_features WHERE book = ? ORDER BY feature',
    [bookInfo.canonical]
  );
  const availableFeatures = allFeaturesRows.map(r => r.feature as string);

  // word_translit — word → lexicon_lsj.original_word_nfc → transliteration,
  // deterministic lowest-strongs_id tie-break (original_word_nfc is NOT unique).
  // A whole-book result can carry far more than ~100 distinct words, so the
  // IN (…) operand reproduces the
  // SAME WHERE filter as the primary query (as a DISTINCT word subquery)
  // instead of a literal list — one bounded statement, fixed bind count,
  // never one lookup per row (AC-12). Wrapped so a lexicon failure degrades
  // every row to word_translit: null rather than failing the whole call.
  let wordTranslitMap: Record<string, string | null> = {};
  if (rows.length > 0) {
    try {
      const translitRows = await query(
        `SELECT original_word_nfc, transliteration FROM (
           SELECT original_word_nfc, transliteration,
                  ROW_NUMBER() OVER (PARTITION BY original_word_nfc ORDER BY strongs_id) AS rn
           FROM lexicon_lsj
           WHERE original_word_nfc IN (
             SELECT DISTINCT word FROM discourse_features WHERE ${whereClause}
           )
         ) WHERE rn = 1`,
        whereParams
      );
      for (const row of translitRows) {
        wordTranslitMap[row.original_word_nfc as string] = row.transliteration as string | null;
      }
    } catch {
      wordTranslitMap = {};
    }
  }

  const features: Record<string, { chapter: number; verse: number; word: string | null; feature_description: string | null; word_translit: string | null }[]> = {};
  const summary: Record<string, number> = {};

  for (const row of rows) {
    const feature = row.feature as string;
    if (!features[feature]) features[feature] = [];
    const word = row.word as string | null;
    features[feature].push({
      chapter: row.chapter as number,
      verse: row.verse as number,
      word,
      feature_description: row.feature_description as string | null,
      word_translit: (word !== null ? wordTranslitMap[word] : undefined) ?? null,
    });
    summary[feature] = (summary[feature] ?? 0) + 1;
  }

  // Word-level discourse boundaries (from OpenGNT Levinsohn data)
  let boundSql = 'SELECT chapter, verse, word_position, boundary_type, clause_id, clause_marker, note_text FROM discourse_boundaries WHERE book = ?';
  const boundParams: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    boundSql += ' AND chapter >= ? AND chapter <= ?';
    boundParams.push(rangeResult.min, rangeResult.max);
  }

  boundSql += ' ORDER BY chapter, verse, word_position, boundary_type, id';

  const boundRows = await query(boundSql, boundParams);

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    features,
    summary,
    available_features: availableFeatures,
  };

  if (boundRows.length > 0) {
    const boundaries = boundRows.map(r => ({
      chapter: r.chapter as number,
      verse: r.verse as number,
      word_position: r.word_position as number,
      boundary_type: r.boundary_type as string,
      clause_id: r.clause_id as string | null,
      clause_marker: r.clause_marker as string | null,
      note_text: r.note_text as string | null,
    }));

    const byBoundaryType: Record<string, number> = {};
    for (const b of boundaries) {
      byBoundaryType[b.boundary_type] = (byBoundaryType[b.boundary_type] ?? 0) + 1;
    }

    result.word_level_boundaries = boundaries;
    result.word_level_summary = { total: boundaries.length, by_boundary_type: byBoundaryType };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
