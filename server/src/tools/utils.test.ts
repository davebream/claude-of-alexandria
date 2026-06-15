import { describe, it, expect } from 'vitest';
import { parseVerseRange, slugifySeason, encodePosition } from './utils.js';

describe('parseVerseRange', () => {
  // Existing formats (backwards compatibility)
  it('parses single verse "8:28"', () => {
    const result = parseVerseRange('8:28');
    expect(result).toEqual({ startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 28 });
  });

  it('parses full range "8:28-8:30"', () => {
    const result = parseVerseRange('8:28-8:30');
    expect(result).toEqual({ startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 30 });
  });

  it('parses cross-chapter range "8:28-9:5"', () => {
    const result = parseVerseRange('8:28-9:5');
    expect(result).toEqual({ startChapter: 8, startVerse: 28, endChapter: 9, endVerse: 5 });
  });

  it('parses single verse at chapter start "1:1"', () => {
    const result = parseVerseRange('1:1');
    expect(result).toEqual({ startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 });
  });

  // New abbreviated format
  it('parses abbreviated range "8:28-30"', () => {
    const result = parseVerseRange('8:28-30');
    expect(result).toEqual({ startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 30 });
  });

  it('parses abbreviated range "1:1-5"', () => {
    const result = parseVerseRange('1:1-5');
    expect(result).toEqual({ startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 5 });
  });

  // Error cases
  it('rejects backwards abbreviated range "8:28-3"', () => {
    const result = parseVerseRange('8:28-3');
    expect(result).toHaveProperty('error');
  });

  it('rejects backwards full range "9:5-8:28"', () => {
    const result = parseVerseRange('9:5-8:28');
    expect(result).toHaveProperty('error');
  });

  it('rejects garbage input', () => {
    const result = parseVerseRange('foo');
    expect(result).toHaveProperty('error');
  });

  it('rejects empty string', () => {
    const result = parseVerseRange('');
    expect(result).toHaveProperty('error');
  });
});

describe('slugifySeason', () => {
  it("converts 'Christmas / Christmastide' to 'christmas-christmastide'", () => {
    expect(slugifySeason('Christmas / Christmastide')).toBe('christmas-christmastide');
  });

  it("converts 'Advent' to 'advent'", () => {
    expect(slugifySeason('Advent')).toBe('advent');
  });

  it("converts 'Christ the King' to 'christ-the-king'", () => {
    expect(slugifySeason('Christ the King')).toBe('christ-the-king');
  });
});

describe('encodePosition', () => {
  it('encodes chapter 9, verse 6 as 9006', () => {
    expect(encodePosition(9, 6)).toBe(9006);
  });

  it('encodes chapter 11, verse 9 as 11009', () => {
    expect(encodePosition(11, 9)).toBe(11009);
  });

  it('encodes chapter 23, verse 1 as 23001', () => {
    expect(encodePosition(23, 1)).toBe(23001);
  });

  it('encodes chapter 23, verse 999 as 23999', () => {
    expect(encodePosition(23, 999)).toBe(23999);
  });
});
