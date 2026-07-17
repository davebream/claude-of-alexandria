import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryLemmas, DistributionEntry } from './lemmas.js';
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
// Real SQLite (compiled to WASM), already a devDependency (server/package.json).
// A mockQuery assertion cannot see ordering — it returns canned rows and never
// executes the composed SQL. Only actual execution proves the tie-break wins.

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
  `);
  return db;
}

describe('query_lemmas — lexicon tie-break, executed via sql.js (not mockQuery)', () => {
  it('resolves to the LOWER strongs_id transliteration when one lemma maps to two Strong\'s numbers', async () => {
    const db = await makeMinimalDb();
    db.run(
      `INSERT INTO lexicon_lsj (strongs_id, original_word, original_word_nfc, original_word_stripped, transliteration, gloss)
       VALUES ('G0026', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-low', 'love'),
              ('G9999', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-high', 'love-alt')`
    );

    mockQuery.mockResolvedValue([
      { lemma: 'ἀγάπη', book: 'romans', chapter: 1, frequency: 3 },
    ]);

    await queryLemmas({ lemmas: ['ἀγάπη'] } as any);

    const lexiconCall = mockQuery.mock.calls.find(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCall, 'expected a lexicon_lsj lookup statement').toBeDefined();
    const [sql, params] = lexiconCall!;

    const stmt = db.prepare(String(sql));
    stmt.bind(params as unknown[]);
    const rows: { original_word_nfc: string; transliteration: string }[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as { original_word_nfc: string; transliteration: string });
    }
    stmt.free();
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].transliteration).toBe('agapē-low');
  });
});

// ─── Bind budget (Step 1a) ───────────────────────────────────────────────────

describe('query_lemmas — bind budget', () => {
  it('keeps params.length <= 100 on every captured call', async () => {
    mockQuery.mockResolvedValue([
      { lemma: 'ἀγάπη', book: 'romans', chapter: 1, frequency: 3 },
    ]);
    await queryLemmas({ lemmas: ['ἀγάπη'] } as any);

    for (const [, params] of mockQuery.mock.calls) {
      expect((params as unknown[]).length).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Statement count (Step 1b) ───────────────────────────────────────────────

describe('query_lemmas — bounded statement count', () => {
  it('issues a bounded number of statements per call (not one per lemma)', async () => {
    mockQuery.mockResolvedValue([
      { lemma: 'ἀγάπη', book: 'romans', chapter: 1, frequency: 3 },
    ]);
    await queryLemmas({ lemmas: ['ἀγάπη'] } as any);
    expect(mockQuery.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

// ─── Schema shape (Step 2) ────────────────────────────────────────────────────

describe('query_lemmas — DistributionEntry schema shape', () => {
  it('declares lemma_translit', () => {
    const keys = Object.keys(DistributionEntry.shape);
    expect(keys).toContain('lemma_translit');
  });
});

// ─── structuredContent (Step 3) ───────────────────────────────────────────────

describe('query_lemmas — structuredContent', () => {
  it('sets structuredContent on success', async () => {
    mockQuery.mockResolvedValue([
      { lemma: 'ἀγάπη', book: 'romans', chapter: 1, frequency: 3 },
    ]);
    const result = await queryLemmas({ lemmas: ['ἀγάπη'] } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});

// ─── Present-and-null (Step 4) ────────────────────────────────────────────────

describe('query_lemmas — present-and-null when no lexicon match', () => {
  it('lemma_translit is present-and-null when the lexicon lookup finds no match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      return [{ lemma: 'ἀγνωστος', book: 'acts', chapter: 17, frequency: 1 }];
    });
    const result = await queryLemmas({ lemmas: ['ἀγνωστος'] } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemmas[0]).toHaveProperty('lemma_translit');
    expect(body.lemmas[0].lemma_translit).toBeNull();
  });

  it('lemma_translit is present-and-null for OT (Hebrew) lemmas', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      return [{ lemma: 'H7225', book: 'genesis', chapter: 1, frequency: 1 }];
    });
    const result = await queryLemmas({ lemmas: ['H7225'] } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemmas[0]).toHaveProperty('lemma_translit');
    expect(body.lemmas[0].lemma_translit).toBeNull();
  });
});

// ─── Error path (Step 4a) ─────────────────────────────────────────────────────

describe('query_lemmas — lexicon error path degrades to null', () => {
  it('degrades lemma_translit to null when the lexicon statement rejects but the primary query succeeds', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) throw new Error('D1 timeout on lexicon_lsj');
      return [{ lemma: 'ἀγάπη', book: 'romans', chapter: 1, frequency: 3 }];
    });
    const result = await queryLemmas({ lemmas: ['ἀγάπη'] } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemmas[0]).toHaveProperty('lemma_translit');
    expect(body.lemmas[0].lemma_translit).toBeNull();
  });
});
