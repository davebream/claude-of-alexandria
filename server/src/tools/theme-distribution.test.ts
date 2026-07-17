import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryThemeDistribution, ThemeDistributionOutputSchema } from './theme-distribution.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

vi.mock('../db/books.js', () => ({
  getAllBooks: vi.fn(() => [
    { canonical: 'romans', displayName: 'Romans', testament: 'nt' },
    { canonical: '1_corinthians', displayName: '1 Corinthians', testament: 'nt' },
  ]),
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
    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY,
      book TEXT NOT NULL, testament TEXT NOT NULL, chapter INTEGER NOT NULL,
      lemma TEXT NOT NULL, frequency INTEGER NOT NULL
    );
  `);
  return db;
}

describe('query_theme_distribution — lexicon tie-break, executed via sql.js (not mockQuery)', () => {
  it('resolves to the LOWER strongs_id transliteration when one lemma maps to two Strong\'s numbers', async () => {
    const db = await makeMinimalDb();
    db.run(
      `INSERT INTO lexicon_lsj (strongs_id, original_word, original_word_nfc, original_word_stripped, transliteration, gloss)
       VALUES ('G0026', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-low', 'love'),
              ('G9999', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-high', 'love-alt')`
    );
    db.run(`INSERT INTO thematic_keywords (lemma, theme, testament) VALUES ('ἀγάπη', 'love', 'nt')`);
    db.run(`INSERT INTO vocabulary (book, testament, chapter, lemma, frequency) VALUES ('romans', 'nt', 1, 'ἀγάπη', 3)`);

    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    });

    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);

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

// ─── Bind budget — fixed at 2 regardless of theme_lemmas size ────────────────

describe('query_theme_distribution — the lexicon lookup is a SEPARATE, fixed-bind statement', () => {
  it('issues a distinct lexicon_lsj statement bound only by (theme, testament)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [{ book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 }];
      return [];
    });

    await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);

    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls).toHaveLength(1);
    const [, params] = lexiconCalls[0];
    expect((params as unknown[]).length).toBeLessThanOrEqual(2);
  });
});

// ─── Boundedness across multiple lemmas (AC-12) ──────────────────────────────

describe('query_theme_distribution — bounded lexicon statement count across multiple lemmas', () => {
  it('issues exactly ONE lexicon_lsj statement, not one per lemma', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) {
        return [
          { original_word_nfc: 'ἀγάπη', transliteration: 'agapē' },
          { original_word_nfc: 'χάρις', transliteration: 'charis' },
        ];
      }
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }, { lemma: 'χάρις' }];
      if (/JOIN thematic_keywords/i.test(sql)) {
        return [
          { book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 },
          { book: 'romans', chapter: 2, lemma: 'χάρις', frequency: 2 },
        ];
      }
      return [];
    });

    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);

    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls).toHaveLength(1);

    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit['ἀγάπη']).toBe('agapē');
    expect(body.lemma_translit['χάρις']).toBe('charis');
  });
});

// ─── Schema shape (Step 1) ────────────────────────────────────────────────────

describe('query_theme_distribution — schema shape', () => {
  it('ThemeDistributionOutputSchema declares lemma_translit', () => {
    expect(Object.keys(ThemeDistributionOutputSchema)).toContain('lemma_translit');
  });
});

// ─── Key-set assertion (Step 2) — keyed over theme_lemmas ────────────────────

describe('query_theme_distribution — lemma_translit keys match theme_lemmas', () => {
  it('keys the map over theme_lemmas, a superset of every by_lemma key across all books', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      // theme_lemmas is a superset: includes χάρις even though it has 0 occurrences.
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }, { lemma: 'χάρις' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [{ book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 }];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.theme_lemmas.sort()).toEqual(['χάρις', 'ἀγάπη'].sort());
    expect(Object.keys(body.lemma_translit).sort()).toEqual(['χάρις', 'ἀγάπη'].sort());
  });
});

// ─── structuredContent (Step 4) ───────────────────────────────────────────────

describe('query_theme_distribution — structuredContent', () => {
  it('carries lemma_translit on structuredContent, not only the text payload', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [{ book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 }];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as any).lemma_translit).toEqual({ 'ἀγάπη': 'agapē' });
  });
});

// ─── Present-and-null: OT fixture (Step 4a) ───────────────────────────────────

describe('query_theme_distribution — OT fixture: every map value is null, keys still present', () => {
  it('keys the map over theme_lemmas but every value is null (lexicon_lsj is Greek-only)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'deity' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'H0430' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'deity', testament: 'ot' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('H0430');
    expect(body.lemma_translit['H0430']).toBeNull();
  });
});

// ─── No-lexicon-match (Step 4b) ────────────────────────────────────────────────

describe('query_theme_distribution — NT lemma with no lexicon match', () => {
  it('maps to null, never a guess and never a missing key', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'obscure' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀσπαλαθος' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'obscure', testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('ἀσπαλαθος');
    expect(body.lemma_translit['ἀσπαλαθος']).toBeNull();
  });
});

// ─── Error path (Step 4c) ──────────────────────────────────────────────────────

describe('query_theme_distribution — lexicon error path degrades to an all-null map', () => {
  it('degrades lemma_translit to an all-null map when the lexicon statement rejects but the rest succeeds', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) throw new Error('D1 timeout on lexicon_lsj');
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [{ book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 }];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemma_translit).toHaveProperty('ἀγάπη');
    expect(body.lemma_translit['ἀγάπη']).toBeNull();
  });
});

// ─── No existing field changed type (Step 5 — regression guard, expected GREEN already) ──

describe('query_theme_distribution — by_lemma keeps its existing nested Record shape (AC-11)', () => {
  it('by_lemma is unchanged — Record<lemma, Record<chapter, count>>, not restructured into an array', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return [{ lemma: 'ἀγάπη' }];
      if (/JOIN thematic_keywords/i.test(sql)) return [{ book: 'romans', chapter: 1, lemma: 'ἀγάπη', frequency: 3 }];
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(Array.isArray(body.books[0].by_lemma)).toBe(false);
    expect(body.books[0].by_lemma).toEqual({ 'ἀγάπη': { '1': 3 } });
  });
});

// ─── Truncation branch: key-set coverage must survive book truncation (Phase-5 review) ──

describe('query_theme_distribution — truncated response still covers every surviving by_lemma key', () => {
  it('truncates books past CHARACTER_LIMIT yet lemma_translit covers every retained by_lemma lemma', async () => {
    // Build a large fixture: many books × many lemmas × many chapters so the
    // serialized payload exceeds CHARACTER_LIMIT (25,000) and the truncation
    // branch fires. Every lemma is in theme_lemmas, so lemma_translit must key
    // all of them regardless of how many books survive truncation.
    const lemmas = Array.from({ length: 12 }, (_, i) => `lemma_${i}`);
    const books = Array.from({ length: 70 }, (_, b) => `book_${b}`);
    const distRows = books.flatMap(book =>
      lemmas.flatMap(lemma =>
        Array.from({ length: 5 }, (_, ch) => ({ book, chapter: ch + 1, lemma, frequency: (ch + 1) * 7 }))
      )
    );
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) {
        // every lemma resolves to a translit (present-and-non-null)
        return lemmas.map(l => ({ original_word_nfc: l, transliteration: `tr_${l}` }));
      }
      if (/DISTINCT theme/i.test(sql)) return [{ theme: 'love' }];
      if (/DISTINCT lemma/i.test(sql)) return lemmas.map(l => ({ lemma: l }));
      if (/JOIN thematic_keywords/i.test(sql)) return distRows;
      return [];
    });
    const result = await queryThemeDistribution({ theme: 'love', testament: 'nt' } as any);
    const body = JSON.parse(result.content[0].text as string);

    // (a) truncation actually fired
    expect(body.truncated).toBe(true);
    expect(body.books.length).toBeLessThan(70);

    // (b) every by_lemma key in every SURVIVING book has a lemma_translit entry
    for (const book of body.books) {
      for (const lemma of Object.keys(book.by_lemma)) {
        expect(body.lemma_translit).toHaveProperty(lemma);
        expect(body.lemma_translit[lemma]).toBe(`tr_${lemma}`);
      }
    }
  });
});
