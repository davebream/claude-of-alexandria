import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

const DEFAULT_FEATURES = [
  'historical_present', 'left_dislocation', 'referential_pod',
  'situational_pod', 'reported_speech', 'tail_head_linkage',
];

export async function queryDiscourseFeatures(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }
  if (bookInfo.testament !== 'nt') {
    return { error: { code: 'TESTAMENT_MISMATCH', message: `Discourse features are NT only. '${bookInfo.displayName}' is an OT book.` } };
  }

  const chapterRange = args.chapter_range as string | undefined;
  const rangeResult = parseChapterRange(chapterRange);
  if ('error' in rangeResult) {
    return { error: { code: 'INVALID_RANGE', message: rangeResult.error } };
  }

  const requestedFeatures = (args.features as string[] | undefined) ?? DEFAULT_FEATURES;

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

  return {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    features,
    summary,
    available_features: availableFeatures,
  };
}
