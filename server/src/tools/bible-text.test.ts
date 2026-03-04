import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BibleLookupInputSchema } from './bible-lookup.js';
import { CommentaryLookupInputSchema } from './commentary-lookup.js';
import { ParallelTextInputSchema } from './parallel-text.js';

describe('BibleLookupInputSchema', () => {
  const schema = z.object(BibleLookupInputSchema);

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    expect(result.book).toBe('Romans');
    expect(result.translation).toBeUndefined();
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
  const schema = z.object(CommentaryLookupInputSchema);

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
  const schema = z.object(ParallelTextInputSchema);

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    expect(result.translations).toBeUndefined();
  });

  it('accepts explicit translations array', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translations: ['KJV', 'BSB'] });
    expect(result.translations).toEqual(['KJV', 'BSB']);
  });

  it('accepts JSON-string translations (XML tool calling format)', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translations: '["KJV", "BSB"]' });
    expect(result.translations).toEqual(['KJV', 'BSB']);
  });

  it('rejects invalid translation in array', () => {
    expect(() => schema.parse({ book: 'Romans', range: '8:28', translations: ['ESV'] })).toThrow();
  });
});
