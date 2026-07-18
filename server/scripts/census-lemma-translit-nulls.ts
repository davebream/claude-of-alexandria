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

// Re-exported for the runner (main(), added in a later task) and for callers
// who want the generator's own pure input-parsing helpers without a second
// import specifier.
export { parseInput, extractConsumerKeys, buildTables };
