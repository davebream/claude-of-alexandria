/**
 * Unit tests for the Hebrew lemma-transliteration SQL generator.
 *
 * Covers the pure, exported helpers (no filesystem, no DB): the NFC oracle
 * drift alarm against the pinned fixture, representative tie-break determinism
 * at both the exact- and base-strongs levels, dual-form strongs emission,
 * byte-capped chunking on multibyte content, the loud ASCII-apostrophe guard,
 * baseline/row-count agreement, malformed-row rejection, unpointed exclusion,
 * and a three-digit base-strongs round-trip.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  transliterateLemma,
  hasNiqqud,
  baseStrongs,
  unpad,
  parseInput,
  buildTables,
  buildTableSql,
  chunkInsertStatements,
  assertNoAsciiApostrophe,
  classifySuffixedStrongs,
  extractConsumerKeys,
  LEMMA_COLUMNS,
  STRONGS_COLUMNS,
} from './generate-lemma-translit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'testdata', 'lemma-translit-fixture.tsv');

// (a) Drift alarm: every pinned fixture lemma re-derives to its NFC oracle value.
describe('transliterateLemma — fixture NFC oracle (drift alarm)', () => {
  const rows = readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => l.split('\t'));

  it('has 20 pinned rows', () => {
    expect(rows.length).toBe(20);
  });

  for (const [lemma, expected] of rows) {
    it(`re-derives ${lemma} -> ${expected}`, () => {
      expect(transliterateLemma(lemma)).toBe(expected);
    });
  }

  it('every pinned expected value is NFC-normalized (idempotent)', () => {
    for (const [, expected] of rows) {
      expect(expected.normalize('NFC')).toBe(expected);
    }
  });
});

// (b) Representative tie-break determinism at BOTH levels.
describe('buildTables — representative tie-break determinism', () => {
  it('exact level: highest count wins, ties broken by smallest UTF-8 bytes', () => {
    // Two pointed lemmas share one exact strongs; the higher-count one wins.
    const rows = parseInput(
      'רֵאשִׁית\tH7225a\t3\n' + // lower count
        'חָכְמָה\tH7225a\t9\n', // higher count -> representative
    );
    const { strongsEntries } = buildTables(rows);
    const exact = strongsEntries.find((e) => e.key === 'H7225a');
    expect(exact).toBeDefined();
    expect(exact!.value).toBe(transliterateLemma('חָכְמָה'));
  });

  it('exact level: equal counts fall back to smallest lemma UTF-8 byte sequence', () => {
    const a = 'רֵאשִׁית';
    const b = 'חָכְמָה';
    const rows = parseInput(`${a}\tH9001\t5\n${b}\tH9001\t5\n`);
    const { strongsEntries } = buildTables(rows);
    const winner =
      Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')) < 0 ? a : b;
    const exact = strongsEntries.find((e) => e.key === 'H9001');
    expect(exact!.value).toBe(transliterateLemma(winner));
  });

  it('base level: homographs collapse to base with highest-count representative', () => {
    // Two exact homographs (H8000a, H8000b) collapse to base H8000.
    const rows = parseInput(
      'רֵאשִׁית\tH8000a\t2\n' + 'חָכְמָה\tH8000b\t7\n', // higher count across the family
    );
    const { strongsEntries } = buildTables(rows);
    const base = strongsEntries.find((e) => e.key === 'H8000');
    expect(base).toBeDefined();
    expect(base!.value).toBe(transliterateLemma('חָכְמָה'));
  });

  it('is deterministic: same input yields identical output', () => {
    const input = 'רֵאשִׁית\tH8000a\t2\nחָכְמָה\tH8000b\t7\nכֹּל\tH8000a\t2\n';
    const a = buildTables(parseInput(input));
    const b = buildTables(parseInput(input));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// (c) Dual-form emission: an exact suffixed strongs yields BOTH exact and base.
describe('buildTables — dual-form strongs emission', () => {
  it('H7225a yields both an H7225a row and an H7225 row', () => {
    const rows = parseInput('רֵאשִׁית\tH7225a\t5\n');
    const { strongsEntries } = buildTables(rows);
    const keys = strongsEntries.map((e) => e.key);
    expect(keys).toContain('H7225a');
    expect(keys).toContain('H7225');
    // Both carry the representative lemma's transliteration.
    const v = transliterateLemma('רֵאשִׁית');
    expect(strongsEntries.find((e) => e.key === 'H7225a')!.value).toBe(v);
    expect(strongsEntries.find((e) => e.key === 'H7225')!.value).toBe(v);
  });
});

// (c2) unpad() normalizer — strip leading zeros, preserve H + suffix.
describe('unpad — padded -> unpadded strongs spelling', () => {
  it('strips leading zeros and preserves the trailing suffix letter', () => {
    expect(unpad('H0001')).toBe('H1');
    expect(unpad('H0014')).toBe('H14');
    expect(unpad('H0871a')).toBe('H871a');
    expect(unpad('H0871')).toBe('H871');
  });

  it('leaves an already-unpadded strongs unchanged', () => {
    expect(unpad('H1090a')).toBe('H1090a');
    expect(unpad('H430')).toBe('H430');
    expect(unpad('H7225')).toBe('H7225'); // 4-digit already coincides
  });

  it('returns a non-numeric raw strongs unchanged', () => {
    expect(unpad('HXYZ')).toBe('HXYZ');
  });
});

// (c3) Unpadded key-variant emission: padded corpus strongs also resolve unpadded.
describe('buildTables — unpadded strongs key variants', () => {
  it('a padded exact strongs H0001 yields BOTH H0001 and H1 with the same translit', () => {
    const rows = parseInput('רֵאשִׁית\tH0001\t5\n');
    const { strongsEntries } = buildTables(rows);
    const v = transliterateLemma('רֵאשִׁית');
    expect(strongsEntries.find((e) => e.key === 'H0001')!.value).toBe(v);
    expect(strongsEntries.find((e) => e.key === 'H1')!.value).toBe(v);
  });

  it('a padded suffixed strongs H0871a yields H0871a, H871a, base H0871, and H871 (all same translit)', () => {
    const rows = parseInput('רֵאשִׁית\tH0871a\t5\n');
    const { strongsEntries } = buildTables(rows);
    const keys = strongsEntries.map((e) => e.key);
    for (const k of ['H0871a', 'H871a', 'H0871', 'H871']) {
      expect(keys, `expected key ${k}`).toContain(k);
    }
    const v = transliterateLemma('רֵאשִׁית');
    for (const k of ['H0871a', 'H871a', 'H0871', 'H871']) {
      expect(strongsEntries.find((e) => e.key === k)!.value, `value for ${k}`).toBe(v);
    }
  });

  it('a 4-digit strongs (H7225a) adds no redundant unpadded duplicate', () => {
    const rows = parseInput('רֵאשִׁית\tH7225a\t5\n');
    const { strongsEntries } = buildTables(rows);
    const keys = strongsEntries.map((e) => e.key);
    // unpad(H7225a)===H7225a and unpad(H7225)===H7225, so only the two dual-form
    // keys exist — no extra rows.
    expect(keys.filter((k) => k === 'H7225a' || k === 'H7225')).toHaveLength(2);
    expect(keys).toHaveLength(2);
  });
});

// (d) Chunk byte-cap respected on multibyte content.
describe('chunkInsertStatements — byte cap on multibyte content', () => {
  it('never emits a statement exceeding 100000 bytes', () => {
    // Build many multibyte tuples to force multiple chunks.
    const tuples: string[] = [];
    for (let i = 0; i < 5000; i++) {
      tuples.push(`('רֵאשִׁית${i}', 'rēʾšîṯ${i}')`);
    }
    const statements = chunkInsertStatements('lemma_translit_he', LEMMA_COLUMNS, tuples);
    expect(statements.length).toBeGreaterThan(1); // forced past one chunk
    for (const stmt of statements) {
      expect(Buffer.byteLength(stmt, 'utf8')).toBeLessThanOrEqual(100000);
    }
  });
});

// (e) ASCII-apostrophe guard fails loudly.
describe('assertNoAsciiApostrophe', () => {
  it('throws listing offenders when a value contains an ASCII quote', () => {
    expect(() =>
      assertNoAsciiApostrophe([
        { key: 'ok', value: 'rēʾšîṯ' },
        { key: 'bad', value: "ra'sh" }, // ASCII U+0027
      ]),
    ).toThrow(/bad/);
  });

  it('passes for legitimate SBL modifier-letter output', () => {
    expect(() =>
      assertNoAsciiApostrophe([{ key: 'H7225', value: 'rēʾšîṯ' }]),
    ).not.toThrow();
  });
});

// (f) Baseline counts equal emitted row counts.
describe('buildTables — baseline agrees with emitted rows', () => {
  it('lemma_rows and strongs partition counts equal emitted entries', () => {
    const rows = parseInput(
      'רֵאשִׁית\tH7225a\t5\n' +
        'חָכְמָה\tH2451\t9\n' +
        'כֹּל\t\t3\n', // valid lemma, empty strongs -> lemma row only
    );
    const { lemmaEntries, strongsEntries, baseline } = buildTables(rows);
    expect(baseline.lemma_rows).toBe(lemmaEntries.length);
    expect(baseline.strongs_rows_exact + baseline.strongs_rows_base).toBe(
      strongsEntries.length,
    );
    expect(baseline.library_version).toBe('2.11.0');
  });
});

// (g) Malformed TSV row -> throw (non-zero exit surface).
describe('parseInput — malformed rows', () => {
  it('throws on a row without exactly three fields', () => {
    expect(() => parseInput('רֵאשִׁית\tH7225a\n')).toThrow();
  });

  it('throws on a non-integer count', () => {
    expect(() => parseInput('רֵאשִׁית\tH7225a\tmany\n')).toThrow();
  });
});

// (h) Unpointed exclusion.
describe('buildTables — unpointed exclusion', () => {
  it('excludes a consonants-only lemma and counts it, keeps a pointed one', () => {
    expect(hasNiqqud('אבג')).toBe(false); // no niqqud
    expect(hasNiqqud('רֵאשִׁית')).toBe(true); // pointed
    const rows = parseInput('אבג\tH9\t4\nרֵאשִׁית\tH7225a\t5\n');
    const { lemmaEntries, strongsEntries, baseline } = buildTables(rows);
    expect(baseline.excluded.unpointed).toBe(1);
    // The unpointed lemma never appears in any emitted SQL.
    expect(lemmaEntries.find((e) => e.key === 'אבג')).toBeUndefined();
    expect(strongsEntries.find((e) => e.key === 'H9')).toBeUndefined();
    // The pointed lemma survives.
    expect(lemmaEntries.find((e) => e.key === 'רֵאשִׁית')).toBeDefined();
  });
});

// (i) Three-digit base-strongs round-trip (format/zero-padding axis).
describe('buildTables — three-digit base strongs round-trip', () => {
  it('an input H430 is present verbatim in the strongs entries', () => {
    const rows = parseInput('אֱלֹהִים\tH430\t100\n');
    const { strongsEntries } = buildTables(rows);
    expect(baseStrongs('H430')).toBe('H430'); // no trailing lowercase to strip
    const entry = strongsEntries.find((e) => e.key === 'H430');
    expect(entry).toBeDefined();
    expect(entry!.value).toBe(transliterateLemma('אֱלֹהִים'));
  });
});

// (j) No BEGIN/COMMIT wrapper (decisions/0006: the bulk importer wraps its own
// transaction). The per-table SQL is DELETE + chunked INSERTs only.
describe('buildTableSql — no BEGIN/COMMIT transaction wrapper (decisions/0006)', () => {
  const entries = [
    { key: 'H0001', value: 'ʾāb' },
    { key: 'H1', value: 'ʾāb' },
  ];

  it('emits DELETE + INSERT but NO BEGIN or COMMIT', () => {
    const sql = buildTableSql('lemma_translit_he_strongs', STRONGS_COLUMNS, entries);
    expect(sql).not.toMatch(/\bBEGIN\b/);
    expect(sql).not.toMatch(/\bCOMMIT\b/);
    expect(sql).toMatch(/^DELETE FROM lemma_translit_he_strongs;/);
    expect(sql).toMatch(/INSERT INTO lemma_translit_he_strongs \(strongs, transliteration\) VALUES/);
  });

  it('starts with the DELETE (idempotent reseed) and keeps each INSERT <= 100000 bytes', () => {
    const sql = buildTableSql('lemma_translit_he', LEMMA_COLUMNS, entries);
    expect(sql.startsWith('DELETE FROM lemma_translit_he;\n')).toBe(true);
    for (const stmt of sql.split('\n').filter((l) => l.startsWith('INSERT'))) {
      expect(Buffer.byteLength(stmt, 'utf8')).toBeLessThanOrEqual(100000);
    }
  });

  it('an empty entry list still emits the DELETE (a clean truncate) and no wrapper', () => {
    const sql = buildTableSql('lemma_translit_he', LEMMA_COLUMNS, []);
    expect(sql).toBe('DELETE FROM lemma_translit_he;\n');
    expect(sql).not.toMatch(/BEGIN|COMMIT|INSERT/);
  });
});

// Column arity locks (guards the INSERT header vs tuple shape).
describe('column locks', () => {
  it('lemma and strongs tables each declare two columns', () => {
    expect(LEMMA_COLUMNS.length).toBe(2);
    expect(STRONGS_COLUMNS.length).toBe(2);
  });
});

// (k) Pure safe-suffix classifier (decisions/0008). A sense-suffixed consumer
// key resolves to its base's transliteration ONLY when the base attests exactly
// one pointed lemma; homograph / unattested / already-present all decline.
describe('classifySuffixedStrongs (decisions/0008)', () => {
  const baseInfo = new Map([
    ['H1121', { translits: new Set(['bēn']), representative: 'bēn' }],
    ['H8500', { translits: new Set(['rēʾšîṯ', 'ḥāḵmâ']), representative: 'ḥāḵmâ' }],
  ]);
  const emitted = new Set(['H7225a']);

  it('singleton base -> safe-recover with the base value', () => {
    expect(classifySuffixedStrongs('H1121a', baseInfo, emitted)).toEqual({
      kind: 'safe-recover',
      value: 'bēn',
    });
  });

  it('homograph base (>=2 distinct translits) -> keep-null (homograph)', () => {
    expect(classifySuffixedStrongs('H8500c', baseInfo, emitted)).toEqual({
      kind: 'keep-null',
      reason: 'homograph',
    });
  });

  it('base attested by no pointed lemma -> keep-null (no-attested-base)', () => {
    expect(classifySuffixedStrongs('H9999z', baseInfo, emitted)).toEqual({
      kind: 'keep-null',
      reason: 'no-attested-base',
    });
  });

  it('a key with no trailing lowercase letter is not a suffix candidate', () => {
    expect(classifySuffixedStrongs('H7225', baseInfo, emitted)).toEqual({ kind: 'not-suffixed' });
  });

  it('a key already emitted as an attested spelling declines (no shadow)', () => {
    expect(classifySuffixedStrongs('H7225a', baseInfo, emitted)).toEqual({ kind: 'already-emitted' });
  });
});

// (l) buildTables safe-suffix alias emission (decisions/0008): consumer keys are
// the sense-suffixed OT Strong's the vocabulary/lemmas/themes tools query.
describe('buildTables — safe-suffix alias recovery (decisions/0008)', () => {
  it('emits an alias row for a singleton-base consumer key (H1121a -> bēn)', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n'); // base H1121 attests only בֵּן
    const { strongsEntries, baseline } = buildTables(rows, ['H1121a']);
    const alias = strongsEntries.find((e) => e.key === 'H1121a');
    expect(alias).toBeDefined();
    expect(alias!.value).toBe(transliterateLemma('בֵּן'));
    expect(baseline.safe_recoverable_strongs).toContain('H1121a');
    expect(baseline.strongs_rows_alias).toBe(1);
  });

  it('emits NO alias for a homograph-base consumer key (H8500c)', () => {
    const rows = parseInput('רֵאשִׁית\tH8500a\t2\nחָכְמָה\tH8500b\t7\n'); // base H8500 = 2 lemmas
    const { strongsEntries, baseline } = buildTables(rows, ['H8500c']);
    expect(strongsEntries.find((e) => e.key === 'H8500c')).toBeUndefined();
    expect(baseline.safe_recoverable_strongs).not.toContain('H8500c');
    expect(baseline.strongs_rows_alias).toBe(0);
  });

  it('never shadows an attested exact key: a consumer key equal to an emitted key adds no duplicate', () => {
    const rows = parseInput('רֵאשִׁית\tH7225a\t5\n'); // H7225a is an attested exact key
    const { strongsEntries, baseline } = buildTables(rows, ['H7225a']);
    expect(strongsEntries.filter((e) => e.key === 'H7225a')).toHaveLength(1);
    expect(baseline.safe_recoverable_strongs).not.toContain('H7225a');
    expect(baseline.strongs_rows_alias).toBe(0);
  });

  it('with no consumer keys, emits no aliases (backward compatible)', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const { baseline } = buildTables(rows);
    expect(baseline.strongs_rows_alias).toBe(0);
    expect(baseline.safe_recoverable_strongs).toEqual([]);
  });

  it('baseline row-count partition (exact + base + alias) equals emitted strongs rows', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const { strongsEntries, baseline } = buildTables(rows, ['H1121a']);
    expect(
      baseline.strongs_rows_exact + baseline.strongs_rows_base + baseline.strongs_rows_alias,
    ).toBe(strongsEntries.length);
  });
});

// (l2) buildTables — additive baseInfo/emittedKeys exposure (census reuse, C0).
describe('buildTables — baseInfo/emittedKeys exposure (census reuse)', () => {
  it('returns baseInfo as a Map keyed by unpadded base with translits.size===1 for a singleton base', () => {
    const rows = parseInput('בֵּן\tH1121\t5\n');
    const { baseInfo } = buildTables(rows);
    expect(baseInfo).toBeInstanceOf(Map);
    const info = baseInfo.get('H1121');
    expect(info).toBeDefined();
    expect(info!.translits.size).toBe(1);
    expect(info!.representative).toBe(transliterateLemma('בֵּן'));
  });

  it('returns baseInfo with translits.size>=2 for a homograph base', () => {
    const rows = parseInput('רֵאשִׁית\tH8500a\t2\nחָכְמָה\tH8500b\t7\n');
    const { baseInfo } = buildTables(rows);
    const info = baseInfo.get('H8500');
    expect(info).toBeDefined();
    expect(info!.translits.size).toBeGreaterThanOrEqual(2);
  });

  it('returns emittedKeys containing an expected emitted key', () => {
    const rows = parseInput('רֵאשִׁית\tH7225a\t5\n');
    const { emittedKeys } = buildTables(rows);
    expect(emittedKeys.has('H7225a')).toBe(true);
    expect(emittedKeys.has('H7225')).toBe(true);
  });
});

// (m) Consumer-key extraction — the imperative shell reads the same wrangler
// `d1 execute --json` output the coverage gate consumes, plucking the `lemma`
// column (where OT Strong's numbers live for vocabulary / thematic_keywords).
describe('extractConsumerKeys (decisions/0008)', () => {
  it('reads the wrangler d1 execute --json shape and plucks the lemma column', () => {
    const json = '[{"results":[{"lemma":"H1121a"},{"lemma":"H834a"}],"success":true}]';
    expect(extractConsumerKeys(json)).toEqual(['H1121a', 'H834a']);
  });

  it('reads a bare string array and dedupes', () => {
    expect(extractConsumerKeys('["H1121a","H1121a","H834a"]')).toEqual(['H1121a', 'H834a']);
  });

  it('returns [] for empty input', () => {
    expect(extractConsumerKeys('[]')).toEqual([]);
  });
});
