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
  chunkInsertStatements,
  assertNoAsciiApostrophe,
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

// Column arity locks (guards the INSERT header vs tuple shape).
describe('column locks', () => {
  it('lemma and strongs tables each declare two columns', () => {
    expect(LEMMA_COLUMNS.length).toBe(2);
    expect(STRONGS_COLUMNS.length).toBe(2);
  });
});
