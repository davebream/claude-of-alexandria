import { describe, expect, it } from 'vitest';
import { DATASET_REGISTRY, mcpDatasets } from './registry.js';
import {
  annotateSourceIds,
  assertRegistryIntegrity,
  attachProvenance,
  PROVENANCE_TOOLS,
  resolveDatasetIds,
} from './resolve.js';
import { LGNTDF_ATTRIBUTION, ProvenanceSchema } from './types.js';
import { renderLegalDatasetsHtml } from './legal-page.js';
import { generateRootNotice, generateServerNoticeMarkdown } from './notice.js';
import { RESPONSE_CHARACTER_LIMIT, paginateCallResult } from '../tools/contract.js';

describe('provenance registry', () => {
  it('passes integrity checks', () => {
    expect(() => assertRegistryIntegrity()).not.toThrow();
  });

  it('has unique stable ids and anchors', () => {
    const ids = Object.keys(DATASET_REGISTRY);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(DATASET_REGISTRY[id].rights.status).toMatch(/^(public-domain|open-license|custom-license|project-owned)$/);
    }
  });

  it('includes exact SIL LGNTDF attribution wording', () => {
    expect(DATASET_REGISTRY.lgntdf.attribution).toBe(LGNTDF_ATTRIBUTION);
    expect(LGNTDF_ATTRIBUTION).toContain('LGNTDF references marked "LGNTDF"');
    expect(LGNTDF_ATTRIBUTION).toContain('https://github.com/biblicalhumanities/levinsohn');
    expect(LGNTDF_ATTRIBUTION).toContain('http://sil.org');
    expect(LGNTDF_ATTRIBUTION).toContain('NA27/UBS4');
  });

  it('covers every MCP tool with at least one dataset', () => {
    for (const tool of PROVENANCE_TOOLS) {
      const hits = mcpDatasets().filter(entry => entry.mcp_tools.includes(tool));
      expect(hits.length, tool).toBeGreaterThan(0);
    }
  });
});

describe('resolveDatasetIds / source_ids', () => {
  it('marks discourse features and boundaries distinctly', () => {
    const annotated = annotateSourceIds('query_discourse_features', {
      book: 'Matthew',
      features: { reported_speech: [{ chapter: 1, verse: 1, word: 'λέγει', feature_description: null }] },
      word_level_boundaries: [{ chapter: 1, verse: 1, word_position: 0, boundary_type: 'clause' }],
    });
    const feature = (annotated.features as Record<string, Array<{ source_ids: string[] }>>).reported_speech[0];
    const boundary = (annotated.word_level_boundaries as Array<{ source_ids: string[] }>)[0];
    expect(feature.source_ids).toEqual(['lgntdf']);
    expect(boundary.source_ids).toEqual(['lgntdf', 'opengnt']);
  });

  it('resolves all three OT-quotation combinations', () => {
    const quotes = [
      { nt_ref: 'Matthew 1:23', greek_text: 'ἰδού', quote_type: 'direct', ot_sources: [{ book: 'Isaiah', chapter: 7, verse: 14, verse_end: null, ref: 'Isaiah 7:14' }] },
      { nt_ref: 'Matthew 2:1', greek_text: 'μάγοι', quote_type: 'direct', ot_sources: [] },
      { nt_ref: 'Matthew 2:15', greek_text: '', quote_type: 'allusion', ot_sources: [{ book: 'Hosea', chapter: 11, verse: 1, verse_end: null, ref: 'Hosea 11:1' }] },
    ];
    const annotated = annotateSourceIds('query_ot_quotes', { quotes });
    const rows = annotated.quotes as Array<{ source_ids: string[] }>;
    expect(rows[0].source_ids).toEqual(['lgntdf', 'stepbible']);
    expect(rows[1].source_ids).toEqual(['lgntdf']);
    expect(rows[2].source_ids).toEqual(['stepbible']);
  });

  it('maps Savoy to Apache-2.0 provenance', () => {
    const ids = resolveDatasetIds('confessional_lookup', { document: 'savoy_declaration' }, {
      documents: [{ slug: 'savoy_declaration', title: 'Savoy', year: 1658, tradition: 'reformed', format: 'confession', sections: [] }],
    });
    expect(ids).toContain('savoy_declaration');
    expect(DATASET_REGISTRY.savoy_declaration.rights.name).toContain('Apache');
  });

  it('returns SIL datasets on empty discourse and ot-quote results', () => {
    expect(resolveDatasetIds('query_discourse_features', { book: 'Matthew' }, { features: {} })).toContain('lgntdf');
    expect(resolveDatasetIds('query_ot_quotes', { book: 'Matthew' }, { quotes: [] })).toEqual(
      expect.arrayContaining(['lgntdf', 'stepbible']),
    );
  });
});

describe('attachProvenance + pagination', () => {
  it('keeps provenance on every page and within the size budget', async () => {
    const quotes = Array.from({ length: 40 }, (_, index) => ({
      nt_ref: `Matthew 1:${index + 1}`,
      greek_text: 'α'.repeat(800),
      quote_type: 'direct',
      ot_sources: [],
    }));
    const result = attachProvenance('query_ot_quotes', { book: 'Matthew', page_size: 5 }, {
      content: [{ type: 'text', text: '{}' }],
      structuredContent: {
        book: 'Matthew',
        quotes,
        summary: { total: quotes.length, nt_verses_with_quotes: quotes.length, ot_books_referenced: [] },
      },
    });

    const page = await paginateCallResult({
      tool: 'query_ot_quotes',
      args: { book: 'Matthew', page_size: 5 },
      cacheVersion: 'v9',
      result,
      getRecords: data => data.quotes as unknown[],
      replaceRecords: (data, records) => ({ ...data, quotes: records }),
    });

    expect(page.isError).toBeFalsy();
    const body = page.structuredContent as {
      provenance: { datasets: Array<{ id: string; attribution: string }> };
      page: { next_cursor?: string; returned: number };
      quotes: unknown[];
    };
    expect(body.provenance.datasets.some(dataset => dataset.id === 'lgntdf')).toBe(true);
    expect(body.provenance.datasets.find(dataset => dataset.id === 'lgntdf')?.attribution).toBe(LGNTDF_ATTRIBUTION);
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(RESPONSE_CHARACTER_LIMIT);
    expect(body.page.returned).toBeGreaterThan(0);

    if (body.page.next_cursor) {
      const page2 = await paginateCallResult({
        tool: 'query_ot_quotes',
        args: { book: 'Matthew', page_size: 5, cursor: body.page.next_cursor },
        cacheVersion: 'v9',
        result,
        getRecords: data => data.quotes as unknown[],
        replaceRecords: (data, records) => ({ ...data, quotes: records }),
      });
      const body2 = page2.structuredContent as { provenance: unknown };
      expect(ProvenanceSchema.parse(body2.provenance)).toBeTruthy();
    }
  });

  it('leaves errors without provenance', () => {
    const result = attachProvenance('query_ot_quotes', { book: 'Matthew' }, {
      content: [{ type: 'text', text: '{"error":{"code":"X","message":"y"}}' }],
      isError: true,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe('legal page and notices', () => {
  it('renders escaped HTML with stable anchors for every MCP dataset', () => {
    const html = renderLegalDatasetsHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('id="lgntdf"');
    expect(html).not.toContain('<script>');
    for (const entry of mcpDatasets()) {
      expect(html).toContain(`id="${entry.id}"`);
      expect(html).toContain(`<code>${entry.id}</code>`);
    }
  });

  it('includes every MCP registry entry in both generated notice surfaces', () => {
    const root = generateRootNotice();
    const server = generateServerNoticeMarkdown();
    for (const entry of mcpDatasets()) {
      expect(root).toContain(entry.title.toUpperCase());
      expect(server).toContain(`\`${entry.id}\``);
      expect(server).toContain(entry.title);
    }
    expect(root).toContain('Commercial works in which LGNTDF exceeds 25%');
    expect(root).toContain('annual reporting');
    expect(root).toContain('NA27/UBS4');
  });
});
