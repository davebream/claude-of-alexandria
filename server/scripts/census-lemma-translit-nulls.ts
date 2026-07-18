/**
 * Hebrew lemma_translit null re-census (read-only).
 *
 * Recomputes and categorizes every OT Strong's key still resolving to null
 * `lemma_translit` against FULL corpus data (never against `query_vocabulary`'s
 * truncated tool sample — see decisions/0008 and the issue this census answers).
 * Reuses the shipped generator's OWN classification data (`baseInfo`,
 * `emittedKeys` — exposed additively by generate-lemma-translit.ts's C0 export,
 * see its buildTables docblock) so this census cannot drift from the generator's
 * actual singleton/homograph decision (OR-7).
 *
 * Inputs (all pure — no I/O in `censusNulls` itself):
 *   - emitRows: the parsed MACULA-derived emit rows (same shape the generator
 *     consumes) — used here ONLY to reconstruct a RAW per-base grouping
 *     BEFORE the niqqud filter, which the generator's own `baseInfo` does not
 *     retain (it is already niqqud-filtered).
 *   - consumerKeys: the full OT Strong's key set the vocabulary/themes tools
 *     query (same shape `extractConsumerKeys` produces).
 *   - shippedStrongsKeys: the FULL production `lemma_translit_he_strongs` key
 *     set (exact + base + unpadded + alias) — direct D1 read, bypassing the
 *     24h Worker response cache (OR-10).
 *   - baseInfo / emittedKeys: the generator's own C0-exposed return fields.
 *   - safeRecoverable: the regenerated `baseline.safe_recoverable_strongs`
 *     from the SAME `buildTables` call that produced `baseInfo`/`emittedKeys`
 *     (never a separately-generated file — see the runner, C2).
 *
 * Classification is exhaustive over FOUR buckets. `missedRecoveries` (the AC-2
 * defect: a safe-recoverable key production did not ship) is computed FIRST
 * and EXCLUDED from the three honest-null buckets below — a missed-recovery
 * key has a singleton, pointed base and would otherwise match none of the
 * three and hit the corruption-guard throw, crashing the census on exactly
 * the defect it exists to report (plan-review CR-1):
 *
 *   - homograph:         baseInfo[B].translits.size >= 2
 *   - unpointed:          raw rows present for B, none carry niqqud
 *   - unattestedAramaic:  zero raw rows for B in the MACULA extract
 *
 * Every residual-null key (suffixed OR non-suffixed — the classifier's
 * `not-suffixed` verdict never orphans a null here) lands in exactly one of
 * missed-recovery / homograph / unpointed / unattested-Aramaic. A key that is
 * genuinely none of these is a hard error — a corruption guard, never a
 * silent drop.
 *
 * Aramaic-label operational caveat: "unattestedAramaic" is defined
 * OPERATIONALLY as "base with zero raw rows in the MACULA-Hebrew extract." If
 * the extract includes pointed OT Aramaic (Daniel/Ezra), those bases would
 * instead land in baseInfo and classify as homograph/singleton — so this
 * bucket is a superset that MAY include non-Aramaic unattested bases too; the
 * report must state this and spot-check a sample.
 */

import { readFileSync, writeFileSync } from 'fs';
import {
  baseStrongs,
  unpad,
  hasNiqqud,
  parseInput,
  extractConsumerKeys,
  buildTables,
  type Row,
  type BaseInfo,
} from './generate-lemma-translit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A residual-null key and the base strongs its classification was decided against. */
export interface CategorizedKey {
  key: string;
  base: string;
}

/** Reconciliation verdict for one of decision-0008's illustrative examples. */
export interface Stale0008Entry {
  status: 'recovered' | 'null';
  reason?: 'homograph' | 'unpointed' | 'unattestedAramaic' | 'missed-recovery' | 'not-a-consumer-key';
}

export interface CensusResult {
  homograph: CategorizedKey[];
  unpointed: CategorizedKey[];
  unattestedAramaic: CategorizedKey[];
  /** AC-2 defect: safe-recoverable keys production did not ship. */
  missedRecoveries: string[];
  /** Size of the regenerated `safeRecoverable` set (AC-3). */
  recoveredCount: number;
  /** Total consumer keys absent from `shippedStrongsKeys` (all four buckets). */
  residualCount: number;
  /** Reconciliation of decisions/0008's H1121a / H1004b / H834a examples. */
  stale0008: Record<string, Stale0008Entry>;
  /** Reverse cross-check: shipped-as-alias-shaped keys the regenerated run no longer emits at all. */
  shippedNotRegenerated: string[];
  /** Degenerate-input guard: empty consumer set, or zero direct resolutions. */
  floorTripped: boolean;
}

export interface CensusInput {
  emitRows: Row[];
  consumerKeys: Iterable<string>;
  shippedStrongsKeys: ReadonlySet<string>;
  baseInfo: Map<string, BaseInfo>;
  emittedKeys: ReadonlySet<string>;
  safeRecoverable: readonly string[];
}

const STALE_0008_KEYS = ['H1121a', 'H1004b', 'H834a'] as const;

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Pure census core. See the module docblock for the four-bucket partition and
 * why `missedRecoveries` must be computed and excluded first.
 */
export function censusNulls(input: CensusInput): CensusResult {
  const { emitRows, consumerKeys, shippedStrongsKeys, baseInfo, safeRecoverable } = input;
  const uniqueConsumerKeys = [...new Set(consumerKeys)];

  // Raw per-base grouping of emitRows, BEFORE the niqqud filter — the one
  // analysis the generator's own baseInfo cannot provide (it is post-filter).
  const rawByBase = new Map<string, Row[]>();
  for (const row of emitRows) {
    if (row.strongs === '') continue;
    const base = unpad(baseStrongs(row.strongs));
    let bucket = rawByBase.get(base);
    if (!bucket) {
      bucket = [];
      rawByBase.set(base, bucket);
    }
    bucket.push(row);
  }

  const safeRecoverableSet = new Set(safeRecoverable);
  // AC-2 defect: a set difference, NEVER a classifySuffixedStrongs re-run (the
  // exposed emittedKeys is alias-inclusive; re-classifying would return
  // already-emitted and mask the exact defect — decisions/0008, verify-
  // lemma-translit-coverage.mjs:233).
  const missedRecoveries = [...safeRecoverableSet].filter((k) => !shippedStrongsKeys.has(k));
  const missedSet = new Set(missedRecoveries);

  const residualKeys = uniqueConsumerKeys.filter((k) => !shippedStrongsKeys.has(k));

  const homograph: CategorizedKey[] = [];
  const unpointed: CategorizedKey[] = [];
  const unattestedAramaic: CategorizedKey[] = [];

  for (const key of residualKeys) {
    if (missedSet.has(key)) continue; // excluded FIRST (plan-review CR-1)

    const base = unpad(baseStrongs(key));
    const info = baseInfo.get(base);
    if (info && info.translits.size >= 2) {
      homograph.push({ key, base });
      continue;
    }

    const rawRows = rawByBase.get(base);
    if (rawRows && rawRows.length > 0) {
      const anyPointed = rawRows.some((r) => hasNiqqud(r.lemma));
      if (!anyPointed) {
        unpointed.push({ key, base });
        continue;
      }
      // Raw rows exist AND at least one carries niqqud, yet the key matched
      // neither the missed-recovery set nor the homograph bucket: this is the
      // singleton-pointed-base drift shape (R2 NEW-1) — never silently
      // dropped, always a hard corruption-guard error.
      throw new Error(
        `Unclassifiable residual-null key ${JSON.stringify(key)} (base ${JSON.stringify(base)}): ` +
          'not a missed-recovery, not homograph (translits.size>=2), not unpointed ' +
          '(a raw row carries niqqud), and raw rows are non-empty (not unattested). ' +
          'This is a corruption guard, not a defect path — investigate baseInfo/emitRows drift.',
      );
    } else {
      unattestedAramaic.push({ key, base });
    }
  }

  const recoveredCount = safeRecoverable.length;
  const residualCount = residualKeys.length;

  // Reverse cross-check (AC-3): a suffixed key shipped in production that the
  // regenerated run does not emit at all — neither natively attested (exact/
  // base/unpadded) nor freshly safe-recovered. `emittedKeys` already subsumes
  // safeRecoverable (aliases are added to it), so testing against it alone is
  // sufficient and avoids double-computing the alias set.
  const shippedNotRegenerated = uniqueConsumerKeys.filter(
    (k) => /[a-z]$/.test(k) && shippedStrongsKeys.has(k) && !input.emittedKeys.has(k),
  );

  const stale0008: Record<string, Stale0008Entry> = {};
  for (const key of STALE_0008_KEYS) {
    if (shippedStrongsKeys.has(key)) {
      stale0008[key] = { status: 'recovered' };
      continue;
    }
    if (missedSet.has(key)) {
      stale0008[key] = { status: 'null', reason: 'missed-recovery' };
      continue;
    }
    const inHomograph = homograph.some((e) => e.key === key);
    const inUnpointed = unpointed.some((e) => e.key === key);
    const inUnattested = unattestedAramaic.some((e) => e.key === key);
    if (inHomograph) stale0008[key] = { status: 'null', reason: 'homograph' };
    else if (inUnpointed) stale0008[key] = { status: 'null', reason: 'unpointed' };
    else if (inUnattested) stale0008[key] = { status: 'null', reason: 'unattestedAramaic' };
    else stale0008[key] = { status: 'null', reason: 'not-a-consumer-key' };
  }

  const directlyResolved = uniqueConsumerKeys.filter((k) => shippedStrongsKeys.has(k)).length;
  const floorTripped = uniqueConsumerKeys.length === 0 || directlyResolved === 0;

  return {
    homograph,
    unpointed,
    unattestedAramaic,
    missedRecoveries,
    recoveredCount,
    residualCount,
    stale0008,
    shippedNotRegenerated,
    floorTripped,
  };
}

// ─── Report renderer ──────────────────────────────────────────────────────────

export interface CensusReportMeta {
  /** ISO date the census was run, for the report header. */
  generatedAt: string;
}

function renderCategorySection(title: string, entries: CategorizedKey[]): string {
  const lines = [`### ${title} (${entries.length})`, ''];
  if (entries.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Strong\'s key | Base | Evidence |', '|---|---|---|');
    for (const { key, base } of entries) {
      lines.push(`| ${key} | ${base} | ${title.toLowerCase()} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Render a `censusNulls` result to markdown (C3). Pure string builder — no
 * I/O. See the module docblock for the Aramaic-label operational caveat this
 * section states (RC-3).
 */
export function renderCensusReport(result: CensusResult, meta: CensusReportMeta): string {
  const lines: string[] = [];

  lines.push('# Hebrew lemma_translit null census');
  lines.push('');
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push('');
  lines.push(
    `**Recovered:** ${result.recoveredCount} — **Residual null:** ${result.residualCount}` +
      ' (supersedes the stale ~57/~92 estimate).',
  );
  if (result.floorTripped) {
    lines.push('');
    lines.push(
      '**FLOOR TRIPPED:** the consumer-key set was empty or zero keys resolved directly ' +
        'against the shipped strongs table — this census input is degenerate and MUST NOT be trusted.',
    );
  }
  lines.push('');

  lines.push(renderCategorySection('Homograph', result.homograph));
  lines.push(renderCategorySection('Unpointed', result.unpointed));
  lines.push(renderCategorySection('Unattested / Aramaic', result.unattestedAramaic));

  lines.push('## AC-2: missed recoveries (safe-recoverable but not shipped)');
  lines.push('');
  if (result.missedRecoveries.length === 0) {
    lines.push('_None — every safe-recoverable key was shipped._');
  } else {
    lines.push(
      `${result.missedRecoveries.length} key(s) the generator would recover but production did not ship:`,
    );
    lines.push('');
    for (const key of result.missedRecoveries) lines.push(`- ${key}`);
  }
  lines.push('');

  lines.push('## Reverse cross-check: shipped but not regenerated');
  lines.push('');
  if (result.shippedNotRegenerated.length === 0) {
    lines.push('_None — every shipped alias-shaped key is reproduced by the regenerated run._');
  } else {
    for (const key of result.shippedNotRegenerated) lines.push(`- ${key}`);
  }
  lines.push('');

  lines.push('## Decision-0008 reconciliation');
  lines.push('');
  for (const [key, entry] of Object.entries(result.stale0008)) {
    const label = entry.status === 'recovered' ? 'recovered' : `null (${entry.reason})`;
    lines.push(`- ${key}: ${label}`);
  }
  lines.push('');

  lines.push('## Aramaic-label operational caveat');
  lines.push('');
  lines.push(
    'The "Unattested / Aramaic" bucket above is defined OPERATIONALLY as "base with ' +
      'zero raw rows in the MACULA-Hebrew extract." If the extract includes pointed OT ' +
      'Aramaic (Daniel/Ezra) with attested lemmas, those bases would instead classify as ' +
      'homograph or singleton-recoverable, not land here — so this bucket is a superset ' +
      'that may include genuinely-unattested non-Aramaic bases too. Spot-check a sample ' +
      'before treating every entry as confirmed Aramaic.',
  );
  lines.push('');

  return lines.join('\n');
}

// ─── Runner / data acquisition (C2) ────────────────────────────────────────────

/**
 * Extract the FULL shipped `lemma_translit_he_strongs` key set from a wrangler
 * `d1 execute --json` payload (or a bare string array), plucking the `strongs`
 * column. Mirrors `extractConsumerKeys` in generate-lemma-translit.ts, which
 * plucks `lemma` instead — the two consumer namespaces use different column
 * names for the same JSON shape.
 */
export function extractShippedStrongsKeys(jsonText: string): string[] {
  const json = JSON.parse(jsonText) as unknown;
  const values: unknown[] = [];
  if (Array.isArray(json)) {
    if (json.length === 0) return [];
    if (typeof json[0] === 'string') {
      values.push(...json);
    } else if (json[0] && Array.isArray((json[0] as { results?: unknown }).results)) {
      for (const stmt of json as Array<{ results?: Array<Record<string, unknown>> }>) {
        for (const row of stmt.results ?? []) values.push(row.strongs);
      }
    } else {
      for (const row of json as Array<Record<string, unknown>>) values.push(row?.strongs);
    }
  } else if (json && Array.isArray((json as { results?: unknown }).results)) {
    for (const row of (json as { results: Array<Record<string, unknown>> }).results) {
      values.push(row.strongs);
    }
  } else {
    throw new Error('Unrecognized shipped-strongs JSON shape');
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function printUsage(): void {
  console.error(
    'usage: census-lemma-translit-nulls.ts --emit <emit.tsv> --consumer-keys <keys.json> ' +
      '--shipped-strongs <strongs.json> --out <report.md>',
  );
  console.error('');
  console.error('Live data acquisition (documented, not run automatically by this script):');
  console.error('  1. Regenerate emit.tsv from .cache/macula-hebrew.tsv:');
  console.error('     python3 server/scripts/emit-lemma-strongs.py .cache/macula-hebrew.tsv <emit.tsv>');
  console.error('  2. Fetch consumer keys (bypasses the 24h Worker response cache, OR-10):');
  console.error(
    '     wrangler d1 execute claude-of-alexandria --remote --json --command ' +
      '"SELECT DISTINCT lemma FROM vocabulary WHERE testament=\'ot\' ' +
      'UNION SELECT DISTINCT lemma FROM thematic_keywords WHERE testament=\'ot\'" > consumer-keys.json',
  );
  console.error('  3. Fetch the full shipped strongs key set:');
  console.error(
    '     wrangler d1 execute claude-of-alexandria --remote --json --command ' +
      '"SELECT strongs FROM lemma_translit_he_strongs" > shipped-strongs.json',
  );
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag || !flag.startsWith('--')) {
      throw new Error(`Expected a --flag, got ${JSON.stringify(flag)}`);
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    args[flag.slice(2)] = value;
  }
  return args;
}

/**
 * CLI entry point (C2). Reads fixture-style inputs (explicit file paths — the
 * unit-test / offline path; see the docblock's live-acquisition commands for
 * the credentialed path) and invokes `censusNulls`. Fails closed: on a missing/
 * unreadable input file OR a `floorTripped` degenerate input, it prints a
 * clear message and writes NO report — a truncated census is worse than none.
 *
 * `baseInfo`, `emittedKeys`, and `safeRecoverable` all come from a SINGLE
 * `buildTables(emitRows, consumerKeys)` call (RC-1) — never a separately
 * generated `--safe-recoverable` file — so the recovered set the census diffs
 * against is the exact set this run computed, never a value that could drift.
 */
export function main(argv: string[]): number {
  let args: Record<string, string>;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    printUsage();
    return 2;
  }

  const { emit, out } = args;
  const consumerKeysPath = args['consumer-keys'];
  const shippedStrongsPath = args['shipped-strongs'];
  if (!emit || !consumerKeysPath || !shippedStrongsPath || !out) {
    printUsage();
    return 2;
  }

  let emitContent: string;
  let consumerKeysContent: string;
  let shippedStrongsContent: string;
  try {
    emitContent = readFileSync(emit, 'utf8');
    consumerKeysContent = readFileSync(consumerKeysPath, 'utf8');
    shippedStrongsContent = readFileSync(shippedStrongsPath, 'utf8');
  } catch (err) {
    console.error('Fatal: could not read an input file —', err instanceof Error ? err.message : err);
    console.error('Refusing to write a partial report.');
    return 1;
  }

  const emitRows = parseInput(emitContent);
  const consumerKeys = extractConsumerKeys(consumerKeysContent);
  const shippedStrongsKeys = new Set(extractShippedStrongsKeys(shippedStrongsContent));

  const { baseInfo, emittedKeys, baseline } = buildTables(emitRows, consumerKeys);
  const result = censusNulls({
    emitRows,
    consumerKeys,
    shippedStrongsKeys,
    baseInfo,
    emittedKeys,
    safeRecoverable: baseline.safe_recoverable_strongs,
  });

  if (result.floorTripped) {
    console.error(
      'FLOOR TRIPPED: the consumer-key set is empty, or zero keys resolve directly against ' +
        'the shipped strongs table. This is a degenerate input (wrong DB binding, mis-scoped ' +
        'token, or a dropped/empty table), not a clean census. Refusing to write a report.',
    );
    return 1;
  }

  const report = renderCensusReport(result, {
    generatedAt: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(out, report, 'utf8');
  console.error(`Census report written to ${out}`);
  console.error(`recovered=${result.recoveredCount} residual=${result.residualCount}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Re-exported for callers who want the generator's own pure input-parsing
// helpers without a second import specifier.
export { parseInput, extractConsumerKeys, buildTables };
