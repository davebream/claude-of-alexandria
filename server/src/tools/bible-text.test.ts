import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { BibleLookupInputSchema } from './bible-lookup.js';
import { CommentaryLookupInputSchema } from './commentary-lookup.js';
import { ParallelTextInputSchema } from './parallel-text.js';

describe('BibleLookupInputSchema', () => {
  const schema = z.object(BibleLookupInputSchema);

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    assert.equal(result.book, 'Romans');
    assert.equal(result.translation, undefined);
  });

  it('accepts explicit translation', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translation: 'KJV' });
    assert.equal(result.translation, 'KJV');
  });

  it('rejects invalid translation', () => {
    assert.throws(() => schema.parse({ book: 'Romans', range: '8:28', translation: 'ESV' }));
  });
});

describe('CommentaryLookupInputSchema', () => {
  const schema = z.object(CommentaryLookupInputSchema);

  it('accepts valid input without commentary filter', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28' });
    assert.equal(result.commentary, undefined);
  });

  it('accepts valid commentary filter', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', commentary: 'matthew-henry' });
    assert.equal(result.commentary, 'matthew-henry');
  });

  it('rejects invalid commentary', () => {
    assert.throws(() => schema.parse({ book: 'Romans', range: '8:28', commentary: 'fake' }));
  });
});

describe('ParallelTextInputSchema', () => {
  const schema = z.object(ParallelTextInputSchema);

  it('accepts valid input with defaults', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28-30' });
    assert.equal(result.translations, undefined);
  });

  it('accepts explicit translations array', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translations: ['KJV', 'BSB'] });
    assert.deepEqual(result.translations, ['KJV', 'BSB']);
  });

  it('accepts JSON-string translations (XML tool calling format)', () => {
    const result = schema.parse({ book: 'Romans', range: '8:28', translations: '["KJV", "BSB"]' });
    assert.deepEqual(result.translations, ['KJV', 'BSB']);
  });

  it('rejects invalid translation in array', () => {
    assert.throws(() => schema.parse({ book: 'Romans', range: '8:28', translations: ['ESV'] }));
  });
});
