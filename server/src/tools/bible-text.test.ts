import { describe, it, expect } from 'vitest';
import { BibleLookupInputSchema } from './bible-lookup.js';
import { CommentaryLookupInputSchema } from './commentary-lookup.js';
import { ParallelTextInputSchema } from './parallel-text.js';

describe('BibleLookupInputSchema', () => {
  const schema = BibleLookupInputSchema;

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    expect(result.book).toBe('Romans');
    expect(result.translation).toBe('BSB');
  });

  it('accepts explicit translation', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translation: 'KJV' });
    expect(result.translation).toBe('KJV');
  });

  it('rejects invalid translation', () => {
    expect(() => schema.parse({ book: 'Romans', range: '8:28', translation: 'ESV' })).toThrow();
  });
});

describe('CommentaryLookupInputSchema', () => {
  const schema = CommentaryLookupInputSchema;

  it('accepts valid input without commentary filter', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28' });
    expect(result.commentary).toBeUndefined();
  });

  it('accepts valid commentary filter', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', commentary: 'matthew-henry' });
    expect(result.commentary).toBe('matthew-henry');
  });

  it('rejects invalid commentary', () => {
    expect(() => schema.parse({ book: 'Romans', range: '8:28', commentary: 'fake' })).toThrow();
  });
});

describe('ParallelTextInputSchema', () => {
  const schema = ParallelTextInputSchema;

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    expect(result.translations).toEqual(['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY']);
  });

  it('accepts explicit translations array', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translations: ['KJV', 'BSB'] });
    expect(result.translations).toEqual(['KJV', 'BSB']);
  });

  it('rejects JSON-string translations', () => {
    expect(() => schema.parse({ book: 'Romans', range: '8:28', translations: '["KJV", "BSB"]' })).toThrow();
  });

  it('rejects invalid translation in array', () => {
    expect(() => schema.parse({ book: 'Romans', range: '8:28', translations: ['ESV'] })).toThrow();
  });
});
