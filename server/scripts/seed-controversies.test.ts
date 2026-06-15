/**
 * seed-controversies.test.ts
 * Dataset-integrity tests for CONTROVERSY_DATASET.
 * All assertions are pure data checks — no DB connection needed.
 */

import { describe, it, expect } from 'vitest';
import {
  CONTROVERSY_DATASET,
  buildPassageRows,
  topicInsertSql,
  passageInsertSql,
} from './seed-controversies.js';
import { slugify } from '../src/tools/utils.js';
import { encodePosition } from '../src/tools/utils.js';
import { lookupBook } from '../src/db/books.js';

const VALID_RATINGS = new Set(['low', 'medium', 'high']);
const VALID_CATEGORIES = new Set(['dating', 'authorship', 'composition', 'historicity', 'harmonization']);
const VALID_SOURCE_TIERS = new Set(['A', 'B', 'C']);
const ADJUDICATIVE_PATTERN = /\b(correct|refuted|debunked|disproven)\b/i;

describe('CONTROVERSY_DATASET integrity', () => {
  it('contains at least 2 topics', () => {
    expect(CONTROVERSY_DATASET.length).toBeGreaterThanOrEqual(2);
  });

  it('all topic slugs are unique', () => {
    const slugs = CONTROVERSY_DATASET.map(t => slugify(t.topic));
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  for (const topic of CONTROVERSY_DATASET) {
    describe(`topic: "${topic.topic}"`, () => {
      it('has a valid rating', () => {
        expect(VALID_RATINGS.has(topic.rating), `rating "${topic.rating}" not in {low,medium,high}`).toBe(true);
      });

      it('has a valid category', () => {
        expect(VALID_CATEGORIES.has(topic.category), `category "${topic.category}" not in allowed set`).toBe(true);
      });

      it('has at least 2 positions', () => {
        expect(topic.positions.length).toBeGreaterThanOrEqual(2);
      });

      for (const position of topic.positions) {
        describe(`position: "${position.label}"`, () => {
          it('has non-empty evidence', () => {
            expect(position.evidence.trim().length).toBeGreaterThan(0);
          });

          it('has at least 1 named scholar', () => {
            expect(position.scholars.length).toBeGreaterThanOrEqual(1);
          });

          it('label does not contain adjudicative language', () => {
            expect(ADJUDICATIVE_PATTERN.test(position.label)).toBe(false);
          });
        });
      }

      it('has at least 1 source with a valid tier', () => {
        expect(topic.sources.length).toBeGreaterThanOrEqual(1);
        for (const source of topic.sources) {
          expect(VALID_SOURCE_TIERS.has(source.tier), `source tier "${source.tier}" not in {A,B,C}`).toBe(true);
        }
      });

      it('resolves at least 1 passage row (no warn-drop)', () => {
        const rows = buildPassageRows(topic, 1);
        expect(rows.length).toBeGreaterThanOrEqual(1);
      });

      it('every passage has correct enc values', () => {
        const rows = buildPassageRows(topic, 1);
        for (const row of rows) {
          expect(row.start_enc).toBe(encodePosition(row.start_chapter, row.start_verse));
          expect(row.end_enc).toBe(encodePosition(row.end_chapter, row.end_verse));
        }
      });

      it('every passage book resolves via lookupBook', () => {
        const rows = buildPassageRows(topic, 1);
        for (const row of rows) {
          const bookInfo = lookupBook(row.book);
          expect(bookInfo, `book "${row.book}" not found via lookupBook`).not.toBeNull();
        }
      });
    });
  }
});

describe('topicInsertSql', () => {
  it('returns a string starting with INSERT OR REPLACE', () => {
    const topic = CONTROVERSY_DATASET[0];
    const sql = topicInsertSql(1, topic);
    expect(sql).toMatch(/^INSERT OR REPLACE INTO controversy_topics/);
  });
});

describe('passageInsertSql', () => {
  it('returns a string starting with INSERT OR REPLACE', () => {
    const topic = CONTROVERSY_DATASET[0];
    const rows = buildPassageRows(topic, 1);
    expect(rows.length).toBeGreaterThan(0);
    const sql = passageInsertSql(1, rows[0]);
    expect(sql).toMatch(/^INSERT OR REPLACE INTO controversy_passages/);
  });
});
