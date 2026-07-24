import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';

export const ThemesInputSchema = z.strictObject({
  lemmas: z.array(z.string()).min(1).max(100).describe(
    'Array of lemmas to resolve (Greek for NT, Strong\'s numbers for OT). Max 100.'
  ),
  testament: z.enum(['nt', 'ot']).describe(
    'Testament — must match the testament used in query_morphology'
  ),
  include_unmatched: z.boolean().default(true).describe(
    'Include unmatched lemmas in response (default: true). Set false to reduce payload.'
  ),
});

export type ThemesInput = z.output<typeof ThemesInputSchema>;

export const ThemesOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  testament: z.string(),
  themes: z.array(z.string()),
  matches: z.record(z.string(), z.array(z.string())),
  unmatched: z.array(z.string()).optional(),
  total_lemmas: z.number(),
  matched_count: z.number(),
  unmatched_count: z.number(),
  report_gap: z.string().optional(),
  // Parallel lookup map — { lemma → transliteration|null } — keyed over the
  // SAME lemma that appears as a KEY in `matches` above (a Greek surface form
  // for NT, a Strong's number for OT). `matches` cannot be restructured to
  // carry transliteration inline without changing an existing field's type
  // (forbidden by AC-11), so this sibling map covers exactly the lemma set the
  // response actually emits. Present-and-null when unpopulated, never omitted
  // (AC-10) — same uniform rule as the value-shaped tools' `lemma_translit`/
  // `word_translit` siblings.
  lemma_translit: z.record(z.string(), z.string().nullable()).describe(
    "Map of lemma → transliteration. Hebrew (OT): derived — deterministic SBL "
    + "rendering of the pointed lemma, keyed by Strong's number (decisions/0007). "
    + "Greek (NT): source-read from OpenGNT. "
    + "A value may be null: for OT when no pointed lemma is attested for the "
    + "Strong's number — an unpointed/consonantal-only lemma, or a sense-suffixed "
    + "or Aramaic Strong's that MACULA does not attest; for NT when the lexicon "
    + "has no match. Null is a defined honest boundary, not an error, and does not "
    + "mean the word is absent from the text."
  ),
});

// ─── Transliteration lookup ────────────────────────────────────────────────────
// A themes call is single-testament, so the lookup source is a clean branch, not
// a partition-and-merge. Either branch is bounded by the input schema's max(100)
// lemmas — a single guarded IN (?,?,…) stays well under D1's ~100 bind-param
// ceiling (same reasoning as lemmas.ts).
//   • OT — the "lemma" IS a Strong's number, so it keys directly into
//     lemma_translit_he_strongs.strongs (PRIMARY KEY, so no tie-break needed).
//     Values are derived (decisions/0007), shipped via the guarded local backfill command.
//   • NT — the lemma is a Greek surface form keyed against lexicon_lsj.original_word_nfc,
//     which is NOT unique, hence the lowest-strongs_id ROW_NUMBER() tie-break
//     (see idx_lsj_original_word_nfc, migration 0011).
//
// Wrapped so a lookup failure degrades every key to lemma_translit: null rather
// than failing the whole call — the primary matches data already succeeded.
async function lookupLemmaTranslit(lemmas: string[], testament: 'nt' | 'ot'): Promise<Record<string, string | null>> {
  if (lemmas.length === 0 || lemmas.length > 100) return {};

  try {
    const placeholders = lemmas.map(() => '?').join(', ');

    if (testament === 'ot') {
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
    }

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
    return {};
  }
}

export async function queryThemesForLemmas(args: ThemesInput): Promise<CallToolResult> {
  const testament = args.testament;
  const includeUnmatched = args.include_unmatched ?? true;

  // Defense in depth: runtime guard matching vocabulary.ts:66-71
  if (testament !== 'nt' && testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_TESTAMENT', message: `Invalid testament: '${testament}'. Use 'nt' or 'ot'.` } }) }],
      isError: true,
    };
  }

  // Deduplicate and sort (caller in index.ts also normalizes for cache key,
  // but the handler must work correctly regardless)
  const uniqueLemmas = [...new Set(args.lemmas)].sort();

  if (uniqueLemmas.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'EMPTY_LEMMAS', message: 'At least one lemma is required.' } }) }],
      isError: true,
    };
  }

  // Build IN clause with dynamic placeholder count.
  // Testament is interpolated (validated enum) to reserve all 100 D1 bind slots for lemmas.
  const placeholders = uniqueLemmas.map(() => '?').join(', ');
  const sql = `
    SELECT lemma, theme
    FROM thematic_keywords
    WHERE lemma IN (${placeholders})
      AND testament = '${testament}'
    ORDER BY lemma, theme
  `;

  const rows = await query(sql, uniqueLemmas);

  // Build matches map: { lemma → theme[] }
  const matches: Record<string, string[]> = {};
  const themeCounts: Record<string, number> = {};

  for (const row of rows) {
    const lemma = row.lemma as string;
    const theme = row.theme as string;

    if (!matches[lemma]) matches[lemma] = [];
    matches[lemma].push(theme);

    themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
  }

  // Sort themes by match count desc, alphabetical tiebreaker
  const themes = Object.keys(themeCounts).sort((a, b) => {
    const countDiff = themeCounts[b] - themeCounts[a];
    if (countDiff !== 0) return countDiff;
    return a.localeCompare(b);
  });

  // Derive unmatched
  const unmatched = uniqueLemmas.filter(l => !matches[l]);

  // lemma_translit — keyed over the lemma set the response ACTUALLY EMITS, not
  // over all requested lemmas. When include_unmatched is false, the unmatched
  // lemmas are omitted from lemma_translit too, so the suppressed lemmas do not
  // leak back into the payload (include_unmatched is documented as "Set false to
  // reduce payload"). A client can always look up any lemma it sees as a key in
  // `matches` (and, when present, in `unmatched`).
  const translitKeys = includeUnmatched
    ? [...Object.keys(matches), ...unmatched]
    : Object.keys(matches);
  const translitLookup = await lookupLemmaTranslit(translitKeys, testament);
  const lemmaTranslit: Record<string, string | null> = {};
  for (const lemma of translitKeys) {
    lemmaTranslit[lemma] = translitLookup[lemma] ?? null;
  }

  const result: Record<string, unknown> = {
    testament,
    themes,
    matches,
    total_lemmas: uniqueLemmas.length,
    matched_count: uniqueLemmas.length - unmatched.length,
    unmatched_count: unmatched.length,
    lemma_translit: lemmaTranslit,
  };

  if (includeUnmatched) {
    result.unmatched = unmatched;
  }

  if (unmatched.length > 0) {
    result.report_gap = 'Some lemmas have no theme mapping. If you expected coverage, report it: https://github.com/davebream/claude-of-alexandria/issues/new?template=data-gap.md';
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
