import { z } from 'zod';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { getAllBooks } from '../db/books.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LEMMAS = 50;
const D1_PARAM_LIMIT = 100;

// ─── Testament detection ──────────────────────────────────────────────────────

// OT lemmas use Strong's H-prefix (e.g. H7462b, H430).
// NT lemmas are bare Greek lexical forms (e.g. πατήρ, κύριος).
// There is no G-prefix convention in the data.
function isOtLemma(lemma: string): boolean {
  return lemma.length >= 2 && lemma[0] === 'H' && lemma[1] >= '0' && lemma[1] <= '9';
}

// ─── Canonical-to-display name map ────────────────────────────────────────────

// vocabulary table stores lowercase canonical names (e.g. "genesis", "1_corinthians").
// We need display names (e.g. "Genesis", "1 Corinthians") for the response.
let _displayMap: Record<string, string> | null = null;
function getDisplayMap(): Record<string, string> {
  if (!_displayMap) {
    _displayMap = {};
    for (const book of getAllBooks()) {
      _displayMap[book.canonical] = book.displayName;
    }
  }
  return _displayMap;
}

// ─── Input / Output schemas ───────────────────────────────────────────────────

export const LemmasInputSchema = z.strictObject({
  ...PaginationInputShape,
  lemmas: z.array(z.string()).min(1).max(50).describe(
    'Lemma IDs to look up. OT: Strong\'s numbers (e.g. "H7462b"). NT: Greek lexical forms (e.g. "πατήρ"). 1–50 items. Mixed OK.'
  ),
});

export type LemmasInput = z.output<typeof LemmasInputSchema>;

export const DistributionEntry = z.strictObject({
  lemma: z.string(),
  testament: z.enum(['ot', 'nt']),
  total_occurrences: z.number(),
  books_count: z.number(),
  distribution: z.record(z.string(), z.record(z.string(), z.number())),
  // SBL transliteration sibling — present-and-null when unpopulated, never
  // omitted (AC-10). Sourced per testament: NT/Greek from lexicon_lsj (source-
  // read from OpenGNT); OT/Hebrew from lemma_translit_he_strongs, keyed by
  // Strong's number (derived — deterministic SBL rendering, decisions/0007).
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

export const LemmasOutputSchema = z.strictObject({
  page: PageSchema,
  lemmas: z.array(DistributionEntry),
  not_found: z.array(z.string()),
  total_requested: z.number(),
  total_found: z.number(),
});

// ─── Single-testament query ───────────────────────────────────────────────────

interface LemmaResult {
  lemma: string;
  testament: 'ot' | 'nt';
  total_occurrences: number;
  books_count: number;
  distribution: Record<string, Record<string, number>>;
}

async function queryForTestament(
  lemmas: string[],
  testament: 'ot' | 'nt'
): Promise<LemmaResult[]> {
  if (lemmas.length === 0) return [];

  // Defensive guard: 1 (testament) + N (lemmas) must fit D1's bind param limit
  if (1 + lemmas.length > D1_PARAM_LIMIT) {
    throw new Error(`D1 parameter limit exceeded: ${1 + lemmas.length} > ${D1_PARAM_LIMIT}`);
  }

  const displayMap = getDisplayMap();
  const placeholders = lemmas.map(() => '?').join(', ');

  // NT distribution is read from the complete, unfiltered `morphology` table
  // (word-level ground truth), NOT the precomputed `vocabulary` table. The
  // vocabulary ETL applies a per-book significance threshold (min_occurrences)
  // and silently drops rare-per-book lemmas — e.g. μεταξύ occurs once in
  // John 4:31, so the min-3 filter excluded it and the tool reported 0
  // occurrences in John. COUNT(*) over morphology yields exact per-book/chapter
  // frequencies with no threshold. NT lemma keys are Greek lexical forms, which
  // match morphology.lemma byte-for-byte (and match query_morphology's output,
  // the documented source of these keys).
  //
  // OT still reads `vocabulary`: OT keys are Strong's numbers whose format
  // (unpadded, base sense — "H430", "H7225") matches vocabulary.lemma but NOT
  // morphology.strongs (zero-padded, sense-suffixed — "H0430", "H1886a").
  // Reconciling those formats is a separate effort (cf. decisions/0007–0008);
  // OT completeness is delivered by lowering the vocabulary ETL threshold and
  // reseeding, not by repointing here.
  const rows = testament === 'nt'
    ? await query(
        `SELECT lemma, book, chapter, COUNT(*) AS frequency
         FROM morphology
         WHERE testament = ? AND lemma IN (${placeholders})
         GROUP BY lemma, book, chapter
         ORDER BY lemma, book, chapter`,
        [testament, ...lemmas]
      )
    : await query(
        `SELECT v.lemma, v.book, v.chapter, v.frequency
         FROM vocabulary v
         WHERE v.testament = ? AND v.lemma IN (${placeholders})
         ORDER BY v.lemma, v.book, v.chapter`,
        [testament, ...lemmas]
      );

  // Group rows by lemma → book → chapter
  const grouped: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of rows) {
    const lemma = row.lemma as string;
    const book = row.book as string;
    const chapter = String(row.chapter);
    const freq = row.frequency as number;

    if (!grouped[lemma]) grouped[lemma] = {};
    if (!grouped[lemma][book]) grouped[lemma][book] = {};
    grouped[lemma][book][chapter] = freq;
  }

  // Build result array with display names and computed totals
  return Object.entries(grouped).map(([lemma, books]) => {
    const distribution: Record<string, Record<string, number>> = {};
    let totalOccurrences = 0;

    for (const [canonical, chapters] of Object.entries(books)) {
      const displayName = displayMap[canonical] ?? canonical;
      distribution[displayName] = chapters;
      for (const count of Object.values(chapters)) {
        totalOccurrences += count;
      }
    }

    return {
      lemma,
      testament,
      total_occurrences: totalOccurrences,
      books_count: Object.keys(distribution).length,
      distribution,
    };
  });
}

// ─── Transliteration lookup (partitioned by testament) ────────────────────────
// The two testaments source transliteration from different tables, so this
// lookup partitions its input via isOtLemma and routes each half separately,
// then merges the two result maps:
//   • NT (Greek) → lexicon_lsj.original_word_nfc  (source-read from OpenGNT)
//   • OT (H-number) → lemma_translit_he_strongs.strongs  (derived, decisions/0007)
// Each half is independently guarded with try/catch → {} so a failure (or a
// missing table) degrades that partition's entries to lemma_translit: null
// rather than failing the whole call — the primary lemma data already succeeded.

// NT: lemma → lexicon_lsj.original_word_nfc → transliteration, with a
// deterministic lowest-strongs_id tie-break (a lemma can map to multiple
// Strong's numbers; original_word_nfc is NOT unique — see
// idx_lsj_original_word_nfc, migration 0011). A single guarded IN (…) is fine:
// lemmas.ts already bounds input at MAX_LEMMAS = 50, well under D1_PARAM_LIMIT.
async function lookupNtTranslit(lemmas: string[]): Promise<Record<string, string | null>> {
  if (lemmas.length === 0) return {};
  if (lemmas.length > D1_PARAM_LIMIT) return {};

  try {
    const placeholders = lemmas.map(() => '?').join(', ');
    const rows = await query(
      `SELECT original_word_nfc, transliteration FROM (
         SELECT original_word_nfc, transliteration,
                ROW_NUMBER() OVER (PARTITION BY original_word_nfc ORDER BY strongs_id) AS rn
         FROM lexicon_lsj
         WHERE original_word_nfc IN (${placeholders})
       ) WHERE rn = 1`,
      lemmas
    );

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.original_word_nfc as string] = row.transliteration as string | null;
    }
    return map;
  } catch {
    // Degrade to null for every requested lemma rather than erroring the call.
    return {};
  }
}

// OT: Strong's number → lemma_translit_he_strongs.strongs → transliteration.
// The table carries BOTH exact ('H7225a') and base ('H7225') forms, so the
// consumer key is matched directly with no format massaging here.
async function lookupOtTranslit(lemmas: string[]): Promise<Record<string, string | null>> {
  if (lemmas.length === 0) return {};
  if (lemmas.length > D1_PARAM_LIMIT) return {};

  try {
    const placeholders = lemmas.map(() => '?').join(', ');
    const rows = await query(
      `SELECT strongs, transliteration FROM lemma_translit_he_strongs
       WHERE strongs IN (${placeholders})`,
      lemmas
    );

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.strongs as string] = row.transliteration as string | null;
    }
    return map;
  } catch {
    // Degrade to null for every requested lemma rather than erroring the call.
    return {};
  }
}

// Partition distinct lemmas by testament, resolve each half against its own
// table, and merge the two maps into one lemma → transliteration lookup.
async function lookupLemmaTranslit(lemmas: string[]): Promise<Record<string, string | null>> {
  const otLemmas: string[] = [];
  const ntLemmas: string[] = [];
  for (const lemma of lemmas) {
    if (isOtLemma(lemma)) otLemmas.push(lemma);
    else ntLemmas.push(lemma);
  }

  const [ntMap, otMap] = await Promise.all([
    lookupNtTranslit(ntLemmas),
    lookupOtTranslit(otLemmas),
  ]);

  return { ...ntMap, ...otMap };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function queryLemmas(args: LemmasInput): Promise<CallToolResult> {
  const { lemmas } = args;

  // Validation
  if (!lemmas || lemmas.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'EMPTY_LEMMAS', message: 'At least one lemma required.' } }) }],
      isError: true,
    };
  }

  if (lemmas.length > MAX_LEMMAS) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'LEMMA_LIMIT_EXCEEDED', message: `Maximum ${MAX_LEMMAS} lemmas per query. Split into batches.`, max: MAX_LEMMAS, received: lemmas.length } }) }],
      isError: true,
    };
  }

  // Partition by testament
  const otLemmas: string[] = [];
  const ntLemmas: string[] = [];
  for (const lemma of lemmas) {
    if (isOtLemma(lemma)) {
      otLemmas.push(lemma);
    } else {
      ntLemmas.push(lemma);
    }
  }

  // Query both testaments in parallel
  const [otResults, ntResults] = await Promise.all([
    queryForTestament(otLemmas, 'ot'),
    queryForTestament(ntLemmas, 'nt'),
  ]);

  const allResults = [...otResults, ...ntResults];

  // Attach lemma_translit siblings — present-and-null uniformly (AC-10). The
  // lookup partitions distinct lemmas by testament and resolves each half
  // against its own table (NT → lexicon_lsj, OT → lemma_translit_he_strongs).
  const distinctLemmas = [...new Set(allResults.map(r => r.lemma))];
  const translitMap = await lookupLemmaTranslit(distinctLemmas);
  const allResultsWithTranslit = allResults.map(r => ({
    ...r,
    lemma_translit: translitMap[r.lemma] ?? null,
  }));

  // Compute not_found per testament
  const foundLemmas = new Set(allResults.map(r => r.lemma));
  const notFound = lemmas.filter(l => !foundLemmas.has(l));

  // Build response
  const result = {
    lemmas: allResultsWithTranslit,
    not_found: notFound,
    total_requested: lemmas.length,
    total_found: allResultsWithTranslit.length,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
