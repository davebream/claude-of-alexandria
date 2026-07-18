import { describe, it, expect } from 'vitest';
import { cacheKeyUrl, resolveCacheVersion } from './index.js';

describe('cacheKeyUrl', () => {
  it('starts with the given version namespace', () => {
    const key = cacheKeyUrl('v5', 'list_books', '{}');
    expect(key.startsWith('https://cache/v5/')).toBe(true);
  });

  it('never contains a hardcoded v4 namespace for a different version', () => {
    const key = cacheKeyUrl('v5', 'list_books', '{}');
    expect(key).not.toContain('/v4/');
  });

  it('is stable for identical inputs', () => {
    const a = cacheKeyUrl('v5', 'query_lexicon', '{"a":1}');
    const b = cacheKeyUrl('v5', 'query_lexicon', '{"a":1}');
    expect(a).toBe(b);
  });

  it('differs across versions for identical name+args (namespace change)', () => {
    const a = cacheKeyUrl('v5', 'query_lexicon', '{"a":1}');
    const b = cacheKeyUrl('v9', 'query_lexicon', '{"a":1}');
    expect(a).not.toBe(b);
  });

  it('URL-encodes the sorted args', () => {
    const key = cacheKeyUrl('v5', 'query_lexicon', '{"a b":"c/d"}');
    expect(key).toBe(`https://cache/v5/query_lexicon/${encodeURIComponent('{"a b":"c/d"}')}`);
  });
});

describe('resolveCacheVersion', () => {
  it('falls back to DEFAULT_CACHE_VERSION when env.CACHE_VERSION is absent', () => {
    expect(resolveCacheVersion({})).toBe('v5');
  });

  it('uses env.CACHE_VERSION when set', () => {
    expect(resolveCacheVersion({ CACHE_VERSION: 'v9' })).toBe('v9');
  });

  it('falls back to DEFAULT_CACHE_VERSION when env.CACHE_VERSION is an empty string', () => {
    expect(resolveCacheVersion({ CACHE_VERSION: '' })).toBe('v5');
  });
});
