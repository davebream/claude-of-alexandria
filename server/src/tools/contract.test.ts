import { describe, expect, it } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { paginateCallResult, RESPONSE_CHARACTER_LIMIT } from './contract.js';

function sourceResult(records: unknown[]): CallToolResult {
  const data = { records, label: 'fixture' };
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

async function page(
  records: unknown[],
  args: Record<string, unknown>,
  options: { tool?: string; cacheVersion?: string } = {},
) {
  return paginateCallResult({
    tool: options.tool ?? 'fixture_tool',
    cacheVersion: options.cacheVersion ?? 'v8',
    args,
    result: sourceResult(records),
    getRecords: data => data.records as unknown[],
    replaceRecords: (data, nextRecords) => ({ ...data, records: nextRecords }),
  });
}

function body(result: CallToolResult): Record<string, any> {
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe('shared cursor pagination', () => {
  it('reconstructs first, middle, and final pages without gaps or duplicates', async () => {
    const records = Array.from({ length: 7 }, (_, id) => ({ id }));
    const reconstructed: unknown[] = [];
    let cursor: string | undefined;

    do {
      const result = await page(records, { filter: 'same', page_size: 3, ...(cursor ? { cursor } : {}) });
      const data = body(result);
      reconstructed.push(...data.records);
      expect(data.page.returned).toBe(data.records.length);
      expect(data.page.total).toBe(7);
      cursor = data.page.next_cursor;
    } while (cursor);

    expect(reconstructed).toEqual(records);
  });

  it('allows page_size to change while continuing', async () => {
    const records = Array.from({ length: 5 }, (_, id) => ({ id }));
    const first = body(await page(records, { filter: 'same', page_size: 2 }));
    const final = body(await page(records, {
      filter: 'same', page_size: 200, cursor: first.page.next_cursor,
    }));
    expect(final.records.map((record: { id: number }) => record.id)).toEqual([2, 3, 4]);
    expect(final.page).toEqual({ returned: 3, total: 5 });
  });

  it('returns an empty final page without a cursor', async () => {
    const data = body(await page([], { page_size: 50 }));
    expect(data.records).toEqual([]);
    expect(data.page).toEqual({ returned: 0, total: 0 });
  });

  it.each([
    ['malformed', async () => page([{ id: 1 }], { cursor: 'not-base64' }), 'INVALID_CURSOR'],
    ['filter mismatch', async () => {
      const first = body(await page([{ id: 1 }, { id: 2 }], { filter: 'a', page_size: 1 }));
      return page([{ id: 1 }, { id: 2 }], { filter: 'b', cursor: first.page.next_cursor });
    }, 'CURSOR_FILTER_MISMATCH'],
    ['wrong tool', async () => {
      const first = body(await page([{ id: 1 }, { id: 2 }], { page_size: 1 }));
      return page([{ id: 1 }, { id: 2 }], { cursor: first.page.next_cursor }, { tool: 'other_tool' });
    }, 'INVALID_CURSOR'],
    ['expired cache', async () => {
      const first = body(await page([{ id: 1 }, { id: 2 }], { page_size: 1 }));
      return page([{ id: 1 }, { id: 2 }], { cursor: first.page.next_cursor }, { cacheVersion: 'v9' });
    }, 'CURSOR_EXPIRED'],
  ])('rejects a %s cursor', async (_label, invoke, expectedCode) => {
    expect(body(await invoke()).error.code).toBe(expectedCode);
  });

  it('rejects a cursor whose payload was tampered with', async () => {
    const first = body(await page([{ id: 1 }, { id: 2 }], { page_size: 1 }));
    const encoded = first.page.next_cursor.replaceAll('-', '+').replaceAll('_', '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    payload.offset = 2;
    const tampered = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
    expect(body(await page([{ id: 1 }, { id: 2 }], { cursor: tampered })).error.code).toBe('INVALID_CURSOR');
  });

  it('uses the character budget as a record boundary', async () => {
    const records = Array.from({ length: 4 }, (_, id) => ({ id, text: 'x'.repeat(8_000) }));
    const result = await page(records, { page_size: 4 });
    const data = body(result);
    expect(data.records.length).toBeGreaterThan(0);
    expect(data.records.length).toBeLessThan(4);
    expect(data.page.next_cursor).toBeTypeOf('string');
    expect(JSON.stringify(data).length).toBeLessThanOrEqual(RESPONSE_CHARACTER_LIMIT);
  });

  it('returns RESULT_TOO_LARGE for one indivisible oversized record', async () => {
    const result = await page([{ id: 1, text: 'x'.repeat(RESPONSE_CHARACTER_LIMIT) }], { page_size: 1 });
    expect(result.isError).toBe(true);
    expect(body(result).error.code).toBe('RESULT_TOO_LARGE');
  });
});
