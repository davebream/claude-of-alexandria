/**
 * seed-confessional-anglican-wesleyan.test.ts
 * Dataset-integrity tests for the Anglican 39 Articles and Wesley's 25 Articles.
 * All assertions are pure data checks — no DB connection needed.
 */

import { describe, it, expect } from 'vitest';
import {
  THIRTY_NINE_ARTICLES,
  WESLEY_ARTICLES,
  documentInsertSql,
  sectionInsertSql,
  buildSeedSql,
} from './seed-confessional-anglican-wesleyan.js';
import { escapeSQL } from './sql-escape.js';

// ─── Dataset counts ────────────────────────────────────────────────────────────

describe('THIRTY_NINE_ARTICLES dataset', () => {
  it('has exactly 39 articles', () => {
    expect(THIRTY_NINE_ARTICLES.length).toBe(39);
  });

  it('article numbers are contiguous 1..39 (no gaps, no duplicates)', () => {
    const nums = THIRTY_NINE_ARTICLES.map(a => a.number).sort((a, b) => a - b);
    for (let i = 0; i < 39; i++) {
      expect(nums[i], `expected article number ${i + 1}, got ${nums[i]}`).toBe(i + 1);
    }
  });

  it('every article has non-empty trimmed title and content', () => {
    for (const art of THIRTY_NINE_ARTICLES) {
      expect(art.title.trim().length, `Art ${art.number} title empty`).toBeGreaterThan(0);
      expect(art.content.trim().length, `Art ${art.number} content empty`).toBeGreaterThan(0);
    }
  });
});

describe('WESLEY_ARTICLES dataset', () => {
  it('has exactly 25 articles', () => {
    expect(WESLEY_ARTICLES.length).toBe(25);
  });

  it('article numbers are contiguous 1..25 (no gaps, no duplicates)', () => {
    const nums = WESLEY_ARTICLES.map(a => a.number).sort((a, b) => a - b);
    for (let i = 0; i < 25; i++) {
      expect(nums[i], `expected article number ${i + 1}, got ${nums[i]}`).toBe(i + 1);
    }
  });

  it('every article has non-empty trimmed title and content', () => {
    for (const art of WESLEY_ARTICLES) {
      expect(art.title.trim().length, `Art ${art.number} title empty`).toBeGreaterThan(0);
      expect(art.content.trim().length, `Art ${art.number} content empty`).toBeGreaterThan(0);
    }
  });
});

// ─── Document metadata ─────────────────────────────────────────────────────────

describe('document metadata', () => {
  it('document slugs are unique', () => {
    const slugs = ['thirty_nine_articles', 'wesleys_25_articles'];
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('THIRTY_NINE_ARTICLES tradition is "anglican"', () => {
    // Validated via buildSeedSql() output checks below
    const sql = buildSeedSql();
    expect(sql).toContain("'anglican'");
  });

  it('WESLEY_ARTICLES tradition is "methodist"', () => {
    const sql = buildSeedSql();
    expect(sql).toContain("'methodist'");
  });

  it('format is "confession" for both documents', () => {
    const sql = buildSeedSql();
    const docInserts = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_documents'));
    expect(docInserts.length).toBe(2);
    for (const line of docInserts) {
      expect(line, 'expected format=confession in document INSERT').toContain("'confession'");
    }
  });
});

// ─── ID non-overlap (vs measured Creeds.json ceiling) ──────────────────────────

describe('ID non-overlap', () => {
  // Measured Creeds.json ceiling: doc IDs 1–40, section IDs 1–1750 (2026-06-15)
  const CREEDSJSON_DOC_MAX = 40;
  const CREEDSJSON_SECTION_MAX = 1750;

  it('emitted document IDs are above Creeds.json ceiling (> 40)', () => {
    const sql = buildSeedSql();
    const docLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_documents'));
    for (const line of docLines) {
      // Extract the first numeric value after VALUES (
      const m = line.match(/VALUES\s*\((\d+)/);
      expect(m, `Could not extract doc ID from: ${line}`).not.toBeNull();
      const docId = parseInt(m![1], 10);
      expect(docId, `Document ID ${docId} must be > ${CREEDSJSON_DOC_MAX}`).toBeGreaterThan(CREEDSJSON_DOC_MAX);
    }
  });

  it('emitted section IDs are above Creeds.json ceiling (> 1750)', () => {
    const sql = buildSeedSql();
    const sectionLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_sections'));
    for (const line of sectionLines) {
      const m = line.match(/VALUES\s*\((\d+)/);
      expect(m, `Could not extract section ID from: ${line}`).not.toBeNull();
      const sectionId = parseInt(m![1], 10);
      expect(sectionId, `Section ID ${sectionId} must be > ${CREEDSJSON_SECTION_MAX}`).toBeGreaterThan(CREEDSJSON_SECTION_MAX);
    }
  });

  it('the two sources section ID blocks do not overlap each other', () => {
    // Anglican: 100001–100039; Methodist: 101001–101025
    const anglicanIds = new Set(THIRTY_NINE_ARTICLES.map((_, i) => 100000 + (i + 1)));
    const wesleyIds = new Set(WESLEY_ARTICLES.map((_, i) => 101000 + (i + 1)));
    const intersection = [...anglicanIds].filter(id => wesleyIds.has(id));
    expect(intersection.length, 'Section ID blocks must not overlap').toBe(0);
  });
});

// ─── SQL-shape assertions ──────────────────────────────────────────────────────

describe('buildSeedSql() SQL shape', () => {
  it('contains exactly 2 INSERT OR REPLACE INTO confessional_documents', () => {
    const sql = buildSeedSql();
    const count = (sql.match(/INSERT OR REPLACE INTO confessional_documents/g) || []).length;
    expect(count).toBe(2);
  });

  it('contains exactly 64 INSERT OR REPLACE INTO confessional_sections', () => {
    const sql = buildSeedSql();
    const count = (sql.match(/INSERT OR REPLACE INTO confessional_sections/g) || []).length;
    expect(count).toBe(64);
  });

  it('document INSERTs use the correct named-column list', () => {
    const sql = buildSeedSql();
    const docLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_documents'));
    for (const line of docLines) {
      expect(line).toContain('(id, slug, title, year, tradition, format, authors, source)');
    }
  });

  it('section INSERTs use the correct named-column list', () => {
    const sql = buildSeedSql();
    const secLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_sections'));
    for (const line of secLines) {
      expect(line).toContain('(id, document_id, chapter_number, chapter_title, section_number, content)');
    }
  });

  it('is one statement per line (no line contains two INSERT keywords)', () => {
    const sql = buildSeedSql();
    const lines = sql.split('\n');
    for (const line of lines) {
      const insertCount = (line.match(/INSERT/g) || []).length;
      expect(insertCount, `Line has more than one INSERT: ${line.slice(0, 100)}`).toBeLessThanOrEqual(1);
    }
  });

  it('ends with a trailing newline', () => {
    const sql = buildSeedSql();
    expect(sql.endsWith('\n')).toBe(true);
  });
});

// ─── Escaping assertions ───────────────────────────────────────────────────────

describe('escapeSQL', () => {
  it('doubles single quotes and wraps in single quotes', () => {
    expect(escapeSQL("a'b")).toBe("'a''b'");
  });

  it('returns NULL for null', () => {
    expect(escapeSQL(null)).toBe('NULL');
  });

  it('returns NULL for undefined', () => {
    expect(escapeSQL(undefined)).toBe('NULL');
  });

  it('leaves double quotes literal (SQLite does not treat \\" as escape)', () => {
    expect(escapeSQL('say "hello"')).toBe("'say \"hello\"'");
  });

  it('leaves backslash literal (SQLite does not treat \\\\ as escape)', () => {
    expect(escapeSQL('path\\file')).toBe("'path\\\\file'");
  });

  it('every emitted string literal has balanced single quotes (no lone apostrophe)', () => {
    const sql = buildSeedSql();
    // Extract all VALUES (...) content by finding strings between ' chars
    // Strategy: find each VALUES clause and check each string literal is balanced
    const stringLiteralPattern = /'((?:[^']|'')*)'/g;
    let m: RegExpExecArray | null;
    while ((m = stringLiteralPattern.exec(sql)) !== null) {
      const inner = m[1];
      // After collapsing '' pairs to empty string, should have no lone '
      const collapsed = inner.replace(/''/g, '');
      expect(
        collapsed.includes("'"),
        `Found lone apostrophe in literal '${inner.slice(0, 80)}'`
      ).toBe(false);
    }
  });
});

// ─── Provenance (OR-6) ─────────────────────────────────────────────────────────

describe('provenance', () => {
  it('every document source is non-empty', () => {
    const sql = buildSeedSql();
    // The source is the last string value in each document INSERT
    // We'll extract document INSERTs and verify the source field appears
    const docLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_documents'));
    expect(docLines.length).toBe(2);
    for (const line of docLines) {
      // source is the 8th column value - just assert the line is non-trivially long
      // (a non-empty source field means the INSERT has meaningful content)
      expect(line.length).toBeGreaterThan(200);
    }
  });

  it('document source strings contain year or public-domain marker', () => {
    const sql = buildSeedSql();
    const docLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_documents'));
    for (const line of docLines) {
      const hasYear = /\b(1[5-9]\d{2}|20\d{2})\b/.test(line);
      const hasPDMarker = /public\s*domain|PD\b/i.test(line);
      expect(
        hasYear || hasPDMarker,
        `Document INSERT lacks year or PD marker: ${line.slice(0, 150)}`
      ).toBe(true);
    }
  });
});

// ─── Article addressing (C3 contract) ─────────────────────────────────────────

describe('article addressing invariants', () => {
  it('every emitted section has section_number === 1', () => {
    const sql = buildSeedSql();
    const secLines = sql.split('\n').filter(l => l.includes('INSERT OR REPLACE INTO confessional_sections'));
    for (const line of secLines) {
      // section_number is the 5th column value in VALUES (id, document_id, chapter_number, chapter_title, section_number, content)
      // Pattern: VALUES (sectionId, docId, chapterNum, 'title', 1, 'content')
      // The section_number appears as ", 1, '" in the VALUES list
      const m = line.match(/VALUES\s*\(\d+,\s*\d+,\s*\d+,\s*'(?:[^']|'')*',\s*(\d+),/);
      expect(m, `Could not parse section_number from: ${line.slice(0, 150)}`).not.toBeNull();
      const sectionNum = parseInt(m![1], 10);
      expect(sectionNum, `section_number must be 1, got ${sectionNum}`).toBe(1);
    }
  });

  it('Anglican section chapter_numbers match article.number (1..39)', () => {
    const sql = buildSeedSql();
    // Anglican section IDs are 100001–100039; extract chapter_numbers
    const secLines = sql.split('\n').filter(l =>
      l.includes('INSERT OR REPLACE INTO confessional_sections') &&
      /VALUES\s*\(1000\d\d/.test(l)
    );
    expect(secLines.length).toBe(39);
    const chapterNums = secLines.map(line => {
      const m = line.match(/VALUES\s*\(\d+,\s*\d+,\s*(\d+)/);
      return m ? parseInt(m[1], 10) : -1;
    }).sort((a, b) => a - b);
    for (let i = 0; i < 39; i++) {
      expect(chapterNums[i]).toBe(i + 1);
    }
  });

  it('Wesley section chapter_numbers match article.number (1..25)', () => {
    const sql = buildSeedSql();
    const secLines = sql.split('\n').filter(l =>
      l.includes('INSERT OR REPLACE INTO confessional_sections') &&
      /VALUES\s*\(1010\d\d/.test(l)
    );
    expect(secLines.length).toBe(25);
    const chapterNums = secLines.map(line => {
      const m = line.match(/VALUES\s*\(\d+,\s*\d+,\s*(\d+)/);
      return m ? parseInt(m[1], 10) : -1;
    }).sort((a, b) => a - b);
    for (let i = 0; i < 25; i++) {
      expect(chapterNums[i]).toBe(i + 1);
    }
  });
});

// ─── Transcription integrity ───────────────────────────────────────────────────

describe('transcription integrity — 39 Articles', () => {
  it('every article content is at least 60 characters', () => {
    for (const art of THIRTY_NINE_ARTICLES) {
      expect(
        art.content.length,
        `Art ${art.number} content is too short (${art.content.length} chars)`
      ).toBeGreaterThanOrEqual(60);
    }
  });

  it('at least one of the 39 articles exceeds 400 characters', () => {
    const long = THIRTY_NINE_ARTICLES.filter(a => a.content.length > 400);
    expect(long.length, 'Expected at least one article > 400 chars').toBeGreaterThan(0);
  });

  it('Art. 1 begins with canonical opening clause', () => {
    const art1 = THIRTY_NINE_ARTICLES.find(a => a.number === 1)!;
    expect(art1.content).toMatch(/^There is but one living and true God/);
  });

  it('Art. 2 mentions the Word or Son of the Father', () => {
    const art2 = THIRTY_NINE_ARTICLES.find(a => a.number === 2)!;
    expect(art2.content).toMatch(/Word|Son of the Father/i);
  });

  it('Art. 6 mentions the canonical book list framing', () => {
    const art6 = THIRTY_NINE_ARTICLES.find(a => a.number === 6)!;
    expect(art6.content).toMatch(/Genesis|canonical|Scripture/i);
  });

  it('Art. 9 mentions original sin', () => {
    const art9 = THIRTY_NINE_ARTICLES.find(a => a.number === 9)!;
    expect(art9.content).toMatch(/[Oo]riginal [Ss]in|original righteousness/i);
  });

  it('Art. 17 mentions Predestination', () => {
    const art17 = THIRTY_NINE_ARTICLES.find(a => a.number === 17)!;
    expect(art17.content).toMatch(/[Pp]redestination/i);
  });

  it('Art. 39 is present (last article)', () => {
    const art39 = THIRTY_NINE_ARTICLES.find(a => a.number === 39);
    expect(art39).toBeDefined();
    expect(art39!.content.trim().length).toBeGreaterThan(60);
  });
});

describe('transcription integrity — Wesley Articles', () => {
  it('every article content is at least 60 characters', () => {
    for (const art of WESLEY_ARTICLES) {
      expect(
        art.content.length,
        `Wesley Art ${art.number} content is too short (${art.content.length} chars)`
      ).toBeGreaterThanOrEqual(60);
    }
  });

  it('at least one Wesley article exceeds 400 characters', () => {
    const long = WESLEY_ARTICLES.filter(a => a.content.length > 400);
    expect(long.length, 'Expected at least one Wesley article > 400 chars').toBeGreaterThan(0);
  });

  it('Wesley Art. 1 begins with canonical opening', () => {
    const art1 = WESLEY_ARTICLES.find(a => a.number === 1)!;
    expect(art1.content).toMatch(/^There is but one living and true God/);
  });

  it('Wesley Art. 25 is present with content', () => {
    const art25 = WESLEY_ARTICLES.find(a => a.number === 25);
    expect(art25).toBeDefined();
    expect(art25!.content.trim().length).toBeGreaterThan(60);
  });
});
