import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerseRange, parseChapterRange } from './utils.js';

describe('parseVerseRange', () => {
  // Existing formats (backwards compatibility)
  it('parses single verse "8:28"', () => {
    const result = parseVerseRange('8:28');
    assert.deepEqual(result, { startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 28 });
  });

  it('parses full range "8:28-8:30"', () => {
    const result = parseVerseRange('8:28-8:30');
    assert.deepEqual(result, { startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 30 });
  });

  it('parses cross-chapter range "8:28-9:5"', () => {
    const result = parseVerseRange('8:28-9:5');
    assert.deepEqual(result, { startChapter: 8, startVerse: 28, endChapter: 9, endVerse: 5 });
  });

  it('parses single verse at chapter start "1:1"', () => {
    const result = parseVerseRange('1:1');
    assert.deepEqual(result, { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 });
  });

  // New abbreviated format
  it('parses abbreviated range "8:28-30"', () => {
    const result = parseVerseRange('8:28-30');
    assert.deepEqual(result, { startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 30 });
  });

  it('parses abbreviated range "1:1-5"', () => {
    const result = parseVerseRange('1:1-5');
    assert.deepEqual(result, { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 5 });
  });

  // Error cases
  it('rejects backwards abbreviated range "8:28-3"', () => {
    const result = parseVerseRange('8:28-3');
    assert('error' in result);
  });

  it('rejects backwards full range "9:5-8:28"', () => {
    const result = parseVerseRange('9:5-8:28');
    assert('error' in result);
  });

  it('rejects garbage input', () => {
    const result = parseVerseRange('foo');
    assert('error' in result);
  });

  it('rejects empty string', () => {
    const result = parseVerseRange('');
    assert('error' in result);
  });
});
