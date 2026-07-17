import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryDiscourseFeatures, DiscourseFeatureRow } from './discourse.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

vi.mock('../db/books.js', () => ({
  lookupBook: vi.fn((name: string) => {
    if (name === 'John') return { canonical: 'john', displayName: 'John', testament: 'nt' };
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
    CREATE TABLE discourse_features (
      id INTEGER PRIMARY KEY,
      book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
      feature TEXT NOT NULL, feature_description TEXT, word TEXT
    );
    CREATE TABLE discourse_boundaries (
      id INTEGER PRIMARY KEY,
      book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
      word_position INTEGER NOT NULL, boundary_type TEXT, clause_id TEXT,
      clause_marker TEXT, note_text TEXT
    );
  `);
  return db;
}

describe('query_discourse_features — lexicon tie-break, executed via sql.js (not mockQuery)', () => {
  it('resolves to the LOWER strongs_id transliteration when one word maps to two Strong\'s numbers', async () => {
    const db = await makeMinimalDb();
    db.run(
      `INSERT INTO lexicon_lsj (strongs_id, original_word, original_word_nfc, original_word_stripped, transliteration, gloss)
       VALUES ('G0026', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-low', 'love'),
              ('G9999', 'ἀγάπη', 'ἀγάπη', 'αγαπη', 'agapē-high', 'love-alt')`
    );
    db.run(
      `INSERT INTO discourse_features (book, chapter, verse, feature, feature_description, word)
       VALUES ('john', 1, 1, 'historical_present', 'desc', 'ἀγάπη')`
    );

    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/FROM discourse_boundaries/i.test(sql)) return [];
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    });

    const result = await queryDiscourseFeatures({ book: 'John' } as any);

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
    expect(body.features.historical_present[0].word_translit).toBe('agapē-low');
  });
});

// ─── Bind budget (Step 1a) — this is the one expected to be red pre-existing ──

describe('query_discourse_features — bind budget', () => {
  it('keeps params.length <= 100 on every captured call', async () => {
    mockQuery.mockResolvedValue([]);
    await queryDiscourseFeatures({ book: 'John' } as any);
    for (const [, params] of mockQuery.mock.calls) {
      expect((params as unknown[]).length).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Statement count (Step 1b) — catches a per-batch/per-row fallback ─────────

describe('query_discourse_features — bounded lexicon statement count', () => {
  it('issues a bounded number of lexicon_lsj statements per call (not one per word/batch)', async () => {
    // Feed a real discourse_features row so the `rows.length > 0` gate that
    // guards the lexicon lookup actually fires. mockResolvedValue([]) would
    // make the primary query return [], the gate would never open, and this
    // assertion would pass vacuously (0 <= 2) regardless of implementation.
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [{ original_word_nfc: 'ἀγάπη', transliteration: 'agapē' }];
      if (/FROM discourse_boundaries/i.test(sql)) return [];
      if (/DISTINCT feature FROM/i.test(sql)) return [];
      if (/FROM discourse_features WHERE/i.test(sql)) {
        return [{ chapter: 1, verse: 1, feature: 'historical_present', feature_description: 'desc', word: 'ἀγάπη' }];
      }
      return [];
    });
    await queryDiscourseFeatures({ book: 'John' } as any);
    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls.length).toBeGreaterThan(0);
    expect(lexiconCalls.length).toBeLessThanOrEqual(2);
  });
});

describe('query_discourse_features — lexicon call count stays flat across multiple words', () => {
  it('does not scale lexicon statement count with the number of distinct words', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM discourse_boundaries/i.test(sql)) return [];
      if (/DISTINCT feature FROM/i.test(sql)) return [];
      if (/FROM discourse_features WHERE/i.test(sql)) {
        return [
          { chapter: 1, verse: 1, feature: 'historical_present', feature_description: 'desc', word: 'ἀγάπη' },
          { chapter: 1, verse: 2, feature: 'historical_present', feature_description: 'desc', word: 'χάρις' },
        ];
      }
      return [];
    });
    await queryDiscourseFeatures({ book: 'John' } as any);
    const lexiconCalls = mockQuery.mock.calls.filter(([sql]) => /FROM lexicon_lsj/i.test(String(sql)));
    expect(lexiconCalls).toHaveLength(1);
  });
});

// ─── Schema shape (Step 2) ────────────────────────────────────────────────────

describe('query_discourse_features — DiscourseFeatureRow schema shape', () => {
  it('declares word_translit', () => {
    expect(Object.keys(DiscourseFeatureRow.shape)).toContain('word_translit');
  });
});

// ─── structuredContent (Step 3) ───────────────────────────────────────────────

describe('query_discourse_features — structuredContent', () => {
  it('sets structuredContent on success', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await queryDiscourseFeatures({ book: 'John' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});

// ─── Present-and-null (Step 4) ────────────────────────────────────────────────

describe('query_discourse_features — present-and-null when no lexicon match', () => {
  it('word_translit is present-and-null when the lexicon lookup finds no match', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) return [];
      if (/FROM discourse_boundaries/i.test(sql)) return [];
      if (/DISTINCT feature FROM/i.test(sql)) return [];
      if (/FROM discourse_features WHERE/i.test(sql)) {
        return [{ chapter: 1, verse: 1, feature: 'historical_present', feature_description: 'desc', word: 'ἄγνωστον' }];
      }
      return [];
    });
    const result = await queryDiscourseFeatures({ book: 'John' } as any);
    const body = JSON.parse(result.content[0].text as string);
    const row = body.features.historical_present[0];
    expect(row).toHaveProperty('word_translit');
    expect(row.word_translit).toBeNull();
  });
});

// ─── Error path (Step 4a) ─────────────────────────────────────────────────────

describe('query_discourse_features — lexicon error path degrades to null', () => {
  it('degrades word_translit to null when the lexicon statement rejects but the primary query succeeds', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM lexicon_lsj/i.test(sql)) throw new Error('D1 timeout on lexicon_lsj');
      if (/FROM discourse_boundaries/i.test(sql)) return [];
      if (/DISTINCT feature FROM/i.test(sql)) return [];
      if (/FROM discourse_features WHERE/i.test(sql)) {
        return [{ chapter: 1, verse: 1, feature: 'historical_present', feature_description: 'desc', word: 'ἀγάπη' }];
      }
      return [];
    });
    const result = await queryDiscourseFeatures({ book: 'John' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text as string);
    const row = body.features.historical_present[0];
    expect(row).toHaveProperty('word_translit');
    expect(row.word_translit).toBeNull();
  });
});
