/**
 * Unit tests for the read-only Hebrew lemma_translit null census core.
 *
 * These tests drive `censusNulls` (and, once added, `renderCensusReport` and
 * the `main()` runner) with synthetic corpus rows and synthetic shipped/consumer
 * key sets — no network, no D1. They assert COMPUTED CONTENTS of the returned
 * buckets, not merely field presence, per plan-review CR-1/RC-2/RC-4.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseInput, buildTables } from './generate-lemma-translit.js';
import { censusNulls, renderCensusReport, main } from './census-lemma-translit-nulls.js';

// (a) Homograph base -> residual null key lands in `homograph`.
describe('censusNulls — homograph bucket', () => {
  it('a suffixed key over a homograph base is classified homograph', () => {
    const rows = parseInput('רֵאשִׁית\tH8500a\t2\nחָכְמָה\tH8500b\t7\n');
    const consumerKeys = ['H8500c'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.homograph).toEqual([{ key: 'H8500c', base: 'H8500' }]);
    expect(result.unpointed).toEqual([]);
    expect(result.unattestedAramaic).toEqual([]);
    expect(result.missedRecoveries).toEqual([]);
  });
});

// (b) Base attested only consonantally (no niqqud) -> `unpointed`.
describe('censusNulls — unpointed bucket', () => {
  it('a suffixed key over a consonants-only base is classified unpointed', () => {
    const rows = parseInput('אבג\tH9\t4\n');
    const consumerKeys = ['H9a'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.unpointed).toEqual([{ key: 'H9a', base: 'H9' }]);
    expect(result.homograph).toEqual([]);
    expect(result.unattestedAramaic).toEqual([]);
  });
});

// (c) Zero raw rows for the base -> `unattestedAramaic`.
describe('censusNulls — unattestedAramaic bucket', () => {
  it('a suffixed key whose base has zero raw rows is classified unattestedAramaic', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n'); // unrelated base, H500 never attested
    const consumerKeys = ['H500a'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.unattestedAramaic).toEqual([{ key: 'H500a', base: 'H500' }]);
  });
});

// (d) Non-suffixed residual null (e.g. H430) whose base is unattested -> correct
// bucket. Guards the `not-suffixed` classifier-verdict orphan case.
describe('censusNulls — non-suffixed residual null routing', () => {
  it('a bare non-suffixed key with zero raw rows lands in unattestedAramaic, not dropped', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const consumerKeys = ['H430']; // no trailing lowercase letter
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.unattestedAramaic).toEqual([{ key: 'H430', base: 'H430' }]);
  });
});

// (e) [CR-1 net] a safe-recoverable key absent from the shipped set (AC-2 defect)
// must NOT throw, must appear in missedRecoveries, and must be excluded from all
// three honest-null buckets.
describe('censusNulls — CR-1: missedRecoveries excluded from honest-null buckets', () => {
  it('a singleton-base alias dropped from production is a missed recovery, never a thrown/bucketed null', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n'); // base H1121 attests exactly one pointed lemma
    const consumerKeys = ['H1121a'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    // emittedKeys (as returned by buildTables) already includes the recovered
    // alias 'H1121a' — mirroring runtime so the wiring cannot mask a false
    // negative (the fixture must include the alias per plan Task 2(e)).
    expect(emittedKeys.has('H1121a')).toBe(true);
    expect(baseline.safe_recoverable_strongs).toContain('H1121a');

    // Production DID NOT ship the alias — the AC-2 defect under test.
    const shippedStrongsKeys = new Set(['H1121']);

    expect(() =>
      censusNulls({
        emitRows: rows,
        consumerKeys,
        shippedStrongsKeys,
        baseInfo,
        emittedKeys,
        safeRecoverable: baseline.safe_recoverable_strongs,
      }),
    ).not.toThrow();

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.missedRecoveries).toEqual(['H1121a']);
    expect(result.homograph.some((e) => e.key === 'H1121a')).toBe(false);
    expect(result.unpointed.some((e) => e.key === 'H1121a')).toBe(false);
    expect(result.unattestedAramaic.some((e) => e.key === 'H1121a')).toBe(false);
  });
});

// (f) [RC-4] decision-0008's three illustrative examples, each computed.
describe('censusNulls — RC-4: decision-0008 example reconciliation', () => {
  it('labels H1121a and H834a recovered, H1004b null-homograph', () => {
    const rows = parseInput(
      'בֵּן\tH1121\t5\n' + // singleton base -> recoverable
        'רֵאשִׁית\tH1004\t2\nחָכְמָה\tH1004\t7\n' + // homograph base (2 distinct translits)
        'עֵדוּת\tH834\t5\n', // singleton base -> recoverable
    );
    const consumerKeys = ['H1121a', 'H1004b', 'H834a'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys); // matches regenerated exactly

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.stale0008.H1121a).toEqual({ status: 'recovered' });
    expect(result.stale0008.H834a).toEqual({ status: 'recovered' });
    expect(result.stale0008.H1004b).toEqual({ status: 'null', reason: 'homograph' });
  });
});

// (g) floorTripped guard.
describe('censusNulls — floorTripped degenerate-input guard', () => {
  it('is true for an empty consumer-key set', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, []);
    const result = censusNulls({
      emitRows: rows,
      consumerKeys: [],
      shippedStrongsKeys: new Set(emittedKeys),
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });
    expect(result.floorTripped).toBe(true);
  });

  it('is true when consumer keys exist but zero resolve directly against shippedStrongsKeys', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const consumerKeys = ['H1'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys: new Set(), // empty/dropped table
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });
    expect(result.floorTripped).toBe(true);
  });
});

// (h) shippedNotRegenerated reverse cross-check.
describe('censusNulls — shippedNotRegenerated reverse cross-check', () => {
  it('flags a shipped alias-shaped key that the regenerated run no longer emits at all', () => {
    // Homograph base -> the regenerated run emits NO alias for H500c, and
    // H500c is not natively attested (no exact/base row of that spelling).
    const rows = parseInput('רֵאשִׁית\tH500\t2\nחָכְמָה\tH500\t7\n');
    const consumerKeys = ['H500c'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    expect(emittedKeys.has('H500c')).toBe(false);
    expect(baseline.safe_recoverable_strongs).not.toContain('H500c');

    // Production shipped H500c anyway (simulating drift from an older run).
    const shippedStrongsKeys = new Set(['H500c']);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.shippedNotRegenerated).toEqual(['H500c']);
    // H500c resolves directly (it's shipped) so it's not a residual null.
    expect(result.homograph).toEqual([]);
  });
});

// (i) [RC-2] end-to-end pin test: censusNulls's bucket assignments match a
// fresh independent buildTables run over the same fixture (drift guard).
describe('censusNulls — RC-2 pin test against a fresh buildTables run', () => {
  it('produces identical bucket assignments across two independent buildTables calls', () => {
    const rows = parseInput(
      'בֵּן\tH1121\t5\n' + 'רֵאשִׁית\tH1004\t2\nחָכְמָה\tH1004\t7\n' + 'עֵדוּת\tH834\t5\n',
    );
    const consumerKeys = ['H1121a', 'H1004b', 'H834a'];

    const first = buildTables(rows, consumerKeys);
    const second = buildTables(rows, consumerKeys); // independent, fresh call

    const shippedStrongsKeys = new Set(first.emittedKeys);

    const resultFromFirst = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo: first.baseInfo,
      emittedKeys: first.emittedKeys,
      safeRecoverable: first.baseline.safe_recoverable_strongs,
    });
    const resultFromSecond = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo: second.baseInfo,
      emittedKeys: second.emittedKeys,
      safeRecoverable: second.baseline.safe_recoverable_strongs,
    });

    expect(resultFromSecond.homograph).toEqual(resultFromFirst.homograph);
    expect(resultFromSecond.stale0008).toEqual(resultFromFirst.stale0008);
    expect(resultFromSecond.missedRecoveries).toEqual(resultFromFirst.missedRecoveries);
  });
});

// (j) [R2 NEW-1] the corruption-guard throw: a residual-null key whose base has
// exactly one distinct pointed translit, is NOT in safeRecoverable (so not
// excluded as a missed recovery), and matches none of the three honest-null
// buckets. A malformed/zero-rows key does NOT throw (see case c/d above) —
// only this singleton-pointed-base drift shape reaches the throw.
describe('censusNulls — corruption-guard throw (fail-closed, never silent-drop)', () => {
  it('throws for a non-suffixed singleton-pointed-base key absent from shipped and not safe-recoverable', () => {
    const rows = parseInput('אֱלֹהִים\tH430\t100\n'); // pointed, singleton base
    const consumerKeys = ['H430']; // non-suffixed: never enters the alias pool
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    expect(baseInfo.get('H430')!.translits.size).toBe(1);
    expect(baseline.safe_recoverable_strongs).not.toContain('H430');

    // H430 has drifted out of the shipped set entirely.
    const shippedStrongsKeys = new Set<string>();

    expect(() =>
      censusNulls({
        emitRows: rows,
        consumerKeys,
        shippedStrongsKeys,
        baseInfo,
        emittedKeys,
        safeRecoverable: baseline.safe_recoverable_strongs,
      }),
    ).toThrow();
  });

  it('does NOT throw for a malformed/zero-rows key — it lands in unattestedAramaic', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const consumerKeys = ['H9999'];
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);
    let result;
    expect(() => {
      result = censusNulls({
        emitRows: rows,
        consumerKeys,
        shippedStrongsKeys,
        baseInfo,
        emittedKeys,
        safeRecoverable: baseline.safe_recoverable_strongs,
      });
    }).not.toThrow();
    expect(result!.unattestedAramaic).toEqual([{ key: 'H9999', base: 'H9999' }]);
  });
});

// recoveredCount / residualCount computed contents.
describe('censusNulls — recoveredCount / residualCount', () => {
  it('recoveredCount equals safeRecoverable.length and residualCount equals total residual keys', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const consumerKeys = ['H1121a', 'H500a']; // one recoverable, one unattested residual null
    const { baseInfo, emittedKeys, baseline } = buildTables(rows, consumerKeys);
    const shippedStrongsKeys = new Set(emittedKeys);

    const result = censusNulls({
      emitRows: rows,
      consumerKeys,
      shippedStrongsKeys,
      baseInfo,
      emittedKeys,
      safeRecoverable: baseline.safe_recoverable_strongs,
    });

    expect(result.recoveredCount).toBe(baseline.safe_recoverable_strongs.length);
    // H1121a resolves directly (shipped, recovered); H500a is the lone residual null.
    expect(result.residualCount).toBe(1);
    expect(result.unattestedAramaic).toEqual([{ key: 'H500a', base: 'H500' }]);
  });
});

// Task 4 — renderCensusReport: pure markdown builder over a censusNulls result.
describe('renderCensusReport', () => {
  it('renders exact recovered/residual counts, category sections, AC-2, 0008 reconciliation, and the Aramaic caveat', () => {
    const result = {
      homograph: [{ key: 'H1004b', base: 'H1004' }],
      unpointed: [{ key: 'H9a', base: 'H9' }],
      unattestedAramaic: [{ key: 'H500a', base: 'H500' }],
      missedRecoveries: [] as string[],
      recoveredCount: 87,
      residualCount: 3,
      stale0008: {
        H1121a: { status: 'recovered' as const },
        H1004b: { status: 'null' as const, reason: 'homograph' as const },
        H834a: { status: 'recovered' as const },
      },
      shippedNotRegenerated: [] as string[],
      floorTripped: false,
    };
    const report = renderCensusReport(result, { generatedAt: '2026-07-18' });

    expect(report).toContain('87');
    expect(report).toContain('3');
    expect(report).toMatch(/homograph/i);
    expect(report).toMatch(/unpointed/i);
    expect(report).toMatch(/unattested.*aramaic/i);
    expect(report).toMatch(/AC-2/i);
    expect(report).toContain('H1004b');
    expect(report).toMatch(/aramaic.*caveat/i);
    expect(report).toMatch(/zero raw rows/i);
  });

  it('reports missedRecoveries when non-empty (AC-2 section is not silently empty)', () => {
    const result = {
      homograph: [],
      unpointed: [],
      unattestedAramaic: [],
      missedRecoveries: ['H1121a'],
      recoveredCount: 1,
      residualCount: 1,
      stale0008: {},
      shippedNotRegenerated: [],
      floorTripped: false,
    };
    const report = renderCensusReport(result, { generatedAt: '2026-07-18' });
    expect(report).toContain('H1121a');
  });
});

// Task 5 — main() runner: fixture-driven CLI, fail-closed on missing file / floorTripped.
describe('main() — census runner', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeFixtures(overrides: { consumerKeys?: unknown; shippedStrongs?: unknown } = {}) {
    dir = mkdtempSync(join(tmpdir(), 'census-runner-'));
    const emitPath = join(dir, 'emit.tsv');
    const consumerKeysPath = join(dir, 'consumer-keys.json');
    const shippedStrongsPath = join(dir, 'shipped-strongs.json');
    const outPath = join(dir, 'report.md');

    writeFileSync(emitPath, 'בֵּן\tH1121\t5\n', 'utf8');
    writeFileSync(
      consumerKeysPath,
      JSON.stringify(overrides.consumerKeys ?? ['H1121a']),
      'utf8',
    );
    writeFileSync(
      shippedStrongsPath,
      JSON.stringify(overrides.shippedStrongs ?? ['H1121', 'H1121a']),
      'utf8',
    );

    return { emitPath, consumerKeysPath, shippedStrongsPath, outPath };
  }

  it('fixture inputs produce a report and exit 0', () => {
    const { emitPath, consumerKeysPath, shippedStrongsPath, outPath } = writeFixtures();
    const code = main([
      '--emit',
      emitPath,
      '--consumer-keys',
      consumerKeysPath,
      '--shipped-strongs',
      shippedStrongsPath,
      '--out',
      outPath,
    ]);
    expect(code).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, 'utf8')).toContain('recovered');
  });

  it('a missing input file exits non-zero and writes no report', () => {
    const { consumerKeysPath, shippedStrongsPath, outPath } = writeFixtures();
    const code = main([
      '--emit',
      join(dir, 'does-not-exist.tsv'),
      '--consumer-keys',
      consumerKeysPath,
      '--shipped-strongs',
      shippedStrongsPath,
      '--out',
      outPath,
    ]);
    expect(code).not.toBe(0);
    expect(existsSync(outPath)).toBe(false);
  });

  it('a floorTripped (degenerate) input exits non-zero and writes no report', () => {
    const { emitPath, consumerKeysPath, shippedStrongsPath, outPath } = writeFixtures({
      consumerKeys: [],
    });
    const code = main([
      '--emit',
      emitPath,
      '--consumer-keys',
      consumerKeysPath,
      '--shipped-strongs',
      shippedStrongsPath,
      '--out',
      outPath,
    ]);
    expect(code).not.toBe(0);
    expect(existsSync(outPath)).toBe(false);
  });
});
