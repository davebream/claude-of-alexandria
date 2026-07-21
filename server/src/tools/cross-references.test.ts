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

// ── traceCrossReferencePath — traversal ───────────────────────────────────────

// Helper: build a planted-graph mock for query().
// The graph has three nodes: A (Genesis 3:15), M (Romans 8:28), B (Revelation 12:1)
// Edges: A→M (via from_side query on A), M→B (via from_side query on M)
// This creates a 2-hop path A→M→B.

const EDGE_A_M: Record<string, unknown> = {
  from_book: 'Genesis',
  from_chapter: 3,
  from_verse: 15,
  to_book: 'Romans',
  to_chapter: 8,
  to_verse_start: 28,
  to_verse_end: 28,
  votes: 42,
  review_status: 'ok',
};

const EDGE_M_B: Record<string, unknown> = {
  from_book: 'Romans',
  from_chapter: 8,
  from_verse: 28,
  to_book: 'Revelation',
  to_chapter: 12,
  to_verse_start: 1,
  to_verse_end: 1,
  votes: 35,
  review_status: 'ok',
};

function plantedGraphMock(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  // from-side query: check from_book, from_chapter, from_verse IN
  if (sql.includes('from_book') && sql.includes('from_verse IN')) {
    const fromBook = params[0] as string;
    const fromChapter = params[1] as number;
    // params[2] is minVotes, params[3..] are verse values
    const verses = params.slice(3) as number[];
    if (fromBook === 'Genesis' && fromChapter === 3 && verses.includes(15)) return Promise.resolve([EDGE_A_M]);
    if (fromBook === 'Romans' && fromChapter === 8 && verses.includes(28)) return Promise.resolve([EDGE_M_B]);
    return Promise.resolve([]);
  }
  // to-side query: range scan via to_verse_start <=
  if (sql.includes('to_book') && sql.includes('to_verse_start <=')) {
    return Promise.resolve([]);
  }
  return Promise.resolve([]);
}

describe('traceCrossReferencePath — traversal', () => {
  it('2-hop path A→M→B returns ordered path with correct votes and connecting_ref', async () => {
    mockQuery.mockImplementation((sql, params) => plantedGraphMock(sql as string, params as unknown[]));

    const result = await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '3:15',
      to_book: 'Revelation',
      to_range: '12:1',
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(2);
    expect(body.path).toHaveLength(2);

    // First hop: A→M
    expect(body.path[0].from_ref).toBe('Genesis 3:15');
    expect(body.path[0].to_ref).toBe('Romans 8:28');
    expect(body.path[0].votes).toBe(42);
    // connecting_ref is the shared vertex between hops
    expect(body.path[0].connecting_ref).toBe('Romans 8:28');

    // Second hop: M→B
    expect(body.path[1].from_ref).toBe('Romans 8:28');
    expect(body.path[1].to_ref).toBe('Revelation 12:1');
    expect(body.path[1].votes).toBe(35);
    expect(body.path[1].connecting_ref).toBe('Romans 8:28');
  });

  it('issued SQL contains review_status = ok, votes >=, from_chapter = ? with from_verse IN (and symmetric to_* form)', async () => {
    const capturedSqls: string[] = [];
    mockQuery.mockImplementation((sql, params) => {
      capturedSqls.push(sql as string);
      return plantedGraphMock(sql as string, params as unknown[]);
    });

    await traceCrossReferencePath({
      from_book: 'Genesis',
      from_range: '3:15',
      to_book: 'Revelation',
      to_range: '12:1',
    });

    // At least one from-side query
    const fromSqlArr = capturedSqls.filter(s => s.includes('from_book') && s.includes('from_verse IN'));
    expect(fromSqlArr.length).toBeGreaterThan(0);
    for (const sql of fromSqlArr) {
      expect(sql).toContain("review_status = 'ok'");
      expect(sql).toContain('votes >=');
      expect(sql).toContain('from_chapter =');
      expect(sql).toContain('from_verse IN (');
      // No OR chains and no composite row-value IN
      expect(sql).not.toMatch(/\bOR\b/);
      expect(sql).not.toContain('VALUES (');
    }

    // At least one to-side query (now a range scan: to_verse_start <=)
    const toSqlArr = capturedSqls.filter(s => s.includes('to_book') && s.includes('to_verse_start <='));
    expect(toSqlArr.length).toBeGreaterThan(0);
    for (const sql of toSqlArr) {
      expect(sql).toContain("review_status = 'ok'");
      expect(sql).toContain('votes >=');
      expect(sql).toContain('to_chapter =');
      expect(sql).toContain('to_verse_start <=');
      expect(sql).not.toMatch(/\bOR\b/);
      expect(sql).not.toContain('VALUES (');
    }
  });

  it('backward-orientation: path reachable only via to-side query emits verbatim stored row orientation', async () => {
    // Plant a graph where target (Genesis 1:1) has an edge POINTING TO it (to-side): Romans 5:12 → Genesis 1:1
    // Source is Genesis 3:15. There's also an edge Genesis 3:15 → Romans 5:12 (from-side).
    const EDGE_SRC_MID: Record<string, unknown> = {
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 5, to_verse_start: 12, to_verse_end: 12, votes: 20, review_status: 'ok',
    };
    // Edge: Romans 5:12 → Genesis 1:1 (this is discovered via from-side query on Romans 5:12)
    const EDGE_MID_TGT: Record<string, unknown> = {
      from_book: 'Romans', from_chapter: 5, from_verse: 12,
      to_book: 'Genesis', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 15, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve([EDGE_SRC_MID]);
        if (fb === 'Romans' && fc === 5 && verses.includes(12)) return Promise.resolve([EDGE_MID_TGT]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Genesis', to_range: '1:1',
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(2);
    // Both edges must render with their TRUE stored orientation (not swapped)
    expect(body.path[0].from_ref).toBe('Genesis 3:15');
    expect(body.path[0].to_ref).toBe('Romans 5:12');
    expect(body.path[1].from_ref).toBe('Romans 5:12');
    expect(body.path[1].to_ref).toBe('Genesis 1:1');
  });

  it('range explosion: edge with to_verse_start=15 to_verse_end=16 lets target verse 16 be found', async () => {
    // Edge: Genesis 3:15 → Romans 8:15-16 (range). Target is Romans 8:16.
    const EDGE_RANGE: Record<string, unknown> = {
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 8, to_verse_start: 15, to_verse_end: 16, votes: 10, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve([EDGE_RANGE]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Romans', to_range: '8:16',
      max_hops: 1,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(1);
  });

  it('no degree-cap false-negative: low-vote connecting edge (votes=1) is still returned', async () => {
    // Edge A→M has votes=1 (low). Edge M→B has high votes=100. Path must still be found.
    const EDGE_LOW_VOTES: Record<string, unknown> = {
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 8, to_verse_start: 28, to_verse_end: 28,
      votes: 1, review_status: 'ok',
    };
    const EDGE_HIGH: Record<string, unknown> = {
      from_book: 'Romans', from_chapter: 8, from_verse: 28,
      to_book: 'Revelation', to_chapter: 12, to_verse_start: 1, to_verse_end: 1,
      votes: 100, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve([EDGE_LOW_VOTES]);
        if (fb === 'Romans' && fc === 8 && verses.includes(28)) return Promise.resolve([EDGE_HIGH]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
      min_votes: 1,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(2);
    expect(body.path[0].votes).toBe(1);
  });

  it('no connecting chain within max_hops returns found:false truncated:false isError falsy', async () => {
    // Disconnected graph: Gen 3:15 → Romans 8:28, but Romans 8:28 has no outgoing edges.
    // Target Revelation 12:1 is unreachable. With default max_hops=4, BFS exhausts the graph
    // naturally (frontier becomes empty) without hitting any budget — so truncated:false.
    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve([EDGE_A_M]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
      // default max_hops=4 — BFS exhausts graph after 2 hops with empty frontier
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(false);
    expect(body.complete).toBe(true);
    expect(body.termination_reason).toBe('exhausted');
    // path is empty
    expect(body.path).toHaveLength(0);
  });

  it('max_hops budget: 2-hop path with max_hops=1 returns found:false truncated:true', async () => {
    mockQuery.mockImplementation((sql, params) => plantedGraphMock(sql as string, params as unknown[]));

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
      max_hops: 1,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(false);
    expect(body.complete).toBe(false);
    expect(body.termination_reason).toBe('max_hops');
  });

  it('range-explode cap: to range wider than RANGE_EXPLODE_CAP sets truncated:true and non-start verses are NOT enqueued', async () => {
    // Use override cap=3 so a range of 5 verses exceeds it.
    // Edge: Genesis 3:15 → Romans 8:1-5 (5 verses, exceeds cap of 3)
    // Target: Romans 8:3 — reachable only via interior verse (not start verse 1).
    // With cap exceeded, only start verse 1 is enqueued. Romans 8:3 should NOT be found.
    const EDGE_WIDE_RANGE: Record<string, unknown> = {
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 8, to_verse_start: 1, to_verse_end: 5,
      votes: 5, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve([EDGE_WIDE_RANGE]);
        return Promise.resolve([]);
      }
      // to-side: range scan returns nothing
      return Promise.resolve([]);
    });

    // Override rangeExplodeCap=3 so 5-verse range exceeds it
    const result = await traceCrossReferencePath(
      { from_book: 'Genesis', from_range: '3:15', to_book: 'Romans', to_range: '8:3' },
      { rangeExplodeCap: 3 },
    );

    const body = JSON.parse(result.content[0].text);
    expect(body.complete).toBe(false);
    expect(body.termination_reason).toBe('response_budget');
    // Romans 8:3 is NOT found — only start verse (8:1) was enqueued
    expect(body.found).toBe(false);
  });

  it('node budget exhaustion: truncated:true and found:false when budget crossed before target', async () => {
    // Plant a star: Genesis 3:15 → Romans 8:1 … Romans 8:5 (5 nodes).
    // Use nodeBudget=3 override so budget is exceeded after enqueuing 3 Romans verses.
    // Target Romans 8:99 is never in the star so it's never found.
    const starEdges = Array.from({ length: 5 }, (_, i) => ({
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 8, to_verse_start: i + 1, to_verse_end: i + 1,
      votes: 5, review_status: 'ok',
    }));

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve(starEdges);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // nodeBudget=3: source counts as 1, so after 2 more nodes are enqueued the 3rd triggers truncation
    const result = await traceCrossReferencePath(
      { from_book: 'Genesis', from_range: '3:15', to_book: 'Romans', to_range: '8:99' },
      { nodeBudget: 3 },
    );

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.complete).toBe(false);
    expect(body.termination_reason).toBe('node_budget');
    expect(body.found).toBe(false);
  });

  it('edge budget exhaustion: truncated:true when EDGE_BUDGET is crossed', async () => {
    // Plant many single-verse edges from Genesis 3:15.
    // Use edgeBudget=2 so the 3rd edge triggers truncation.
    const manyEdges = Array.from({ length: 5 }, (_, i) => ({
      from_book: 'Genesis', from_chapter: 3, from_verse: 15,
      to_book: 'Romans', to_chapter: 8, to_verse_start: i + 1, to_verse_end: i + 1,
      votes: 5, review_status: 'ok',
    }));

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Genesis' && fc === 3 && verses.includes(15)) return Promise.resolve(manyEdges);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // edgeBudget=2: 3rd edge triggers truncation
    const result = await traceCrossReferencePath(
      { from_book: 'Genesis', from_range: '3:15', to_book: 'Revelation', to_range: '12:1' },
      { edgeBudget: 2 },
    );

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.complete).toBe(false);
    expect(body.termination_reason).toBe('edge_budget');
  });

  it('character limit guard: truncated:true, path stays adjacency-intact, note field omitted', async () => {
    // Build a 5-hop chain. Use characterLimit=10 (tiny) to guarantee the guard triggers.
    // Chain: Genesis 1:1 → Romans 1:1 → Exodus 1:1 → Psalms 1:1 → John 1:1 → Revelation 1:1
    const chainEdges: Array<Record<string, unknown>> = [
      { from_book: 'Genesis', from_chapter: 1, from_verse: 1, to_book: 'Romans', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 50, review_status: 'ok' },
      { from_book: 'Romans', from_chapter: 1, from_verse: 1, to_book: 'Exodus', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 40, review_status: 'ok' },
      { from_book: 'Exodus', from_chapter: 1, from_verse: 1, to_book: 'Psalms', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 30, review_status: 'ok' },
      { from_book: 'Psalms', from_chapter: 1, from_verse: 1, to_book: 'John', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 20, review_status: 'ok' },
      { from_book: 'John', from_chapter: 1, from_verse: 1, to_book: 'Revelation', to_chapter: 1, to_verse_start: 1, to_verse_end: 1, votes: 10, review_status: 'ok' },
    ];

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        for (const edge of chainEdges) {
          if (fb === edge.from_book && fc === edge.from_chapter && verses.includes(edge.from_verse as number)) {
            return Promise.resolve([edge]);
          }
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    // characterLimit=10 is far smaller than any real output — guaranteed to trigger the guard
    const result = await traceCrossReferencePath(
      { from_book: 'Genesis', from_range: '1:1', to_book: 'Revelation', to_range: '1:1', max_hops: 6 },
      { characterLimit: 10 },
    );

    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.complete).toBe(false);
    expect(body.termination_reason).toBe('response_budget');
    // note field must be omitted (design C4 — dropped to save budget)
    expect('note' in body).toBe(false);
    // path must be adjacency-intact: all hops present, no interior gaps
    expect(body.path.length).toBeGreaterThan(0);
    for (let i = 0; i < body.path.length - 1; i++) {
      expect(body.path[i].connecting_ref).toBeTruthy();
    }
  });

  it('FIX 1 — to-side containment: target reachable only via interior of a to-range is found', async () => {
    // Edge: Genesis 3:15 → Romans 8:14-16 (range, ≤ RANGE_EXPLODE_CAP so all verses enqueued).
    // Target: Romans 8:15 — interior verse, NOT the start (8:14).
    // Old code queried `to_verse_start IN (frontier verses)` — would miss this edge when
    // frontier contains 8:15 (not 8:14). New code uses range scan + containment filter.
    // We verify via the to-side lookup: source (Genesis 3:15) is on the from-side.
    // After hop 1 expands the range, Romans 8:15 should be in the visited set.
    // To test the to-side path specifically: put Genesis 3:15 → Romans 8:14-16 as a
    // to-side edge discovered when frontier={Genesis 3:15}, i.e., the edge points TO
    // the frontier via its to-range. We need an edge where to_book=Genesis, to_chapter=3,
    // and to_verse_start ≤ 15 ≤ to_verse_end.
    // Set up: edge A points to Genesis 3:14-16 (from Psalms 22:1).
    // Edge B: Psalms 22:1 → Revelation 12:1.
    // BFS: frontier={Gen 3:15}. to-side query finds edge A (to_verse_start=14 ≤ 15 ≤ to_verse_end=16).
    // matchedVerse=15. prev=Gen 3:15, connectingVerse=Gen 3:15 (i.e. the same key since 14-16 contains 15).
    // Then Psalms 22:1 added. Hop 2: from-side finds edge B → Revelation 12:1 found.
    const EDGE_TO_GEN: Record<string, unknown> = {
      from_book: 'Psalms', from_chapter: 22, from_verse: 1,
      to_book: 'Genesis', to_chapter: 3, to_verse_start: 14, to_verse_end: 16,
      votes: 5, review_status: 'ok',
    };
    const EDGE_PS_REV: Record<string, unknown> = {
      from_book: 'Psalms', from_chapter: 22, from_verse: 1,
      to_book: 'Revelation', to_chapter: 12, to_verse_start: 1, to_verse_end: 1,
      votes: 5, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        if (fb === 'Psalms' && fc === 22 && verses.includes(1)) return Promise.resolve([EDGE_PS_REV]);
        return Promise.resolve([]);
      }
      // to-side range scan: to_book, to_chapter, to_verse_start <=
      if (s.includes('to_book') && s.includes('to_verse_start <=')) {
        const tb = p[0] as string; const tc = p[1] as number; const maxV = p[3] as number;
        // Return EDGE_TO_GEN when querying to_book=Genesis, to_chapter=3, and 14 ≤ maxVerse
        if (tb === 'Genesis' && tc === 3 && maxV >= 14) return Promise.resolve([EDGE_TO_GEN]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
      max_hops: 3,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    expect(body.hops).toBe(2);
  });

  it('FIX 2 — to-side range match yields connecting_ref at the MATCHED frontier verse, not to_verse_start', async () => {
    // Discriminating scenario: the connecting verse (27) must differ from the edge's
    // to_verse_start (26). The OLD bug hardcoded connectingVerse = to_verse_start → "Romans 8:26";
    // the FIX uses the actual matched frontier verse → "Romans 8:27".
    //
    // Source = Romans 8:27, Target = Revelation 12:1.
    // Hop 0 (to-side from source 8:27): Isaiah 53:1 → Romans 8:26-28 (range CONTAINS 27,
    //   but starts at 26). matchedVerse = 27 (the frontier verse), to_verse_start = 26.
    // Hop 1 (from-side from Isaiah 53:1): Isaiah 53:1 → Revelation 12:1 = target.
    const EDGE_ISA_ROM: Record<string, unknown> = {
      from_book: 'Isaiah', from_chapter: 53, from_verse: 1,
      to_book: 'Romans', to_chapter: 8, to_verse_start: 26, to_verse_end: 28,
      votes: 5, review_status: 'ok',
    };
    const EDGE_ISA_REV: Record<string, unknown> = {
      from_book: 'Isaiah', from_chapter: 53, from_verse: 1,
      to_book: 'Revelation', to_chapter: 12, to_verse_start: 1, to_verse_end: 1,
      votes: 5, review_status: 'ok',
    };

    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      const s = sql as string;
      const p = params as unknown[];
      if (s.includes('from_book') && s.includes('from_verse IN')) {
        const fb = p[0] as string; const fc = p[1] as number; const verses = p.slice(3) as number[];
        // Only Isaiah 53:1 has a from-side edge (to Revelation); Romans has none.
        if (fb === 'Isaiah' && fc === 53 && verses.includes(1)) return Promise.resolve([EDGE_ISA_REV]);
        return Promise.resolve([]);
      }
      if (s.includes('to_book') && s.includes('to_verse_start <=')) {
        const tb = p[0] as string; const tc = p[1] as number; const maxV = p[3] as number;
        // From the source frontier {Romans 8:27}: maxVerse = 27 ≥ to_verse_start 26 → returned.
        if (tb === 'Romans' && tc === 8 && maxV >= 26) return Promise.resolve([EDGE_ISA_ROM]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await traceCrossReferencePath({
      from_book: 'Romans', from_range: '8:27',
      to_book: 'Revelation', to_range: '12:1',
      max_hops: 3,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.found).toBe(true);
    // Hop 0 is the to-side edge Isaiah 53:1 → Romans 8:26-28, traversed backward from the
    // source verse 27. Its junction (connecting_ref) is the MATCHED frontier verse, 27 —
    // NOT to_verse_start (26). This assertion fails against the pre-fix verses[0]/to_verse_start code.
    const romHop = body.path.find((h: { to_ref: string }) => h.to_ref.startsWith('Romans 8:'));
    expect(romHop).toBeDefined();
    expect(romHop.from_ref).toBe('Isaiah 53:1');
    expect(romHop.to_ref).toBe('Romans 8:26-28'); // rendered verbatim from the stored edge (range preserved)
    expect(romHop.connecting_ref).toBe('Romans 8:27');
  });

  it('summary counters reflect traversal (nodes_visited and edges_examined)', async () => {
    mockQuery.mockImplementation((sql, params) => plantedGraphMock(sql as string, params as unknown[]));

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
    });

    const body = JSON.parse(result.content[0].text);
    expect(body.summary.nodes_visited).toBeGreaterThan(0);
    expect(body.summary.edges_examined).toBeGreaterThan(0);
    expect(body.summary.min_votes).toBe(1);
  });

  it('mid-traversal query() rejection returns isError truthy and no partial path', async () => {
    let callCount = 0;
    mockQuery.mockImplementation((sql: unknown, params: unknown) => {
      callCount++;
      if (callCount === 1) {
        // First call succeeds — returns edge from source
        const s = sql as string;
        const p = params as unknown[];
        return plantedGraphMock(s, p);
      }
      // Second call rejects
      return Promise.reject(new Error('D1 query failed'));
    });

    const result = await traceCrossReferencePath({
      from_book: 'Genesis', from_range: '3:15',
      to_book: 'Revelation', to_range: '12:1',
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    // No partial path — isError means abort
    expect(body.path).toBeUndefined();
  });
});
