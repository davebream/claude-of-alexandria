import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import {
  hasNiqqud,
  unpad,
  pad,
  extractKeys,
  buildScratchDb,
  columnSet,
  checkSelfConsistency,
  checkStrongsSpace,
  checkLemmaSpace,
  runChecks,
} from './verify-lemma-translit-coverage.mjs';

// Migration 0021's CREATE statements, inlined so the scratch-DB builder is
// exercised exactly as production runs it: the fixtures below emit the SAME shape
// the generator produces — DELETE FROM …; + chunked INSERTs, NO BEGIN/COMMIT
// wrapper (decisions/0006: the bulk importer wraps its own transaction).
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

// Two pointed lemmas that always get a lemma_translit_he row. NO BEGIN/COMMIT.
const lemmaSql = (extra = []) => {
  const tuples = [`('${POINTED}', 'bārāʾ')`, `('רֵאשִׁית', 'rēʾšît')`, ...extra];
  return (
    `DELETE FROM lemma_translit_he;\n` +
    (tuples.length > 0
      ? `INSERT INTO lemma_translit_he (lemma, transliteration) VALUES ${tuples.join(',')};\n`
      : '')
  );
};

// An empty keys array emits ONLY the DELETE (a clean truncate) — the wholesale
// -empty table shape the strongs-arm floor must catch.
const strongsSql = (keys = ['H0001', 'H0430']) =>
  `DELETE FROM lemma_translit_he_strongs;\n` +
  (keys.length > 0
    ? `INSERT INTO lemma_translit_he_strongs (strongs, transliteration) VALUES ` +
      keys.map((k) => `('${k}', 'x')`).join(',') +
      `;\n`
    : '');

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

describe('pad / unpad — strongs padding-sibling normalizers', () => {
  it('unpad strips leading zeros, preserving the suffix', () => {
    expect(unpad('H0001')).toBe('H1');
    expect(unpad('H0871a')).toBe('H871a');
    expect(unpad('H1090a')).toBe('H1090a');
  });
  it('pad zero-pads to >=4 digits, preserving the suffix', () => {
    expect(pad('H1')).toBe('H0001');
    expect(pad('H871a')).toBe('H0871a');
    expect(pad('H1090a')).toBe('H1090a');
  });
  it('are inverse on the padded/unpadded axis', () => {
    expect(unpad(pad('H1'))).toBe('H1');
    expect(pad(unpad('H0430'))).toBe('H0430');
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

  it('FLOOR (BLOCKS) — a wholly-empty strongs table with nonzero consumers fails part (b)', () => {
    // The regression this guards: a wholesale-dropped strongs table. Without the
    // floor, every consumer key falls into explained-absence and (b) would pass.
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql([]), // wholly empty (DELETE only, no INSERT)
    });
    const b = checkStrongsSpace(db, ['H0001', 'H0430', 'H1']);
    db.close();
    expect(b.ok).toBe(false);
    expect(b.floorTripped).toBe(true);
    expect(b.directlyResolved).toBe(0);
    expect(b.wouldBeBug).toEqual([]); // floor, not a would-be-bug misclassification
  });

  it('floor does NOT trip when some keys resolve directly — a populated table with explained-absence still passes', () => {
    // Many keys resolve directly; a handful are honest explained-absence (no
    // spelling in the table). directlyResolved > 0, so the floor never fires.
    const tableKeys = Array.from({ length: 50 }, (_, i) => `H${1000 + i}`);
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(tableKeys),
    });
    const consumers = [...tableKeys, 'H9998', 'H9999']; // 50 resolve, 2 honest-null
    const b = checkStrongsSpace(db, consumers);
    db.close();
    expect(b.ok).toBe(true);
    expect(b.floorTripped).toBe(false);
    expect(b.directlyResolved).toBe(50);
    expect(b.wouldBeBug).toEqual([]);
    expect(b.explainedAbsence).toEqual(['H9998', 'H9999']);
  });

  it('would-be-bug (BLOCKS) — a consumer strongs whose padding-sibling IS a table key fails part (b)', () => {
    // Table has the UNPADDED spelling H430; the consumer asks for the PADDED
    // H0430. A pointed lemma clearly exists (H430 resolves), so the missing
    // padded spelling is a real spelling-coverage bug — exactly the padding
    // mismatch class this gate guards.
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H430']),
    });
    const b = checkStrongsSpace(db, ['H0001', 'H0430']);
    db.close();
    expect(b.ok).toBe(false);
    expect(b.wouldBeBug).toEqual(['H0430']);
    expect(b.explainedAbsence).toEqual([]);
  });

  it('explained-absence (does NOT block) — a consumer strongs with NO spelling in the table is counted, not failed', () => {
    // No padding-sibling of H9999 is a table key, so no pointed lemma is
    // attested under any spelling — null is the honest answer, not a bug.
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H0430']),
    });
    const b = checkStrongsSpace(db, ['H0001', 'H9999']);
    db.close();
    expect(b.ok).toBe(true);
    expect(b.wouldBeBug).toEqual([]);
    expect(b.explainedAbsence).toEqual(['H9999']);
  });

  it('a sense-suffix consumer key (H1004b) whose only sibling is a base form is explained-absence, not a bug', () => {
    // Table attests H1004a and its base H1004 (downward base). The consumer's
    // distinct sense H1004b must NOT be treated as derivable — base is not a
    // resolving sibling. Honest null. (H1004a is included in the consumer set so
    // one key resolves directly and the wholesale-empty floor does not fire.)
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H1004a', 'H1004']),
    });
    const b = checkStrongsSpace(db, ['H1004a', 'H1004b']);
    db.close();
    expect(b.ok).toBe(true);
    expect(b.floorTripped).toBe(false);
    expect(b.explainedAbsence).toEqual(['H1004b']);
    expect(b.wouldBeBug).toEqual([]);
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

// Safe-suffix alias recovery (decisions/0008): the generator now emits alias
// rows for singleton-base sense-suffixed keys, records them in the baseline, and
// the gate blocks if one is DROPPED (a regression that would re-introduce a null).
describe('coverage gate — safe-suffix aliases (decisions/0008)', () => {
  it('(a) self-consistency folds the alias row count into the expected strongs total', () => {
    // Three strongs rows: 2 exact/base + 1 alias. Baseline declares the split.
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H1121', 'H1121a']),
    });
    const a = checkSelfConsistency(
      db,
      baseline({ strongs_rows_exact: 2, strongs_rows_base: 0, strongs_rows_alias: 1 }),
    );
    db.close();
    expect(a.ok).toBe(true);
    expect(a.strongsActual).toBe(3);
    expect(a.strongsExpected).toBe(3);
  });

  it('(b) a DROPPED safe-recoverable alias BLOCKS as a would-be-bug', () => {
    // The base H1121 is present but the alias H1121a was dropped. Because H1121a
    // is a declared safe-recoverable key, its absence is a regression, not honest
    // null. (H0001 resolves directly, so the wholesale-empty floor does not fire.)
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H1121']),
    });
    const b = checkStrongsSpace(db, ['H0001', 'H1121a'], new Set(['H1121a']));
    db.close();
    expect(b.ok).toBe(false);
    expect(b.wouldBeBug).toEqual(['H1121a']);
    expect(b.explainedAbsence).toEqual([]);
  });

  it('(b) a present safe-recoverable alias resolves directly', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H1121a']),
    });
    const b = checkStrongsSpace(db, ['H0001', 'H1121a'], new Set(['H1121a']));
    db.close();
    expect(b.ok).toBe(true);
    expect(b.directlyResolved).toBe(2);
    expect(b.wouldBeBug).toEqual([]);
  });

  it('runChecks reads baseline.safe_recoverable_strongs and blocks a dropped alias', () => {
    const db = buildScratchDb(SQL, {
      migrationSql: MIGRATION_SQL,
      lemmaSql: lemmaSql(),
      strongsSql: strongsSql(['H0001', 'H1121']), // H1121a dropped
    });
    const result = runChecks(db, {
      baseline: baseline({
        strongs_rows_exact: 2,
        strongs_rows_base: 0,
        strongs_rows_alias: 0,
        safe_recoverable_strongs: ['H1121a'],
      }),
      strongsConsumerKeys: ['H0001', 'H1121a'],
      lemmaConsumerKeys: [POINTED, 'רֵאשִׁית'],
    });
    db.close();
    expect(result.pass).toBe(false);
    expect(result.b.wouldBeBug).toEqual(['H1121a']);
  });
});
