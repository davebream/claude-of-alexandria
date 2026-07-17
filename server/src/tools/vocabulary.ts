import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query, type QueryResult } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

export const VocabularyInputSchema = {
  book: z.string().describe('Book name (any common form, e.g., "Romans", "Gen", "Psalms")'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
  theme: z.string().optional().describe('Thematic keyword group (e.g., "joy", "faith", "covenant"). Use list_books tool to see available themes.'),
  check_clustering: z.boolean().optional().describe('Include precomputed vocabulary concentration clusters'),
  min_frequency: z.number().optional().describe('Minimum total lemma frequency to include (default: 1)'),
  limit: z.number().optional().describe('Max lemmas returned (default: 200, max: 500)'),
};

export type VocabularyInput = z.output<z.ZodObject<typeof VocabularyInputSchema>>;

const CHARACTER_LIMIT = 25_000;

export const LemmaEntry = z.object({
  lemma: z.string(),
  total: z.number(),
  by_chapter: z.record(z.string(), z.number()),
  // SBL transliteration sibling — present-and-null when unpopulated, never
  // omitted (AC-10). Always null for OT/Hebrew lemmas: lexicon_lsj is
  // Greek-only, so the join simply finds no match — no special-casing needed.
  lemma_translit: z.string().nullable().optional(),
});

export const ClusterEntry = z.object({
  lemma: z.string(),
  concentration: z.number(),
  chapter_range: z.string(),
  total_occurrences: z.number(),
  lemma_translit: z.string().nullable().optional(),
});

const ClusteringSchema = z.object({
  has_clustering: z.boolean(),
  notable_count: z.number(),
  clusters: z.array(ClusterEntry),
}).nullable();

export const VocabularyOutputSchema = {
  response_type: z.enum(['full', 'themed']).describe('Discriminator: "full" when no theme filter, "themed" when theme filter used'),
  book: z.string(),
  testament: z.string(),
  // Present when response_type = "full"
  lemmas: z.array(LemmaEntry).optional(),
  total_lemmas: z.number().optional(),
  returned: z.number().optional(),
  // Present when response_type = "themed"
  theme: z.string().optional(),
  thematic_matches: z.array(LemmaEntry).optional(),
  // Always present when check_clustering = true
  clustering: ClusteringSchema.optional(),
  // Present when truncated
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

// ─── Lexicon transliteration lookup ───────────────────────────────────────────
// lemma → lexicon_lsj.original_word_nfc → transliteration, with a deterministic
// lowest-strongs_id tie-break (a lemma can map to multiple Strong's numbers,
// original_word_nfc is NOT unique — see idx_lsj_original_word_nfc, migration 0011).
//
// D1 limits SQL variables to ~100 per statement (same warning as the by-chapter
// lookup above), and up to MAX_VOCABULARY_LIMIT = 500 lemmas can be in play, so a
// literal IN (?,?,?...) is not an option here. Instead the IN operand is a
// subquery — reproducing whatever set of lemma names the caller already selected
// — so the bind count stays fixed regardless of how many lemmas that set contains.
//
// Wrapped so a lexicon failure degrades every entry to lemma_translit: null
// rather than failing the whole call — the primary vocabulary data already
// succeeded.
async function lookupTranslitViaSubquery(
  lemmaSelectSql: string,
  lemmaSelectParams: unknown[]
): Promise<Record<string, string | null>> {
  try {
    const rows = await query(
      `SELECT original_word_nfc, transliteration FROM (
         SELECT original_word_nfc, transliteration,
                ROW_NUMBER() OVER (PARTITION BY original_word_nfc ORDER BY strongs_id) AS rn
         FROM lexicon_lsj
         WHERE original_word_nfc IN (${lemmaSelectSql})
       ) WHERE rn = 1`,
      lemmaSelectParams
    );

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.original_word_nfc as string] = row.transliteration as string | null;
    }
    return map;
  } catch {
    return {};
  }
}

export async function queryVocabulary(args: VocabularyInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }

  const testament = args.testament ?? bookInfo.testament;
  if (testament !== 'nt' && testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_TESTAMENT', message: `Invalid testament: '${testament}'. Use 'nt' or 'ot'.` } }) }],
      isError: true,
    };
  }

  const theme = args.theme;
  const checkClustering = args.check_clustering;
  const MAX_VOCABULARY_LIMIT = 500;
  const minFrequency = Math.max(0, args.min_frequency ?? 1);
  const limit = Math.min(Math.max(1, args.limit ?? 200), MAX_VOCABULARY_LIMIT);

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
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_THEME', message: `Theme '${theme}' not found for ${testament.toUpperCase()}.`, available_themes: allThemes.map(r => r.theme), report_gap: 'If this theme should exist, report it: https://github.com/davebream/claude-of-alexandria/issues/new?template=data-gap.md' } }) }],
        isError: true,
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

  // Ranked-lemma-name subquery — the same set the outer lemmaRows query already
  // selected, minus the totals. Reused as the IN (…) operand for both the
  // by-chapter lookup below and the lexicon transliteration lookup further
  // down, so both stay at a fixed bind count regardless of result size.
  const rankedLemmaNamesSql = theme
    ? `SELECT lemma FROM (
         SELECT v2.lemma, SUM(v2.frequency) as total
         FROM vocabulary v2
         JOIN thematic_keywords tk2 ON tk2.lemma = v2.lemma AND tk2.testament = v2.testament
         WHERE v2.book = ? AND v2.testament = ? AND tk2.theme = ?
         GROUP BY v2.lemma
       ) WHERE total >= ?
       ORDER BY total DESC LIMIT ?`
    : `SELECT lemma FROM (
         SELECT lemma, SUM(frequency) as total FROM vocabulary
         WHERE book = ? AND testament = ?
         GROUP BY lemma
       ) WHERE total >= ?
       ORDER BY total DESC LIMIT ?`;
  const rankedLemmaNamesParams = theme
    ? [canonical, testament, theme, minFrequency, limit]
    : [canonical, testament, minFrequency, limit];

  // D1 limits SQL variables to ~100 per statement, so we cannot use IN (?,?,?...) for
  // large lemma lists. Instead, reproduce the ranking subquery inline so the by-chapter
  // lookup uses only a fixed number of bound parameters regardless of result size.
  let byChapterRows: QueryResult;
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

  // lemma_translit — one bounded lexicon statement covering exactly the ranked
  // lemma set already selected above (AC-10 present-and-null; AC-12 bounded).
  const lemmaTranslitMap = lemmaRows.length > 0
    ? await lookupTranslitViaSubquery(rankedLemmaNamesSql, rankedLemmaNamesParams)
    : {};

  const lemmaList = lemmaRows.map(r => ({
    lemma: r.lemma as string,
    total: r.total as number,
    by_chapter: byChapterMap[r.lemma as string] ?? {},
    lemma_translit: lemmaTranslitMap[r.lemma as string] ?? null,
  }));

  let clustering = null;
  if (checkClustering) {
    const clusterRows = await query(
      'SELECT lemma, concentration, chapter_start, chapter_end, total_occurrences FROM vocabulary_clusters WHERE book = ? AND testament = ? ORDER BY concentration DESC',
      [canonical, testament]
    );
    // lemma_translit — a second bounded lexicon statement, scoped to cluster
    // lemmas (a different set from the ranked lemma list above; may not overlap).
    const clusterTranslitMap = clusterRows.length > 0
      ? await lookupTranslitViaSubquery(
          'SELECT lemma FROM vocabulary_clusters WHERE book = ? AND testament = ?',
          [canonical, testament]
        )
      : {};
    clustering = {
      has_clustering: clusterRows.length > 0,
      notable_count: clusterRows.length,
      clusters: clusterRows.map(r => ({
        lemma: r.lemma as string,
        concentration: r.concentration as number,
        chapter_range: `${r.chapter_start}-${r.chapter_end}`,
        total_occurrences: r.total_occurrences as number,
        lemma_translit: clusterTranslitMap[r.lemma as string] ?? null,
      })),
    };
  }

  if (theme) {
    const result = {
      response_type: 'themed' as const,
      book: bookInfo.displayName,
      testament,
      theme,
      thematic_matches: lemmaList,
      clustering,
    };
    const serialized = JSON.stringify(result);
    if (serialized.length > CHARACTER_LIMIT) {
      const truncatedList = lemmaList.slice(0, Math.ceil(lemmaList.length / 2));
      const truncatedResult = {
        ...result,
        thematic_matches: truncatedList,
        truncated: true,
        truncation_message: `Response truncated from ${lemmaList.length} to ${truncatedList.length} lemmas. Use min_frequency or limit parameters to narrow results.`,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
        structuredContent: truncatedResult,
      };
    }
    return {
      content: [{ type: 'text', text: serialized }],
      structuredContent: result,
    };
  }

  const totalResult = await query(
    'SELECT COUNT(DISTINCT lemma) as cnt FROM vocabulary WHERE book = ? AND testament = ?',
    [canonical, testament]
  );
  const totalLemmas = (totalResult[0]?.cnt as number) ?? 0;

  const result = {
    response_type: 'full' as const,
    book: bookInfo.displayName,
    testament,
    lemmas: lemmaList,
    total_lemmas: totalLemmas,
    returned: lemmaList.length,
    clustering,
  };
  const serialized = JSON.stringify(result);
  if (serialized.length > CHARACTER_LIMIT) {
    const truncatedList = lemmaList.slice(0, Math.ceil(lemmaList.length / 2));
    const truncatedResult = {
      ...result,
      lemmas: truncatedList,
      returned: truncatedList.length,
      truncated: true,
      truncation_message: `Response truncated from ${lemmaList.length} to ${truncatedList.length} lemmas. Use min_frequency or limit parameters to narrow results.`,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
      structuredContent: truncatedResult,
    };
  }

  return {
    content: [{ type: 'text', text: serialized }],
    structuredContent: result,
  };
}
