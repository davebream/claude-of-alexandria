import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { setDb } from './db/query.js';
import { queryDiscourseFeatures } from './tools/discourse.js';
import { queryParagraphBreaks } from './tools/paragraphs.js';
import { queryVocabulary } from './tools/vocabulary.js';
import { queryMorphology } from './tools/morphology.js';

// ─── Tool definitions (identical to local server) ─────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'query_discourse_features',
    description: 'Query Levinsohn NT discourse features (historical present, left dislocation, etc.) for a given book and chapter range. NT books only.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'NT book name (any common form)' },
        features: { type: 'array', items: { type: 'string' }, description: 'Feature names to filter (default: 6 segmentation features)' },
        chapter_range: { type: 'string', description: 'Chapter range: "3", "3-7", or omit for all' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_paragraph_breaks',
    description: 'Query Masoretic paragraph markers (petuchah/setumah) for an OT book. OT books only.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'OT book name (any common form)' },
        chapter_range: { type: 'string', description: 'Chapter range: "3", "3-7", or omit for all' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_vocabulary',
    description: 'Query vocabulary frequencies, thematic keyword matches, and clustering for any biblical book.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'Book name (any common form)' },
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: derived from book)' },
        theme: { type: 'string', description: 'Thematic keyword group (e.g., "joy", "faith")' },
        check_clustering: { type: 'boolean', description: 'Include precomputed vocabulary clusters' },
        min_frequency: { type: 'number', description: 'Minimum lemma frequency (default: 1)' },
        limit: { type: 'number', description: 'Max lemmas returned (default: 200)' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_morphology',
    description: 'Query morphological parsing data for a verse range.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'Book name (any common form)' },
        range: { type: 'string', description: 'Verse range: "1:1-1:11" or "1:6"' },
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: derived from book)' },
        pos_filter: { type: 'string', description: 'Filter by part of speech' },
        word_filter: { type: 'string', description: 'Filter by word form (matches text, normalized, lemma)' },
      },
      required: ['book', 'range'],
    },
  },
];

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
  handler: () => Promise<unknown>
): Promise<unknown> {
  const sortedArgs = stableStringify(args);
  const cacheKey = new Request(`https://cache/${name}/${encodeURIComponent(sortedArgs)}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return JSON.parse(await cached.text()) as unknown;
  }

  const result = await handler();
  const response = new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
  });
  await cache.put(cacheKey, response.clone());
  return result;
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

// Per-request Server instance. The MCP SDK's Protocol.connect() is single-use
// — calling it twice on the same Server throws "Already connected". Creating
// per request is cheap (constructor only sets up handler maps, no I/O).
function createServer(): Server {
  const server = new Server(
    { name: 'claude-of-alexandria-mcp', version: '1.5.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case 'query_discourse_features':
          result = await cachedToolCall(name, toolArgs, () => queryDiscourseFeatures(toolArgs));
          break;
        case 'query_paragraph_breaks':
          result = await cachedToolCall(name, toolArgs, () => queryParagraphBreaks(toolArgs));
          break;
        case 'query_vocabulary':
          result = await cachedToolCall(name, toolArgs, () => queryVocabulary(toolArgs));
          break;
        case 'query_morphology':
          result = await cachedToolCall(name, toolArgs, () => queryMorphology(toolArgs));
          break;
        default:
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` } }) }],
            isError: true,
          };
      }

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Database error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

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
          JSON.stringify({ status: 'ok', version: '1.5.0', db: 'connected' }),
          { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      } catch {
        return new Response(
          JSON.stringify({ status: 'degraded', version: '1.5.0', db: 'unreachable' }),
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
