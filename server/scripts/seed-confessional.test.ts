import { describe, it, expect, vi } from 'vitest';
import { parseProofTextRef } from './seed-confessional.js';

describe('parseProofTextRef', () => {
  it('parses a single-verse reference', () => {
    const result = parseProofTextRef('Ps.19.1');
    expect(result).toEqual([{ book: 'psalms', chapter: 19, verse: 1 }]);
  });

  it('parses a same-chapter range', () => {
    const result = parseProofTextRef('Gen.1.1-Gen.1.5');
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 1 });
    expect(result[4]).toEqual({ book: 'genesis', chapter: 1, verse: 5 });
  });

  it('parses a cross-chapter range within the same book', () => {
    // Gen 1 has 31 verses; Gen 2 starts at verse 1
    const result = parseProofTextRef('Gen.1.28-Gen.2.3');
    // Expects Gen 1:28-31 (4 verses) + Gen 2:1-3 (3 verses) = 7 verses
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 28 });
    expect(result[6]).toEqual({ book: 'genesis', chapter: 2, verse: 3 });
  });

  it('returns empty array and does not throw for an unresolvable abbreviation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseProofTextRef('Unkn.1.1');
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('parses an NT book with digit prefix (1Cor)', () => {
    const result = parseProofTextRef('1Cor.15.3');
    expect(result).toEqual([{ book: '1_corinthians', chapter: 15, verse: 3 }]);
  });

  it('parses a reference with no range (Rom.8.28)', () => {
    const result = parseProofTextRef('Rom.8.28');
    expect(result).toEqual([{ book: 'romans', chapter: 8, verse: 28 }]);
  });

  it('clamps verse exceeding chapter length and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Gen 1 has 31 verses; asking for verse 99 should clamp to 31
    const result = parseProofTextRef('Gen.1.99');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 31 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('expands a cross-book range spanning Malachi into Matthew', () => {
    // Mal 4 has 6 verses; Matt 1:1 is the first verse of Matthew
    // Mal.4.5-Matt.1.1 → Mal 4:5, Mal 4:6, Matt 1:1 = 3 verses
    const result = parseProofTextRef('Mal.4.5-Matt.1.1');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ book: 'malachi', chapter: 4, verse: 5 });
    expect(result[1]).toEqual({ book: 'malachi', chapter: 4, verse: 6 });
    expect(result[2]).toEqual({ book: 'matthew', chapter: 1, verse: 1 });
  });
});
