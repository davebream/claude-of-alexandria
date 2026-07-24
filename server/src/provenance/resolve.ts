import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  COMMENTARY_ID_TO_DATASET,
  CONFESSIONAL_SLUG_TO_DATASET,
  DATASET_REGISTRY,
  LEXICON_SOURCE_TO_DATASET,
  TRANSLATION_ID_TO_DATASET,
  requireDataset,
} from './registry.js';
import {
  ATTRIBUTION_URL,
  ProvenanceSchema,
  toPublicDataset,
  type Provenance,
} from './types.js';

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function buildProvenance(ids: string[]): Provenance {
  const datasets = uniqueIds(ids).map(id => toPublicDataset(requireDataset(id)));
  if (datasets.length === 0) {
    throw new Error('Provenance resolver produced an empty dataset list');
  }
  return ProvenanceSchema.parse({
    attribution_url: ATTRIBUTION_URL,
    datasets,
  });
}

function mapRows(rows: unknown[], mapper: (row: Record<string, unknown>) => Record<string, unknown>): unknown[] {
  return rows.map(row => mapper({ ...(row as Record<string, unknown>) }));
}

function annotateFeatureMap(
  features: Record<string, unknown[]>,
  sourceIds: string[],
): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(features).map(([feature, rows]) => [
      feature,
      mapRows(rows, row => ({ ...row, source_ids: [...sourceIds] })),
    ]),
  );
}

function otQuoteSourceIds(quote: Record<string, unknown>): string[] {
  const quoteType = String(quote.quote_type ?? '');
  const greek = String(quote.greek_text ?? '');
  const otSources = Array.isArray(quote.ot_sources) ? quote.ot_sources : [];
  if (quoteType === 'allusion' || (greek.length === 0 && otSources.length > 0)) {
    return ['stepbible'];
  }
  if (otSources.length > 0) return ['lgntdf', 'stepbible'];
  return ['lgntdf'];
}

function lexiconSourceIds(entry: Record<string, unknown>): string[] {
  const tokens = Array.isArray(entry.sources) ? entry.sources.map(String) : [];
  return uniqueIds(tokens.map(token => LEXICON_SOURCE_TO_DATASET[token]).filter(Boolean) as string[]);
}

function confessionalDatasetId(slug: string): string {
  return CONFESSIONAL_SLUG_TO_DATASET[slug] ?? 'creeds_json';
}

function translationIdsFromArgs(args: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const single = args.translation;
  if (typeof single === 'string' && TRANSLATION_ID_TO_DATASET[single]) {
    ids.push(TRANSLATION_ID_TO_DATASET[single]);
  }
  const many = args.translations;
  if (Array.isArray(many)) {
    for (const id of many) {
      if (typeof id === 'string' && TRANSLATION_ID_TO_DATASET[id]) {
        ids.push(TRANSLATION_ID_TO_DATASET[id]);
      }
    }
  }
  return uniqueIds(ids);
}

/**
 * Resolve which dataset IDs apply for a tool call before looking at result rows.
 * Result-dependent IDs are unioned in annotateAndCollect().
 */
export function resolveDatasetIds(
  tool: string,
  args: Record<string, unknown>,
  data: Record<string, unknown>,
): string[] {
  switch (tool) {
    case 'list_books': {
      const ids = ['coa_canonical'];
      if (args.include_themes === true || data.themes) ids.push('coa_thematic');
      ids.push(...Object.values(TRANSLATION_ID_TO_DATASET));
      ids.push(...Object.values(COMMENTARY_ID_TO_DATASET));
      return ids;
    }
    case 'query_discourse_features': {
      const ids = ['lgntdf', 'opengnt'];
      // Transliteration join uses TFLSJ when any feature row carries word_translit.
      const features = (data.features ?? {}) as Record<string, Array<Record<string, unknown>>>;
      const hasTranslit = Object.values(features).some(rows =>
        rows.some(row => row.word_translit != null),
      );
      if (hasTranslit) ids.push('step_tflsj', 'stepbible');
      return ids;
    }
    case 'query_paragraph_breaks':
      return ['morphhb'];
    case 'query_vocabulary':
    case 'query_lemmas':
    case 'query_themes_for_lemmas':
    case 'query_theme_distribution': {
      const ids = ['coa_thematic'];
      // Testament may be explicit or inferred from book; include both corpora when unknown.
      const testament = args.testament ?? data.testament;
      if (testament === 'nt') ids.push('morphgnt', 'sblgnt');
      else if (testament === 'ot') ids.push('morphhb');
      else ids.push('morphgnt', 'sblgnt', 'morphhb');
      return ids;
    }
    case 'query_morphology': {
      const ids: string[] = [];
      const testament = args.testament ?? data.testament;
      const detail = args.fields ?? data.detail_level;
      if (testament === 'ot') {
        ids.push('macula_hebrew', 'morphhb');
      } else if (testament === 'nt') {
        ids.push('opengnt', 'rmac', 'sblgnt');
        if (detail === 'full' || detail === 'lexical') ids.push('stepbible', 'ubs_domains');
      } else {
        ids.push('opengnt', 'rmac', 'sblgnt', 'macula_hebrew', 'morphhb', 'stepbible');
      }
      return ids;
    }
    case 'query_ot_quotes': {
      const quotes = Array.isArray(data.quotes) ? data.quotes as Array<Record<string, unknown>> : [];
      if (quotes.length === 0) return ['lgntdf', 'stepbible'];
      const ids = quotes.flatMap(otQuoteSourceIds);
      return uniqueIds(ids);
    }
    case 'query_lexicon': {
      const entries = Array.isArray(data.entries) ? data.entries as Array<Record<string, unknown>> : [];
      if (entries.length === 0) return ['step_tflsj', 'abbott_smith', 'bdb', 'stepbible'];
      const ids = entries.flatMap(lexiconSourceIds);
      return uniqueIds(ids.length > 0 ? ids : ['stepbible']);
    }
    case 'check_versification':
      return ['ubs_versification'];
    case 'query_cross_references':
    case 'trace_cross_reference_path':
      return ['openbible_xref'];
    case 'query_people':
    case 'query_places':
    case 'query_person_network':
      return ['theographic', 'tipnr'];
    case 'query_events':
      return ['theographic', 'tipnr', 'coa_controversies'];
    case 'query_speakers':
      return ['clear_bible_speakers', 'glyssen'];
    case 'query_ot_structure':
      return ['macula_hebrew', 'clear_bible_speakers'];
    case 'query_syntax':
      return ['opentext', 'opengnt'];
    case 'query_variants':
      return ['opengnt', 'stepbible'];
    case 'bible_lookup':
    case 'parallel_text': {
      const fromArgs = translationIdsFromArgs(args);
      if (fromArgs.length > 0) return fromArgs;
      // Default / multi-translation responses: collect from result rows when present.
      const verses = Array.isArray(data.verses) ? data.verses as Array<Record<string, unknown>> : [];
      const fromRows = verses.flatMap(verse => {
        const id = verse.translation ?? verse.id;
        return typeof id === 'string' && TRANSLATION_ID_TO_DATASET[id]
          ? [TRANSLATION_ID_TO_DATASET[id]]
          : [];
      });
      return uniqueIds(fromRows.length > 0 ? fromRows : Object.values(TRANSLATION_ID_TO_DATASET));
    }
    case 'commentary_lookup': {
      if (typeof args.commentary === 'string' && COMMENTARY_ID_TO_DATASET[args.commentary]) {
        return [COMMENTARY_ID_TO_DATASET[args.commentary]];
      }
      const commentaries = Array.isArray(data.commentaries)
        ? data.commentaries as Array<Record<string, unknown>>
        : [];
      const fromGroups = commentaries
        .map(group => COMMENTARY_ID_TO_DATASET[String(group.commentary)])
        .filter(Boolean) as string[];
      const entries = Array.isArray(data.entries) ? data.entries as Array<Record<string, unknown>> : [];
      const fromEntries = entries
        .map(entry => COMMENTARY_ID_TO_DATASET[String(entry.commentary)])
        .filter(Boolean) as string[];
      const ids = uniqueIds([...fromGroups, ...fromEntries]);
      return ids.length > 0 ? ids : Object.values(COMMENTARY_ID_TO_DATASET);
    }
    case 'confessional_lookup': {
      const documents = Array.isArray(data.documents)
        ? data.documents as Array<Record<string, unknown>>
        : [];
      const results = Array.isArray(data.results)
        ? data.results as Array<Record<string, unknown>>
        : [];
      const slugs = [...documents, ...results]
        .map(row => row.slug)
        .filter((slug): slug is string => typeof slug === 'string');
      if (typeof args.document === 'string') slugs.push(args.document);
      if (typeof args.slug === 'string') slugs.push(args.slug);
      const ids = uniqueIds(slugs.map(confessionalDatasetId));
      return ids.length > 0 ? ids : ['creeds_json'];
    }
    case 'liturgical_lookup':
      return ['coa_liturgical'];
    case 'query_controversies':
      return ['coa_controversies'];
    default:
      throw new Error(`No provenance resolver registered for tool: ${tool}`);
  }
}

/**
 * Annotate heterogeneous records with source_ids and return the dataset ID set used.
 */
export function annotateSourceIds(
  tool: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...data };

  if (tool === 'query_discourse_features') {
    if (next.features && typeof next.features === 'object') {
      next.features = annotateFeatureMap(next.features as Record<string, unknown[]>, ['lgntdf']);
    }
    if (Array.isArray(next.word_level_boundaries)) {
      next.word_level_boundaries = mapRows(next.word_level_boundaries, row => ({
        ...row,
        source_ids: ['lgntdf', 'opengnt'],
      }));
    }
    if (Array.isArray(next.records)) {
      next.records = mapRows(next.records, row => {
        if (row.record_type === 'boundary') {
          return { ...row, source_ids: row.source_ids ?? ['lgntdf', 'opengnt'] };
        }
        return { ...row, source_ids: row.source_ids ?? ['lgntdf'] };
      });
    }
  }

  if (tool === 'query_ot_quotes' && Array.isArray(next.quotes)) {
    next.quotes = mapRows(next.quotes, row => ({
      ...row,
      source_ids: otQuoteSourceIds(row),
    }));
  }

  if (tool === 'query_lexicon' && Array.isArray(next.entries)) {
    next.entries = mapRows(next.entries, row => {
      if (!Array.isArray(row.sources)) return row;
      const ids = lexiconSourceIds(row);
      return { ...row, source_ids: ids.length > 0 ? ids : ['stepbible'] };
    });
  }

  if (tool === 'commentary_lookup') {
    if (Array.isArray(next.commentaries)) {
      next.commentaries = mapRows(next.commentaries, group => {
        const datasetId = COMMENTARY_ID_TO_DATASET[String(group.commentary)];
        const entries = Array.isArray(group.entries)
          ? mapRows(group.entries, entry => (
            datasetId ? { ...entry, source_ids: [datasetId] } : entry
          ))
          : group.entries;
        return datasetId
          ? { ...group, source_ids: [datasetId], entries }
          : { ...group, entries };
      });
    }
    if (Array.isArray(next.entries)) {
      next.entries = mapRows(next.entries, entry => {
        const datasetId = COMMENTARY_ID_TO_DATASET[String(entry.commentary)];
        return datasetId ? { ...entry, source_ids: [datasetId] } : entry;
      });
    }
  }

  if (tool === 'confessional_lookup') {
    if (Array.isArray(next.documents)) {
      next.documents = mapRows(next.documents, doc => {
        const slug = String(doc.slug ?? '');
        const datasetId = confessionalDatasetId(slug);
        const sections = Array.isArray(doc.sections)
          ? mapRows(doc.sections, section => ({ ...section, source_ids: [datasetId] }))
          : doc.sections;
        return { ...doc, source_ids: [datasetId], sections };
      });
    }
    if (Array.isArray(next.results)) {
      next.results = mapRows(next.results, row => {
        const slug = String(row.slug ?? '');
        return { ...row, source_ids: [confessionalDatasetId(slug)] };
      });
    }
  }

  return next;
}

/** Tools that must have a resolver. Kept for coverage assertions. */
export const PROVENANCE_TOOLS = [
  'list_books',
  'query_discourse_features',
  'query_paragraph_breaks',
  'query_vocabulary',
  'query_morphology',
  'query_ot_quotes',
  'query_themes_for_lemmas',
  'query_lemmas',
  'query_theme_distribution',
  'query_lexicon',
  'check_versification',
  'query_cross_references',
  'trace_cross_reference_path',
  'query_places',
  'query_people',
  'query_events',
  'query_person_network',
  'query_speakers',
  'query_syntax',
  'query_ot_structure',
  'query_variants',
  'bible_lookup',
  'commentary_lookup',
  'parallel_text',
  'confessional_lookup',
  'liturgical_lookup',
  'query_controversies',
] as const;

export type ProvenanceTool = (typeof PROVENANCE_TOOLS)[number];

/**
 * Attach provenance (and heterogeneous source_ids) to a successful tool result
 * before pagination. Errors are returned unchanged.
 */
export function attachProvenance(
  tool: string,
  args: Record<string, unknown>,
  result: CallToolResult,
): CallToolResult {
  if (result.isError || !result.structuredContent) return result;

  const annotated = annotateSourceIds(tool, result.structuredContent as Record<string, unknown>);
  const provenance = buildProvenance(resolveDatasetIds(tool, args, annotated));
  const data = { ...annotated, provenance };

  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function assertRegistryIntegrity(): void {
  for (const [id, entry] of Object.entries(DATASET_REGISTRY)) {
    if (entry.id !== id) throw new Error(`Registry key/id mismatch: ${id} vs ${entry.id}`);
    if (!entry.title || !entry.creator || !entry.attribution || !entry.source_url) {
      throw new Error(`Dataset ${id} missing required metadata`);
    }
    if (!entry.rights.name) throw new Error(`Dataset ${id} missing rights.name`);
    for (const tool of entry.mcp_tools) {
      if (!(PROVENANCE_TOOLS as readonly string[]).includes(tool)) {
        throw new Error(`Dataset ${id} references unknown MCP tool ${tool}`);
      }
    }
  }
  if (DATASET_REGISTRY.lgntdf.attribution !== requireDataset('lgntdf').attribution) {
    throw new Error('LGNTDF attribution drift');
  }
}
