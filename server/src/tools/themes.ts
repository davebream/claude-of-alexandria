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
};

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

  const result: Record<string, unknown> = {
    testament,
    themes,
    matches,
    total_lemmas: uniqueLemmas.length,
    matched_count: uniqueLemmas.length - unmatched.length,
    unmatched_count: unmatched.length,
  };

  if (includeUnmatched) {
    result.unmatched = unmatched;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
