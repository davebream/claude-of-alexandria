# Remote MCP Server — Design Document

**Date:** 2026-02-19
**Status:** Revised (post-review)
**Goal:** Eliminate the local Node.js/SQLite MCP server by deploying to Cloudflare Workers + D1. Reduce installation to zero local dependencies for Claude Desktop users, and remove the 71MB database blob from the repository.
**Version:** 1.5.0

---

## Problem

The v1.3.0 MCP server works, but the deployment model is wrong for the audience:

1. **71MB SQLite database** in the git repository. GitHub warns on every push.
2. **Node.js required** on the user's machine — just to serve biblical reference data.
3. **Build step** (`npm install && npm run build`) before the plugin works. Non-technical users (pastors, seminary students) will not do this.
4. **Three-step Claude Desktop setup** that we documented in v1.3.0 and immediately recognized as too complex.

The MCP protocol itself is fine. The tools are fine. The data is fine. The problem is running a local server process to serve 130MB of pre-built data.

## Solution

Deploy the existing MCP server to Cloudflare Workers with D1 (edge SQLite). The user's MCP configuration becomes a single URL. No local server, no Node.js, no build step, no database file.

### What changes

| Component | Before | After |
| --------- | ------ | ----- |
| Runtime | Node.js + sql.js (local) | Cloudflare Workers (remote) |
| Database | `biblical.sqlite` file (71MB) | D1 database (edge SQLite) |
| Transport | stdio (child process) | Streamable HTTP (Web Standard) |
| Installation | Clone + npm install + npm run build | One URL in MCP config |
| Repository | Ships database + server source | Ships server source only |
| Offline | Yes | No (skills fall back to training memory) |

### What stays the same

| Component | Lines | Changes |
| --------- | ----- | ------- |
| 3 tool handlers (`discourse.ts`, `paragraphs.ts`, `vocabulary.ts`) | ~270 | Zero — they call `query()` and `queryFirst()`, which we preserve as the interface |
| `morphology.ts` | ~90 | Import path only — `expandParsing` moves from `'../db/query.js'` to `'../db/parsing.js'` |
| Book lookup (`books.ts`) | 177 | Zero — static map, no database dependency |
| Parsing expansion (`expandParsing`) | 30 | Extracted to its own module (`parsing.ts`) — pure function, no database dependency |
| Build script (`build-db.ts`) | 429 | Stays as-is, used pre-deployment to generate SQL import |
| Database schema (`schema.sql`) | — | Zero — D1 is standard SQLite |

---

## Architecture

```
Before (v1.3.0):
  Claude Code/Desktop → stdio pipe → Node.js process → sql.js → biblical.sqlite (local)

After (v1.5.0):
  Claude Code/Desktop → HTTP → CF Worker → D1 → biblical.sqlite (edge)
```

### User-facing MCP Configuration

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "url": "https://claude-of-alexandria-mcp.<account>.workers.dev/mcp"
    }
  }
}
```

**Claude Code** (`.mcp.json` in plugin):
```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "url": "https://claude-of-alexandria-mcp.<account>.workers.dev/mcp"
    }
  }
}
```

Both become a single URL. No `command`, no `args`, no `env`.

---

## Access Control

The API serves read-only, public-domain biblical reference data. No authentication is required.

- All data is derived from publicly available linguistic resources (Levinsohn discourse features, Masoretic paragraph markers, open morphological parsings).
- The endpoint is read-only — no write operations exist.
- Cloudflare Workers free tier limits (100K requests/day) provide natural throttling.
- If abuse occurs, Cloudflare's built-in rate limiting rules can be added via the dashboard without code changes.

This is a deliberate architectural decision, not an oversight.

**Boundary condition:** If the server ever gains write operations, user-specific data, or administrative endpoints, authentication becomes mandatory. This constraint must be documented as a code comment in the Worker entry point.

---

## Query Interface Contract

Both the local and remote implementations must satisfy these function signatures. The tool handlers depend on this interface and must not change.

```typescript
// db/query.ts
export type QueryResult = Record<string, unknown>[];
export function query(sql: string, params?: unknown[]): Promise<QueryResult>;
export function queryFirst(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null>;

// db/parsing.ts (extracted from query.ts — pure function, no DB dependency)
export function expandParsing(compact: string | null): Record<string, string> | null;
```

Tool handlers import from these two modules. As long as the contract holds, they require zero changes.

---

## Implementation Plan

### Step 1: Create Workers Project

New directory alongside the existing server. The local server directory (`claude-of-alexandria-mcp/`) is kept during development only and will be removed as part of this release (Step 10). During the overlap period, any bug fix to tool handlers must be applied to both directories.

```
plugins/claude-of-alexandria/servers/
├── claude-of-alexandria-mcp/          # Existing local server (removed in Step 10)
└── claude-of-alexandria-mcp-worker/   # New Workers deployment
    ├── src/
    │   ├── index.ts                   # Worker entry point + MCP HTTP handler
    │   ├── db/
    │   │   ├── query.ts               # D1 query wrapper (replaces sql.js version)
    │   │   ├── parsing.ts             # expandParsing (extracted, no DB dependency)
    │   │   └── books.ts               # Copy from existing (no changes)
    │   └── tools/
    │       ├── discourse.ts           # Copy from existing (no changes)
    │       ├── paragraphs.ts          # Copy from existing (no changes)
    │       ├── vocabulary.ts          # Copy from existing (no changes)
    │       ├── morphology.ts          # Import path update: expandParsing from '../db/parsing.js'
    │       └── utils.ts               # Copy from existing (no changes)
    ├── scripts/
    │   ├── export-d1.ts               # Export biblical.sqlite → chunked SQL files
    │   └── seed-d1.sh                 # Upload chunks to D1
    ├── wrangler.toml                  # Workers + D1 config
    ├── package.json
    └── tsconfig.json
```

### Step 2: Extract `expandParsing` and Rewrite Query Layer for D1

First, extract `expandParsing` from `query.ts` into `db/parsing.ts`. It is a pure transformation function with no database dependency — it lives in `query.ts` only by historical accident. Tool handlers that import it will update their import path.

Then rewrite `src/db/query.ts` for D1:

```typescript
import type { D1Database } from '@cloudflare/workers-types';

export type QueryResult = Record<string, unknown>[];

let _db: D1Database;

export function setDb(db: D1Database) {
  _db = db;
}

export async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const result = await _db.prepare(sql).bind(...params).all();
  return result.results as QueryResult;
}

export async function queryFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const result = await _db.prepare(sql).bind(...params).first();
  return result as Record<string, unknown> | null;
}
```

The `setDb()` function receives the D1 binding from the Worker's `env` on each request. The module-level `_db` variable is safe because D1 bindings are identical across all requests within the same Workers isolate — `env.DB` always resolves to the same D1 database object, so concurrent overwrites are harmless. This is a Cloudflare Workers implementation detail, not a guarantee about request serialization.

### Step 3: Worker Entry Point with MCP HTTP Transport

The MCP SDK provides `WebStandardStreamableHTTPServerTransport` in `webStandardStreamableHttp.js` for environments that use Web Standard `Request`/`Response` (Cloudflare Workers, Deno, Bun). The Node.js-specific `StreamableHTTPServerTransport` wraps `IncomingMessage`/`ServerResponse` and will not work in Workers.

**Both the `Server` instance and the transport are created per-request.** The MCP SDK's `Protocol.connect()` throws `"Already connected"` if `_transport` is already set, and transport cleanup after a request does not clear this field. A module-level `Server` would crash on the second request within the same isolate. Creating a `Server` per request is trivially cheap — the constructor only sets up handler maps.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { setDb } from './db/query.js';
// ... tool imports, TOOLS array (identical to current index.ts)

// CORS headers — added defensively. Claude Desktop/Code MCP clients may or may not
// require CORS depending on their HTTP implementation. The cost is near zero.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

// Factory: per-request Server instance with handlers registered.
// The MCP SDK's Protocol.connect() is single-use — calling it twice on the same
// Server throws "Already connected". Creating per request is cheap (no I/O).
function createServer(): Server {
  const server = new Server(
    { name: 'claude-of-alexandria-mcp', version: '1.5.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Identical to current index.ts handler, wrapped in try/catch for D1 errors.
    try {
      // ... tool dispatch logic ...
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Database error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  return server;
}

// AUTH BOUNDARY: This server is intentionally unauthenticated. It serves read-only,
// public-domain biblical reference data. If write operations, user data, or admin
// endpoints are ever added, authentication becomes mandatory.

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

    // Inject D1 binding for this request
    setDb(env.DB);

    // Per-request server and transport
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);

    return transport.handleRequest(request);
  },
};
```

### Step 4: Health Check Endpoint

The `GET /health` handler (shown in Step 3) is a readiness check, not just a liveness check. It probes D1 with `SELECT 1` and returns either `{ "status": "ok", "db": "connected" }` or `{ "status": "degraded", "db": "unreachable" }` with a 503 status. This enables monitoring and satisfies the "gracefully degrade when server is unreachable" verification criterion.

### Step 5: Response Caching

Add a Workers Cache API layer for MCP tool responses. Since the biblical reference data is completely static, cache entries never need invalidation.

Cache key: deterministic string from tool name + JSON-stringified args (sorted keys).

```typescript
async function cachedToolCall(name: string, args: Record<string, unknown>, handler: () => Promise<Response>): Promise<Response> {
  const cacheKey = new Request(`https://cache/${name}/${JSON.stringify(args, Object.keys(args).sort())}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await handler();
  // Clone before caching — response body can only be read once
  await cache.put(cacheKey, response.clone());
  return response;
}
```

This reduces repeated queries from 10-50ms to 0-1ms. Biblical study sessions frequently query the same book/range multiple times, so the hit rate will be high.

**Note:** Caching applies at the MCP tool response level, not the HTTP response level, because the MCP transport wraps tool results in protocol framing. The cache intercept goes inside `CallToolRequestSchema` handler, caching the tool result before MCP serialization.

### Step 6: Wrangler Configuration

```toml
name = "claude-of-alexandria-mcp"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "claude-of-alexandria"
database_id = "<created-by-wrangler>"
```

### Step 7: Database Seeding

The existing `build-db.ts` script produces `biblical.sqlite`. A new `export-d1.ts` script converts it to D1-importable SQL chunks:

1. `export-d1.ts` reads `biblical.sqlite` and produces:
   - `d1-seed/schema.sql` — CREATE TABLE and CREATE INDEX statements (including the optimized morphology covering index `(book, testament, chapter, verse)` which replaces the existing `(book, chapter, verse)` index for better D1 query performance)
   - `d1-seed/morphology-001.sql` through `d1-seed/morphology-NNN.sql` — INSERT batches, max 5000 rows each (keeps each file well under D1's 10MB import limit)
   - `d1-seed/data.sql` — all other tables combined (discourse_features, paragraph_markers, vocabulary, vocabulary_clusters, thematic_keywords — these are small enough to fit in one file)

2. `seed-d1.sh` executes in order:
   ```bash
   #!/bin/bash
   set -e
   DB_NAME="claude-of-alexandria"

   # Schema first
   wrangler d1 execute "$DB_NAME" --file=d1-seed/schema.sql

   # Small tables
   wrangler d1 execute "$DB_NAME" --file=d1-seed/data.sql

   # Morphology in batches
   for chunk in d1-seed/morphology-*.sql; do
     echo "Importing $chunk..."
     wrangler d1 execute "$DB_NAME" --file="$chunk"
   done

   echo "Seeding complete."
   ```

This is a one-time operation, repeated only when the underlying reference data changes.

### Step 8: Update Plugin Configuration

Replace `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "url": "https://claude-of-alexandria-mcp.<account>.workers.dev/mcp"
    }
  }
}
```

### Step 9: Update Documentation

- Root README: Claude Desktop section simplifies to "add URL to config"
- Plugin README: Update architecture section
- Remove build instructions from manual installation path
- Remove MCP server tarball from GitHub Actions release workflow

### Step 10: Remove Local Server from Distribution

Once the remote server is verified and parity-tested:

1. Remove `servers/claude-of-alexandria-mcp/` directory entirely (the Worker directory is the source of truth now)
2. Remove `biblical.sqlite` from git history if desired (BFG or `git filter-repo`)
3. Remove the tarball packaging from `package-desktop.yml`
4. Bump marketplace.json version to 1.5.0

This eliminates the code duplication introduced in Step 1.

### Step 10a: Verify Levinsohn Data Licensing

Before public deployment, confirm that the Levinsohn discourse features data license permits unrestricted public API distribution. If the license restricts distribution, the discourse tool may need to be excluded from the remote server or the data may need to be replaced with an alternative source.

### Step 11: Adapt Parity Test for Remote Endpoint

The existing `scripts/parity-test.py` in the local server directory tests all 4 tools against the SQLite database. Adapt it to also test the remote endpoint:

- Accept a `--url` flag to point at the Workers URL instead of the local server
- Run the same test suite against both local and remote during migration
- Once the local server is removed (Step 10), the remote URL becomes the sole test target

**Parity test specifics:**

- **Inputs tested:** All 4 tools with representative queries — at minimum: a single verse (morphology), a chapter range (discourse), a full book (vocabulary), OT and NT books (paragraphs).
- **"Identical results" means:** Exact JSON structural match after normalizing key ordering. Row ordering must match (both use `ORDER BY` clauses in the SQL). Type coercion differences between sql.js and D1 (e.g., integer vs. string for numeric columns) must be identified and handled with a comparison function that normalizes known acceptable differences.
- **D1 vs sql.js behavioral differences to watch for:** `NULL` handling, `REAL` vs `INTEGER` type affinity, collation ordering for non-ASCII characters (Hebrew/Greek text).

---

## Open Decisions (Resolved During Review)

| Decision | Resolution |
| -------- | ---------- |
| Version number | **1.5.0** — 1.4.0 is already taken by consult-biblical-scholar |
| Levinsohn data licensing | **Needs verification** before public deployment. Must confirm the license permits unrestricted public API distribution. |
| `expandParsing()` CPU budget | **Benchmark first** — deploy and measure; only optimize (pre-expand at build time) if it exceeds Workers free-tier CPU limit |
| Workers Cache API | **Yes, include in v1.5.0** — cache MCP tool responses keyed by tool name + args. Static data, high hit rate expected. |
| Morphology index optimization | **Yes, update schema** — add `(book, testament, chapter, verse)` covering index to `schema.sql` |

---

## D1 Limits and Feasibility

| Limit | D1 Free Tier | Our Usage | Status |
| ----- | ------------ | --------- | ------ |
| Storage | 5 GB | ~71 MB | Well within |
| Reads/day | 5 million | ~100-1000 (generous) | Well within |
| Rows read/query | 500,000 | Morphology max ~30K (one book) | OK |
| Request size | 20 MB response | Morphology max ~2-3 MB | OK |
| Rows written/query | 100,000 | 0 (read-only) | N/A |
| Worker requests/day | 100,000 | ~100-1000 | Well within |

No limit is remotely close to being hit.

---

## Migration Path

The transition can be gradual:

1. **Deploy remote server** alongside existing local server
2. **Run parity tests** against both endpoints — all 4 tools must return identical results
3. **Test with Claude Desktop** using the remote URL
4. **Switch `.mcp.json`** in plugin to point to remote
5. **Release v1.5.0** with remote as default
6. **Remove local server directory and database blob** from repository
7. **Simplify documentation** — the installation docs become a single URL

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Cloudflare outage | Skills fall back to training memory (same as local server misconfiguration). Tool handlers return MCP error responses (`isError: true`) when D1 is unreachable. |
| D1 query performance | Pre-indexed by schema; morphology is the heaviest at ~500K rows but queries are point lookups. First cold request at a new colo may take 200-400ms (isolate startup + D1 cold load + query + serialization). Subsequent requests at the same colo: 10-50ms. The 500ms target is achievable but not "well within" — it is tight for cold starts on large morphology queries. |
| MCP SDK HTTP transport | Use `WebStandardStreamableHTTPServerTransport` (verified in SDK source). Fallback: implement JSON-RPC directly (~100 lines) |
| D1 import size limits | `export-d1.ts` script chunks morphology into 5000-row batches; `seed-d1.sh` imports sequentially |
| Free tier changes | Monitor; the usage is so low that any reasonable paid tier would be cents/month |
| Morphology response size | Full-book queries (e.g., Psalms) can return ~30K rows / 2-3MB. Add a configurable `LIMIT` clause (default 5000 rows) to the morphology tool to prevent unbounded responses. Also verify `expandParsing()` CPU cost on 30K rows fits within Workers free-tier CPU budget (10ms). |

---

## Effort Estimate

| Task | Step | Hours |
| ---- | ---- | ----- |
| Create Workers project, copy shared code, extract `parsing.ts` | 1 | 1-2 |
| Rewrite query.ts for D1 | 2 | 2-3 |
| Worker entry point with HTTP transport, routing, CORS, health check, error handling | 3-4 | 3-5 |
| Response caching with Workers Cache API | 5 | 1-2 |
| Database seeding script (`export-d1.ts` + `seed-d1.sh`) with optimized index | 6-7 | 2-3 |
| Deploy, seed D1, and test | — | 2-3 |
| Adapt parity test with normalized comparison | 11 | 2-3 |
| Update plugin .mcp.json and docs | 8-9 | 1-2 |
| Remove local server, database from repo, update CI | 10 | 1-2 |
| Benchmark `expandParsing()` CPU on full-book morphology query | — | 0.5-1 |
| Verify Levinsohn data licensing | 10a | 0.5-1 |
| **Total** | | **14-25** |

The tool handlers (~360 lines) and book lookup (177 lines) transfer with only one import path change (`morphology.ts`). The work is concentrated in the query layer, the transport layer, caching, and the deployment tooling.

**Note on `export-d1.ts`:** The script should use `sql.js` (WASM SQLite) to read `biblical.sqlite`, matching the existing build environment. Do not introduce a native `sqlite3` dependency that may not be available in CI.

---

## Verification Criteria

- [ ] All 4 MCP tools return identical results to local server (parity test with `--url` flag, normalized comparison)
- [ ] Claude Desktop connects via URL with no local dependencies
- [ ] Claude Code plugin uses remote URL by default
- [ ] `biblical.sqlite` removed from repository
- [ ] D1 free tier metrics confirm low usage
- [ ] Skills gracefully degrade when server is unreachable (MCP error responses with `isError: true`)
- [ ] Response latency acceptable (<500ms for typical queries, including cold starts)
- [ ] Health check endpoint returns 200 OK with D1 connectivity probe
- [ ] Health check returns 503 when D1 is unreachable
- [ ] Local server directory removed — no code duplication in final release
- [ ] CORS preflight requests handled (OPTIONS returns 204)
- [ ] Non-MCP paths return 404
- [ ] `expandParsing()` CPU cost on full-book morphology query fits within Workers CPU budget
