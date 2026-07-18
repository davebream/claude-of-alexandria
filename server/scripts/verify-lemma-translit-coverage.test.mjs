import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import {
  hasNiqqud,
  extractKeys,
  buildScratchDb,
  columnSet,
  checkSelfConsistency,
  checkStrongsSpace,
  checkLemmaSpace,
  runChecks,
} from './verify-lemma-translit-coverage.mjs';

// Migration 0021's CREATE statements, inlined so the scratch-DB builder is
// exercised exactly as production runs it (BEGIN/DELETE/INSERT blocks loaded on
// top of these tables).
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS lemma_translit_he (
  lemma TEXT PRIMARY KEY,
  transliteration TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lemma_translit_he_strongs (
  strongs TEXT PRIMARY KEY,
  transliteration TEXT NOT NULL
);
`;

// A pointed lemma (carries niqqud) and its consonantal skeleton (no niqqud).
const POINTED = 'בָּרָא';
const UNPOINTED = 'ברא';

// Two pointed lemmas that always get a lemma_translit_he row.
const lemmaSql = (extra = []) =>
  `BEGIN;\nDELETE FROM lemma_translit_he;\nINSERT INTO lemma_translit_he (lemma, transliteration) VALUES ` +
  [`('${POINTED}', 'bārāʾ')`, `('רֵאשִׁית', 'rēʾšît')`, ...extra].join(',') +
  `;\nCOMMIT;\n`;

const strongsSql = (keys = ['H0001', 'H0430']) =>
  `BEGIN;\nDELETE FROM lemma_translit_he_strongs;\nINSERT INTO lemma_translit_he_strongs (strongs, transliteration) VALUES ` +
  keys.map((k) => `('${k}', 'x')`).join(',') +
  `;\nCOMMIT;\n`;

// Baseline that matches the default 2-lemma / 2-strongs fixtures.
const baseline = (over = {}) => ({
  lemma_rows: 2,
  strongs_rows_exact: 2,
  strongs_rows_base: 0,
  excluded: { empty: 0, unpointed: 0, subsegment: 0 },
  library_version: 'test',
  ...over,
});

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

describe('hasNiqqud', () => {
  it('is true for a pointed lemma and false for a consonantal skeleton', () => {
    expect(hasNiqqud(POINTED)).toBe(true);
    expect(hasNiqqud(UNPOINTED)).toBe(false);
  });
});

describe('extractKeys', () => {
  it('reads the wrangler d1 execute --json shape', () => {
    const json = [{ results: [{ lemma: 'H1' }, { lemma: 'H2' }], success: true }];
    expect(extractKeys(json, 'lemma')).toEqual(['H1', 'H2']);
  });

  it('reads a bare string array and dedupes preserving order', () => {
    expect(extractKeys(['H1', 'H1', 'H2'])).toEqual(['H1', 'H2']);
  });

  it('reads an array of row objects and drops null values', () => {
    expect(extractKeys([{ lemma: 'H1' }, { lemma: null }, { lemma: 'H2' }], 'lemma')).toEqual([
      'H1',
      'H2',
    ]);
  });

  it('returns [] for empty input (trivially-passing anti-join)', () => {
    expect(extractKeys([])).toEqual([]);
  });
});

describe('buildScratchDb + columnSet', () => {
  it('loads the generated SQL into the migration-created tables', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(),
    });
    expect(columnSet(db, 'SELECT lemma FROM lemma_translit_he')).toEqual(
      new Set([POINTED, 'רֵאשִׁית']),
    );
    expect(columnSet(db, 'SELECT strongs FROM lemma_translit_he_strongs')).toEqual(
      new Set(['H0001', 'H0430']),
    );
    db.close();
  });
});

describe('coverage gate', () => {
  it('clean pass — complete coverage yields pass on all three checks', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H0430']),
    });
    const result = runChecks(db, {
      baseline: baseline(),
      strongsConsumerKeys: ['H0001', 'H0430'],
      lemmaConsumerKeys: [POINTED, 'רֵאשִׁית'],
    });
    db.close();
    expect(result.pass).toBe(true);
    expect(result.a.ok).toBe(true);
    expect(result.b.ok).toBe(true);
    expect(result.c.ok).toBe(true);
  });

  it('strongs gap detected — a consumer strongs with no row fails part (b)', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001']), // H0430 absent
    });
    const b = checkStrongsSpace(db, ['H0001', 'H0430']);
    db.close();
    expect(b.ok).toBe(false);
    expect(b.missing).toEqual(['H0430']);
  });

  it('lemma gap detected — a POINTED consumer lemma with no row is unexplained', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(),
    });
    // 'שָׁלוֹם' is pointed but absent from the table → an unexplained gap.
    const c = checkLemmaSpace(db, [POINTED, 'שָׁלוֹם']);
    db.close();
    expect(c.ok).toBe(false);
    expect(c.unexplained).toEqual(['שָׁלוֹם']);
    expect(c.explained).toEqual([]);
  });

  it('exclusion-subtraction — an UNPOINTED consumer lemma with no row is explained, not a gap', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(),
    });
    // UNPOINTED is a consonantal skeleton — deliberately never transliterated,
    // so its absence is an enumerated exclusion, not a gap.
    const c = checkLemmaSpace(db, [POINTED, UNPOINTED]);
    db.close();
    expect(c.ok).toBe(true);
    expect(c.explained).toEqual([UNPOINTED]);
    expect(c.unexplained).toEqual([]);
  });

  it('self-consistency — scratch counts not matching the baseline fails part (a)', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(),
    });
    // Baseline claims 3 lemma rows; scratch has 2.
    const a = checkSelfConsistency(db, baseline({ lemma_rows: 3 }));
    db.close();
    expect(a.ok).toBe(false);
    expect(a.lemmaActual).toBe(2);
    expect(a.lemmaExpected).toBe(3);
  });

  it('empty consumer input passes both anti-joins trivially', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(),
    });
    expect(checkStrongsSpace(db, []).ok).toBe(true);
    expect(checkLemmaSpace(db, []).ok).toBe(true);
    db.close();
  });
});
