import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodType } from 'zod';
import { setDb } from './db/query.js';
import { queryDiscourseFeatures, DiscourseInputSchema, DiscourseOutputSchema } from './tools/discourse.js';
import { queryParagraphBreaks, ParagraphsInputSchema, ParagraphsOutputSchema } from './tools/paragraphs.js';
import { queryVocabulary, VocabularyInputSchema, VocabularyOutputSchema } from './tools/vocabulary.js';
import { queryMorphology, MorphologyInputSchema, MorphologyOutputSchema } from './tools/morphology.js';
import { listBooks, ListBooksInputSchema, ListBooksOutputSchema } from './tools/list-books.js';
import { queryOtQuotes, OtQuotesInputSchema, OtQuotesOutputSchema } from './tools/ot-quotes.js';
import { queryThemesForLemmas, ThemesInputSchema, ThemesOutputSchema } from './tools/themes.js';
import { queryLemmas, LemmasInputSchema, LemmasOutputSchema } from './tools/lemmas.js';
import { queryThemeDistribution, ThemeDistributionInputSchema, ThemeDistributionOutputSchema } from './tools/theme-distribution.js';
import { queryLexicon, LexiconInputSchema, LexiconOutputSchema } from './tools/lexicon.js';
import { checkVersification, VersificationInputSchema, VersificationOutputSchema } from './tools/versification.js';
import { queryCrossReferences, CrossReferencesInputSchema, CrossReferencesOutputSchema, traceCrossReferencePath, TraceCrossReferencePathInputSchema, TraceCrossReferencePathOutputSchema } from './tools/cross-references.js';
import { queryPeople, PeopleInputSchema, PeopleOutputSchema } from './tools/people.js';
import { queryPlaces, PlacesInputSchema, PlacesOutputSchema } from './tools/places.js';
import { queryEvents, EventsInputSchema, EventsOutputSchema } from './tools/events.js';
import { queryPersonNetwork, PersonNetworkInputSchema, PersonNetworkOutputSchema } from './tools/person-network.js';
import { speakersQuery, SpeakersInputSchema, SpeakersOutputSchema } from './tools/speakers.js';
import { querySyntax, SyntaxInputSchema, SyntaxOutputSchema } from './tools/syntax.js';
import { queryOtStructure, OtStructureInputSchema, OtStructureOutputSchema } from './tools/ot-structure.js';
import { queryVariants, VariantsInputSchema, VariantsOutputSchema } from './tools/variants.js';
import { bibleLookup, BibleLookupInputSchema, BibleLookupOutputSchema } from './tools/bible-lookup.js';
import { commentaryLookup, CommentaryLookupInputSchema, CommentaryLookupOutputSchema } from './tools/commentary-lookup.js';
import { parallelText, ParallelTextInputSchema, ParallelTextOutputSchema, type ParallelTextInput } from './tools/parallel-text.js';
import { confessionalLookup, ConfessionalLookupInputSchema, ConfessionalLookupOutputSchema } from './tools/confessional-lookup.js';
import { liturgicalLookup, LiturgicalLookupInputSchema, LiturgicalLookupOutputSchema } from './tools/liturgical-lookup.js';
import { queryControversies, ControversiesInputSchema, ControversiesOutputSchema } from './tools/controversies.js';
import { mcpObjectSchema, paginateCallResult, successResult } from './tools/contract.js';
import {
  SERVER_INSTRUCTIONS,
  DESC_LIST_BOOKS, DESC_DISCOURSE, DESC_PARAGRAPHS, DESC_VOCABULARY,
  DESC_MORPHOLOGY, DESC_OT_QUOTES, DESC_THEMES, DESC_LEMMAS,
  DESC_THEME_DISTRIBUTION, DESC_LEXICON, DESC_VERSIFICATION,
  DESC_CROSS_REFERENCES, DESC_TRACE_CROSS_REFERENCE_PATH, DESC_PLACES,
  DESC_PEOPLE, DESC_EVENTS, DESC_PERSON_NETWORK, DESC_SPEAKERS, DESC_SYNTAX,
  DESC_OT_STRUCTURE, DESC_VARIANTS, DESC_BIBLE_LOOKUP, DESC_COMMENTARY_LOOKUP,
  DESC_PARALLEL_TEXT, DESC_CONFESSIONAL_LOOKUP, DESC_LITURGICAL_LOOKUP,
  DESC_QUERY_CONTROVERSIES,
} from './tool-descriptions.js';
// Single source of truth for the served version. Bundled in at build time from
// package.json, which the release commit bumps — so serverInfo/health can never
// silently drift from the plugin version again.
import { version as SERVER_VERSION } from '../package.json';

// ─── CORS ─────────────────────────────────────────────────────────────────────

// CORS is not required for MCP clients (Claude Desktop, Claude Code are native
// apps, not browsers). It is included to enable browser-based callers (web tools,
// debugging UIs). Applied to all responses including the MCP transport response.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

// ─── Response cache ───────────────────────────────────────────────────────────

// Cache MCP tool results keyed by a version-prefixed namespace + tool name +
// sorted args JSON: `https://cache/<CACHE_VERSION>/<tool>/<sorted-args>`.
// Cache intercepts inside the CallTool handler before MCP serialization.
//
// Invalidation contract: a Cloudflare Worker cannot enumerate or purge
// `caches.default` — there is no API to list or delete-by-prefix. Global
// invalidation is therefore achieved by bumping CACHE_VERSION (either this
// constant, on a code deploy, or the env.CACHE_VERSION override, for an
// operational bump without a deploy — e.g. after a D1 data backfill).
// Bumping the version changes every cache key's namespace, so all subsequent
// requests miss and re-read current D1 data; entries under the orphaned
// namespace are never actively deleted — they are simply never matched again
// and are left for the platform's TTL/LRU reaping. The 24h `max-age=86400`
// TTL below is therefore also the upper bound on staleness: even without a
// version bump, any entry self-expires within 24h of being written.
const DEFAULT_CACHE_VERSION = 'v8';

// Per-request context: the ExecutionContext (used to schedule non-blocking
// cache writes via waitUntil) and the resolved cache-version namespace.
// Captured once per request in fetch() and threaded through createServer()'s
// closure — see C2 in the design doc for why this must NOT be module-global
// mutable state (ctx is per-request-distinct, unlike env.DB).
interface RequestCtx {
  ctx?: ExecutionContext;
  cacheVersion: string;
}

interface PageableCollection {
  getRecords(data: Record<string, unknown>): unknown[];
  replaceRecords(data: Record<string, unknown>, records: unknown[]): Record<string, unknown>;
}

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function registerReadOnlyTool<Input extends ZodType, Output extends ZodType>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Input;
    outputSchema: Output;
  },
  handler: ToolCallback<Input>,
): void {
  server.registerTool<Output, Input>(name, {
    ...config,
    inputSchema: mcpObjectSchema(config.inputSchema),
    outputSchema: mcpObjectSchema(config.outputSchema),
    annotations: READ_ONLY_ANNOTATIONS,
  }, handler);
}

function collection(field: string): PageableCollection {
  return {
    getRecords: data => Array.isArray(data[field]) ? data[field] as unknown[] : [],
    replaceRecords: (data, records) => ({ ...data, [field]: records }),
  };
}

const PAGEABLE_COLLECTIONS: Record<string, PageableCollection> = {
  query_discourse_features: {
    getRecords: data => {
      const featureRecords = Object.entries((data.features ?? {}) as Record<string, unknown[]>)
        .flatMap(([feature, rows]) => rows.map(row => ({ record_type: 'feature', feature, ...(row as object) })));
      const boundaryRecords = Array.isArray(data.word_level_boundaries)
        ? data.word_level_boundaries.map(row => ({ record_type: 'boundary', ...(row as object) }))
        : [];
      return [...featureRecords, ...boundaryRecords].sort((leftValue, rightValue) => {
        const left = leftValue as Record<string, unknown>;
        const right = rightValue as Record<string, unknown>;
        return Number(left.chapter) - Number(right.chapter)
          || Number(left.verse) - Number(right.verse)
          || Number(left.word_position ?? 0) - Number(right.word_position ?? 0)
          || String(left.record_type).localeCompare(String(right.record_type));
      });
    },
    replaceRecords: (data, records) => {
      const { features: _features, word_level_boundaries: _boundaries, ...rest } = data;
      return { ...rest, records };
    },
  },
  query_vocabulary: {
    getRecords: data => {
      const field = data.response_type === 'themed' ? 'thematic_matches' : 'lemmas';
      return Array.isArray(data[field]) ? data[field] as unknown[] : [];
    },
    replaceRecords: (data, records) => {
      const field = data.response_type === 'themed' ? 'thematic_matches' : 'lemmas';
      return { ...data, [field]: records };
    },
  },
  query_morphology: collection('words'),
  query_ot_quotes: collection('quotes'),
  query_lemmas: collection('lemmas'),
  query_theme_distribution: collection('books'),
  query_lexicon: collection('entries'),
  query_cross_references: collection('cross_references'),
  query_people: collection('people'),
  query_places: collection('places'),
  query_events: collection('events'),
  query_person_network: {
    getRecords: data => {
      const relationships = Array.isArray(data.relationships)
        ? data.relationships.map(item => ({ connection_type: 'relationship', depth_level: 1, ...(item as object) }))
        : [];
      const coAppearances = Array.isArray(data.co_appearances)
        ? data.co_appearances.map(item => ({ connection_type: 'co_appearance', depth_level: 1, ...(item as object) }))
        : [];
      const expanded = Array.isArray(data.expanded_network)
        ? data.expanded_network.flatMap(entryValue => {
            const entry = entryValue as Record<string, unknown>;
            const source = entry.person as Record<string, unknown>;
            const depthLevel = entry.depth_level === 3 ? 3 : 2;
            return Array.isArray(entry.relationships)
              ? entry.relationships.map(item => ({
                  connection_type: 'expanded_relationship',
                  source_name: source.name,
                  source_slug: source.slug,
                  depth_level: depthLevel,
                  ...(item as object),
                }))
              : [];
          })
        : [];
      return [...relationships, ...coAppearances, ...expanded];
    },
    replaceRecords: (data, records) => {
      const {
        relationships: _relationships,
        co_appearances: _coAppearances,
        expanded_network: _expanded,
        ...rest
      } = data;
      return { ...rest, connections: records };
    },
  },
  query_speakers: collection('quotations'),
  query_syntax: collection('annotations'),
  query_ot_structure: collection('boundaries'),
  query_variants: collection('variants'),
  bible_lookup: collection('verses'),
  commentary_lookup: {
    getRecords: data => Array.isArray(data.commentaries)
      ? data.commentaries.flatMap(groupValue => {
          const group = groupValue as Record<string, unknown>;
          return Array.isArray(group.entries)
            ? group.entries.map(entry => ({
                commentary: group.commentary,
                attribution: group.attribution,
                ...(entry as object),
              }))
            : [];
        })
      : [],
    replaceRecords: (data, records) => {
      const { commentaries: _commentaries, ...rest } = data;
      return { ...rest, entries: records };
    },
  },
  parallel_text: collection('verses'),
  confessional_lookup: {
    getRecords: data => {
      if (!Array.isArray(data.documents)) return [];
      if (data.mode === 'list') {
        return data.documents.map(documentValue => {
          const { sections: _sections, ...document } = documentValue as Record<string, unknown>;
          return document;
        });
      }
      return data.documents.flatMap(documentValue => {
        const document = documentValue as Record<string, unknown>;
        const { sections: _sections, ...metadata } = document;
        return Array.isArray(document.sections)
          ? document.sections.map(section => ({ ...metadata, ...(section as object) }))
          : [];
      });
    },
    replaceRecords: (data, records) => {
      const { documents: _documents, ...rest } = data;
      return { ...rest, results: records };
    },
  },
  liturgical_lookup: {
    getRecords: data => {
      if (!Array.isArray(data.seasons)) return [];
      if (data.mode === 'list') {
        return data.seasons.map(seasonValue => {
          const { readings: _readings, ...season } = seasonValue as Record<string, unknown>;
          return season;
        });
      }
      return data.seasons.flatMap(seasonValue => {
        const season = seasonValue as Record<string, unknown>;
        const { readings: _readings, themes: seasonThemes, ...metadata } = season;
        return Array.isArray(season.readings)
          ? season.readings.map(reading => ({
              ...metadata,
              season_themes: seasonThemes,
              ...(reading as object),
            }))
          : [];
      });
    },
    replaceRecords: (data, records) => {
      const { seasons: _seasons, ...rest } = data;
      return { ...rest, results: records };
    },
  },
  query_controversies: collection('topics'),
};

const OUTPUT_SCHEMAS: Record<string, ZodType> = {
  list_books: ListBooksOutputSchema,
  query_discourse_features: DiscourseOutputSchema,
  query_paragraph_breaks: ParagraphsOutputSchema,
  query_vocabulary: VocabularyOutputSchema,
  query_morphology: MorphologyOutputSchema,
  query_ot_quotes: OtQuotesOutputSchema,
  query_themes_for_lemmas: ThemesOutputSchema,
  query_lemmas: LemmasOutputSchema,
  query_theme_distribution: ThemeDistributionOutputSchema,
  query_lexicon: LexiconOutputSchema,
  check_versification: VersificationOutputSchema,
  query_cross_references: CrossReferencesOutputSchema,
  trace_cross_reference_path: TraceCrossReferencePathOutputSchema,
  query_places: PlacesOutputSchema,
  query_people: PeopleOutputSchema,
  query_events: EventsOutputSchema,
  query_person_network: PersonNetworkOutputSchema,
  query_speakers: SpeakersOutputSchema,
  query_syntax: SyntaxOutputSchema,
  query_ot_structure: OtStructureOutputSchema,
  query_variants: VariantsOutputSchema,
  bible_lookup: BibleLookupOutputSchema,
  commentary_lookup: CommentaryLookupOutputSchema,
  parallel_text: ParallelTextOutputSchema,
  confessional_lookup: ConfessionalLookupOutputSchema,
  liturgical_lookup: LiturgicalLookupOutputSchema,
  query_controversies: ControversiesOutputSchema,
};

const INPUT_SCHEMAS: Record<string, ZodType> = {
  list_books: ListBooksInputSchema,
  query_discourse_features: DiscourseInputSchema,
  query_paragraph_breaks: ParagraphsInputSchema,
  query_vocabulary: VocabularyInputSchema,
  query_morphology: MorphologyInputSchema,
  query_ot_quotes: OtQuotesInputSchema,
  query_themes_for_lemmas: ThemesInputSchema,
  query_lemmas: LemmasInputSchema,
  query_theme_distribution: ThemeDistributionInputSchema,
  query_lexicon: LexiconInputSchema,
  check_versification: VersificationInputSchema,
  query_cross_references: CrossReferencesInputSchema,
  trace_cross_reference_path: TraceCrossReferencePathInputSchema,
  query_places: PlacesInputSchema,
  query_people: PeopleInputSchema,
  query_events: EventsInputSchema,
  query_person_network: PersonNetworkInputSchema,
  query_speakers: SpeakersInputSchema,
  query_syntax: SyntaxInputSchema,
  query_ot_structure: OtStructureInputSchema,
  query_variants: VariantsInputSchema,
  bible_lookup: BibleLookupInputSchema,
  commentary_lookup: CommentaryLookupInputSchema,
  parallel_text: ParallelTextInputSchema,
  confessional_lookup: ConfessionalLookupInputSchema,
  liturgical_lookup: LiturgicalLookupInputSchema,
  query_controversies: ControversiesInputSchema,
};

function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

// Pure key-derivation seam: builds the cache key URL from an already-resolved
// version, the tool name, and the (stably-stringified) sorted args.
export function cacheKeyUrl(version: string, name: string, sortedArgs: string): string {
  return `https://cache/${version}/${name}/${encodeURIComponent(sortedArgs)}`;
}

// Resolves the cache-version namespace for a request: env.CACHE_VERSION wins
// when set to a non-empty string; otherwise falls back to DEFAULT_CACHE_VERSION.
// Uses `||` (not `??`) so an empty-string override is treated as unset rather
// than producing a broken `https://cache//...` key.
export function resolveCacheVersion(env: { CACHE_VERSION?: string }): string {
  return env.CACHE_VERSION || DEFAULT_CACHE_VERSION;
}

export async function runCachedToolCall(
  name: string,
  args: Record<string, unknown>,
  handler: () => Promise<CallToolResult>,
  reqCtx: RequestCtx
): Promise<CallToolResult> {
  const sortedArgs = stableStringify(args);
  const cacheKey = new Request(cacheKeyUrl(reqCtx.cacheVersion, name, sortedArgs));
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return JSON.parse(await cached.text()) as CallToolResult;
  }

  const result = await handler();
  const response = new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
  });
  try {
    const put = cache.put(cacheKey, response.clone()).catch(() => {});
    if (reqCtx.ctx) reqCtx.ctx.waitUntil(put); else void put;
  } catch {
    // Cache scheduling failures are non-fatal — the handler result is still returned
  }
  return result;
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

// Per-request McpServer instance. The MCP SDK's Protocol.connect() is single-use
// — calling it twice on the same Server throws "Already connected". Creating
// per request is cheap (constructor only sets up handler maps, no I/O).
export function createServer(reqCtx: RequestCtx): McpServer {
  const server = new McpServer(
    { name: 'claude-of-alexandria-mcp', version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  // Bound-local closure over this request's reqCtx — the ~28 call sites below
  // are unchanged; each resolves to the per-request cache version + ExecutionContext.
  const cachedToolCall = (
    name: string,
    args: Record<string, unknown>,
    handler: () => Promise<CallToolResult>
  ) => {
    const normalizedArgs = INPUT_SCHEMAS[name]!.parse(args) as Record<string, unknown>;
    return runCachedToolCall(name, normalizedArgs, async () => {
      const result = await handler();
      const pageable = PAGEABLE_COLLECTIONS[name];
      const pagedResult = pageable
        ? await paginateCallResult({
            tool: name,
            args: normalizedArgs,
            cacheVersion: reqCtx.cacheVersion,
            result,
            ...pageable,
          })
        : result;
      if (pagedResult.isError || !pagedResult.structuredContent) return pagedResult;
      return successResult(OUTPUT_SCHEMAS[name]!, pagedResult.structuredContent);
    }, reqCtx);
  };

  registerReadOnlyTool(server, 'list_books', {
    title: 'List Biblical Books',
    description: DESC_LIST_BOOKS,
    inputSchema: ListBooksInputSchema,
    outputSchema: ListBooksOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('list_books', { ...args }, () => listBooks(args))
  );

  registerReadOnlyTool(server, 'query_discourse_features', {
    title: 'Query Discourse Features',
    description: DESC_DISCOURSE,
    inputSchema: DiscourseInputSchema,
    outputSchema: DiscourseOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_discourse_features', { ...args }, () => queryDiscourseFeatures(args))
  );

  registerReadOnlyTool(server, 'query_paragraph_breaks', {
    title: 'Query Paragraph Breaks',
    description: DESC_PARAGRAPHS,
    inputSchema: ParagraphsInputSchema,
    outputSchema: ParagraphsOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_paragraph_breaks', { ...args }, () => queryParagraphBreaks(args))
  );

  registerReadOnlyTool(server, 'query_vocabulary', {
    title: 'Query Vocabulary',
    description: DESC_VOCABULARY,
    inputSchema: VocabularyInputSchema,
    outputSchema: VocabularyOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_vocabulary', { ...args }, () => queryVocabulary(args))
  );

  registerReadOnlyTool(server, 'query_morphology', {
    title: 'Query Morphology',
    description: DESC_MORPHOLOGY,
    inputSchema: MorphologyInputSchema,
    outputSchema: MorphologyOutputSchema,
  }, async (args, _extra) => {
    // Normalize fields: omitting and passing "basic" must produce the same cache key
    // Normalize strongs_filter: H430 → H0430 (4-digit zero-padded) for consistent cache keys
    let normalizedStrongs = args.strongs_filter;
    if (normalizedStrongs) {
      const match = normalizedStrongs.match(/^([HG])0*(\d+)([a-z]?)$/);
      if (match) {
        normalizedStrongs = `${match[1]}${match[2].padStart(4, '0')}${match[3]}`;
      }
    }
    const normalizedArgs = {
      ...args,
      fields: args.fields ?? 'basic',
      ...(normalizedStrongs !== undefined && { strongs_filter: normalizedStrongs }),
    };
    return cachedToolCall(
      'query_morphology',
      { ...normalizedArgs },
      () => queryMorphology(normalizedArgs)
    );
  });

  registerReadOnlyTool(server, 'query_ot_quotes', {
    title: 'Query OT Quotations in NT',
    description: DESC_OT_QUOTES,
    inputSchema: OtQuotesInputSchema,
    outputSchema: OtQuotesOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_ot_quotes', { ...args }, () => queryOtQuotes(args))
  );

  registerReadOnlyTool(server, 'query_themes_for_lemmas', {
    title: 'Resolve Lemmas to Themes',
    description: DESC_THEMES,
    inputSchema: ThemesInputSchema,
    outputSchema: ThemesOutputSchema,
  }, async (args, _extra) => {
    // Normalize lemmas BEFORE cachedToolCall so identical sets produce the same cache key.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_themes_for_lemmas',
      { ...normalizedArgs },
      () => queryThemesForLemmas({ ...args, lemmas: normalizedLemmas })
    );
  });

  registerReadOnlyTool(server, 'query_lemmas', {
    title: 'Query Lemma Distribution',
    description: DESC_LEMMAS,
    inputSchema: LemmasInputSchema,
    outputSchema: LemmasOutputSchema,
  }, async (args, _extra) => {
    // Normalize lemmas: dedup + sort for cache key stability.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_lemmas',
      { ...normalizedArgs },
      () => queryLemmas(normalizedArgs)
    );
  });

  registerReadOnlyTool(server, 'query_theme_distribution', {
    title: 'Query Theme Distribution',
    description: DESC_THEME_DISTRIBUTION,
    inputSchema: ThemeDistributionInputSchema,
    outputSchema: ThemeDistributionOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_theme_distribution', { ...args }, () => queryThemeDistribution(args))
  );

  registerReadOnlyTool(server, 'query_lexicon', {
    title: 'Query Lexicon',
    description: DESC_LEXICON,
    inputSchema: LexiconInputSchema,
    outputSchema: LexiconOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_lexicon', { ...args }, () => queryLexicon(args))
  );

  registerReadOnlyTool(server, 'check_versification', {
    title: 'Check Versification',
    description: DESC_VERSIFICATION,
    inputSchema: VersificationInputSchema,
    outputSchema: VersificationOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('check_versification', { ...args }, () => checkVersification(args))
  );

  registerReadOnlyTool(server, 'query_cross_references', {
    title: 'Query Cross-References',
    description: DESC_CROSS_REFERENCES,
    inputSchema: CrossReferencesInputSchema,
    outputSchema: CrossReferencesOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_cross_references', { ...args }, () => queryCrossReferences(args))
  );

  registerReadOnlyTool(server, 'trace_cross_reference_path', {
    title: 'Trace Cross-Reference Path',
    description: DESC_TRACE_CROSS_REFERENCE_PATH,
    inputSchema: TraceCrossReferencePathInputSchema,
    outputSchema: TraceCrossReferencePathOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('trace_cross_reference_path', { ...args }, () => traceCrossReferencePath(args))
  );

  registerReadOnlyTool(server, 'query_places', {
    title: 'Query Places',
    description: DESC_PLACES,
    inputSchema: PlacesInputSchema,
    outputSchema: PlacesOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_places', { ...args }, () => queryPlaces(args))
  );

  registerReadOnlyTool(server, 'query_people', {
    title: 'Query People',
    description: DESC_PEOPLE,
    inputSchema: PeopleInputSchema,
    outputSchema: PeopleOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_people', { ...args }, () => queryPeople(args))
  );

  registerReadOnlyTool(server, 'query_events', {
    title: 'Query Events',
    description: DESC_EVENTS,
    inputSchema: EventsInputSchema,
    outputSchema: EventsOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_events', { ...args }, () => queryEvents(args))
  );

  registerReadOnlyTool(server, 'query_person_network', {
    title: 'Query Person Network',
    description: DESC_PERSON_NETWORK,
    inputSchema: PersonNetworkInputSchema,
    outputSchema: PersonNetworkOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_person_network', { ...args }, () => queryPersonNetwork(args))
  );

  registerReadOnlyTool(server, 'query_speakers', {
    title: 'Query Speaker Quotations',
    description: DESC_SPEAKERS,
    inputSchema: SpeakersInputSchema,
    outputSchema: SpeakersOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_speakers', { ...args }, () => speakersQuery(args))
  );

  registerReadOnlyTool(server, 'query_syntax', {
    title: 'Query Syntax Annotations',
    description: DESC_SYNTAX,
    inputSchema: SyntaxInputSchema,
    outputSchema: SyntaxOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_syntax', { ...args }, () => querySyntax(args))
  );

  registerReadOnlyTool(server, 'query_ot_structure', {
    title: 'Query OT Structure',
    description: DESC_OT_STRUCTURE,
    inputSchema: OtStructureInputSchema,
    outputSchema: OtStructureOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_ot_structure', { ...args }, () => queryOtStructure(args))
  );

  registerReadOnlyTool(server, 'query_variants', {
    title: 'Query Textual Variants',
    description: DESC_VARIANTS,
    inputSchema: VariantsInputSchema,
    outputSchema: VariantsOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_variants', { ...args }, () => queryVariants(args))
  );

  registerReadOnlyTool(server, 'bible_lookup', {
    title: 'Look Up Bible Text',
    description: DESC_BIBLE_LOOKUP,
    inputSchema: BibleLookupInputSchema,
    outputSchema: BibleLookupOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('bible_lookup', { ...args }, () => bibleLookup(args))
  );

  registerReadOnlyTool(server, 'commentary_lookup', {
    title: 'Look Up Commentary',
    description: DESC_COMMENTARY_LOOKUP,
    inputSchema: CommentaryLookupInputSchema,
    outputSchema: CommentaryLookupOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('commentary_lookup', { ...args }, () => commentaryLookup(args))
  );

  registerReadOnlyTool(server, 'parallel_text', {
    title: 'Parallel Text Comparison',
    description: DESC_PARALLEL_TEXT,
    inputSchema: ParallelTextInputSchema,
    outputSchema: ParallelTextOutputSchema,
  }, async (args, _extra) => {
    // Normalize translations array for cache key stability (sort before caching)
    const translations: ParallelTextInput['translations'] = [...new Set(args.translations)].sort();
    const normalizedArgs = { ...args, translations };
    return cachedToolCall(
      'parallel_text',
      { ...normalizedArgs },
      () => parallelText(normalizedArgs)
    );
  });

  registerReadOnlyTool(server, 'confessional_lookup', {
    title: 'Confessional Lookup',
    description: DESC_CONFESSIONAL_LOOKUP,
    inputSchema: ConfessionalLookupInputSchema,
    outputSchema: ConfessionalLookupOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('confessional_lookup', { ...args }, () =>
      confessionalLookup(args)
    )
  );

  registerReadOnlyTool(server, 'liturgical_lookup', {
    title: 'Liturgical Lookup',
    description: DESC_LITURGICAL_LOOKUP,
    inputSchema: LiturgicalLookupInputSchema,
    outputSchema: LiturgicalLookupOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('liturgical_lookup', { ...args }, () =>
      liturgicalLookup(args)
    )
  );

  registerReadOnlyTool(server, 'query_controversies', {
    title: 'Query Controversies',
    description: DESC_QUERY_CONTROVERSIES,
    inputSchema: ControversiesInputSchema,
    outputSchema: ControversiesOutputSchema,
  }, async (args, _extra) =>
    cachedToolCall('query_controversies', { ...args }, () =>
      queryControversies(args)
    )
  );

  return server;
}

// ─── Worker entry point ───────────────────────────────────────────────────────

// AUTH BOUNDARY: This server is intentionally unauthenticated. It serves read-only,
// public-domain biblical reference data. If write operations, user-specific data,
// or administrative endpoints are ever added, authentication becomes mandatory.

interface Env {
  DB: D1Database;
  CACHE_VERSION?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check with D1 connectivity probe
    if (url.pathname === '/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return new Response(
          JSON.stringify({ status: 'ok', version: SERVER_VERSION, db: 'connected' }),
          { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      } catch {
        return new Response(
          JSON.stringify({ status: 'degraded', version: SERVER_VERSION, db: 'unreachable' }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
    }

    // Only /mcp path is handled by MCP transport
    if (url.pathname !== '/mcp') {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    // Stateless Workers cannot maintain long-lived SSE connections.
    // Return 405 for GET so MCP clients (mcp-remote, Claude Code) fall back to POST-only mode.
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'POST, OPTIONS', ...CORS_HEADERS },
      });
    }

    // Inject D1 binding for this request
    setDb(env.DB);

    // Per-request context: ExecutionContext + resolved cache-version namespace.
    const reqCtx: RequestCtx = { ctx, cacheVersion: resolveCacheVersion(env) };

    // Per-request Server and transport
    const server = createServer(reqCtx);
    // Stateless mode: sessionIdGenerator omitted intentionally.
    // Per-request transports require stateless mode — each request creates a new
    // transport with no session history. Stateful mode would reject all non-initialize
    // requests because the new transport has no knowledge of the session ID issued
    // by a previous transport instance.
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);

    // Apply CORS headers to transport response (enables browser-based callers)
    const mcpResponse = await transport.handleRequest(request);
    const responseHeaders = new Headers(mcpResponse.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v);
    }
    return new Response(mcpResponse.body, { status: mcpResponse.status, headers: responseHeaders });
  },
};
