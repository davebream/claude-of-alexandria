import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { queryParagraphBreaks } from './paragraphs.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

// ─── Migration-executed fixture (design C7 / plan Task 4) ─────────────────
// This fixture is deliberately NOT a hand-written inline CREATE TABLE (the
// pattern used by discourse.test.ts / lemmas.test.ts). Instead it executes
// the real 0001/0022/0023 migration SQL files in sql.js, so a malformed
// migration fails `npm test` before it can reach the unrepairable
// `wrangler d1 migrations apply` step at deploy time. This is a net-new
// pattern for this repo (design C7) and is load-bearing: the inline-schema
// seam would NOT catch a broken migration.
//
// The fixture applies only 0001, 0022, and 0023 — not the full migration
// sequence. This is sound because paragraph_markers and graphic_signs are
// self-contained tables touched by no other migration, but it is not a
// full-sequence apply.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
  db = new SQL.Database();
  for (const file of [
    '0001_initial_schema.sql',
    '0022_expand_paragraph_markers.sql',
    '0023_repair_paragraph_markers_data.sql',
  ]) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    db.run(sql);
  }

  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  });
});

function rawCount(table: string): number {
  const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${table}`);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.c as number;
}

function rawCountWhere(table: string, whereSql: string, params: unknown[]): number {
  const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${whereSql}`);
  stmt.bind(params);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.c as number;
}

// The handler's hardcoded evidence_scope block is compared against an actual
// corpus JSON's evidence_scope, read directly here — sourcing the expected
// value from a hand-retyped literal would guard nothing against drift.
const GENESIS_JSON_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'plugins',
  'claude-of-alexandria',
  'skills',
  'biblical-segmentation',
  'reference',
  'masoretic',
  'genesis.json'
);
const genesisCorpus = JSON.parse(readFileSync(GENESIS_JSON_PATH, 'utf-8'));

describe('query_paragraph_breaks — raw corpus counts (AC-1 non-vacuous)', () => {
  it('fixture holds the corrected corpus: 3162 markers, Genesis 92, Ruth 1, 20 graphic_signs', () => {
    expect(rawCount('paragraph_markers')).toBe(3162);
    expect(rawCountWhere('paragraph_markers', 'book = ?', ['genesis'])).toBe(92);
    expect(rawCountWhere('paragraph_markers', 'book = ?', ['ruth'])).toBe(1);
    expect(rawCount('graphic_signs')).toBe(20);
  });

  it('the corpus-count guard fails under mutation (AC-1 anchor is non-vacuous)', () => {
    try {
      db.run(`DELETE FROM paragraph_markers WHERE book = 'genesis'`);
      expect(rawCount('paragraph_markers')).not.toBe(3162);
      expect(rawCountWhere('paragraph_markers', 'book = ?', ['genesis'])).not.toBe(92);
    } finally {
      // Re-apply 0023 (its own DELETE-then-INSERT restores both tables to the corrected corpus).
      db.run(readFileSync(path.join(MIGRATIONS_DIR, '0023_repair_paragraph_markers_data.sql'), 'utf-8'));
    }
  });
});

describe('query_paragraph_breaks — Genesis chapter 1 (AC-2)', () => {
  it('returns exactly verses 5,8,13,19,23,31, all petuchah, all verse_end', async () => {
    const result = await queryParagraphBreaks({ book: 'Genesis', chapter_range: '1' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.markers.map((m: any) => m.verse)).toEqual([5, 8, 13, 19, 23, 31]);
    for (const m of body.markers) {
      expect(m.type).toBe('petuchah');
      expect(m.position).toBe('verse_end');
    }
  });

  it('fails under mutation of a marker verse', async () => {
    try {
      db.run(`UPDATE paragraph_markers SET verse = 6 WHERE book = 'genesis' AND chapter = 1 AND verse = 5`);
      const result = await queryParagraphBreaks({ book: 'Genesis', chapter_range: '1' } as any);
      const body = JSON.parse(result.content[0].text as string);
      expect(body.markers.map((m: any) => m.verse)).not.toEqual([5, 8, 13, 19, 23, 31]);
    } finally {
      db.run(`UPDATE paragraph_markers SET verse = 5 WHERE book = 'genesis' AND chapter = 1 AND verse = 6`);
    }
  });
});

describe('query_paragraph_breaks — Ruth (AC-2)', () => {
  it('returns exactly one marker at 4:17', async () => {
    const result = await queryParagraphBreaks({ book: 'Ruth' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.markers).toHaveLength(1);
    expect(body.markers[0].chapter).toBe(4);
    expect(body.markers[0].verse).toBe(17);
  });

  it('fails under mutation dropping the Ruth marker', async () => {
    try {
      db.run(`UPDATE paragraph_markers SET book = 'ruth_mutated' WHERE book = 'ruth'`);
      const result = await queryParagraphBreaks({ book: 'Ruth' } as any);
      const body = JSON.parse(result.content[0].text as string);
      expect(body.markers).toHaveLength(0);
    } finally {
      db.run(`UPDATE paragraph_markers SET book = 'ruth' WHERE book = 'ruth_mutated'`);
    }
  });
});

describe('query_paragraph_breaks — 2 Samuel 16:13 (AC-1 distinctness)', () => {
  it('returns two distinct markers with ordinals 1 and 2, only the petuchah carries verse_end', async () => {
    const result = await queryParagraphBreaks({ book: '2 Samuel', chapter_range: '16' } as any);
    const body = JSON.parse(result.content[0].text as string);
    const at13 = body.markers.filter((m: any) => m.verse === 13);
    expect(at13).toHaveLength(2);
    const byOrdinal = [...at13].sort((a, b) => a.ordinal_in_verse - b.ordinal_in_verse);
    expect(byOrdinal[0].ordinal_in_verse).toBe(1);
    expect(byOrdinal[0].type).toBe('setumah');
    expect(byOrdinal[0].position).toBe('within_verse');
    expect(byOrdinal[1].ordinal_in_verse).toBe(2);
    expect(byOrdinal[1].type).toBe('petuchah');
    expect(byOrdinal[1].position).toBe('verse_end');
  });

  it('fails under mutation flipping the setumah position to verse_end', async () => {
    try {
      db.run(
        `UPDATE paragraph_markers SET position = 'verse_end' WHERE book = '2_samuel' AND chapter = 16 AND verse = 13 AND ordinal_in_verse = 1`
      );
      const result = await queryParagraphBreaks({ book: '2 Samuel', chapter_range: '16' } as any);
      const body = JSON.parse(result.content[0].text as string);
      const at13 = body.markers.filter((m: any) => m.verse === 13);
      const positions = at13.map((m: any) => m.position).sort();
      expect(positions).not.toEqual(['verse_end', 'within_verse'].sort());
    } finally {
      db.run(
        `UPDATE paragraph_markers SET position = 'within_verse' WHERE book = '2_samuel' AND chapter = 16 AND verse = 13 AND ordinal_in_verse = 1`
      );
    }
  });
});

describe('query_paragraph_breaks — Psalms (zero markers, non-zero graphic_signs)', () => {
  it('returns markers: [] but a non-empty graphic_signs array and evidence_scope', async () => {
    const result = await queryParagraphBreaks({ book: 'Psalms' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.markers).toEqual([]);
    expect(body.graphic_signs.length).toBeGreaterThan(0);
    expect(body.evidence_scope).toBeDefined();
  });

  it('fails under mutation removing the Psalms graphic_signs', async () => {
    try {
      db.run(`UPDATE graphic_signs SET book = 'psalms_mutated' WHERE book = 'psalms'`);
      const result = await queryParagraphBreaks({ book: 'Psalms' } as any);
      const body = JSON.parse(result.content[0].text as string);
      expect(body.graphic_signs.length).toBe(0);
    } finally {
      db.run(`UPDATE graphic_signs SET book = 'psalms' WHERE book = 'psalms_mutated'`);
    }
  });
});

describe('query_paragraph_breaks — Obadiah (true empty book)', () => {
  it('returns markers: [], graphic_signs: [], summary.total: 0, and evidence_scope present', async () => {
    const result = await queryParagraphBreaks({ book: 'Obadiah' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.markers).toEqual([]);
    expect(body.graphic_signs).toEqual([]);
    expect(body.summary.total).toBe(0);
    expect(body.evidence_scope).toBeDefined();
  });
});

describe('query_paragraph_breaks — evidence_scope drift guard', () => {
  it('the handler hardcoded evidence_scope deep-equals the corpus JSON block', async () => {
    const result = await queryParagraphBreaks({ book: 'Genesis' } as any);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.evidence_scope).toEqual(genesisCorpus.evidence_scope);
  });
});

describe('query_paragraph_breaks — versification namespace guard', () => {
  it('carries Hebrew/Masoretic-versified anchors (Joel 4:17 exists) with sane chapter/verse bounds', async () => {
    const result = await queryParagraphBreaks({ book: 'Joel' } as any);
    const body = JSON.parse(result.content[0].text as string);
    const hasJoel4 = body.markers.some((m: any) => m.chapter === 4);
    expect(hasJoel4).toBe(true);
    for (const m of body.markers) {
      expect(m.chapter).toBeGreaterThanOrEqual(1);
      expect(m.verse).toBeGreaterThanOrEqual(1);
    }
  });

  it('fails under mutation collapsing the Hebrew Joel chapter 4 anchors', async () => {
    try {
      db.run(`DELETE FROM paragraph_markers WHERE book = 'joel' AND chapter = 4`);
      const result = await queryParagraphBreaks({ book: 'Joel' } as any);
      const body = JSON.parse(result.content[0].text as string);
      expect(body.markers.some((m: any) => m.chapter === 4)).toBe(false);
    } finally {
      db.run(readFileSync(path.join(MIGRATIONS_DIR, '0023_repair_paragraph_markers_data.sql'), 'utf-8'));
    }
  });
});

describe('query_paragraph_breaks — error paths unchanged', () => {
  it('returns BOOK_NOT_FOUND for an unknown book', async () => {
    const result = await queryParagraphBreaks({ book: 'Nowhere' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
  });

  it('returns TESTAMENT_MISMATCH for an NT book', async () => {
    const result = await queryParagraphBreaks({ book: 'John' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('TESTAMENT_MISMATCH');
  });

  it('returns INVALID_RANGE for a malformed chapter_range', async () => {
    const result = await queryParagraphBreaks({ book: 'Genesis', chapter_range: 'abc' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('INVALID_RANGE');
  });
});
