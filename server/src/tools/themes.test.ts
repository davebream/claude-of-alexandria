import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryThemesForLemmas, ThemesOutputSchema } from './themes.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── sql.js execution seam ──────────────────────────────────────────────────
// Real SQLite (compiled to WASM). mockQuery never executes SQL, so it cannot
// see whether ROW_NUMBER()'s ORDER BY resolves the tie correctly.

let SQL: SqlJsStatic;

async function makeMinimalDb(): Promise<Database> {
  if (!SQL) SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE lexicon_lsj (
      strongs_id TEXT PRIMARY KEY,
      original_word TEXT, original_word_nfc TEXT, original_word_stripped TEXT,
      transliteration TEXT, gloss TEXT, definition TEXT
    );
    CREATE TABLE thematic_keywords (
      lemma TEXT NOT NULL, theme TEXT NOT NULL, testament TEXT NOT NULL
    );
  `);
  return db;
}

describe('query_themes — lexicon tie-break, executed via sql.js (not mockQuery)', () => {
  it('resolves to the LOWER strongs_id transliteration when one lemma maps to two Strong\'s numbers', async () => {
    const db = await makeMinimalDb();
    db.run(
      `INSERT INTO lexicon_lsj (strongs_id, original_word, original_word_nfc, original_word_stripped, transliteration, gloss)
       VALUES ('G0026', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-low', 'love'),
              ('G9999', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-high', 'love-alt')`
    );
    db.run(`INSERT INTO thematic_keywords (lemma, theme, testament) VALUES ('ἀγάπη', 'love', 'nt')`);

    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    });

    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);

    const lexiconCall = mockQuery.mock.calls.find(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCall, 'expected a lexicon_lsj lookup statement').toBeDefined();
    const [sql, params] = lexiconCall!;

    const stmt = db.prepare(String(sql));
    stmt.bind(params as unknown[]);
    const rows: { original_word_nfc: string; transliteration: string }[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as { original_word_nfc: string; transliteration: string });
    stmt.free();
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].transliteration).toBe('agapē-low');

    // The tool's OWN response must carry the resolved value — not just the
    // re-executed SQL above. A broken map-key or `?? null` wiring bug would
    // still pass the assertions above while emitting an all-null response.
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit['ἀγάπη']).toBe('agapē-low');
  });
});

// ─── Bind budget / separate statement (Step 3) ────────────────────────────────

describe('query_themes — the lexicon lookup is a SEPARATE statement, not folded into the matches query', () => {
  it('issues a distinct lexicon_lsj statement, with the matches query untouched by the new bind', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });

    await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);

    const matchesCall = mockQuery.mock.calls.find(([sql]) => /FROM thematic_keywords/i.test(String(sql)));
    expect(matchesCall).toBeDefined();
    // testament is interpolated into the matches SQL string (reserves all 100
    // bind slots for lemmas) — its bind array must contain ONLY the lemma(s).
    expect((matchesCall![1] as unknown[])).toEqual(['ἀγάπη']);

    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls).toHaveLength(1);
  });
});

// ─── Boundedness across multiple lemmas (AC-12) ──────────────────────────────

describe('query_themes — bounded lexicon statement count across multiple lemmas', () => {
  it('issues exactly ONE lexicon_lsj statement, not one per lemma', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) {
        return [
          { original_word_nfc: 'ἀγάπη', transliteration: 'agapē' },
          { original_word_nfc: 'χάρις', transliteration: 'charis' },
        ];
      }
      if (/FROM thematic_keywords/i.test(sql)) {
        return [
          { lemma: 'ἀγάπη', theme: 'love' },
          { lemma: 'χάρις', theme: 'grace' },
        ];
      }
      return [];
    });

    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη', 'χάρις'], testament: 'nt' } as any);

    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls).toHaveLength(1);

    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit['ἀγάπη']).toBe('agapē');
    expect(body.lemma_translit['χάρις']).toBe('charis');
  });
});

// ─── Schema shape (Step 1) ────────────────────────────────────────────────────

describe('query_themes — schema shape', () => {
  it('ThemesOutputSchema declares lemma_translit', () => {
    expect(Object.keys(ThemesOutputSchema)).toContain('lemma_translit');
  });
});

// ─── Key-set assertions (Step 2) — include_unmatched true vs false ───────────

describe('query_themes — lemma_translit key set follows include_unmatched', () => {
  it('include_unmatched: true (default) — keys are matches keys UNION unmatched', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });
    const result = await queryThemesForLemmas({
      lemmas: ['ἀγάπη', 'ἄγνωστος'],
      testament: 'nt',
      include_unmatched: true,
    } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.unmatched).toEqual(['ἄγνωστος']);
    expect(Object.keys(body.lemma_translit).sort()).toEqual(['ἄγνωστος', 'ἀγάπη'].sort());
  });

  it('include_unmatched: false — keys are matches keys ONLY (unmatched lemmas do not re-appear)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });
    const result = await queryThemesForLemmas({
      lemmas: ['ἀγάπη', 'ἄγνωστος'],
      testament: 'nt',
      include_unmatched: false,
    } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.unmatched).toBeUndefined();
    expect(Object.keys(body.lemma_translit)).toEqual(['ἀγάπη']);
  });
});

// ─── structuredContent (Step 4) ───────────────────────────────────────────────

describe('query_themes — structuredContent', () => {
  it('carries lemma_translit on structuredContent, not only the text payload', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });
    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as any).lemma_translit).toEqual({ 'ἀγάπη': 'agapē' });
  });
});

// ─── Present-and-null: OT fixture (Step 4a) ───────────────────────────────────

describe('query_themes — OT fixture: every map value is null, keys still present', () => {
  it('keys the map over the requested OT lemmas but every value is null when the Hebrew table has no match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lemma_translit_he_strongs/i.test(sql)) return [];
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'H0430', theme: 'deity' }];
      return [];
    });
    const result = await queryThemesForLemmas({ lemmas: ['H0430'], testament: 'ot' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('H0430');
    expect(body.lemma_translit['H0430']).toBeNull();
  });
});

// ─── OT Hebrew branch (Task 8) ────────────────────────────────────────────────
// For OT the theme "lemma" IS a Strong's number, so the translit lookup must
// route to lemma_translit_he_strongs (keyed on `strongs`), NOT lexicon_lsj (Greek,
// keyed on original_word_nfc). themes.ts feeds the keys as BIND PARAMS
// (WHERE strongs IN (?, ?, …), params = the lemma array), so the mock discriminates
// on BOTH the table name AND the bound params: it returns a row only for a
// byte-matching seeded strongs that actually appears in params.
//
// Two traps make these assertions load-bearing rather than vacuous:
//   1. lexicon_lsj is seeded with the SAME key (H7225) → 'GREEK-WRONG'. A misroute
//      to the Greek table for an OT call would surface 'GREEK-WRONG' (a *value*,
//      not null), so a table-blind fix cannot pass by accident.
//   2. The Hebrew seed carries a decoy key (H9999) that is never requested. Because
//      the mock returns rows only for byte-matching seeded keys present in params,
//      a broken bind (empty/wrong params) yields NO row → null → the test fails.

describe('query_themes — OT Hebrew lemma_translit via lemma_translit_he_strongs', () => {
  const heSeed: Record<string, string> = { H7225: 'rēʾšît', H9999: 'DECOY-HEB' };

  it('resolves the OT map key via lemma_translit_he_strongs (not lexicon_lsj)', async () => {
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/FROM lemma_translit_he_strongs/i.test(sql)) {
        // bind-param seam: return rows only for byte-matching seeded keys in params
        return (params as string[])
          .filter(k => k in heSeed)
          .map(k => ({ strongs: k, transliteration: heSeed[k] }));
      }
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'H7225', transliteration: 'GREEK-WRONG' }];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'H7225', theme: 'beginning' }];
      return [];
    });

    const result = await queryThemesForLemmas({ lemmas: ['H7225'], testament: 'ot' } as any);

    // OT calls must never touch the Greek lexicon table.
    const lexiconCall = mockQuery.mock.calls.find(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCall, 'OT call must not query lexicon_lsj').toBeUndefined();
    const heCall = mockQuery.mock.calls.find(([sql]) => /FROM lemma_translit_he_strongs/i.test(String(sql)));
    expect(heCall, 'OT call must query lemma_translit_he_strongs').toBeDefined();

    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit['H7225']).toBe('rēʾšît');
  });

  it('returns null for an OT strongs absent from lemma_translit_he_strongs (present-and-null)', async () => {
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/FROM lemma_translit_he_strongs/i.test(sql)) {
        return (params as string[])
          .filter(k => k in heSeed)
          .map(k => ({ strongs: k, transliteration: heSeed[k] }));
      }
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'H0430', transliteration: 'GREEK-WRONG' }];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'H0430', theme: 'deity' }];
      return [];
    });

    const result = await queryThemesForLemmas({ lemmas: ['H0430'], testament: 'ot' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('H0430');
    expect(body.lemma_translit['H0430']).toBeNull();
  });

  it('leaves the NT/Greek path routed to lexicon_lsj (unchanged)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lemma_translit_he_strongs/i.test(sql)) return [{ strongs: 'ἀγάπη', transliteration: 'HEB-WRONG' }];
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });

    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);
    const heCall = mockQuery.mock.calls.find(([sql]) => /FROM lemma_translit_he_strongs/i.test(String(sql)));
    expect(heCall, 'NT call must not query the Hebrew table').toBeUndefined();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit['ἀγάπη']).toBe('agapē');
  });
});

// ─── No-lexicon-match (Step 4b) ────────────────────────────────────────────────

describe('query_themes — NT lemma with no lexicon match', () => {
  it('maps to null, never a guess and never a missing key', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀσπαλαθος', theme: 'obscure' }];
      return [];
    });
    const result = await queryThemesForLemmas({ lemmas: ['ἀσπαλαθος'], testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('ἀσπαλαθος');
    expect(body.lemma_translit['ἀσπαλαθος']).toBeNull();
  });
});

// ─── Error path (Step 4c) ──────────────────────────────────────────────────────

describe('query_themes — lexicon error path degrades to an all-null map', () => {
  it('degrades lemma_translit to an all-null map when the lexicon statement rejects but matches succeeds', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) throw new Error('D1 timeout on lexicon_lsj');
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });
    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('ἀγάπη');
    expect(body.lemma_translit['ἀγάπη']).toBeNull();
  });
});

// ─── No existing field changed type (Step 5 — regression guard, expected GREEN already) ──

describe('query_themes — matches keeps its existing Record<lemma, theme[]> shape (AC-11)', () => {
  it('matches is unchanged — a Record<string, string[]>, not restructured into an array', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/FROM thematic_keywords/i.test(sql)) return [{ lemma: 'ἀγάπη', theme: 'love' }];
      return [];
    });
    const result = await queryThemesForLemmas({ lemmas: ['ἀγάπη'], testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(Array.isArray(body.matches)).toBe(false);
    expect(body.matches).toEqual({ 'ἀγάπη': ['love'] });
  });
});

// ─── lemma_translit null semantics (schema documentation) ─────────────────────
// The lemma_translit map carries `null` values for lemmas with no attested
// pointed lemma. A consumer must be able to learn from the schema alone that
// null is a defined outcome (not an error), and why it occurs.
describe('ThemesOutputSchema — lemma_translit documents null semantics', () => {
  const d = (ThemesOutputSchema.lemma_translit.description ?? '').toLowerCase();

  it('states values can be null', () => {
    expect(d).toContain('null');
  });

  it('reassures that null is not an error', () => {
    expect(d).toContain('not an error');
  });

  it('explains the honest-null cause (no attested pointed lemma)', () => {
    expect(d).toContain('attest');
  });
});
