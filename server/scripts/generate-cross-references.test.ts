/**
 * Unit tests for generate-cross-references ETL core.
 *
 * Tests the pure, exported helpers classifyEdge and processLines without
 * touching the filesystem or database.
 */

import { describe, it, expect } from 'vitest';
import { classifyEdge, processLines } from './generate-cross-references.js';

describe('classifyEdge', () => {
  it('returns ok for a fully resolved pair', () => {
    const result = classifyEdge('Gen.1.1', 'Exod.2.2');
    expect(result.reviewStatus).toBe('ok');
    expect(result.from).not.toBeNull();
    expect(result.to).not.toBeNull();
    expect(result.fromRaw).toBe('Gen.1.1');
    expect(result.toRaw).toBe('Exod.2.2');
  });

  it('returns unresolved_source when from-ref uses an unknown book abbreviation', () => {
    // Sirach (Sir) is not in BOOK_MAP
    const result = classifyEdge('Sir.1.1', 'Gen.1.1');
    expect(result.reviewStatus).toBe('unresolved_source');
    expect(result.from).toBeNull();
    expect(result.fromRaw).toBe('Sir.1.1');
    expect(result.to).not.toBeNull();
  });

  it('returns unresolved_target when to-ref uses an unknown book abbreviation', () => {
    const result = classifyEdge('Gen.1.1', 'Sir.1.1');
    expect(result.reviewStatus).toBe('unresolved_target');
    expect(result.to).toBeNull();
    expect(result.toRaw).toBe('Sir.1.1');
    expect(result.from).not.toBeNull();
  });

  it('returns unresolved_both when both refs are unknown', () => {
    const result = classifyEdge('Sir.1.1', 'Tob.1.1');
    expect(result.reviewStatus).toBe('unresolved_both');
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
    expect(result.fromRaw).toBe('Sir.1.1');
    expect(result.toRaw).toBe('Tob.1.1');
  });
});

describe('processLines (Task 2 — basic counting)', () => {
  it('returns correct counts and rows for a synthetic set', () => {
    const lines = [
      'From Verse\tTo Verse\tVotes',  // header line — malformed (no numeric votes)
      '',                              // blank line — malformed
      'Gen.1.1\tExod.1.1\t5',         // ok edge
      'Sir.1.1\tGen.1.1\t3',          // unresolved_source edge
      'Gen.1.1\tGen.1.2\tnot-a-number', // bad votes — malformed
    ];

    const { rows, counts } = processLines(lines);

    expect(counts.ok).toBe(1);
    expect(counts.unresolved_source).toBe(1);
    expect(counts.unresolved_target).toBe(0);
    expect(counts.unresolved_both).toBe(0);
    expect(counts.malformedLines).toBe(3);
    // Every retained edge (ok + unresolved_*) produces a row
    expect(rows.length).toBe(counts.ok + counts.unresolved_source + counts.unresolved_target + counts.unresolved_both);
  });
});

// ─── Task 3 tests (RED — will fail until Task 3 implementation) ──────────────

describe('processLines (Task 3 — row tuple shape)', () => {
  it('ok row contains canonical book name, ok status, and two NULLs', () => {
    const lines = ['Gen.1.1\tExod.1.1\t5'];
    const { rows } = processLines(lines);
    expect(rows.length).toBe(1);
    const row = rows[0];
    // Row should contain escaped canonical names
    expect(row).toContain("'Genesis'");
    expect(row).toContain("'Exodus'");
    // Status field
    expect(row).toContain("'ok'");
    // Two trailing NULLs for from_raw and to_raw
    expect(row).toMatch(/NULL,\s*NULL\s*\)$/);
  });

  it('unresolved_source row stores full original reference string in from-book position', () => {
    const lines = ['Sir.1.1\tGen.1.1\t3'];
    const { rows } = processLines(lines);
    expect(rows.length).toBe(1);
    const row = rows[0];
    // Full original ref (escaped) in from-book position — not just 'Sir'
    expect(row).toContain("'Sir.1.1'");
    // Status
    expect(row).toContain("'unresolved_source'");
    // from_raw should also appear (the raw value in from_raw column)
    // It appears twice: once as the book col and once as from_raw col
    expect(row.split("'Sir.1.1'").length - 1).toBeGreaterThanOrEqual(2);
  });

  it('collision-safety (CR-1): two distinct unresolved-source refs produce two rows with distinct from-book values', () => {
    const lines = [
      'Sir.1.1\tGen.1.1\t5',
      'Sir.1.2\tGen.1.1\t5',
    ];
    const { rows } = processLines(lines);
    expect(rows.length).toBe(2);
    // from-book values must differ: 'Sir.1.1' vs 'Sir.1.2'
    expect(rows[0]).toContain("'Sir.1.1'");
    expect(rows[1]).toContain("'Sir.1.2'");
    expect(rows[0]).not.toContain("'Sir.1.2'");
    expect(rows[1]).not.toContain("'Sir.1.1'");
  });
});

describe('XREF_COLUMNS arity lock (Task 3 — RC-1)', () => {
  it('XREF_COLUMNS has exactly 12 columns', async () => {
    const mod = await import('./generate-cross-references.js');
    expect((mod as any).XREF_COLUMNS.length).toBe(12);
  });

  it('an emitted row tuple has exactly 12 top-level comma-separated values', () => {
    const lines = ['Gen.1.1\tExod.1.1\t5'];
    const { rows } = processLines(lines);
    const row = rows[0];
    // Strip outer parens and count top-level commas (naive split works because
    // no commas appear inside our escaped values in this test input)
    const inner = row.replace(/^\(/, '').replace(/\)$/, '');
    const values = inner.split(', ');
    expect(values.length).toBe(12);
  });
});
