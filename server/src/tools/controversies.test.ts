import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { queryControversies } from './controversies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

// Mock the database query module
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

// Mock the books module
vi.mock('../db/books.js', () => ({
  lookupBook: vi.fn(),
  suggestBooks: vi.fn(),
}));

import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

const mockQuery = vi.mocked(query);
const mockLookupBook = vi.mocked(lookupBook);
const mockSuggestBooks = vi.mocked(suggestBooks);

// Reusable fixture rows mirroring the controversy_topics JOIN schema
const exodusTopicRow = {
  topic: 'Date of the Exodus',
  slug: 'date-of-the-exodus',
  category: 'historicity',
  rating: 'debated',
  summary: 'Scholars dispute whether the Exodus occurred in the 15th or 13th century BCE.',
  positions: JSON.stringify([
    { label: 'Early date', view: '15th century BCE', evidence: '1 Kgs 6:1', scholars: ['Archer', 'Kitchen (early)'] },
    { label: 'Late date', view: '13th century BCE', evidence: 'Ramesses II', scholars: ['Kitchen', 'Hoffmeier'] },
  ]),
  sources: JSON.stringify([
    { citation: 'Kitchen, On the Reliability of the Old Testament', tier: 'primary' },
  ]),
  note: 'Archaeology provides indirect rather than direct evidence.',
};

const passageTopicRow = {
  ...exodusTopicRow,
  book: 'exodus',
  start_enc: 12001,
  end_enc: 12051,
};

const abundantTopicRow = {
  topic: 'Abundant Grace Doctrine',
  slug: 'abundant-grace-doctrine',
  category: 'theology',
  rating: 'minority',
  summary: 'A theological debate about grace.',
  positions: JSON.stringify([]),
  sources: JSON.stringify([]),
  note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSuggestBooks.mockReturnValue([]);
});

// ─── mode="topic" ─────────────────────────────────────────────────────────────

describe('mode="topic"', () => {
  it('returns full record when topic matches', async () => {
    mockQuery.mockResolvedValue([exodusTopicRow]);

    const result = await queryControversies({ mode: 'topic', topic: 'exodus' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('topic');
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].topic).toBe('Date of the Exodus');
    expect(body.topics[0].slug).toBe('date-of-the-exodus');
    expect(body.topics[0].positions).toHaveLength(2);
    expect(body.topics[0].sources).toHaveLength(1);
    expect(body.topics[0].sources[0].tier).toBe('primary');
  });

  it('false-positive guard: "dan" does NOT match "Abundant Grace Doctrine" (no substring trap)', async () => {
    // Topic search for "dan" must not return rows whose keyword is "abundant"
    // Verify the SQL uses exact keyword match (lower(k.value) = lower(?)) not LIKE for keyword branch
    mockQuery.mockResolvedValue([]);

    const result = await queryControversies({ mode: 'topic', topic: 'dan' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics).toEqual([]);

    // Introspect the SQL: keyword branch must use exact equality (lower(k.value) = lower(?))
    // not a LIKE which would let "dan" match "abundant"
    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('json_each');
    expect(sqlArg).toMatch(/lower\(k\.value\)\s*=\s*lower\(\?\)/);
  });

  it('strips LIKE metacharacters from topic input (%_)', async () => {
    mockQuery.mockResolvedValue([]);

    await queryControversies({ mode: 'topic', topic: '100%_exodus' });

    // The LIKE param wraps with % for the LIKE search, but user-supplied % and _ must be stripped.
    // Input '100%_exodus' → stripped core '100exodus' → LIKE param '%100exodus%'
    // Check: the LIKE param should NOT contain '100%' or '%_' as substrings from user input.
    const sqlParam = mockQuery.mock.calls[0][1] as unknown[];
    const likeParam = sqlParam.find(p => typeof p === 'string' && (p as string).includes('exodus')) as string | undefined;
    // The user's % and _ must be stripped — so '100%' sequence from user must not appear in param
    expect(likeParam).toBeDefined();
    expect(likeParam).not.toContain('100%');
    expect(likeParam).not.toContain('%_');
    // The word 'exodus' should still be present (not stripped)
    expect(likeParam).toContain('exodus');
  });

  it('returns MISSING_TOPIC error when topic is omitted in mode=topic', async () => {
    const result = await queryControversies({ mode: 'topic' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_TOPIC');
  });

  it('no-match returns success with topics:[]', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await queryControversies({ mode: 'topic', topic: 'nonexistent debate' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics).toEqual([]);
  });
});

// ─── mode="passage" ───────────────────────────────────────────────────────────

describe('mode="passage"', () => {
  it('returns topics that overlap the given passage range', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus' });
    mockQuery.mockResolvedValue([passageTopicRow]);

    const result = await queryControversies({ mode: 'passage', book: 'Exodus', range: '12:1-51' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('passage');
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].topic).toBe('Date of the Exodus');
  });

  it('returns MISSING_BOOK error when book is omitted', async () => {
    const result = await queryControversies({ mode: 'passage', range: '12:1' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_BOOK');
  });

  it('returns MISSING_RANGE error when range is omitted', async () => {
    const result = await queryControversies({ mode: 'passage', book: 'Exodus' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_RANGE');
  });

  it('returns INVALID_RANGE for malformed range', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus' });

    const result = await queryControversies({ mode: 'passage', book: 'Exodus', range: 'notarange' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('returns BOOK_NOT_FOUND when lookupBook returns null', async () => {
    mockLookupBook.mockReturnValue(null);
    mockSuggestBooks.mockReturnValue(['exodus', 'numbers']);

    const result = await queryControversies({ mode: 'passage', book: 'Exoduus', range: '12:1' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
  });

  it('no-match passage returns success with topics:[]', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus' });
    mockQuery.mockResolvedValue([]);

    const result = await queryControversies({ mode: 'passage', book: 'Exodus', range: '1:1' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics).toEqual([]);
  });

  it('chapter-only range (e.g. "12") parses via parseChapterRange and queries with CHAPTER_ONLY_MAX_VERSE bounds', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus' });
    mockQuery.mockResolvedValue([passageTopicRow]);

    const result = await queryControversies({ mode: 'passage', book: 'Exodus', range: '12' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('passage');
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].topic).toBe('Date of the Exodus');

    // Verify the encoded positions passed to query use chapter-only encoding:
    // encodePosition(12, 1) for start and encodePosition(12, 999) for end
    // encodePosition(ch, v) = ch * 1000 + v → start=12001, end=12999
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('exodus');     // book param
    expect(params).toContain(12999);        // end_enc = encodePosition(12, CHAPTER_ONLY_MAX_VERSE=999)
    expect(params).toContain(12001);        // start_enc = encodePosition(12, 1)
  });
});

// ─── mode="list" ─────────────────────────────────────────────────────────────

describe('mode="list"', () => {
  it('enumerates topics with topic, slug, category, rating', async () => {
    mockQuery.mockResolvedValue([
      { topic: 'Date of the Exodus', slug: 'date-of-the-exodus', category: 'historicity', rating: 'debated' },
      { topic: 'Abundant Grace Doctrine', slug: 'abundant-grace-doctrine', category: 'theology', rating: 'minority' },
    ]);

    const result = await queryControversies({ mode: 'list' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('list');
    expect(body.topics).toHaveLength(2);
    expect(body.topics[0]).toMatchObject({ topic: 'Date of the Exodus', slug: 'date-of-the-exodus', category: 'historicity', rating: 'debated' });
  });

  it('list mode with rating filter passes rating param to SQL', async () => {
    mockQuery.mockResolvedValue([]);

    await queryControversies({ mode: 'list', rating: 'debated' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg.toLowerCase()).toContain('rating');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('debated');
  });

  it('list mode with category filter passes category param to SQL', async () => {
    mockQuery.mockResolvedValue([]);

    await queryControversies({ mode: 'list', category: 'historicity' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg.toLowerCase()).toContain('category');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('historicity');
  });
});

// ─── Robustness ───────────────────────────────────────────────────────────────

describe('robustness', () => {
  it('malformed positions JSON column → topic returned with positions:[]', async () => {
    mockQuery.mockResolvedValue([{ ...exodusTopicRow, positions: 'not-json' }]);

    const result = await queryControversies({ mode: 'topic', topic: 'exodus' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics[0].positions).toEqual([]);
  });

  it('malformed sources JSON column → topic returned with sources:[]', async () => {
    mockQuery.mockResolvedValue([{ ...exodusTopicRow, sources: '{invalid}' }]);

    const result = await queryControversies({ mode: 'topic', topic: 'exodus' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics[0].sources).toEqual([]);
  });

  it('does not add v3 truncation fields to oversized handler results', async () => {
    const bigSummary = 'x'.repeat(3000);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ...exodusTopicRow,
      topic: `Topic ${i}`,
      slug: `topic-${i}`,
      summary: bigSummary,
    }));
    mockQuery.mockResolvedValue(rows);

    const result = await queryControversies({ mode: 'topic', topic: 'topic' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.truncated).toBeUndefined();
    expect(body.truncation_message).toBeUndefined();
    expect(body.topics.length).toBeGreaterThan(0);
  });

  it('response includes neutrality_caveat and controversies-specific attribution mentioning curated scholarship', async () => {
    mockQuery.mockResolvedValue([exodusTopicRow]);

    const result = await queryControversies({ mode: 'topic', topic: 'exodus' });

    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.neutrality_caveat).toBeTruthy();
    expect(body.attribution).toBeTruthy();
    // Attribution must describe the controversies dataset specifically — not Theographic/TIPNR entity data
    expect(body.attribution.toLowerCase()).toContain('curated');
    expect(body.attribution.toLowerCase()).toContain('scholarship');
  });
});

// ─── Real-schema execution (issue #188) ──────────────────────────────────────
// Every test above mocks `query()`, so the SQL string in controversies.ts is
// never executed and a column that does not exist in the schema cannot fail an
// assertion. That is exactly how `p.topic_id` shipped in 0017's feature commit
// and survived to v5.0.0: the table has always declared `controversy_id`.
//
// This block follows the migration-executed fixture pattern established by
// paragraphs.test.ts — it runs the real 0017/0018 migration SQL in sql.js and
// routes query() at it, so the handler's own SQL must prepare against the
// shipped schema. A rename on either side fails here before it can reach D1.

describe('mode="passage" against the real migration schema', () => {
  let db: Database;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    for (const file of ['0017_add_controversies.sql', '0018_seed_controversies.sql']) {
      db.run(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }
  });

  beforeEach(() => {
    mockLookupBook.mockReturnValue({ canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus' });
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params as never);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    });
  });

  it('prepares and executes its join against the shipped controversy_passages schema', async () => {
    const result = await queryControversies({ mode: 'passage', book: 'Exodus', range: '12:1-51' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('passage');
    expect(body.topics.map((t: { slug: string }) => t.slug)).toContain('date-of-the-exodus');
  });

  it('returns an empty topic list for a book with no seeded controversy passages', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'psalms', displayName: 'Psalms', testament: 'ot', morphologyFile: 'psalms' });

    const result = await queryControversies({ mode: 'passage', book: 'Psalms', range: '134:1-3' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.topics).toEqual([]);
  });
});
