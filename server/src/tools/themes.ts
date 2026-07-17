import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { jsonArray } from './json-array.js';

export const ThemesInputSchema = {
  lemmas: jsonArray(z.array(z.string()).min(1).max(100)).describe(
    'Array of lemmas to resolve (Greek for NT, Strong\'s numbers for OT). Max 100.'
  ),
  testament: z.enum(['nt', 'ot']).describe(
    'Testament — must match the testament used in query_morphology'
  ),
  include_unmatched: z.boolean().optional().describe(
    'Include unmatched lemmas in response (default: true). Set false to reduce payload.'
  ),
};

export type ThemesInput = z.output<z.ZodObject<typeof ThemesInputSchema>>;

export const ThemesOutputSchema = {
  testament: z.string(),
  themes: z.array(z.string()),
  matches: z.record(z.string(), z.array(z.string())),
  unmatched: z.array(z.string()).optional(),
  total_lemmas: z.number(),
  matched_count: z.number(),
  unmatched_count: z.number(),
  // Parallel lookup map — { lemma → transliteration|null } — keyed over the
  // SAME Greek lemma that appears as a KEY in `matches` above. `matches`
  // cannot be restructured to carry transliteration inline without changing
  // an existing field's type (forbidden by AC-11), so this sibling map
  // covers exactly the lemma set the response actually emits. Present-and-
  // null when unpopulated, never omitted (AC-10) — same uniform rule as the
  // value-shaped tools' `lemma_translit`/`word_translit` siblings.
  lemma_translit: z.record(z.string(), z.string().nullable()),
};

// ─── Lexicon transliteration lookup ───────────────────────────────────────────
// lemma → lexicon_lsj.original_word_nfc → transliteration, with a deterministic
// lowest-strongs_id tie-break (a lemma can map to multiple Strong's numbers,
// original_word_nfc is NOT unique — see idx_lsj_original_word_nfc, migration
// 0011). A single guarded IN (…) is fine here: the key set is bounded by the
// input schema's max(100) lemmas, well under D1's ~100 bind-param ceiling —
// same reasoning as lemmas.ts.
//
// Wrapped so a lexicon failure degrades every key to lemma_translit: null
// rather than failing the whole call — the primary matches data already
// succeeded.
async function lookupLemmaTranslit(lemmas: string[]): Promise<Record<string, string | null>> {
  if (lemmas.length === 0 || lemmas.length > 100) return {};

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
  const translitLookup = await lookupLemmaTranslit(translitKeys);
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
