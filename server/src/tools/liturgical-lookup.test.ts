import { describe, it, expect, vi, beforeEach } from 'vitest';
import { liturgicalLookup } from './liturgical-lookup.js';

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

// A reusable row that matches the liturgical_readings schema
const adventRow = {
  season: 'Advent',
  season_slug: 'advent',
  season_order: 1,
  tradition: 'western',
  book: 'isaiah',
  start_enc: 9002,
  end_enc: 9007,
  reference_display: 'Isaiah 9:2-7',
  themes: '["hope","expectation"]',
  note: null,
  source: 'Revised Common Lectionary',
};

const christmasRow = {
  season: 'Christmas',
  season_slug: 'christmas',
  season_order: 2,
  tradition: 'western',
  book: 'luke',
  start_enc: 2001,
  end_enc: 2020,
  reference_display: 'Luke 2:1-20',
  themes: '["incarnation"]',
  note: 'The nativity narrative',
  source: 'Revised Common Lectionary',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSuggestBooks.mockReturnValue([]);
});

// ─── mode="list" ──────────────────────────────────────────────────────────────

describe('mode="list"', () => {
  it('returns distinct seasons with empty readings arrays', async () => {
    mockQuery.mockResolvedValue([
      { season: 'Advent', season_slug: 'advent', season_order: 1, tradition: 'western' },
      { season: 'Christmas', season_slug: 'christmas', season_order: 2, tradition: 'western' },
    ]);

    const result = await liturgicalLookup({ mode: 'list' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('list');
    expect(body.total_seasons).toBe(2);
    expect(body.seasons[0].readings).toEqual([]);
    expect(body.seasons[1].readings).toEqual([]);
  });

  it('passes tradition filter to SQL when provided', async () => {
    mockQuery.mockResolvedValue([]);

    await liturgicalLookup({ mode: 'list', tradition: 'reformed' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('tradition');
    const paramsArg = mockQuery.mock.calls[0][1] as unknown[];
    expect(paramsArg).toContain('reformed');
  });

  it('sets structuredContent on success', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await liturgicalLookup({ mode: 'list' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});

// ─── mode="season" ────────────────────────────────────────────────────────────

describe('mode="season"', () => {
  it('returns MISSING_SEASON error when season is omitted', async () => {
    const result = await liturgicalLookup({ mode: 'season' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_SEASON');
  });

  it('derives slug from display name and queries season_slug', async () => {
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'season', season: 'Advent' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('season_slug');
    const paramsArg = mockQuery.mock.calls[0][1] as unknown[];
    // 'Advent' → 'advent' via slugifySeason
    expect(paramsArg[0]).toBe('advent');
  });

  it('applies slugifySeason to multi-word display name', async () => {
    mockQuery.mockResolvedValue([]);

    await liturgicalLookup({ mode: 'season', season: 'Christ the King' });

    const paramsArg = mockQuery.mock.calls[0][1] as unknown[];
    expect(paramsArg[0]).toBe('christ-the-king');
  });

  it('groups rows into season objects with readings and parses themes JSON', async () => {
    mockQuery.mockResolvedValue([adventRow]);

    const result = await liturgicalLookup({ mode: 'season', season: 'Advent' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('season');
    expect(body.total_seasons).toBe(1);
    expect(body.seasons[0].season).toBe('Advent');
    expect(body.seasons[0].readings).toHaveLength(1);
    expect(body.seasons[0].readings[0].reference_display).toBe('Isaiah 9:2-7');
    expect(body.seasons[0].readings[0].themes).toEqual(['hope', 'expectation']);
    expect(body.seasons[0].themes).toEqual(['hope', 'expectation']);
    expect(body.seasons[0].readings[0].start).toEqual({ chapter: 9, verse: 2 });
    expect(body.seasons[0].readings[0].end).toEqual({ chapter: 9, verse: 7 });
  });

  it('returns zero seasons (not an error) for unknown season slug', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await liturgicalLookup({ mode: 'season', season: 'Unknown Season' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.total_seasons).toBe(0);
    expect(body.seasons).toEqual([]);
  });

  it('threads tradition filter into SQL lowercased', async () => {
    mockQuery.mockResolvedValue([]);

    await liturgicalLookup({ mode: 'season', season: 'Advent', tradition: 'Reformed' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('tradition');
    const paramsArg = mockQuery.mock.calls[0][1] as unknown[];
    // tradition must be lowercased
    expect(paramsArg).toContain('reformed');
  });

  it('sets both content[].text and structuredContent on success', async () => {
    mockQuery.mockResolvedValue([adventRow]);

    const result = await liturgicalLookup({ mode: 'season', season: 'Advent' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toHaveProperty('text');
    expect(result.structuredContent).toBeDefined();
    const fromText = JSON.parse((result.content[0] as { text: string }).text);
    expect(fromText.total_seasons).toBe(1);
  });
});

// ─── mode="passage" ───────────────────────────────────────────────────────────

describe('mode="passage"', () => {
  it('returns MISSING_BOOK error when book is omitted', async () => {
    const result = await liturgicalLookup({ mode: 'passage', range: '9:6' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_BOOK');
  });

  it('returns MISSING_RANGE error when range is omitted', async () => {
    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_RANGE');
  });

  it('returns BOOK_NOT_FOUND with suggestions when lookupBook returns null', async () => {
    mockLookupBook.mockReturnValue(null);
    mockSuggestBooks.mockReturnValue(['isaiah', 'ezekiel']);

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiaah', range: '9:6' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
    expect(body.error.suggestions).toEqual(['isaiah', 'ezekiel']);
  });

  it('returns INVALID_RANGE for malformed verse range', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: 'notarange' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('returns INVALID_RANGE for malformed chapter-only input (no colon, non-numeric)', async () => {
    // routes through parseChapterRange's error path (no colon in range)
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: 'abc' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  // --- Overlap correctness: single verse 9:6 ---
  it('single verse 9:6 — builds correct overlap bounds', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:6' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    // single verse 9:6 → queryStart = queryEnd = 9006
    // bind order: [canonical, queryEnd, queryStart] (WHERE book=? AND start_enc<=? AND end_enc>=?)
    expect(params[0]).toBe('isaiah');
    expect(params[1]).toBe(9006); // queryEnd — start_enc <= queryEnd
    expect(params[2]).toBe(9006); // queryStart — end_enc >= queryStart
  });

  // --- Overlap correctness: same-chapter range 9:2-7 ---
  it('same-chapter range 9:2-7 — passes start_enc<=9007 and end_enc>=9002', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:2-7' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    // bind order: [canonical, queryEnd, queryStart] (WHERE book=? AND start_enc<=? AND end_enc>=?)
    expect(params[0]).toBe('isaiah');
    expect(params[1]).toBe(9007); // queryEnd — start_enc <= 9007
    expect(params[2]).toBe(9002); // queryStart — end_enc >= 9002
  });

  // --- Overlap correctness: cross-chapter 9:2-11:9 ---
  it('cross-chapter range 9:2-11:9 — correct multi-chapter bounds', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:2-11:9' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('isaiah');
    // queryStart = 9002, queryEnd = 11009
    expect(params).toContain(9002);
    expect(params).toContain(11009);
  });

  // --- Overlap correctness: chapter-only range "9" ---
  it('chapter-only range "9" — uses parseChapterRange and encodes to [9001, 9999]', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('isaiah');
    // chapter-only "9" → queryStart=9001, queryEnd=9999
    expect(params).toContain(9001);
    expect(params).toContain(9999);
  });

  // --- Adjacent non-overlap returns zero seasons ---
  it('adjacent-non-overlapping query returns zero seasons (not error)', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    // DB returns empty → no overlap
    mockQuery.mockResolvedValue([]);

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '1:1' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.total_seasons).toBe(0);
    expect(body.seasons).toEqual([]);
  });

  // --- SQL uses start_enc / end_enc overlap predicate ---
  it('overlap SQL uses start_enc and end_enc columns', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:6' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('start_enc');
    expect(sqlArg).toContain('end_enc');
  });

  // --- Many-to-many: one passage → two seasons ---
  it('many-to-many: rows from two seasons grouped into separate season objects', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    const row2 = {
      ...adventRow,
      season: 'Holy Week',
      season_slug: 'holy-week',
      season_order: 5,
      reference_display: 'Isaiah 53:1-6',
      themes: '["suffering"]',
    };
    mockQuery.mockResolvedValue([adventRow, row2]);

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:2-11:9' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.total_seasons).toBe(2);
    const seasonNames = body.seasons.map((s: { season: string }) => s.season);
    expect(seasonNames).toContain('Advent');
    expect(seasonNames).toContain('Holy Week');
  });

  // --- Tradition filter in passage mode ---
  it('tradition filter threads into passage SQL lowercased', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([]);

    await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:6', tradition: 'Western' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('tradition');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('western');
  });

  // --- Success response sets both content[].text and structuredContent ---
  it('sets both content[].text and structuredContent on success', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah' });
    mockQuery.mockResolvedValue([adventRow]);

    const result = await liturgicalLookup({ mode: 'passage', book: 'Isaiah', range: '9:2-7' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.seasons).toHaveLength(1);
  });
});

// ─── Robustness ───────────────────────────────────────────────────────────────

describe('robustness', () => {
  it('malformed stored themes JSON → reading returned with themes:[], call succeeds', async () => {
    const rowWithBadThemes = { ...adventRow, themes: 'not json' };
    mockQuery.mockResolvedValue([rowWithBadThemes]);

    const result = await liturgicalLookup({ mode: 'season', season: 'Advent' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.seasons[0].readings[0].themes).toEqual([]);
  });

  it('rejected query promise propagates as thrown error (not masked as zero-result)', async () => {
    mockQuery.mockRejectedValue(new Error('D1 connection failure'));

    await expect(
      liturgicalLookup({ mode: 'season', season: 'Advent' })
    ).rejects.toThrow('D1 connection failure');
  });

  it('note field is included in reading output', async () => {
    const rowWithNote = { ...adventRow, note: 'A curated note for Advent' };
    mockQuery.mockResolvedValue([rowWithNote]);

    const result = await liturgicalLookup({ mode: 'season', season: 'Advent' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.seasons[0].readings[0].note).toBe('A curated note for Advent');
  });
});
