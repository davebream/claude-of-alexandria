import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './index.js';
import { TOOL_DESCRIPTIONS } from './tool-descriptions.js';
import { setDb } from './db/query.js';

const PAGEABLE_TOOLS = [
  'query_discourse_features', 'query_vocabulary', 'query_morphology',
  'query_ot_quotes', 'query_lemmas', 'query_theme_distribution', 'query_lexicon',
  'query_cross_references', 'query_people', 'query_places', 'query_events',
  'query_person_network', 'query_speakers', 'query_syntax', 'query_variants',
  'bible_lookup', 'commentary_lookup', 'parallel_text', 'confessional_lookup',
  'liturgical_lookup', 'query_controversies',
] as const;

function expectOwnedObjectsStrict(schema: unknown, path = 'schema'): void {
  if (!schema || typeof schema !== 'object') return;
  const node = schema as Record<string, unknown>;
  if (node.type === 'object' && node.properties) {
    expect(node.additionalProperties, `${path} additionalProperties`).toBe(false);
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [name, child] of Object.entries(node.properties)) {
      expectOwnedObjectsStrict(child, `${path}.${name}`);
    }
  }
  if (node.items) expectOwnedObjectsStrict(node.items, `${path}[]`);
  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(node[keyword])) {
      node[keyword].forEach((child, index) => expectOwnedObjectsStrict(child, `${path}.${keyword}[${index}]`));
    }
  }
}

describe('MCP v4 protocol contract', () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = createServer({ cacheVersion: 'v8' });
    client = new Client({ name: 'contract-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  function useRows(rows: Record<string, unknown>[]): void {
    const statement = {
      bind: vi.fn(() => statement),
      all: vi.fn(async () => ({ results: rows })),
    };
    setDb({ prepare: vi.fn(() => statement) } as unknown as D1Database);
  }

  it('emits the hard-cutover catalog and server instructions', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(26);
    expect(tools.map(tool => tool.name)).toContain('query_theme_distribution');
    expect(tools.map(tool => tool.name)).not.toContain('query_theme');
    expect(client.getServerVersion()?.version).toBe('4.0.0');
    expect(client.getInstructions()).toContain('native JSON arrays');
    expect(client.getInstructions()).toContain('next_cursor');
  });

  it('emits compileable strict input and output JSON Schemas', async () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(() => ajv.compile(tool.inputSchema), `${tool.name} inputSchema`).not.toThrow();
      expect(tool.outputSchema, `${tool.name} outputSchema`).toBeDefined();
      expect(() => ajv.compile(tool.outputSchema!), `${tool.name} outputSchema`).not.toThrow();
      expect(tool.inputSchema.additionalProperties, `${tool.name} input strictness`).toBe(false);
      expect(tool.outputSchema!.additionalProperties, `${tool.name} output strictness`).toBe(false);
      for (const [property, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((schema as Record<string, unknown>).description, `${tool.name}.${property} description`).toBeTypeOf('string');
      }
      expectOwnedObjectsStrict(tool.inputSchema, `${tool.name}.input`);
      expectOwnedObjectsStrict(tool.outputSchema, `${tool.name}.output`);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it('retains required arrays and numeric constraints in tools/list', async () => {
    const { tools } = await client.listTools();
    const themes = tools.find(tool => tool.name === 'query_themes_for_lemmas')!;
    expect(themes.inputSchema.required).toContain('lemmas');
    expect(themes.inputSchema.properties!.lemmas).toMatchObject({ type: 'array', minItems: 1, maxItems: 100 });

    for (const name of PAGEABLE_TOOLS) {
      const tool = tools.find(candidate => candidate.name === name)!;
      expect(tool.inputSchema.properties!.page_size).toMatchObject({
        type: 'integer', default: 50, minimum: 1, maximum: 200,
      });
      expect(tool.inputSchema.properties!.cursor).toMatchObject({ type: 'string' });
      expect(tool.outputSchema!.properties!.page).toBeDefined();
    }
  });

  it('emits mode unions instead of empty schemas', async () => {
    const { tools } = await client.listTools();
    for (const name of ['query_vocabulary', 'query_lexicon', 'confessional_lookup', 'liturgical_lookup', 'query_controversies']) {
      const tool = tools.find(candidate => candidate.name === name)!;
      expect(tool.inputSchema.oneOf, `${name} input oneOf`).toBeInstanceOf(Array);
      expect(tool.outputSchema!.oneOf, `${name} output oneOf`).toBeInstanceOf(Array);
      expect((tool.inputSchema.oneOf as unknown[]).length).toBeGreaterThan(1);
    }
  });

  it('rejects invalid mode combinations before handler execution', async () => {
    const result = await client.callTool({
      name: 'query_vocabulary',
      arguments: { mode: 'frequency', book: 'Romans', theme: 'joy' },
    });
    expect(result.isError).toBe(true);
  });

  it('returns equivalent text and structured content without list_books tool inventory', async () => {
    const { tools } = await client.listTools();
    const schema = tools.find(tool => tool.name === 'list_books')!.outputSchema!;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const result = await client.callTool({ name: 'list_books', arguments: {} });
    const text = result.content.find(block => block.type === 'text');

    expect(result.isError).toBeFalsy();
    expect(text?.type === 'text' ? JSON.parse(text.text) : undefined).toEqual(result.structuredContent);
    expect(result.structuredContent).not.toHaveProperty('available_tools');
    expect(validate(result.structuredContent), ajv.errorsText(validate.errors)).toBe(true);
  });

  it('returns the matching morphology detail variant', async () => {
    useRows([{
      id: 1, chapter: 1, verse: 1, word_position: 1, text: 'Ἐν',
      normalized: 'ἐν', lemma: 'ἐν', pos: 'preposition', parsing: '{}',
      text_translit: 'En',
    }]);
    const result = await client.callTool({
      name: 'query_morphology',
      arguments: { book: 'John', range: '1:1', fields: 'basic' },
    });
    const data = result.structuredContent as Record<string, any>;
    expect(result.isError).toBeFalsy();
    expect(data.detail_level).toBe('basic');
    expect(data.words[0]).not.toHaveProperty('strongs');
    expect(data.page).toEqual({ returned: 1, total: 1 });
  });

  it('flattens and enriches liturgical reading records', async () => {
    useRows([{
      season: 'Advent', season_slug: 'advent', season_order: 1,
      tradition: 'western', book: 'isaiah', start_enc: 9002, end_enc: 9007,
      reference_display: 'Isaiah 9:2-7', themes: '["hope","expectation"]',
      note: null, source: 'Revised Common Lectionary',
    }]);
    const result = await client.callTool({
      name: 'liturgical_lookup',
      arguments: { mode: 'season', season: 'Advent' },
    });
    const data = result.structuredContent as Record<string, any>;
    expect(result.isError).toBeFalsy();
    expect(data.results).toHaveLength(1);
    expect(data.results[0]).toMatchObject({
      season_slug: 'advent', season_themes: ['hope', 'expectation'],
      themes: ['hope', 'expectation'], start: { chapter: 9, verse: 2 },
      end: { chapter: 9, verse: 7 }, source: 'Revised Common Lectionary',
    });
  });

  it('keeps descriptions within the per-tool and aggregate budgets', () => {
    expect(TOOL_DESCRIPTIONS.every(description => description.length <= 1_500)).toBe(true);
    expect(TOOL_DESCRIPTIONS.reduce((total, description) => total + description.length, 0)).toBeLessThanOrEqual(24_000);
  });
});
