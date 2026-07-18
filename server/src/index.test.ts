import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { cacheKeyUrl, resolveCacheVersion, runCachedToolCall } from './index.js';

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
    expect(resolveCacheVersion({})).toBe('v6');
  });

  it('uses env.CACHE_VERSION when set', () => {
    expect(resolveCacheVersion({ CACHE_VERSION: 'v9' })).toBe('v9');
  });

  it('falls back to DEFAULT_CACHE_VERSION when env.CACHE_VERSION is an empty string', () => {
    expect(resolveCacheVersion({ CACHE_VERSION: '' })).toBe('v6');
  });
});

// ─── runCachedToolCall ──────────────────────────────────────────────────────

const FAKE_RESULT: CallToolResult = { content: [{ type: 'text', text: 'hello' }] };

function stubCache(opts: { matchResponse?: Response } = {}) {
  const putCalls: Request[] = [];
  const cache = {
    match: vi.fn(async (_req: Request) => opts.matchResponse),
    put: vi.fn(async (req: Request, _res: Response) => {
      putCalls.push(req);
    }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { cache, putCalls };
}

function fakeExecutionContext(): ExecutionContext & { waited: Promise<unknown>[] } {
  const waited: Promise<unknown>[] = [];
  return {
    waited,
    waitUntil(p: Promise<unknown>) {
      waited.push(p);
    },
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext & { waited: Promise<unknown>[] };
}

describe('runCachedToolCall', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits a put key containing the requested cache version (v5)', async () => {
    const { putCalls } = stubCache();
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v5' });
    await Promise.all(ctx.waited);

    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.url).toContain('/v5/');
  });

  it('emits a put key containing an overridden cache version (v9)', async () => {
    const { putCalls } = stubCache();
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v9' });
    await Promise.all(ctx.waited);

    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.url).toContain('/v9/');
  });

  it('preserves the 24h max-age TTL header on the cached response', async () => {
    const putResponses: Response[] = [];
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async (_req: Request, res: Response) => {
        putResponses.push(res);
      }),
    };
    vi.stubGlobal('caches', { default: cache });
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v5' });
    await Promise.all(ctx.waited);

    expect(putResponses).toHaveLength(1);
    expect(putResponses[0]!.headers.get('Cache-Control')).toBe('max-age=86400');
  });

  it('returns the cached value on a HIT without calling the handler', async () => {
    const cachedResponse = new Response(JSON.stringify(FAKE_RESULT), {
      headers: { 'Content-Type': 'application/json' },
    });
    stubCache({ matchResponse: cachedResponse });
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    const result = await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v5' });

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual(FAKE_RESULT);
  });

  it('schedules the cache write via ctx.waitUntil without blocking the response', async () => {
    const { putCalls } = stubCache();
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    const result = await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v5' });

    // The call must resolve to the handler result without awaiting the put itself.
    expect(result).toEqual(FAKE_RESULT);
    expect(ctx.waited).toHaveLength(1);

    // The put is scheduled (not necessarily settled yet); await it to confirm it eventually runs.
    await Promise.all(ctx.waited);
    expect(putCalls).toHaveLength(1);
  });

  it('still returns the handler result when ExecutionContext.waitUntil throws synchronously', async () => {
    stubCache();
    const throwingCtx = {
      waitUntil() {
        throw new Error('boom');
      },
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext;
    const handler = vi.fn(async () => FAKE_RESULT);

    const result = await runCachedToolCall('t', { a: 1 }, handler, { ctx: throwingCtx, cacheVersion: 'v5' });

    expect(result).toEqual(FAKE_RESULT);
  });

  it('caches fire-and-forget and returns the result when no ExecutionContext is present', async () => {
    const { putCalls } = stubCache();
    const handler = vi.fn(async () => FAKE_RESULT);

    // No ctx on reqCtx — exercises the `else void put` fallback branch (local dev / non-fetch callers).
    const result = await runCachedToolCall('t', { a: 1 }, handler, { cacheVersion: 'v5' });

    expect(result).toEqual(FAKE_RESULT);
    expect(handler).toHaveBeenCalledTimes(1);
    // The put is scheduled fire-and-forget; flush the microtask queue then confirm it ran.
    await Promise.resolve();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.url).toContain('/v5/');
  });

  it('swallows an async cache.put rejection and still returns the handler result', async () => {
    const cache = {
      match: vi.fn(async (_req: Request) => undefined),
      put: vi.fn(async (_req: Request, _res: Response) => {
        throw new Error('put failed');
      }),
    };
    vi.stubGlobal('caches', { default: cache });
    const ctx = fakeExecutionContext();
    const handler = vi.fn(async () => FAKE_RESULT);

    const result = await runCachedToolCall('t', { a: 1 }, handler, { ctx, cacheVersion: 'v5' });

    expect(result).toEqual(FAKE_RESULT);
    // The scheduled put rejects, but the inner `.catch(() => {})` swallows it — awaiting must not throw.
    await expect(Promise.all(ctx.waited)).resolves.toBeDefined();
  });
});
