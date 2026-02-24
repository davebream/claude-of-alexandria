import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { setDb } from './db/query.js';
import { queryDiscourseFeatures, DiscourseInputSchema, DiscourseOutputSchema } from './tools/discourse.js';
import { queryParagraphBreaks, ParagraphsInputSchema, ParagraphsOutputSchema } from './tools/paragraphs.js';
import { queryVocabulary, VocabularyInputSchema, VocabularyOutputSchema } from './tools/vocabulary.js';
import { queryMorphology, MorphologyInputSchema, MorphologyOutputSchema } from './tools/morphology.js';
import { listBooks, ListBooksInputSchema, ListBooksOutputSchema } from './tools/list-books.js';
import { queryOtQuotes, OtQuotesInputSchema, OtQuotesOutputSchema } from './tools/ot-quotes.js';

// ─── Rich tool descriptions ───────────────────────────────────────────────────

const DESC_LIST_BOOKS = `List all available biblical books and their testaments. Use this tool first to discover what data is available before querying specific tools.

Optionally include available thematic keyword groups for use with query_vocabulary's theme parameter.

Args:
  - testament (string, optional): "nt" or "ot" to filter. Omit for all 66 books.
  - include_themes (boolean, optional): Include available thematic keyword groups (default: false)

Returns: { total, ot: string[], nt: string[], available_tools: string[], themes?: {ot: string[], nt: string[]} }`;

const DESC_DISCOURSE = `Query Levinsohn's New Testament discourse features for a given book and chapter range.

Returns discourse-grammatical features like historical present, left dislocation, tail-head linkage, and reported speech markers that signal narrative structure and information flow. NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "John", "1 Cor", "Revelation", "Rom")
  - features (string[], optional): Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage. Use without filter first to see available_features in the response.
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, features: { [name]: [{chapter, verse, word, feature_description}] }, summary: { [name]: count }, available_features: string[] }

Examples:
  - Historical presents in Mark 1-5: book="Mark", chapter_range="1-5", features=["historical_present"]
  - All discourse features in Romans: book="Romans"
  - Left dislocations in John: book="John", features=["left_dislocation"]`;

const DESC_PARAGRAPHS = `Query Masoretic paragraph markers (petuchah and setumah) for an Old Testament book.

Petuchah (open) and setumah (closed) markers are ancient paragraph divisions in the Hebrew Masoretic text that indicate structural breaks in the narrative or discourse. OT books only.

Args:
  - book (string, required): OT book name in any common form (e.g., "Genesis", "Gen", "Psalms", "Isa")
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, markers: [{chapter, verse, type}], summary: {petuchot, setumot, total} }

Examples:
  - All markers in Genesis 1-3: book="Genesis", chapter_range="1-3"
  - Paragraph structure of Isaiah: book="Isaiah"`;

const DESC_VOCABULARY = `Query vocabulary frequencies, thematic keyword matches, and clustering data for any biblical book.

Returns lemma frequencies broken down by chapter, with optional thematic filtering (e.g., "joy", "faith") and concentration clustering analysis. Works for both OT and NT books.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "Psalms")
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted
  - theme (string, optional): Thematic keyword group to filter by (e.g., "joy", "faith", "covenant"). If the theme is not found, the error response lists all available themes for that testament.
  - check_clustering (boolean, optional): Include precomputed vocabulary concentration clusters showing where lemmas are concentrated within the book
  - min_frequency (number, optional): Minimum total lemma frequency to include (default: 1)
  - limit (number, optional): Max lemmas returned (default: 200, max: 500)

Returns (without theme): { response_type: "full", book, testament, lemmas: [{lemma, total, by_chapter: {ch: count}}], total_lemmas, returned, clustering }
Returns (with theme): { response_type: "themed", book, testament, theme, thematic_matches: [{lemma, total, by_chapter}], clustering }

Examples:
  - Top vocabulary in Romans: book="Romans", min_frequency=5
  - Joy-related words in Philippians: book="Philippians", theme="joy"
  - Vocabulary clusters in Genesis: book="Genesis", check_clustering=true`;

const DESC_OT_QUOTES = `Query Old Testament quotations found within New Testament books.

Returns quotation data including the quoted Greek text, quote type (direct/allusion/echo), and the OT source passage(s). NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "Romans", "Matt", "Hebrews")
  - range (string, optional): Verse range "8:28-8:39" or single verse "1:23". Omit for entire book.
  - ot_book (string, optional): Filter by OT source book (e.g., "Isaiah", "Isa", "Psalms"). Only returns quotes that have a known source in this book.

Returns: { book, range?, quotes: [{nt_ref, greek_text, quote_type, ot_sources: [{book, chapter, verse, verse_end?, ref}]}], summary: {total, nt_verses_with_quotes, ot_books_referenced} }

Examples:
  - All OT quotes in Romans: book="Romans"
  - Isaiah quotes in Matthew: book="Matthew", ot_book="Isaiah"
  - Quotes in Romans 8: book="Romans", range="8:1-8:39"`;

const DESC_MORPHOLOGY = `Query word-level morphological parsing data for a verse range in any biblical book.

Returns each word with its surface form, normalized form, lemma, part of speech, and full grammatical parsing (case, number, gender, tense, voice, mood, person, degree where applicable).

Args:
  - book (string, required): Book name in any common form (e.g., "John", "Gen", "Hebrews")
  - range (string, required): Verse range as "chapter:verse-chapter:verse" (e.g., "1:1-1:11") or single verse "1:6"
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted
  - pos_filter (string, optional): Filter by part of speech (e.g., "verb", "noun", "adjective", "preposition", "conjunction")
  - word_filter (string, optional): Filter by exact word form — matches against surface text, normalized form, or lemma

Returns: { book, range, testament, words: [{verse, position, text, normalized, lemma, pos, parsing: {case, number, gender, tense, voice, mood, person, degree} | null}], summary: {total_words, by_pos: {pos: count}} }

Examples:
  - All words in John 1:1-1:5: book="John", range="1:1-1:5"
  - Only verbs in Romans 8:1-8:4: book="Romans", range="8:1-8:4", pos_filter="verb"
  - Find occurrences of "logos" in John 1: book="John", range="1:1-1:18", word_filter="logos"`;

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

// Cache MCP tool results keyed by tool name + sorted args JSON.
// Biblical reference data is static — entries never need invalidation.
// Cache intercepts inside the CallTool handler before MCP serialization.
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

async function cachedToolCall(
  name: string,
  args: Record<string, unknown>,
  handler: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  const sortedArgs = stableStringify(args);
  const cacheKey = new Request(`https://cache/${name}/${encodeURIComponent(sortedArgs)}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return JSON.parse(await cached.text()) as CallToolResult;
  }

  const result = await handler();
  const response = new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
  });
  await cache.put(cacheKey, response.clone());
  return result;
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

// Per-request McpServer instance. The MCP SDK's Protocol.connect() is single-use
// — calling it twice on the same Server throws "Already connected". Creating
// per request is cheap (constructor only sets up handler maps, no I/O).
function createServer(): McpServer {
  const server = new McpServer(
    { name: 'claude-of-alexandria-mcp', version: '1.7.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool('list_books', {
    title: 'List Biblical Books',
    description: DESC_LIST_BOOKS,
    inputSchema: ListBooksInputSchema,
    outputSchema: ListBooksOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('list_books', args as unknown as Record<string, unknown>, () => listBooks(args))
  );

  server.registerTool('query_discourse_features', {
    title: 'Query Discourse Features',
    description: DESC_DISCOURSE,
    inputSchema: DiscourseInputSchema,
    outputSchema: DiscourseOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_discourse_features', args as unknown as Record<string, unknown>, () => queryDiscourseFeatures(args))
  );

  server.registerTool('query_paragraph_breaks', {
    title: 'Query Paragraph Breaks',
    description: DESC_PARAGRAPHS,
    inputSchema: ParagraphsInputSchema,
    outputSchema: ParagraphsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_paragraph_breaks', args as unknown as Record<string, unknown>, () => queryParagraphBreaks(args))
  );

  server.registerTool('query_vocabulary', {
    title: 'Query Vocabulary',
    description: DESC_VOCABULARY,
    inputSchema: VocabularyInputSchema,
    outputSchema: VocabularyOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_vocabulary', args as unknown as Record<string, unknown>, () => queryVocabulary(args))
  );

  server.registerTool('query_morphology', {
    title: 'Query Morphology',
    description: DESC_MORPHOLOGY,
    inputSchema: MorphologyInputSchema,
    outputSchema: MorphologyOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_morphology', args as unknown as Record<string, unknown>, () => queryMorphology(args))
  );

  server.registerTool('query_ot_quotes', {
    title: 'Query OT Quotations in NT',
    description: DESC_OT_QUOTES,
    inputSchema: OtQuotesInputSchema,
    outputSchema: OtQuotesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_ot_quotes', args as unknown as Record<string, unknown>, () => queryOtQuotes(args))
  );

  return server;
}

// ─── Worker entry point ───────────────────────────────────────────────────────

// AUTH BOUNDARY: This server is intentionally unauthenticated. It serves read-only,
// public-domain biblical reference data. If write operations, user-specific data,
// or administrative endpoints are ever added, authentication becomes mandatory.

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
          JSON.stringify({ status: 'ok', version: '1.7.0', db: 'connected' }),
          { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      } catch {
        return new Response(
          JSON.stringify({ status: 'degraded', version: '1.7.0', db: 'unreachable' }),
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

    // Per-request Server and transport
    const server = createServer();
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
