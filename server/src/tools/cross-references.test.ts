import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryCrossReferences, traceCrossReferencePath } from './cross-references.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── traceCrossReferencePath — resolution ─────────────────────────────────────

describe('traceCrossReferencePath — resolution', () => {
  it('book not found returns isError with suggestions', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Nonexistentbook',
      from_range: '1:1',
      to_book: 'Genesis',
      to_range: '1:1',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
    expect(Array.isArray(body.error.suggestions)).toBe(true);
  });

  it('to_book not found returns isError with suggestions', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '1:1',
      to_book: 'Nonexistentbook',
      to_range: '1:1',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
  });

  it('invalid from_range returns isError INVALID_RANGE', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: 'notarange',
      to_book: 'Romans',
      to_range: '8:28',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('multi-verse from_range returns isError INVALID_RANGE (single verse required)', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '3:15-16',
      to_book: 'Romans',
      to_range: '8:28',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('multi-verse to_range returns isError INVALID_RANGE (single verse required)', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '3:15',
      to_book: 'Romans',
      to_range: '8:28-30',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('same source and target verse returns found:true hops:0 path:[] not an error', async () => {
    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '3:15',
      to_book: 'Genesis',
      to_range: '3:15',
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(0);
    expect(body.path).toEqual([]);
  });
});

// ── review_status filter ──────────────────────────────────────────────────────

describe('queryCrossReferences — review_status filter', () => {
  it('direction=from issues SQL containing review_status = \'ok\'', async () => {
    mockQuery.mockResolvedValue([]);

    await queryCrossReferences({ book: 'Romans', direction: 'from' });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("review_status = 'ok'");
  });

  it('direction=to issues SQL containing review_status = \'ok\'', async () => {
    mockQuery.mockResolvedValue([]);

    await queryCrossReferences({ book: 'Romans', direction: 'to' });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("review_status = 'ok'");
  });

  it('direction=both — both issued SQL strings contain review_status = \'ok\'', async () => {
    mockQuery.mockResolvedValue([]);

    await queryCrossReferences({ book: 'Romans', direction: 'both' });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const sql1 = mockQuery.mock.calls[0][0] as string;
    const sql2 = mockQuery.mock.calls[1][0] as string;
    expect(sql1).toContain("review_status = 'ok'");
    expect(sql2).toContain("review_status = 'ok'");
  });
});

// ── Output shape (backward compat) ───────────────────────────────────────────

describe('queryCrossReferences — output shape unchanged', () => {
  it('given one ok row, cross_references[0] has from_ref/to_ref/votes/direction and summary.total === 1', async () => {
    const okRow = {
      from_book: 'Romans',
      from_chapter: 8,
      from_verse: 28,
      to_book: 'Genesis',
      to_chapter: 50,
      to_verse_start: 20,
      to_verse_end: 20,
      votes: 42,
      review_status: 'ok',
    };

    mockQuery.mockResolvedValue([okRow]);

    const result = await queryCrossReferences({ book: 'Romans', direction: 'from' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);

    expect(body.cross_references).toHaveLength(1);
    const ref = body.cross_references[0];
    expect(ref).toHaveProperty('from_ref');
    expect(ref).toHaveProperty('to_ref');
    expect(ref).toHaveProperty('votes');
    expect(ref).toHaveProperty('direction');
    expect(ref.votes).toBe(42);
    expect(ref.direction).toBe('from');
    expect(body.summary.total).toBe(1);
  });
});
