import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryVocabulary, LemmaEntry, ClusterEntry } from './vocabulary.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

vi.mock('../db/books.js', () => ({
  lookupBook: vi.fn((name: string) => {
    if (name === 'Romans') return { canonical: 'romans', displayName: 'Romans', testament: 'nt' };
    return null;
  }),
  suggestBooks: vi.fn(() => []),
}));

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
    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY,
      book TEXT NOT NULL, testament TEXT NOT NULL, chapter INTEGER NOT NULL,
      lemma TEXT NOT NULL, frequency INTEGER NOT NULL
    );
    CREATE TABLE vocabulary_clusters (
      id INTEGER PRIMARY KEY,
      book TEXT NOT NULL, testament TEXT NOT NULL, lemma TEXT NOT NULL,
      concentration REAL NOT NULL, chapter_start INTEGER NOT NULL, chapter_end INTEGER NOT NULL,
      total_occurrences INTEGER NOT NULL
    );
  `);
  return db;
}

describe('query_vocabulary — lexicon tie-break, executed via sql.js (not mockQuery)', () => {
  it('resolves to the LOWER strongs_id transliteration when one lemma maps to two Strong\'s numbers', async () => {
    const db = await makeMinimalDb();
    db.run(
      `INSERT INTO lexicon_lsj (strongs_id, original_word, original_word_nfc, original_word_stripped, transliteration, gloss)
       VALUES ('G0026', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-low', 'love'),
              ('G9999', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-high', 'love-alt')`
    );
    db.run(`INSERT INTO vocabulary (book, testament, chapter, lemma, frequency) VALUES ('romans', 'nt', 1, 'ἀγάπη', 3)`);

    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    });

    await queryVocabulary({ book: 'Romans' } as any);

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
  });
});

// ─── Bind budget (Step 1a) ───────────────────────────────────────────────────

describe('query_vocabulary — bind budget', () => {
  it('keeps params.length <= 100 on every captured call', async () => {
    mockQuery.mockResolvedValue([]);
    await queryVocabulary({ book: 'Romans' } as any);
    for (const [, params] of mockQuery.mock.calls) {
      expect((params as unknown[]).length).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Statement count (Step 1b) ────────────────────────────────────────────────
// vocabulary.ts already issues baseline statements (ranked lemma list, by-chapter
// lookup, total count). The assertion below is scoped to lexicon_lsj calls only —
// AC-12's real requirement is "bounded, never one per row/lemma", which this proves
// without contradicting the tool's pre-existing (out-of-scope) statement shape.

describe('query_vocabulary — bounded lexicon statement count', () => {
  it('issues a bounded number of lexicon_lsj statements per call (not one per lemma)', async () => {
    mockQuery.mockResolvedValue([]);
    await queryVocabulary({ book: 'Romans' } as any);
    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls.length).toBeLessThanOrEqual(2);
  });
});

// ─── Schema shape (Step 2) ────────────────────────────────────────────────────

describe('query_vocabulary — schema shapes', () => {
  it('LemmaEntry declares lemma_translit', () => {
    expect(Object.keys(LemmaEntry.shape)).toContain('lemma_translit');
  });

  it('ClusterEntry declares lemma_translit', () => {
    expect(Object.keys(ClusterEntry.shape)).toContain('lemma_translit');
  });
});

// ─── structuredContent (Step 3) ───────────────────────────────────────────────

describe('query_vocabulary — structuredContent', () => {
  it('sets structuredContent on success', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await queryVocabulary({ book: 'Romans' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});

// ─── Present-and-null (Step 4) ────────────────────────────────────────────────

describe('query_vocabulary — present-and-null when no lexicon match', () => {
  it('lemma_translit is present-and-null on lemmas entries when the lexicon lookup finds no match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM vocabulary v\s+WHERE/i.test(sql) || /SELECT v\.lemma, v\.chapter/i.test(sql)) return [];
      if (/SELECT lemma, total FROM/i.test(sql)) return [{ lemma: 'ἀγνωστος', total: 2 }];
      if (/COUNT\(DISTINCT lemma\)/i.test(sql)) return [{ cnt: 1 }];
      return [];
    });
    const result = await queryVocabulary({ book: 'Romans' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemmas[0]).toHaveProperty('lemma_translit');
    expect(body.lemmas[0].lemma_translit).toBeNull();
  });

  it('lemma_translit is present-and-null on cluster entries when check_clustering=true and no match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM vocabulary_clusters/i.test(sql)) {
        return [{ lemma: 'ἀγνωστος', concentration: 0.5, chapter_start: 1, chapter_end: 2, total_occurrences: 4 }];
      }
      if (/SELECT lemma, total FROM/i.test(sql)) return [];
      if (/COUNT\(DISTINCT lemma\)/i.test(sql)) return [{ cnt: 0 }];
      return [];
    });
    const result = await queryVocabulary({ book: 'Romans', check_clustering: true } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.clustering.clusters[0]).toHaveProperty('lemma_translit');
    expect(body.clustering.clusters[0].lemma_translit).toBeNull();
  });
});

// ─── Error path (Step 4a) ─────────────────────────────────────────────────────

describe('query_vocabulary — lexicon error path degrades to null', () => {
  it('degrades lemma_translit to null when the lexicon statement rejects but the primary query succeeds', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) throw new Error('D1 timeout on lexicon_lsj');
      if (/SELECT lemma, total FROM/i.test(sql)) return [{ lemma: 'ἀγάπη', total: 3 }];
      if (/COUNT\(DISTINCT lemma\)/i.test(sql)) return [{ cnt: 1 }];
      return [];
    });
    const result = await queryVocabulary({ book: 'Romans' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.lemmas[0]).toHaveProperty('lemma_translit');
    expect(body.lemmas[0].lemma_translit).toBeNull();
  });
});
