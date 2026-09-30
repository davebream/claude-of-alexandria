import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './index.js';
import Ajv from 'ajv';
import { CommentaryLookupOutputSchema } from './tools/commentary-lookup.js';
import { COMMENTARY_CATALOG, COMMENTARY_IDS, commentarySource } from './provenance/commentaries.js';
import { DATASET_REGISTRY } from './provenance/registry.js';
import { annotateSourceIds, resolveDatasetIds } from './provenance/resolve.js';
import { RESPONSE_CHARACTER_LIMIT } from './tools/contract.js';
import { setDb } from './db/query.js';

// Read-only production observation, 2026-09-30, Psalms 134:1-3.
// Preserve source IDs, duplicate rows, verse spans and character lengths.
// All text is an explicit synthetic placeholder; no unresolved excerpts are redistributed.
const observedRows = [
  {
    "commentary": "ambrose-of-milan",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 2,
    "text_length": 534
  },
  {
    "commentary": "augustine-of-hippo",
    "chapter": 134,
    "verse_start": 2,
    "verse_end": 2,
    "text_length": 981
  },
  {
    "commentary": "augustine-of-hippo",
    "chapter": 134,
    "verse_start": 2,
    "verse_end": 2,
    "text_length": 604
  },
  {
    "commentary": "augustine-of-hippo",
    "chapter": 134,
    "verse_start": 3,
    "verse_end": 3,
    "text_length": 470
  },
  {
    "commentary": "john-gill",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 2135
  },
  {
    "commentary": "john-gill",
    "chapter": 134,
    "verse_start": 2,
    "verse_end": 2,
    "text_length": 781
  },
  {
    "commentary": "john-gill",
    "chapter": 134,
    "verse_start": 3,
    "verse_end": 3,
    "text_length": 1366
  },
  {
    "commentary": "keil-delitzsch",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 3567
  },
  {
    "commentary": "keil-delitzsch",
    "chapter": 134,
    "verse_start": 3,
    "verse_end": 3,
    "text_length": 410
  },
  {
    "commentary": "matthew-henry",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 4080
  },
  {
    "commentary": "tyndale",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 252
  },
  {
    "commentary": "unfoldingword",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 120
  },
  {
    "commentary": "unfoldingword",
    "chapter": 134,
    "verse_start": 1,
    "verse_end": 1,
    "text_length": 49
  },
  {
    "commentary": "unfoldingword",
    "chapter": 134,
    "verse_start": 2,
    "verse_end": 2,
    "text_length": 41
  },
  {
    "commentary": "unfoldingword",
    "chapter": 134,
    "verse_start": 2,
    "verse_end": 2,
    "text_length": 78
  },
  {
    "commentary": "unfoldingword",
    "chapter": 134,
    "verse_start": 3,
    "verse_end": 3,
    "text_length": 113
  }
];
const psalmRows = observedRows.map((row, index) => {
  const { text_length, ...fields } = row;
  return { ...fields, text: `Fixture ${index}: `.padEnd(text_length, 'x') };
});

describe('commentary MCP contract', () => {
  let client: Client;
  beforeEach(async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn(async () => {}) } });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer({ cacheVersion: 'commentary-test' });
    client = new Client({ name: 'commentary-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });
  function useRows(rows: Record<string, unknown>[]) {
    const statement = { bind: vi.fn(() => statement), all: vi.fn(async () => ({ results: rows })) };
    setDb({ prepare: vi.fn(() => statement) } as unknown as D1Database);
    return statement;
  }

  it('returns usable default Psalm 134 results with explicit source coverage', async () => {
    useRows(psalmRows);
    const result = await client.callTool({ name: 'commentary_lookup', arguments: {
      book: 'Psalms', range: '134:1-134:3', page_size: 100,
    } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ entries: expect.any(Array), unavailable_sources: expect.any(Array) });
  });

  async function lookup(args: Record<string, unknown> = {}) {
    return client.callTool({ name: 'commentary_lookup', arguments: {
      book: 'Psalms', range: '134:1-134:3', page_size: 100, ...args,
    } });
  }

  async function successfulLookup(args: Record<string, unknown> = {}) {
    const result = await lookup(args);
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    const body = CommentaryLookupOutputSchema.parse(result.structuredContent);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual(body);
    const ids = new Set(body.provenance.datasets.map(dataset => dataset.id));
    for (const entry of body.entries) {
      expect(entry.source_ids).toEqual([commentarySource(entry.commentary)!.datasetId]);
      for (const id of entry.source_ids) expect(ids.has(id)).toBe(true);
    }
    if (body.entries.length) {
      expect([...ids].sort()).toEqual([...new Set(body.entries.flatMap(entry => entry.source_ids))].sort());
    }
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(RESPONSE_CHARACTER_LIMIT);
    return body;
  }

  it('accounts for all 16 observed rows without losing duplicate verse entries', async () => {
    useRows(psalmRows);
    const body = await successfulLookup();
    const expected = psalmRows.filter(row => commentarySource(row.commentary)?.datasetId);
    expect(body.entries.map(({ commentary, chapter, verse_start, verse_end, text }) =>
      ({ commentary, chapter, verse_start, verse_end, text }))).toEqual(expected);
    expect(body.page).toEqual({ returned: expected.length, total: expected.length });
    expect(body.page.total + body.unavailable_sources.reduce((sum, source) => sum + source.omitted_entries, 0)).toBe(16);
    expect(body.unavailable_sources).toEqual([
      { commentary: 'ambrose-of-milan', reason: expect.any(String), omitted_entries: 1 },
      { commentary: 'augustine-of-hippo', reason: expect.any(String), omitted_entries: 3 },
    ]);
    const { tools } = await client.listTools();
    const validate = new Ajv({ strict: false }).compile(tools.find(tool => tool.name === 'commentary_lookup')!.outputSchema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(COMMENTARY_IDS)('handles the named catalog source %s consistently', async commentary => {
    const row = { commentary, chapter: 134, verse_start: 1, verse_end: 1, text: 'Synthetic catalog fixture' };
    const statement = useRows([row]);
    const source = COMMENTARY_CATALOG[commentary];
    if (source.datasetId) {
      const body = await successfulLookup({ commentary });
      expect(body.entries).toHaveLength(1);
      expect(body.unavailable_sources).toEqual([]);
      expect(statement.bind.mock.calls[0]).toEqual(['psalms', 134, 134, 1, 134, 134, 3, commentary]);
      expect(DATASET_REGISTRY[source.datasetId].mcp_published).toBe(true);
      expect(resolveDatasetIds('commentary_lookup', { commentary }, {})).toEqual([source.datasetId]);
      expect(annotateSourceIds('commentary_lookup', { entries: [row] })).toMatchObject({ entries: [{ source_ids: [source.datasetId] }] });
      expect(annotateSourceIds('commentary_lookup', { commentaries: [{ commentary, entries: [row] }] })).toMatchObject({
        commentaries: [{ source_ids: [source.datasetId], entries: [{ source_ids: [source.datasetId] }] }],
      });
    } else {
      const result = await lookup({ commentary });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toMatchObject({
        error: { code: 'SOURCE_UNAVAILABLE', details: { commentary, reason: source.unavailableReason } },
      });
      expect(statement.all).not.toHaveBeenCalled();
    }
  });

  it('advertises only verified sources and accepts all 29 known IDs', async () => {
    const result = await client.callTool({ name: 'list_books', arguments: {} });
    const data = result.structuredContent as { available_commentaries: Array<{ id: string }> };
    expect(data.available_commentaries.map(source => source.id).sort()).toEqual(
      COMMENTARY_IDS.filter(id => COMMENTARY_CATALOG[id].datasetId).sort(),
    );
    expect(COMMENTARY_IDS).toHaveLength(29);
    const { tools } = await client.listTools();
    expect(tools.find(tool => tool.name === 'commentary_lookup')!.inputSchema.properties!.commentary).toMatchObject({ enum: [...COMMENTARY_IDS] });
  });

  it('keeps coverage notices and stable totals across cursors with changed page sizes', async () => {
    useRows(psalmRows);
    const entries = [];
    let body = await successfulLookup({ page_size: 2 });
    const notices = body.unavailable_sources;
    const total = body.page.total;
    for (let pages = 0; ; pages++) {
      expect(pages).toBeLessThan(20);
      expect(body.page.total).toBe(total);
      expect(body.unavailable_sources).toEqual(notices);
      entries.push(...body.entries);
      if (!body.page.next_cursor) break;
      body = await successfulLookup({ cursor: body.page.next_cursor, page_size: 3 });
    }
    expect(entries.map(row => row.text)).toEqual(psalmRows.filter(row => commentarySource(row.commentary)?.datasetId).map(row => row.text));
    expect(entries).toHaveLength(total);
  });

  it('sizes pages with their own provenance rather than every queried dataset', async () => {
    const rows = COMMENTARY_IDS.filter(id => COMMENTARY_CATALOG[id].datasetId).map(commentary => ({
      commentary, chapter: 134, verse_start: 1, verse_end: 1, text: 'x'.repeat(20_000),
    }));
    useRows(rows);
    let cursor: string | undefined;
    const received = [];
    do {
      const body = await successfulLookup({ cursor });
      expect(body.page.returned).toBe(1);
      expect(body.page.total).toBe(rows.length);
      received.push(...body.entries.map(row => row.commentary));
      cursor = body.page.next_cursor;
      expect(received.length).toBeLessThanOrEqual(rows.length);
    } while (cursor);
    expect(received).toEqual(rows.map(row => row.commentary));
  });

  it.each(['future-source', '__proto__', 'constructor'])('reports unregistered stored ID %s explicitly', async commentary => {
    useRows([psalmRows[4], { ...psalmRows[0], commentary }]);
    const body = await successfulLookup();
    expect(body.entries).toHaveLength(1);
    expect(body.unavailable_sources).toEqual([{ commentary, reason: expect.stringContaining('not registered'), omitted_entries: 1 }]);
  });

  it('returns SOURCE_UNAVAILABLE when all matching rows are excluded', async () => {
    useRows(psalmRows.slice(0, 4));
    const result = await lookup();
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toMatchObject({
      error: { code: 'SOURCE_UNAVAILABLE', details: { unavailable_sources: [
        { commentary: 'ambrose-of-milan', omitted_entries: 1 },
        { commentary: 'augustine-of-hippo', omitted_entries: 3 },
      ] } },
    });
    expect(result.structuredContent).toBeUndefined();
  });

  it.each([undefined, 'john-gill'])('retains query provenance on empty results (%s)', async commentary => {
    useRows([]);
    const body = await successfulLookup({ commentary });
    expect(body.entries).toEqual([]);
    expect(body.page).toEqual({ returned: 0, total: 0 });
    expect(body.unavailable_sources).toEqual([]);
    expect(body.provenance.datasets.map(dataset => dataset.id).sort()).toEqual(
      (commentary ? [commentarySource(commentary)!.datasetId] : Object.values(COMMENTARY_CATALOG).flatMap(source => source.datasetId ? [source.datasetId] : [])).sort(),
    );
  });

  it('keeps database errors distinct from empty scholarly results', async () => {
    const statement = useRows([]);
    statement.all.mockRejectedValueOnce(new Error('Database unavailable'));
    const result = await lookup();
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it.each(['john-gill', 'keil-delitzsch'])('preserves named %s records and totals', async commentary => {
    const rows = psalmRows.filter(row => row.commentary === commentary);
    useRows(rows);
    const body = await successfulLookup({ commentary });
    expect(body.entries.map(entry => entry.text)).toEqual(rows.map(row => row.text));
    expect(body.page).toEqual({ returned: rows.length, total: rows.length });
  });

  it('preserves range warnings on large default requests', async () => {
    useRows([psalmRows[4]]);
    expect((await successfulLookup({ range: '134:1-136:3' })).range_warning).toContain('Large range');
    expect((await successfulLookup({ range: '134:1-136:3', commentary: 'john-gill' })).range_warning).toBeUndefined();
  });

});
