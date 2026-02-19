# Remote MCP Server — Design Document

**Date:** 2026-02-19
**Status:** Reviewed
**Goal:** Eliminate the local Node.js/SQLite MCP server by deploying to Cloudflare Workers + D1. Reduce installation to zero local dependencies for Claude Desktop users, and remove the 71MB database blob from the repository.

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
| 4 tool handlers (`discourse.ts`, `paragraphs.ts`, `vocabulary.ts`, `morphology.ts`) | 359 | Zero — they call `query()` and `queryFirst()`, which we preserve as the interface |
| Book lookup (`books.ts`) | 177 | Zero — static map, no database dependency |
| Parsing expansion (`expandParsing`) | 30 | Extracted to its own module (`parsing.ts`) — pure function, no database dependency |
| Build script (`build-db.ts`) | 429 | Stays as-is, used pre-deployment to generate SQL import |
| Database schema (`schema.sql`) | — | Zero — D1 is standard SQLite |

---

## Architecture

```
Before (v1.3.0):
  Claude Code/Desktop → stdio pipe → Node.js process → sql.js → biblical.sqlite (local)

After (v1.4.0):
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

New directory alongside the existing server. The local server directory (`claude-of-alexandria-mcp/`) is kept during development only and will be removed as part of this release (Step 9). During the overlap period, any bug fix to tool handlers must be applied to both directories.

```
plugins/claude-of-alexandria/servers/
├── claude-of-alexandria-mcp/          # Existing local server (removed in Step 9)
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
    │       ├── morphology.ts          # Copy from existing (no changes)
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

The `setDb()` function receives the D1 binding from the Worker's `env` on each request. The module-level `_db` variable is safe for single-environment Workers deployments.

### Step 3: Worker Entry Point with MCP HTTP Transport

The MCP SDK provides `WebStandardStreamableHTTPServerTransport` in `webStandardStreamableHttp.js` for environments that use Web Standard `Request`/`Response` (Cloudflare Workers, Deno, Bun). The Node.js-specific `StreamableHTTPServerTransport` wraps `IncomingMessage`/`ServerResponse` and will not work in Workers.

The `Server` instance and its handlers are module-level (persist across requests within the same isolate). Only the transport is per-request (stateless).

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

// Module-level server (persists across requests in same isolate)
const server = new Server(
  { name: 'claude-of-alexandria-mcp', version: '1.4.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Identical to current index.ts handler
});

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Inject D1 binding for this request
    setDb(env.DB);

    // Per-request transport (stateless)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);

    return transport.handleRequest(request);
  },
};
```

### Step 4: Health Check Endpoint

Add a simple `GET /health` handler (before MCP routing) that returns `{ "status": "ok", "version": "1.4.0" }`. This enables monitoring and allows the plugin configuration to verify the server is reachable.

### Step 5: Wrangler Configuration

```toml
name = "claude-of-alexandria-mcp"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "claude-of-alexandria"
database_id = "<created-by-wrangler>"
```

### Step 6: Database Seeding

The existing `build-db.ts` script produces `biblical.sqlite`. A new `export-d1.ts` script converts it to D1-importable SQL chunks:

1. `export-d1.ts` reads `biblical.sqlite` and produces:
   - `d1-seed/schema.sql` — CREATE TABLE and CREATE INDEX statements
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

### Step 7: Update Plugin Configuration

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

### Step 8: Update Documentation

- Root README: Claude Desktop section simplifies to "add URL to config"
- Plugin README: Update architecture section
- Remove build instructions from manual installation path
- Remove MCP server tarball from GitHub Actions release workflow

### Step 9: Remove Local Server from Distribution

Once the remote server is verified and parity-tested:

1. Remove `servers/claude-of-alexandria-mcp/` directory entirely (the Worker directory is the source of truth now)
2. Remove `biblical.sqlite` from git history if desired (BFG or `git filter-repo`)
3. Remove the tarball packaging from `package-desktop.yml`
4. Bump marketplace.json version to 1.4.0

This eliminates the code duplication introduced in Step 1. The duplication window exists during development only.

### Step 10: Adapt Parity Test for Remote Endpoint

The existing `scripts/parity-test.py` in the local server directory tests all 4 tools against the SQLite database. Adapt it to also test the remote endpoint:

- Accept a `--url` flag to point at the Workers URL instead of the local server
- Run the same test suite against both local and remote during migration
- Once the local server is removed (Step 9), the remote URL becomes the sole test target

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
5. **Release v1.4.0** with remote as default
6. **Remove local server directory and database blob** from repository
7. **Simplify documentation** — the v1.3.0 installation docs become a single URL

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Cloudflare outage | Skills fall back to training memory (same as local server misconfiguration) |
| D1 query performance | Pre-indexed by schema; morphology is the heaviest at ~500K rows but queries are point lookups. Cold start ~50-100ms, well within 500ms target. |
| MCP SDK HTTP transport | Use `WebStandardStreamableHTTPServerTransport` (verified in SDK source). Fallback: implement JSON-RPC directly (~100 lines) |
| D1 import size limits | `export-d1.ts` script chunks morphology into 5000-row batches; `seed-d1.sh` imports sequentially |
| Free tier changes | Monitor; the usage is so low that any reasonable paid tier would be cents/month |

---

## Effort Estimate

| Task | Hours |
| ---- | ----- |
| Create Workers project, copy shared code, extract `parsing.ts` | 1-2 |
| Rewrite query.ts for D1 | 2-3 |
| Worker entry point with HTTP transport + health check | 2-4 |
| Database seeding script (`export-d1.ts` + `seed-d1.sh`) | 2-3 |
| Deploy, seed D1, and test | 2-3 |
| Adapt parity test for remote endpoint | 1-2 |
| Update plugin .mcp.json and docs | 1-2 |
| Remove local server, database from repo, update CI | 1-2 |
| **Total** | **12-21** |

The tool handlers (359 lines) and book lookup (177 lines) transfer unchanged. The work is concentrated in the query layer, the transport layer, and the deployment tooling.

---

## Verification Criteria

- [ ] All 4 MCP tools return identical results to local server (parity test with `--url` flag)
- [ ] Claude Desktop connects via URL with no local dependencies
- [ ] Claude Code plugin uses remote URL by default
- [ ] `biblical.sqlite` removed from repository
- [ ] D1 free tier metrics confirm low usage
- [ ] Skills gracefully degrade when server is unreachable
- [ ] Response latency acceptable (<500ms for typical queries)
- [ ] Health check endpoint returns 200 OK
- [ ] Local server directory removed — no code duplication in final release
