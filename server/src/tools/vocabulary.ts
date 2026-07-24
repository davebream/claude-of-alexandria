import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query, type QueryResult } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

const VocabularyCommonInput = {
  ...PaginationInputShape,
  book: z.string().describe('Book name (any common form, e.g., "Romans", "Gen", "Psalms")'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
  check_clustering: z.boolean().default(false).describe('Include precomputed vocabulary concentration clusters'),
  min_frequency: z.number().int().nonnegative().default(1).describe('Minimum total lemma frequency to include.'),
};

export const VocabularyInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...VocabularyCommonInput, mode: z.literal('frequency').describe('Return ranked lemma frequencies.'), theme: z.never().optional() }),
  z.strictObject({ ...VocabularyCommonInput, mode: z.literal('theme').describe('Return lemmas in one named theme.'), theme: z.string().min(1).describe('Theme name from list_books(include_themes=true).') }),
]);

export type VocabularyInput = z.output<typeof VocabularyInputSchema>;


export const LemmaEntry = z.strictObject({
  lemma: z.string(),
  total: z.number(),
  by_chapter: z.record(z.string(), z.number()),
  // SBL transliteration sibling — present-and-null when unpopulated, never
  // omitted (AC-10). Testament-aware source: NT lemmas read lexicon_lsj, OT
  // lemmas (Strong's numbers) read lemma_translit_he_strongs.
  lemma_translit: z.string().nullable().optional().describe(
    "Transliteration of the lemma. Hebrew (OT): derived — deterministic SBL "
    + "rendering of the pointed lemma, keyed by Strong's number (decisions/0007). "
    + "Greek (NT): source-read from OpenGNT. "
    + "May be null: for OT when no pointed lemma is attested for the Strong's "
    + "number — an unpointed/consonantal-only lemma, or a sense-suffixed or Aramaic "
    + "Strong's that MACULA does not attest; for NT when the lexicon has no match. "
    + "Null is a defined honest boundary, not an error, and does not mean the word "
    + "is absent from the text."
  ),
});

export const ClusterEntry = z.strictObject({
  lemma: z.string(),
  concentration: z.number(),
  chapter_range: z.string(),
  total_occurrences: z.number(),
  lemma_translit: z.string().nullable().optional().describe(
    "Transliteration of the lemma. Hebrew (OT): derived — deterministic SBL "
    + "rendering of the pointed lemma, keyed by Strong's number (decisions/0007). "
    + "Greek (NT): source-read from OpenGNT. "
    + "May be null: for OT when no pointed lemma is attested for the Strong's "
    + "number — an unpointed/consonantal-only lemma, or a sense-suffixed or Aramaic "
    + "Strong's that MACULA does not attest; for NT when the lexicon has no match. "
    + "Null is a defined honest boundary, not an error, and does not mean the word "
    + "is absent from the text."
  ),
});

const ClusteringSchema = z.strictObject({
  has_clustering: z.boolean(),
  notable_count: z.number(),
  clusters: z.array(ClusterEntry),
}).nullable();

const VocabularyOutputBaseSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  testament: z.enum(['nt', 'ot']),
  clustering: ClusteringSchema.optional(),
});

export const VocabularyOutputSchema = z.discriminatedUnion('response_type', [
  VocabularyOutputBaseSchema.extend({ response_type: z.literal('full'), lemmas: z.array(LemmaEntry), total_lemmas: z.number().int().nonnegative() }),
  VocabularyOutputBaseSchema.extend({ response_type: z.literal('themed'), theme: z.string(), thematic_matches: z.array(LemmaEntry) }),
]);

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
// Testament-aware: a vocabulary call is single-testament, so the lookup source is
// a clean branch, not a partition-and-merge.
//   • OT — the "lemma" IS a Strong's number, so it keys directly into
//     lemma_translit_he_strongs.strongs (PRIMARY KEY, so no tie-break needed).
//     Values are derived (decisions/0007), shipped via backfill-lemma-translit.yml.
//   • NT — the lemma is a Greek surface form keyed against lexicon_lsj.original_word_nfc,
//     which is NOT unique, hence the lowest-strongs_id ROW_NUMBER() tie-break.
// Making the shared helper branch (rather than either call site) guarantees BOTH
// the ranked-lemma path and the clusters path stay testament-consistent.
async function lookupTranslitViaSubquery(
  testament: 'nt' | 'ot',
  lemmaSelectSql: string,
  lemmaSelectParams: unknown[]
): Promise<Record<string, string | null>> {
  try {
    const map: Record<string, string | null> = {};
    if (testament === 'ot') {
      const rows = await query(
        `SELECT strongs, transliteration FROM lemma_translit_he_strongs
         WHERE strongs IN (${lemmaSelectSql})`,
        lemmaSelectParams
      );
      for (const row of rows) {
        map[row.strongs as string] = row.transliteration as string | null;
      }
      return map;
    }

    const rows = await query(
      `SELECT original_word_nfc, transliteration FROM (
         SELECT original_word_nfc, transliteration,
                ROW_NUMBER() OVER (PARTITION BY original_word_nfc ORDER BY strongs_id) AS rn
         FROM lexicon_lsj
         WHERE original_word_nfc IN (${lemmaSelectSql})
       ) WHERE rn = 1`,
      lemmaSelectParams
    );
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
  const minFrequency = Math.max(0, args.min_frequency ?? 1);

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
      ORDER BY total DESC, lemma
    `;
    params = [canonical, testament, theme, minFrequency];
  } else {
    sql = `
      SELECT lemma, total FROM (
        SELECT lemma, SUM(frequency) as total
        FROM vocabulary
        WHERE book = ? AND testament = ?
        GROUP BY lemma
      ) WHERE total >= ?
      ORDER BY total DESC, lemma
    `;
    params = [canonical, testament, minFrequency];
  }

  const lemmaRows = await query(sql, params);

  // Ranked-lemma-name subquery — the same set the outer lemmaRows query already
  // selected, minus the totals. Used as the IN (…) operand for the lexicon
  // transliteration lookup further down, so that lookup stays at a fixed bind
  // count regardless of result size. (The by-chapter lookup below inlines its
  // own copy of this ranking subquery rather than referencing this one.)
  const rankedLemmaNamesSql = theme
    ? `SELECT lemma FROM (
         SELECT v2.lemma, SUM(v2.frequency) as total
         FROM vocabulary v2
         JOIN thematic_keywords tk2 ON tk2.lemma = v2.lemma AND tk2.testament = v2.testament
         WHERE v2.book = ? AND v2.testament = ? AND tk2.theme = ?
         GROUP BY v2.lemma
       ) WHERE total >= ?
       ORDER BY total DESC, lemma`
    : `SELECT lemma FROM (
         SELECT lemma, SUM(frequency) as total FROM vocabulary
         WHERE book = ? AND testament = ?
         GROUP BY lemma
       ) WHERE total >= ?
       ORDER BY total DESC, lemma`;
  const rankedLemmaNamesParams = theme
    ? [canonical, testament, theme, minFrequency]
    : [canonical, testament, minFrequency];

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
           ORDER BY total DESC, lemma
         )
       ORDER BY v.lemma, v.chapter`,
      [canonical, testament, theme, canonical, testament, theme, minFrequency]
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
           ORDER BY total DESC, lemma
         )
       ORDER BY v.lemma, v.chapter`,
      [canonical, testament, canonical, testament, minFrequency]
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
    ? await lookupTranslitViaSubquery(testament, rankedLemmaNamesSql, rankedLemmaNamesParams)
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
          testament,
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
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
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
    clustering,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
