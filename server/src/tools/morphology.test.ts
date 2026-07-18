import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryMorphology, MorphologyWordEntry } from './morphology.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── sql.js prepare() gate ─────────────────────────────────────────────────────
// Real SQLite (compiled to WASM), already a devDependency (server/package.json).
// This is the seam that catches column ambiguity — a string/regex assertion
// cannot see whether every column in the WHERE/ORDER BY clauses is qualified.

let SQL: SqlJsStatic;

async function makeMinimalDb(): Promise<Database> {
  if (!SQL) SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE morphology (
      id INTEGER PRIMARY KEY,
      book TEXT, chapter INTEGER, verse INTEGER, word_position INTEGER, testament TEXT,
      text TEXT, normalized TEXT, lemma TEXT, pos TEXT, parsing TEXT,
      clause_id TEXT, clause_type TEXT, strongs TEXT,
      gloss TEXT, semantic_frame TEXT, subject_ref TEXT, participant_ref TEXT,
      gloss_tbesg TEXT, louw_nida TEXT, louw_nida_domain TEXT,
      transliteration TEXT
    );
    CREATE TABLE lexicon_lsj (
      strongs_id TEXT PRIMARY KEY,
      original_word TEXT, original_word_nfc TEXT, original_word_stripped TEXT,
      transliteration TEXT, gloss TEXT, definition TEXT
    );
    CREATE TABLE lemma_translit_he (
      lemma TEXT PRIMARY KEY,
      transliteration TEXT NOT NULL
    );
  `);
  return db;
}

describe('query_morphology — sql.js prepare() ambiguity gate', () => {
  it('REJECTS an unqualified column reference once the lexicon join is present', async () => {
    const db = await makeMinimalDb();
    // Both morphology and lexicon_lsj carry `transliteration` (and `gloss`) —
    // an unaliased projection is genuinely ambiguous under the join.
    expect(() =>
      db.prepare(
        'SELECT transliteration FROM morphology LEFT JOIN lexicon_lsj ON morphology.strongs = lexicon_lsj.strongs_id'
      )
    ).toThrow(/ambiguous column name/);
    db.close();
  });

  it('ACCEPTS the table-qualified form of the same join', async () => {
    const db = await makeMinimalDb();
    expect(() =>
      db.prepare(
        'SELECT m.transliteration AS text_translit FROM morphology m LEFT JOIN lexicon_lsj lx ON m.strongs = lx.strongs_id'
      )
    ).not.toThrow();
    db.close();
  });

  it('prepares the ACTUAL SQL emitted by queryMorphology at fields=syntax cleanly', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'syntax' } as any);

    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    expect(call, 'expected a call whose SQL selects FROM morphology m').toBeDefined();
    const sql = String(call![0]);

    const db = await makeMinimalDb();
    expect(() => db.prepare(sql)).not.toThrow();
    db.close();
  });

  // ─── OT join shape: lemma_translit_he shares BOTH `lemma` and `transliteration`
  // column names with morphology, so an unqualified projection is ambiguous under
  // the OT join, exactly as lexicon_lsj is under the NT join.
  it('REJECTS an unqualified column reference once the lemma_translit_he join is present', async () => {
    const db = await makeMinimalDb();
    expect(() =>
      db.prepare(
        'SELECT transliteration FROM morphology LEFT JOIN lemma_translit_he ON morphology.lemma = lemma_translit_he.lemma'
      )
    ).toThrow(/ambiguous column name/);
    db.close();
  });

  it('prepares the ACTUAL SQL emitted by queryMorphology at fields=syntax for OT cleanly', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'syntax' } as any);

    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    expect(call, 'expected a call whose SQL selects FROM morphology m').toBeDefined();
    const sql = String(call![0]);

    const db = await makeMinimalDb();
    expect(() => db.prepare(sql)).not.toThrow();
    db.close();
  });
});

// ─── Generated-SQL structural assertions (content-matched, not positional) ────

describe('query_morphology — generated SQL structure', () => {
  it('aliases the table FROM morphology m', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology/i.test(String(sql)));
    expect(call).toBeDefined();
    expect(String(call![0])).toMatch(/FROM morphology m\b/);
  });

  it('projects m.transliteration AS text_translit at basic', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    expect(String(call![0])).toMatch(/m\.transliteration AS text_translit/);
  });

  it('emits NO JOIN at fields=basic', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    expect(String(call![0])).not.toMatch(/JOIN/i);
  });

  it('emits lx.transliteration AS lemma_translit via a LEFT JOIN at fields=syntax', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'syntax' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const sql = String(call![0]);
    expect(sql).toMatch(/LEFT JOIN lexicon_lsj lx ON m\.strongs = lx\.strongs_id/);
    expect(sql).toMatch(/lx\.transliteration AS lemma_translit/);
  });

  it('emits lx.transliteration AS lemma_translit via a LEFT JOIN at fields=lexical too', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'lexical' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const sql = String(call![0]);
    expect(sql).toMatch(/LEFT JOIN lexicon_lsj lx ON m\.strongs = lx\.strongs_id/);
    expect(sql).toMatch(/lx\.transliteration AS lemma_translit/);
  });
});

// ─── OT testament-conditional join (lemma_translit_he) ──────────────────────────
// OT morphology has no Strong's-keyed Hebrew lexicon; lemma_translit is derived
// and stored in lemma_translit_he, keyed by the exact pointed Hebrew lemma. The
// join therefore switches on testament: OT → lemma_translit_he ON m.lemma; NT →
// lexicon_lsj ON m.strongs (unchanged). Alias stays `lx` either way, so the
// column projections (lx.transliteration AS lemma_translit) never change.

describe('query_morphology — OT testament-conditional join', () => {
  it('OT syntax joins lemma_translit_he on m.lemma, never lexicon_lsj', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'syntax' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const sql = String(call![0]);
    expect(sql).toMatch(/LEFT JOIN lemma_translit_he lx ON m\.lemma = lx\.lemma/);
    expect(sql).not.toMatch(/lexicon_lsj/);
    expect(sql).toMatch(/lx\.transliteration AS lemma_translit/);
  });

  it('OT lexical joins lemma_translit_he on m.lemma, never lexicon_lsj', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'lexical' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const sql = String(call![0]);
    expect(sql).toMatch(/LEFT JOIN lemma_translit_he lx ON m\.lemma = lx\.lemma/);
    expect(sql).not.toMatch(/lexicon_lsj/);
    expect(sql).toMatch(/lx\.transliteration AS lemma_translit/);
  });

  it('NT syntax still joins lexicon_lsj on m.strongs, never lemma_translit_he (AC-5 byte-identical)', async () => {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'syntax' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const sql = String(call![0]);
    expect(sql).toMatch(/LEFT JOIN lexicon_lsj lx ON m\.strongs = lx\.strongs_id/);
    expect(sql).not.toMatch(/lemma_translit_he/);
  });

  // ─── Execution seam (NON-VACUOUS) ────────────────────────────────────────────
  // The OT lookup key is a JOIN column (m.lemma), NOT a bind param — so a
  // param-aware mock cannot guard it. Instead we execute the ACTUAL composed SQL
  // against a real sql.js DB with a seeded morphology row + lemma_translit_he row,
  // and assert the transliteration flows back only when the lemma BYTES match.

  async function runOtSyntaxAgainstSqlJs(heRows: Array<[string, string]>): Promise<Record<string, unknown>> {
    mockQuery.mockResolvedValue([]);
    await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'syntax' } as any);
    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    const [sql, params] = call!;
    const p = params as unknown[];

    const db = await makeMinimalDb();
    // Seed one OT morphology row whose book/testament match the captured params,
    // in chapter 1 verse 1 so it falls inside the 1:1-1:1 range. Pointed lemma.
    db.run(
      `INSERT INTO morphology (book, chapter, verse, word_position, testament, text, normalized, lemma, pos, strongs, transliteration)
       VALUES (?, 1, 1, 1, ?, 'בְּרֵאשִׁית', 'בראשית', 'רֵאשִׁית', 'noun', 'H7225', 'bǝrēʾšît')`,
      [p[0] as string, p[1] as string]
    );
    for (const [lemma, translit] of heRows) {
      db.run('INSERT INTO lemma_translit_he (lemma, transliteration) VALUES (?, ?)', [lemma, translit]);
    }

    const stmt = db.prepare(String(sql));
    stmt.bind(p as any[]);
    const stepped = stmt.step();
    expect(stepped, 'expected the seeded morphology row to be returned by the composed SQL').toBe(true);
    const row = stmt.getAsObject();
    stmt.free();
    db.close();
    return row;
  }

  it('EXECUTES the composed OT SQL: a byte-matching lemma_translit_he row yields non-null lemma_translit', async () => {
    // lemma_translit_he.lemma byte-matches morphology.lemma ('רֵאשִׁית').
    const row = await runOtSyntaxAgainstSqlJs([['רֵאשִׁית', 'rēʾšît']]);
    expect(row.lemma_translit).toBe('rēʾšît');
    // Sanity: text_translit (m.transliteration) is unaffected by the join (AC-4).
    expect(row.text_translit).toBe('bǝrēʾšît');
  });

  it('EXECUTES the composed OT SQL: a non-byte-matching lemma yields lemma_translit null (LEFT JOIN miss)', async () => {
    // Different lemma bytes → no join match → null under the LEFT JOIN.
    const row = await runOtSyntaxAgainstSqlJs([['שָׁמַיִם', 'šāmayim']]);
    expect(row.lemma_translit).toBeNull();
    expect(row.text_translit).toBe('bǝrēʾšît');
  });

  it('EXECUTES the composed OT SQL: an absent lemma yields lemma_translit null', async () => {
    const row = await runOtSyntaxAgainstSqlJs([]);
    expect(row.lemma_translit).toBeNull();
  });
});

// ─── Schema-shape assertion ─────────────────────────────────────────────────────

describe('query_morphology — MorphologyWordEntry schema shape', () => {
  it('declares text_translit and lemma_translit', () => {
    const keys = Object.keys(MorphologyWordEntry.shape);
    expect(keys).toContain('text_translit');
    expect(keys).toContain('lemma_translit');
  });
});

// ─── structuredContent assertion ────────────────────────────────────────────────

describe('query_morphology — structuredContent', () => {
  it('sets structuredContent on success', async () => {
    mockQuery.mockResolvedValue([
      { chapter: 1, verse: 1, word_position: 1, text: 'ἐν', normalized: 'ἐν', lemma: 'ἐν', pos: 'prep', parsing: null, text_translit: 'en' },
    ]);
    const result = await queryMorphology({ book: 'John', range: '1:1-1:1' } as any);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});

// ─── Placement assertions ───────────────────────────────────────────────────────
// Pin the fixture: an NT row WITH a lexicon match, so lemma_translit has
// something non-null to assert against at syntax+.

const NT_ROW_WITH_MATCH = {
  chapter: 6, verse: 23, word_position: 5,
  text: 'ἀγάπη', normalized: 'ἀγάπη', lemma: 'ἀγάπη', pos: 'noun', parsing: null,
  clause_id: 'c1', clause_type: 'main', strongs: 'G0026',
  gloss: 'love', semantic_frame: null, subject_ref: null, participant_ref: null,
  gloss_tbesg: null, louw_nida: null, louw_nida_domain: null,
  text_translit: 'agapē',
  lemma_translit: 'agapē',
};

describe('query_morphology — field placement across fields levels', () => {
  it('text_translit is present at basic; lemma_translit is ABSENT at basic (no join)', async () => {
    mockQuery.mockResolvedValue([{ ...NT_ROW_WITH_MATCH }]);
    const result = await queryMorphology({ book: 'John', range: '1:1-1:1' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0]).not.toHaveProperty('lemma_translit');
  });

  it('text_translit and lemma_translit are both present at syntax', async () => {
    mockQuery.mockResolvedValue([{ ...NT_ROW_WITH_MATCH }]);
    const result = await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'syntax' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0].text_translit).toBe('agapē');
    expect(body.words[0]).toHaveProperty('lemma_translit');
    expect(body.words[0].lemma_translit).toBe('agapē');
  });

  it('text_translit and lemma_translit are both present at full', async () => {
    mockQuery.mockResolvedValue([{ ...NT_ROW_WITH_MATCH }]);
    const result = await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'full' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0]).toHaveProperty('lemma_translit');
  });

  it('text_translit and lemma_translit are both present at lexical', async () => {
    mockQuery.mockResolvedValue([{ ...NT_ROW_WITH_MATCH }]);
    const result = await queryMorphology({ book: 'John', range: '1:1-1:1', fields: 'lexical' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0]).toHaveProperty('lemma_translit');
  });
});

// ─── Null assertions — uniform present-and-null rule ────────────────────────────
// OT fixture: lemma_translit is always null for Hebrew (no Hebrew headword source).

const OT_ROW_UNPOPULATED = {
  chapter: 1, verse: 1, word_position: 1,
  text: 'בְּרֵאשִׁית', normalized: 'בראשית', lemma: 'רֵאשִׁית', pos: 'noun', parsing: null,
  clause_id: null, clause_type: null, strongs: 'H7225',
  gloss: null, semantic_frame: null, subject_ref: null, participant_ref: null,
  gloss_tbesg: null, louw_nida: null, louw_nida_domain: null,
  text_translit: null,
  lemma_translit: null,
};

describe('query_morphology — null assertions (present-and-null, never omitted)', () => {
  it('text_translit is present-and-null at basic when unpopulated', async () => {
    mockQuery.mockResolvedValue([{ ...OT_ROW_UNPOPULATED }]);
    const result = await queryMorphology({ book: 'Genesis', range: '1:1-1:1' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0].text_translit).toBeNull();
  });

  it('text_translit and lemma_translit are present-and-null at syntax when unpopulated (OT)', async () => {
    mockQuery.mockResolvedValue([{ ...OT_ROW_UNPOPULATED }]);
    const result = await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'syntax' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0].text_translit).toBeNull();
    expect(body.words[0]).toHaveProperty('lemma_translit');
    expect(body.words[0].lemma_translit).toBeNull();
  });

  it('text_translit and lemma_translit are present-and-null at full when unpopulated (OT)', async () => {
    mockQuery.mockResolvedValue([{ ...OT_ROW_UNPOPULATED }]);
    const result = await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'full' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0].text_translit).toBeNull();
    expect(body.words[0]).toHaveProperty('lemma_translit');
    expect(body.words[0].lemma_translit).toBeNull();
  });

  it('text_translit and lemma_translit are present-and-null at lexical when unpopulated (OT)', async () => {
    mockQuery.mockResolvedValue([{ ...OT_ROW_UNPOPULATED }]);
    const result = await queryMorphology({ book: 'Genesis', range: '1:1-1:1', fields: 'lexical' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.words[0]).toHaveProperty('text_translit');
    expect(body.words[0].text_translit).toBeNull();
    expect(body.words[0]).toHaveProperty('lemma_translit');
    expect(body.words[0].lemma_translit).toBeNull();
  });
});

// ─── Bound-parameter regression (TS-side analog of the ETL's sql_escape guard) ──
// morphology.ts never interpolates values into the SQL string — word_filter,
// strongs_filter, etc. are always passed as bound `?` params. This is insurance
// against a future upstream romanization scheme introducing a literal apostrophe
// (e.g. Hebrew ʾ → ') into text/lemma/transliteration values: since the value
// never touches the SQL string, no escaping is ever needed on this path.

describe('query_morphology — parameterized binding regression (apostrophe safety)', () => {
  it('passes a word_filter containing an apostrophe as a bound param, never interpolated into SQL', async () => {
    mockQuery.mockResolvedValue([]);
    const filterValue = "O'Brien";
    await queryMorphology({ book: 'John', range: '1:1-1:1', word_filter: filterValue } as any);

    const call = mockQuery.mock.calls.find(([sql]) => /FROM morphology m/.test(String(sql)));
    expect(call).toBeDefined();
    const [sql, params] = call!;
    // The literal value must never appear inside the SQL string itself.
    expect(String(sql)).not.toContain(filterValue);
    // It must appear, unmodified, among the bound parameters.
    expect(params as unknown[]).toContain(filterValue);
  });
});
