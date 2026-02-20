import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

export async function queryVocabulary(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }

  const testament = (args.testament as string | undefined) ?? bookInfo.testament;
  if (testament !== 'nt' && testament !== 'ot') {
    return { error: { code: 'INVALID_TESTAMENT', message: `Invalid testament: '${testament}'. Use 'nt' or 'ot'.` } };
  }

  const theme = args.theme as string | undefined;
  const checkClustering = args.check_clustering as boolean | undefined;
  const MAX_VOCABULARY_LIMIT = 500;
  const minFrequency = Math.max(0, (args.min_frequency as number | undefined) ?? 1);
  const limit = Math.min(Math.max(1, (args.limit as number | undefined) ?? 200), MAX_VOCABULARY_LIMIT);

  if (theme) {
    const themeCheck = await query(
      'SELECT DISTINCT theme FROM thematic_keywords WHERE theme = ? AND testament = ?',
      [theme, testament]
    );
    if (themeCheck.length === 0) {
      const allThemes = await query(
        'SELECT DISTINCT theme FROM thematic_keywords WHERE testament = ? ORDER BY theme',
        [testament]
      );
      return {
        error: {
          code: 'INVALID_THEME',
          message: `Theme '${theme}' not found for ${testament.toUpperCase()}.`,
          available_themes: allThemes.map(r => r.theme),
        },
      };
    }
  }

  const canonical = bookInfo.canonical;

  let sql: string;
  let params: unknown[];

  if (theme) {
    sql = `
      SELECT lemma, total FROM (
        SELECT v.lemma, SUM(v.frequency) as total
        FROM vocabulary v
        JOIN thematic_keywords tk ON tk.lemma = v.lemma AND tk.testament = v.testament
        WHERE v.book = ? AND v.testament = ? AND tk.theme = ?
        GROUP BY v.lemma
      ) WHERE total >= ?
      ORDER BY total DESC
      LIMIT ?
    `;
    params = [canonical, testament, theme, minFrequency, limit];
  } else {
    sql = `
      SELECT lemma, total FROM (
        SELECT lemma, SUM(frequency) as total
        FROM vocabulary
        WHERE book = ? AND testament = ?
        GROUP BY lemma
      ) WHERE total >= ?
      ORDER BY total DESC
      LIMIT ?
    `;
    params = [canonical, testament, minFrequency, limit];
  }

  const lemmaRows = await query(sql, params);

  // D1 limits SQL variables to ~100 per statement, so we cannot use IN (?,?,?...) for
  // large lemma lists. Instead, reproduce the ranking subquery inline so the by-chapter
  // lookup uses only a fixed number of bound parameters regardless of result size.
  let byChapterRows: import('../db/query.js').QueryResult;
  if (lemmaRows.length === 0) {
    byChapterRows = [];
  } else if (theme) {
    byChapterRows = await query(
      `SELECT v.lemma, v.chapter, v.frequency FROM vocabulary v
       JOIN thematic_keywords tk ON tk.lemma = v.lemma AND tk.testament = v.testament
       WHERE v.book = ? AND v.testament = ? AND tk.theme = ?
         AND v.lemma IN (
           SELECT lemma FROM (
             SELECT v2.lemma, SUM(v2.frequency) as total
             FROM vocabulary v2
             JOIN thematic_keywords tk2 ON tk2.lemma = v2.lemma AND tk2.testament = v2.testament
             WHERE v2.book = ? AND v2.testament = ? AND tk2.theme = ?
             GROUP BY v2.lemma
           ) WHERE total >= ?
           ORDER BY total DESC LIMIT ?
         )
       ORDER BY v.lemma, v.chapter`,
      [canonical, testament, theme, canonical, testament, theme, minFrequency, limit]
    );
  } else {
    byChapterRows = await query(
      `SELECT v.lemma, v.chapter, v.frequency FROM vocabulary v
       WHERE v.book = ? AND v.testament = ?
         AND v.lemma IN (
           SELECT lemma FROM (
             SELECT lemma, SUM(frequency) as total FROM vocabulary
             WHERE book = ? AND testament = ?
             GROUP BY lemma
           ) WHERE total >= ?
           ORDER BY total DESC LIMIT ?
         )
       ORDER BY v.lemma, v.chapter`,
      [canonical, testament, canonical, testament, minFrequency, limit]
    );
  }

  const byChapterMap: Record<string, Record<string, number>> = {};
  for (const row of byChapterRows) {
    const lemma = row.lemma as string;
    const chapter = String(row.chapter);
    if (!byChapterMap[lemma]) byChapterMap[lemma] = {};
    byChapterMap[lemma][chapter] = row.frequency as number;
  }

  const lemmaList = lemmaRows.map(r => ({
    lemma: r.lemma as string,
    total: r.total as number,
    by_chapter: byChapterMap[r.lemma as string] ?? {},
  }));

  let clustering = null;
  if (checkClustering) {
    const clusterRows = await query(
      'SELECT lemma, concentration, chapter_start, chapter_end, total_occurrences FROM vocabulary_clusters WHERE book = ? AND testament = ? ORDER BY concentration DESC',
      [canonical, testament]
    );
    clustering = {
      has_clustering: clusterRows.length > 0,
      notable_count: clusterRows.length,
      clusters: clusterRows.map(r => ({
        lemma: r.lemma,
        concentration: r.concentration,
        chapter_range: `${r.chapter_start}-${r.chapter_end}`,
        total_occurrences: r.total_occurrences,
      })),
    };
  }

  if (theme) {
    return {
      book: bookInfo.displayName,
      testament,
      theme,
      thematic_matches: lemmaList,
      clustering,
    };
  }

  const totalResult = await query(
    'SELECT COUNT(DISTINCT lemma) as cnt FROM vocabulary WHERE book = ? AND testament = ?',
    [canonical, testament]
  );
  const totalLemmas = (totalResult[0]?.cnt as number) ?? 0;

  return {
    book: bookInfo.displayName,
    testament,
    lemmas: lemmaList,
    total_lemmas: totalLemmas,
    returned: lemmaList.length,
    clustering,
  };
}
