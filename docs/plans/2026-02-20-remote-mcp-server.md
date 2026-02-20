# Remote MCP Server (v1.5.0) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Deploy the MCP server to Cloudflare Workers + D1, replacing the local Node.js/SQLite server and eliminating all local installation requirements.

**Architecture:** New Worker directory `claude-of-alexandria-mcp-worker/` alongside the existing local server. The 4 tool handlers copy verbatim. Only the query layer, transport, and entry point are rewritten. After parity testing, the local server and 71MB SQLite blob are removed.

**Tech Stack:** Cloudflare Workers, D1 (edge SQLite), `@modelcontextprotocol/sdk` (WebStandardStreamableHTTPServerTransport), TypeScript, Wrangler CLI, sql.js (build-time only for export script)

**Design doc:** `docs/plans/2026-02-19-remote-mcp-server-design.md` — read it before starting.

---

## Pre-flight Checklist

Before Task 1, verify these are installed:
- `wrangler` CLI: `npx wrangler --version` (needs v3+)
- `node`: `node --version` (needs v18+)
- You are logged in to Cloudflare: `npx wrangler whoami` (if not: `npx wrangler login`)
- The existing `biblical.sqlite` exists at `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/data/biblical.sqlite`
  - If not: `cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp && npm ci && npm run build:db`

---

### Task 0: Verify Levinsohn data licensing (BLOCKING GATE)

**Status:** Must be resolved before Task 9 (deploy) can proceed.

Review the license for the Levinsohn GNT Discourse Features dataset to confirm it permits unrestricted public API distribution without authentication or restrictions.

**Done criteria — one of:**
- License confirmed as permissible for public, unauthenticated API distribution, OR
- Decision made to exclude `query_discourse_features` from the Worker (remove it from the `TOOLS` array in `src/index.ts` and skip seeding the `discourse_features` table in Task 10)

**Gate: Do not execute Task 9 until this task is resolved.**

---

### Task 1: Initialize Worker project structure

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/package.json`
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/tsconfig.json`
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/wrangler.toml`
- Create directories: `src/db/`, `src/tools/`, `scripts/`, `d1-seed/`

**Step 1: Create the directory tree**

```bash
mkdir -p plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/db
mkdir -p plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/tools
mkdir -p plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts
mkdir -p plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/d1-seed
```

**Step 2: Create `package.json`**

```json
{
  "name": "claude-of-alexandria-mcp-worker",
  "version": "1.5.0",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "typecheck": "tsc --noEmit",
    "export-d1": "tsx scripts/export-d1.ts",
    "seed-d1": "bash scripts/seed-d1.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250214.0",
    "@types/node": "^20.0.0",
    "sql.js": "^1.12.0",
    "tsx": "^4.19.3",
    "typescript": "^5.0.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 3: Create `tsconfig.json`**

Workers use Wrangler as bundler — `tsc` is type-check only (`noEmit: true`). Module resolution is `bundler` (Wrangler's default).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: Create `wrangler.toml`**

Leave `database_id` as placeholder — fill it in during Task 9 after `wrangler d1 create`.

```toml
name = "claude-of-alexandria-mcp"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "claude-of-alexandria"
database_id = "REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE"
```

**Step 5: Install dependencies**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker && npm install
```

Expected: `node_modules/` created, no errors.

**Step 6: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/
git commit -m "feat(mcp-worker): initialize Cloudflare Worker project for v1.5.0"
```

---

### Task 2: Copy unchanged source files

These 5 files are **identical** to the local server — zero content changes. Copy each one.

**Files:**
- Create: `src/db/books.ts` — copy from `../claude-of-alexandria-mcp/src/db/books.ts`
- Create: `src/tools/utils.ts` — copy from `../claude-of-alexandria-mcp/src/tools/utils.ts`
- Create: `src/tools/discourse.ts` — copy from `../claude-of-alexandria-mcp/src/tools/discourse.ts`
- Create: `src/tools/paragraphs.ts` — copy from `../claude-of-alexandria-mcp/src/tools/paragraphs.ts`
- Create: `src/tools/vocabulary.ts` — copy from `../claude-of-alexandria-mcp/src/tools/vocabulary.ts`

All paths below are relative to `plugins/claude-of-alexandria/servers/`.

**Step 1: Copy the files**

```bash
BASE_FROM=claude-of-alexandria-mcp/src
BASE_TO=claude-of-alexandria-mcp-worker/src

cp $BASE_FROM/db/books.ts $BASE_TO/db/books.ts
cp $BASE_FROM/tools/utils.ts $BASE_TO/tools/utils.ts
cp $BASE_FROM/tools/discourse.ts $BASE_TO/tools/discourse.ts
cp $BASE_FROM/tools/paragraphs.ts $BASE_TO/tools/paragraphs.ts
cp $BASE_FROM/tools/vocabulary.ts $BASE_TO/tools/vocabulary.ts
```

Run from `plugins/claude-of-alexandria/servers/`.

**Step 2: Verify no accidental changes**

```bash
diff claude-of-alexandria-mcp/src/db/books.ts claude-of-alexandria-mcp-worker/src/db/books.ts
diff claude-of-alexandria-mcp/src/tools/discourse.ts claude-of-alexandria-mcp-worker/src/tools/discourse.ts
```

Expected: no output (files are identical).

**Step 3: Apply server-side cap to `query_vocabulary`**

In `claude-of-alexandria-mcp-worker/src/tools/vocabulary.ts`, find the line that reads the `limit` argument (will look like `?? 200` or similar). Add a `MAX_VOCABULARY_LIMIT` constant and clamp the value:

```typescript
const MAX_VOCABULARY_LIMIT = 500;
const limit = Math.min(Math.max(1, (args.limit as number | undefined) ?? 200), MAX_VOCABULARY_LIMIT);
```

Also find where `min_frequency` is read (will look like `?? 1` or similar) and add a lower bound:

```typescript
const minFrequency = Math.max(0, (args.min_frequency as number | undefined) ?? 1);
```

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/
git commit -m "feat(mcp-worker): copy unchanged tool handlers and books lookup; cap vocabulary limit at 500"
```

---

### Task 3: Create the parsing module and D1 query layer

**Files:**
- Create: `src/db/parsing.ts` — `expandParsing()` extracted from old query.ts (pure function, no DB)
- Create: `src/db/query.ts` — D1 wrapper replacing sql.js

**Step 1: Write `src/db/parsing.ts`**

Extract `expandParsing` from `../claude-of-alexandria-mcp/src/db/query.ts`. This is a pure transformation function — it belongs in its own module.

```typescript
// Expand compact NT parsing back to full form for API responses
const KEY_EXPAND: Record<string, string> = {
  c: 'case', n: 'number', g: 'gender', t: 'tense',
  v: 'voice', m: 'mood', p: 'person', d: 'degree',
};
const VAL_EXPAND: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative',
  sg: 'singular', pl: 'plural', du: 'dual',
  mas: 'masculine', fem: 'feminine', neu: 'neuter',
  prs: 'present', aor: 'aorist', prf: 'perfect', ipf: 'imperfect',
  fut: 'future', plpf: 'pluperfect',
  act: 'active', mid: 'middle', pas: 'passive',
  ind: 'indicative', sub: 'subjunctive', opt: 'optative',
  imp: 'imperative', inf: 'infinitive', ptc: 'participle',
  cmp: 'comparative', sup: 'superlative',
};

export function expandParsing(compact: string | null): Record<string, string> | null {
  if (!compact) return null;
  try {
    const obj = JSON.parse(compact) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[KEY_EXPAND[k] ?? k] = VAL_EXPAND[v] ?? v;
    }
    return out;
  } catch {
    return null;
  }
}
```

**Step 2: Write `src/db/query.ts`**

D1 replacement for the sql.js query wrapper. The `setDb()` function receives the D1 binding from `env` on each request.

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

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/db/
git commit -m "feat(mcp-worker): add D1 query layer and extract parsing module"
```

---

### Task 4: Copy and update morphology.ts

**Files:**
- Create: `src/tools/morphology.ts` — copy from old server, update 1 import, add LIMIT

**Step 1: Copy from old server**

```bash
cp plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/tools/morphology.ts \
   plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/tools/morphology.ts
```

**Step 2: Update import path**

In `src/tools/morphology.ts`, change:
```typescript
import { query, expandParsing } from '../db/query.js';
```
to:
```typescript
import { query } from '../db/query.js';
import { expandParsing } from '../db/parsing.js';
```

**Step 3: Add default LIMIT to unbounded queries**

Add a default limit constant at the top of the file (after the imports):
```typescript
const DEFAULT_MORPHOLOGY_LIMIT = 5000;
```

Find this exact line in `queryMorphology()`:
```typescript
  sql += ' ORDER BY chapter, verse, word_position';
```

Change it to:
```typescript
  sql += ' ORDER BY chapter, verse, word_position LIMIT ?';
  params.push(DEFAULT_MORPHOLOGY_LIMIT);
```

**Important:** The `params.push(DEFAULT_MORPHOLOGY_LIMIT)` line must come after any conditional `params.push` for `posFilter` and `wordFilter`, and immediately before `const rows = await query(sql, params);`. It is the last push before the query executes.

**Step 4: Verify typecheck passes**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker && npm run typecheck
```

Expected: no TypeScript errors. (There will likely be errors about `D1Database` bindings if `@cloudflare/workers-types` is not installed — `npm install` from Task 1 should have handled this.)

**Step 5: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/tools/morphology.ts
git commit -m "feat(mcp-worker): update morphology.ts imports and add 5000-row default limit"
```

---

### Task 5: Write Worker entry point

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/index.ts`

This is the core file. It includes: CORS, health check, MCP routing, per-request Server + transport, response caching, and the auth boundary comment.

**Step 1: Write `src/index.ts`**

```typescript
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
async function cachedToolCall(
  name: string,
  args: Record<string, unknown>,
  handler: () => Promise<unknown>
): Promise<unknown> {
  const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
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
```

**Step 2: Typecheck**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker && npm run typecheck
```

**If you get "Cannot find module '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'":**

Check the installed version: `npm ls @modelcontextprotocol/sdk`. If it's below 1.5.0, the module doesn't exist yet. Update the package.json version requirement and re-run `npm install`.

**If the module truly doesn't exist in the installed version**, check the SDK source:
```bash
ls node_modules/@modelcontextprotocol/sdk/dist/esm/server/
```
Look for a file with "web" or "standard" in the name. Use that import path instead.

Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/src/index.ts
git commit -m "feat(mcp-worker): write Worker entry point with CORS, health check, caching, per-request Server"
```

---

### Task 6: Create D1 schema

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/d1-schema.sql`

This is based on the existing `scripts/schema.sql` in the local server, with one change: the morphology index is updated to a covering index `(book, testament, chapter, verse)` for better D1 query performance.

**Step 1: Create `scripts/d1-schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS discourse_features (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  feature TEXT NOT NULL,
  feature_description TEXT,
  word TEXT
);
CREATE INDEX IF NOT EXISTS idx_discourse_book ON discourse_features(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_discourse_feature ON discourse_features(feature);

CREATE TABLE IF NOT EXISTS paragraph_markers (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  marker_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_markers_book ON paragraph_markers(book, chapter, verse);

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  lemma TEXT NOT NULL,
  frequency INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocab_book_lemma ON vocabulary(book, lemma);
CREATE INDEX IF NOT EXISTS idx_vocab_book_chapter ON vocabulary(book, chapter);
CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);

CREATE TABLE IF NOT EXISTS vocabulary_clusters (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  lemma TEXT NOT NULL,
  concentration REAL NOT NULL,
  chapter_start INTEGER NOT NULL,
  chapter_end INTEGER NOT NULL,
  total_occurrences INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_book ON vocabulary_clusters(book, lemma);

CREATE TABLE IF NOT EXISTS thematic_keywords (
  theme TEXT NOT NULL,
  lemma TEXT NOT NULL,
  testament TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);

CREATE TABLE IF NOT EXISTS morphology (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  word_position INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalized TEXT,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  parsing TEXT
);
-- Covering index: (book, testament, chapter, verse) — replaces (book, chapter, verse)
-- for better D1 performance on the common query pattern in queryMorphology()
CREATE INDEX IF NOT EXISTS idx_morph_range ON morphology(book, testament, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_morph_lemma ON morphology(lemma);
```

**Step 2: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/d1-schema.sql
git commit -m "feat(mcp-worker): add D1 schema with optimized morphology covering index"
```

---

### Task 7: Write the D1 export script

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/export-d1.ts`

This script reads `biblical.sqlite` using sql.js (matching the build environment) and generates:
- `d1-seed/schema.sql` — the schema from Task 6 (just copies it)
- `d1-seed/data.sql` — all tables except `morphology` (small tables, one file)
- `d1-seed/morphology-001.sql` ... `d1-seed/morphology-NNN.sql` — morphology in 5000-row batches

**Step 1: Create `scripts/export-d1.ts`**

```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

// ESM-compatible __dirname (safe in both CJS and ESM/tsx contexts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_DIR = join(__dirname, '..');
const OLD_SERVER_DIR = join(WORKER_DIR, '../claude-of-alexandria-mcp');
const DB_PATH = join(OLD_SERVER_DIR, 'data/biblical.sqlite');
const SCHEMA_SRC = join(WORKER_DIR, 'scripts/d1-schema.sql');
const OUT_DIR = join(WORKER_DIR, 'd1-seed');

const BATCH_SIZE = 5000;

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  // Escape single quotes in strings
  return `'${String(val).replace(/'/g, "''")}'`;
}

function rowsToInsertStatements(table: string, rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return '';
  const colList = columns.join(', ');
  return rows.map(row => {
    const values = columns.map(c => escapeValue(row[c])).join(', ');
    return `INSERT INTO ${table} (${colList}) VALUES (${values});`;
  }).join('\n');
}

async function main() {
  console.log('Loading database from:', DB_PATH);
  const dbBuffer = readFileSync(DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(dbBuffer);

  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Copy schema
  copyFileSync(SCHEMA_SRC, join(OUT_DIR, 'schema.sql'));
  console.log('Wrote d1-seed/schema.sql');

  // 2. Export small tables to data.sql
  const smallTables = [
    { name: 'discourse_features', cols: ['id', 'book', 'chapter', 'verse', 'feature', 'feature_description', 'word'] },
    { name: 'paragraph_markers', cols: ['id', 'book', 'chapter', 'verse', 'marker_type'] },
    { name: 'vocabulary', cols: ['id', 'book', 'testament', 'chapter', 'lemma', 'frequency'] },
    { name: 'vocabulary_clusters', cols: ['id', 'book', 'testament', 'lemma', 'concentration', 'chapter_start', 'chapter_end', 'total_occurrences'] },
    { name: 'thematic_keywords', cols: ['theme', 'lemma', 'testament'] },
  ];

  let dataSql = '-- Small tables (discourse_features, paragraph_markers, vocabulary, vocabulary_clusters, thematic_keywords)\n';
  dataSql += 'BEGIN TRANSACTION;\n\n';

  for (const { name, cols } of smallTables) {
    const stmt = db.prepare(`SELECT ${cols.join(', ')} FROM ${name}`);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    console.log(`  ${name}: ${rows.length} rows`);
    if (rows.length > 0) {
      dataSql += rowsToInsertStatements(name, rows, cols) + '\n\n';
    }
  }

  dataSql += 'COMMIT;\n';
  writeFileSync(join(OUT_DIR, 'data.sql'), dataSql);
  console.log('Wrote d1-seed/data.sql');

  // 3. Export morphology in batches
  const morphCols = ['id', 'book', 'testament', 'chapter', 'verse', 'word_position', 'text', 'normalized', 'lemma', 'pos', 'parsing'];
  const countRow = db.exec('SELECT COUNT(*) FROM morphology')[0];
  const totalRows = countRow.values[0][0] as number;
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
  console.log(`  morphology: ${totalRows} rows → ${totalBatches} batches of ${BATCH_SIZE}`);

  for (let i = 0; i < totalBatches; i++) {
    const offset = i * BATCH_SIZE;
    const stmt = db.prepare(
      `SELECT ${morphCols.join(', ')} FROM morphology ORDER BY id LIMIT ? OFFSET ?`
    );
    stmt.bind([BATCH_SIZE, offset]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();

    const batchNum = String(i + 1).padStart(3, '0');
    const filename = `morphology-${batchNum}.sql`;
    let sql = `-- Morphology batch ${i + 1}/${totalBatches} (rows ${offset + 1}-${offset + rows.length})\n`;
    sql += 'BEGIN TRANSACTION;\n\n';
    sql += rowsToInsertStatements('morphology', rows, morphCols) + '\n\n';
    sql += 'COMMIT;\n';
    writeFileSync(join(OUT_DIR, filename), sql);
    process.stdout.write(`\r  Wrote ${filename} (${i + 1}/${totalBatches})`);
  }
  console.log('\nExport complete.');
  console.log(`Output: ${OUT_DIR}/`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
```

**Step 2: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/export-d1.ts
git commit -m "feat(mcp-worker): add export-d1.ts to convert biblical.sqlite to D1 SQL chunks"
```

---

### Task 8: Write the D1 seeding script

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/seed-d1.sh`

**Step 1: Create `scripts/seed-d1.sh`**

```bash
#!/bin/bash
set -e

DB_NAME="claude-of-alexandria"
SEED_DIR="$(dirname "$0")/../d1-seed"

echo "=== Seeding D1 database: $DB_NAME ==="
echo ""

# Schema first
echo "Applying schema..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/schema.sql" --remote
echo "  Schema applied."

# Small tables
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote
echo "  Small tables imported."

# Morphology in batches
echo "Importing morphology..."
chunk_count=0
for chunk in "$SEED_DIR"/morphology-*.sql; do
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  chunk_count=$((chunk_count + 1))
done

echo ""
echo "=== Seeding complete. $chunk_count morphology batches imported. ==="
```

**Step 2: Make it executable**

```bash
chmod +x plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/seed-d1.sh
```

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/scripts/seed-d1.sh
git commit -m "feat(mcp-worker): add seed-d1.sh for sequential D1 import"
```

---

### Task 9: Create D1 database and deploy Worker

**Prerequisites:** You must be logged in to Cloudflare (`npx wrangler whoami`). Run all commands from `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/`.

**Step 1: Create the D1 database**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker
npx wrangler d1 create claude-of-alexandria
```

Expected output contains:
```
✅ Successfully created DB 'claude-of-alexandria'

[[d1_databases]]
binding = "DB"
database_name = "claude-of-alexandria"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Step 2: Update `wrangler.toml` with the real database_id**

Copy the `database_id` from the output and replace `REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE` in `wrangler.toml`.

**Step 3: Deploy the Worker**

```bash
npx wrangler deploy
```

Expected output ends with:
```
✅ Deployed claude-of-alexandria-mcp
  https://claude-of-alexandria-mcp.<account>.workers.dev
```

Note the Workers URL — you will need it for the parity test and .mcp.json update.

**Step 4: Verify the health check returns 200**

```bash
curl https://claude-of-alexandria-mcp.<account>.workers.dev/health
```

Expected: `{"status":"ok","version":"1.5.0","db":"connected"}` with HTTP 200.

Note: An empty D1 database is not unreachable — `SELECT 1` succeeds on an empty database. The health check returns 200 as soon as the D1 database exists and the binding is correctly configured. HTTP 503 only occurs if D1 is genuinely unreachable (wrong `database_id`, Cloudflare service outage, or binding misconfigured).

**Step 5: Verify non-MCP paths return 404**

```bash
curl -i https://claude-of-alexandria-mcp.<account>.workers.dev/
```

Expected: HTTP 404, body `Not Found`.

**Step 6: Commit updated wrangler.toml**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/wrangler.toml
git commit -m "feat(mcp-worker): update wrangler.toml with D1 database_id"
```

**Note on `database_id` in a public repository:** The `database_id` UUID is an identifier, not a credential — it does not grant read or write access to D1 without a Cloudflare API token with account-level permissions. The database is read-only from the public perspective. Committing it is an accepted risk. If stricter isolation is required, use a `wrangler.toml.local` file with the real ID and add it to `.gitignore`, keeping the placeholder in the committed `wrangler.toml`.

---

### Task 10: Build biblical.sqlite and seed D1

**Prerequisites:** `biblical.sqlite` must exist. If it does:
```bash
ls -lh plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/data/biblical.sqlite
```

If it does NOT exist, build it first:
```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
npm ci
npm run build:db
cd ../../../..
```

The build takes several minutes. It reads from `skills/biblical-segmentation/reference/` and the morphology data.

**Step 1: Run the export script**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker
npm run export-d1
```

Expected output: lists all tables with row counts, then morphology batch progress, ending with `Export complete.`

Check output:
```bash
ls -la d1-seed/
```

Expected: `schema.sql`, `data.sql`, and `morphology-001.sql` through `morphology-NNN.sql`.

**Step 2: Seed D1**

```bash
npm run seed-d1
```

This uploads all chunks sequentially. Takes several minutes for the morphology batches. Expected: `=== Seeding complete. N morphology batches imported. ===`

**Step 3: Verify health check returns 200**

```bash
curl https://claude-of-alexandria-mcp.<account>.workers.dev/health
```

Expected: `{"status":"ok","version":"1.5.0","db":"connected"}` with HTTP 200.

**Step 4: Quick smoke test — call a tool directly via HTTP**

```bash
curl -s -X POST https://claude-of-alexandria-mcp.<account>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}'
```

Expected: JSON-RPC response with `"result":{"protocolVersion":...,"capabilities":{"tools":{}},...}`.

```bash
curl -s -X POST https://claude-of-alexandria-mcp.<account>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_paragraph_breaks","arguments":{"book":"Genesis","chapter_range":"1"}}}'
```

Expected: JSON-RPC response containing `"content":[{"type":"text","text":"{...}"}]` with paragraph marker data.

**Note on D1 seeded files:** The `d1-seed/` directory contains generated SQL files. These are large and should not be committed to git. Add to `.gitignore`:

```
# D1 seed files (generated — do not commit)
plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp-worker/d1-seed/
```

```bash
git add .gitignore
git commit -m "chore: exclude d1-seed/ from git (generated files)"
```

---

### Task 10b: Benchmark expandParsing() CPU on full-book morphology query

**Prerequisite:** Task 10 complete (D1 seeded, health check returns 200).

**Step 1: Run a large-book morphology query against the deployed Worker**

```bash
curl -s -X POST https://claude-of-alexandria-mcp.<account>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_morphology","arguments":{"book":"Psalms","range":"1:1-50:6","testament":"ot"}}}'
```

The `DEFAULT_MORPHOLOGY_LIMIT` (5000 rows from Task 4) caps the response. This tests `expandParsing()` on a realistic large result set.

**Step 2: Check CPU time in Cloudflare Workers dashboard**

Cloudflare dashboard → Workers & Pages → `claude-of-alexandria-mcp` → Metrics → CPU Time.

Expected: P99 CPU time < 10ms (Workers free-tier CPU budget per request).

**If CPU exceeds 10ms:** Implement pre-expansion at D1 build time — modify `build-db.ts` to store expanded parsing JSON in D1 directly, removing the compact form. Update `export-d1.ts` to export the expanded column. This eliminates the `expandParsing()` call at query time. Do not proceed to Task 11 until resolved.

**Done criteria:** P99 CPU time < 10ms confirmed in Workers dashboard, or pre-expansion optimization implemented and verified.

**No commit needed.** (Metrics-only task)

---

### Task 11: Update parity test for remote endpoint

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/parity-test.py`

The existing parity test compares Python source scripts to the local SQLite database. We need to extend it to also test the remote MCP endpoint.

**Step 1: Read the existing parity test**

Read `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/parity-test.py` to understand its structure before modifying.

**Step 2: Add MCP HTTP client and --url mode**

The updated parity test adds:
- `--url <workers_url>` flag: tests the remote endpoint instead of local DB
- `MCPClient` class: minimal MCP HTTP client using `requests`
- Normalized comparison: coerce numeric types before comparing (D1 may return int vs float differently)

Replace the content of `parity-test.py` with:

```python
#!/usr/bin/env python3
"""
Parity test: compare tool outputs from local SQLite vs remote MCP endpoint.

Usage:
  python3 parity-test.py                    # Test local SQLite (original behaviour)
  python3 parity-test.py --url <workers_url>  # Test remote MCP endpoint
"""

import argparse
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

SCRIPTS_DIR = Path(__file__).parent.parent.parent.parent / 'skills' / 'biblical-segmentation' / 'scripts'
DB_PATH = Path(__file__).parent.parent / 'data' / 'biblical.sqlite'

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'

passed = 0
failed = 0


def check(label: str, expected, actual):
    global passed, failed
    if expected == actual:
        print(f'  {PASS}  {label}: {actual}')
        passed += 1
    else:
        print(f'  {FAIL}  {label}: expected={expected}, actual={actual}')
        failed += 1


# ── MCP HTTP Client ───────────────────────────────────────────────────────────

class MCPClient:
    """Minimal MCP HTTP client for parity testing."""

    def __init__(self, base_url: str):
        if not HAS_REQUESTS:
            print('ERROR: requests library not installed. Run: pip3 install requests')
            sys.exit(1)
        self.base_url = base_url.rstrip('/')
        self._session_id: str | None = None
        self._req_id = 0
        self._initialize()

    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    def _post(self, body: dict) -> dict:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Mcp-Protocol-Version': '2024-11-05',
        }
        if self._session_id:
            headers['Mcp-Session-Id'] = self._session_id

        resp = requests.post(f'{self.base_url}/mcp', json=body, headers=headers, timeout=30)

        # Handle SSE stream response
        content_type = resp.headers.get('Content-Type', '')
        if 'text/event-stream' in content_type:
            # Parse first data: line from SSE stream
            for line in resp.text.splitlines():
                if line.startswith('data: '):
                    return json.loads(line[6:])
            raise ValueError(f'No data line in SSE response: {resp.text[:200]}')

        return resp.json()

    def _initialize(self):
        body = {
            'jsonrpc': '2.0',
            'id': self._next_id(),
            'method': 'initialize',
            'params': {
                'protocolVersion': '2024-11-05',
                'capabilities': {},
                'clientInfo': {'name': 'parity-test', 'version': '1.0.0'},
            },
        }
        result = self._post(body)
        if 'error' in result:
            raise RuntimeError(f'MCP initialize failed: {result["error"]}')

    def call_tool(self, name: str, arguments: dict) -> dict:
        body = {
            'jsonrpc': '2.0',
            'id': self._next_id(),
            'method': 'tools/call',
            'params': {'name': name, 'arguments': arguments},
        }
        result = self._post(body)
        if 'error' in result:
            raise RuntimeError(f'MCP tool call failed: {result["error"]}')
        # Extract tool result text from MCP response
        content = result.get('result', {}).get('content', [])
        if not content:
            raise ValueError(f'Empty content in MCP response: {result}')
        return json.loads(content[0]['text'])


# ── Normalisation for cross-engine comparison ─────────────────────────────────

def normalize(obj):
    """Recursively normalize values for comparison.

    D1 may return integers where sql.js returns floats (or vice versa).
    Coerce all numbers to float for comparison.
    """
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize(v) for v in obj]
    if isinstance(obj, (int, float)):
        return float(obj)
    return obj


# ── Local DB helpers ──────────────────────────────────────────────────────────

def py_discourse(book: str):
    result = subprocess.run(
        [sys.executable, 'levinsohn_parser.py', book, '--output', 'json'],
        capture_output=True, text=True, cwd=SCRIPTS_DIR
    )
    if result.returncode != 0:
        print(f'  ERROR running levinsohn_parser.py for {book}: {result.stderr[:200]}')
        return None
    return json.loads(result.stdout)


def db_discourse(book_canonical: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT feature, COUNT(*) as cnt FROM discourse_features WHERE book = ? GROUP BY feature',
        (book_canonical,)
    ).fetchall()
    conn.close()
    return {r['feature']: r['cnt'] for r in rows}


def db_paragraphs(book_canonical: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT marker_type, COUNT(*) as cnt FROM paragraph_markers WHERE book = ? GROUP BY marker_type',
        (book_canonical,)
    ).fetchall()
    conn.close()
    counts = {r['marker_type']: r['cnt'] for r in rows}
    petuchot = counts.get('petuchah', 0)
    setumot = counts.get('setumah', 0)
    return {'petuchot': petuchot, 'setumot': setumot, 'total': petuchot + setumot}


def db_vocabulary(book_canonical: str, testament: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        'SELECT COUNT(DISTINCT lemma) as cnt FROM vocabulary WHERE book = ? AND testament = ?',
        (book_canonical, testament)
    ).fetchone()
    conn.close()
    return row['cnt'] if row else 0


def db_morphology_count(book_canonical: str, testament: str, range_str: str):
    """Count words returned by the morphology query for a given book/range."""
    # Parse range: "1:1-1:11"
    parts = range_str.split('-')
    if len(parts) == 1:
        sc, sv = map(int, parts[0].split(':'))
        ec, ev = sc, sv
    else:
        sc, sv = map(int, parts[0].split(':'))
        ec, ev = map(int, parts[1].split(':'))

    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        '''SELECT COUNT(*) as cnt FROM morphology
           WHERE book = ? AND testament = ?
           AND (chapter > ? OR (chapter = ? AND verse >= ?))
           AND (chapter < ? OR (chapter = ? AND verse <= ?))''',
        (book_canonical, testament, sc, sc, sv, ec, ec, ev)
    ).fetchone()
    conn.close()
    return row[0] if row else 0


# ── Remote MCP tests ──────────────────────────────────────────────────────────

SEGMENTATION_FEATURES = [
    'historical_present', 'left_dislocation', 'referential_pod',
    'situational_pod', 'reported_speech', 'tail_head_linkage',
]

DISCOURSE_BOOKS = [
    ('Mark', 'mark'),
    ('Philippians', 'philippians'),
    ('John', 'john'),
    ('Romans', 'romans'),
]

PARA_BOOKS = [
    ('genesis', 'genesis'),
    ('deuteronomy', 'deuteronomy'),
    ('psalms', 'psalms'),
]


def test_remote(client: MCPClient):
    print('\n[Remote MCP — Discourse Features]')
    for book_name, book_canonical in DISCOURSE_BOOKS:
        try:
            result = client.call_tool('query_discourse_features', {'book': book_name})
            summary = result.get('summary', {})
            remote_total = sum(summary.get(f, 0) for f in SEGMENTATION_FEATURES)
            db_counts = db_discourse(book_canonical)
            db_total = sum(db_counts.get(f, 0) for f in SEGMENTATION_FEATURES)
            check(f'{book_name} total (6 features)', db_total, remote_total)
        except Exception as e:
            print(f'  ERROR testing {book_name}: {e}')
            global failed
            failed += 1

    print('\n[Remote MCP — Paragraph Markers]')
    for book_name, book_canonical in PARA_BOOKS:
        try:
            result = client.call_tool('query_paragraph_breaks', {'book': book_name.title()})
            db = db_paragraphs(book_canonical)
            check(f'{book_name} petuchot', db['petuchot'], result.get('petuchot', 0))
            check(f'{book_name} setumot', db['setumot'], result.get('setumot', 0))
            check(f'{book_name} total', db['total'], result.get('total', 0))
        except Exception as e:
            print(f'  ERROR testing {book_name}: {e}')
            failed += 1

    print('\n[Remote MCP — Vocabulary (distinct lemmas)]')
    try:
        result = client.call_tool('query_vocabulary', {'book': 'Mark'})
        remote_lemmas = result.get('total_lemmas', len(result.get('lemmas', [])))
        db_lemmas = db_vocabulary('mark', 'nt')
        check('Mark NT lemmas match', db_lemmas, remote_lemmas)
    except Exception as e:
        print(f'  ERROR testing vocabulary: {e}')
        failed += 1

    print('\n[Remote MCP — Morphology (word count)]')
    try:
        result = client.call_tool('query_morphology', {'book': 'John', 'range': '1:1-1:18'})
        remote_count = result.get('summary', {}).get('total_words', 0)
        db_count = db_morphology_count('john', 'nt', '1:1-1:18')
        check('John 1:1-1:18 word count', db_count, remote_count)
    except Exception as e:
        print(f'  ERROR testing morphology: {e}')
        failed += 1

    # OT morphology
    try:
        result = client.call_tool('query_morphology', {'book': 'Genesis', 'range': '1:1-1:5'})
        remote_count = result.get('summary', {}).get('total_words', 0)
        db_count = db_morphology_count('genesis', 'ot', '1:1-1:5')
        check('Genesis 1:1-1:5 word count', db_count, remote_count)
    except Exception as e:
        print(f'  ERROR testing OT morphology: {e}')
        failed += 1


# ── Local DB tests (original behaviour) ───────────────────────────────────────

def test_local():
    print('\n[Discourse Features — Python scripts vs SQLite]')
    for book_name, book_canonical in DISCOURSE_BOOKS:
        py = py_discourse(book_name)
        if py is None:
            continue
        db = db_discourse(book_canonical)
        py_summary = py.get('summary', {})
        py_total = sum(py_summary.get(f, 0) for f in SEGMENTATION_FEATURES)
        db_total = sum(db.get(f, 0) for f in SEGMENTATION_FEATURES)
        check(f'{book_name} total (6 features)', py_total, db_total)
        if py_total != db_total:
            for feat in SEGMENTATION_FEATURES:
                py_cnt = py_summary.get(feat, 0)
                db_cnt = db.get(feat, 0)
                if py_cnt != db_cnt:
                    check(f'  {book_name}.{feat}', py_cnt, db_cnt)

    print('\n[Paragraph Markers — Python scripts vs SQLite]')
    for book_name, book_canonical in PARA_BOOKS:
        py_result = subprocess.run(
            [sys.executable, 'sefaria_paragraphs.py', book_name, '--output', 'json'],
            capture_output=True, text=True, cwd=SCRIPTS_DIR
        )
        if py_result.returncode != 0:
            print(f'  ERROR running sefaria_paragraphs.py for {book_name}')
            continue
        py = json.loads(py_result.stdout)
        if isinstance(py, list):
            petuchot = sum(1 for m in py if m.get('type') == 'petuchah')
            setumot = sum(1 for m in py if m.get('type') == 'setumah')
            py = {'petuchot': petuchot, 'setumot': setumot, 'total': len(py)}
        db = db_paragraphs(book_canonical)
        check(f'{book_name} petuchot', py['petuchot'], db['petuchot'])
        check(f'{book_name} setumot', py['setumot'], db['setumot'])
        check(f'{book_name} total', py['total'], db['total'])

    print('\n[Vocabulary — distinct lemmas]')
    mark_lemmas = db_vocabulary('mark', 'nt')
    check('Mark NT lemmas > 400', True, mark_lemmas > 400)
    check('Mark NT lemmas < 2000', True, mark_lemmas < 2000)
    print(f'  (actual: {mark_lemmas})')
    gen_lemmas = db_vocabulary('genesis', 'ot')
    check('Genesis OT lemmas > 500', True, gen_lemmas > 500)
    print(f'  (actual: {gen_lemmas})')


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Parity test: local SQLite vs remote MCP endpoint')
    parser.add_argument('--url', help='Remote Workers URL (e.g. https://claude-of-alexandria-mcp.<account>.workers.dev)')
    args = parser.parse_args()

    print('=' * 60)
    if args.url:
        print(f'PARITY TEST: Remote MCP endpoint vs local SQLite')
        print(f'URL: {args.url}')
    else:
        print('PARITY TEST: Python scripts vs SQLite database')
    print('=' * 60)

    if args.url:
        client = MCPClient(args.url)
        test_remote(client)
    else:
        test_local()

    print(f'\n{"=" * 60}')
    total = passed + failed
    print(f'Results: {passed} passed, {failed} failed / {total} total')
    if failed > 0:
        sys.exit(1)
```

**Step 3: Run local mode to confirm it still works**

```bash
python3 plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/parity-test.py
```

Expected: same results as before — all tests pass. If `levinsohn_parser.py` or `sefaria_paragraphs.py` scripts are not available, those sections will error gracefully.

**Step 4: Run remote mode against the deployed Worker**

```bash
python3 plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/parity-test.py \
  --url https://claude-of-alexandria-mcp.<account>.workers.dev
```

Expected: all tests pass. If any fail, investigate the specific tool and compare the data — check for type coercion issues (int vs float), NULL handling, or ordering differences.

**STOP GATE: Do not proceed to Task 12 until all parity tests pass.**

If tests fail:
1. Run the failing query directly against D1: `npx wrangler d1 execute claude-of-alexandria --remote --command "SELECT ..."`
2. Compare the specific failing tool's SQL in `src/db/query.ts` against `../claude-of-alexandria-mcp/src/db/query.ts`
3. Check for type coercion differences — use the `normalize()` function in the parity test to debug
4. If data is missing from D1, re-run `npm run export-d1 && npm run seed-d1` for the affected tables

**Step 5: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/parity-test.py
git commit -m "feat(parity-test): add --url flag for remote MCP endpoint testing"
```

---

### Task 12: Update plugin .mcp.json

**Files:**
- Modify: `plugins/claude-of-alexandria/.mcp.json`

**Step 1: Replace contents**

Replace the entire file with:

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "url": "https://claude-of-alexandria-mcp.<account>.workers.dev/mcp"
    }
  }
}
```

Replace `<account>` with your actual Cloudflare account subdomain (from the deployed Workers URL in Task 9).

**Step 2: Test with Claude Code**

Reload the plugin in Claude Code:
```
/mcp
```
or restart Claude Code and verify the tool `query_discourse_features` appears. Make a test call:

```
Use the query_discourse_features tool to look up Mark chapter 1.
```

Expected: the tool returns discourse features from D1 via the remote URL.

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/.mcp.json
git commit -m "feat(plugin): switch .mcp.json to remote Workers URL for v1.5.0"
```

---

### Task 13: Update documentation

**Files:**
- Modify: `README.md` (root)
- Modify: `plugins/claude-of-alexandria/README.md`

**Step 1: Update root README.md**

Find the "Claude Desktop" installation section. Replace the multi-step local server setup with:

```markdown
### MCP Tools (Claude Desktop)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "url": "https://claude-of-alexandria-mcp.<account>.workers.dev/mcp"
    }
  }
}
```

No local installation required. The server runs on Cloudflare Workers with edge SQLite.
```

Remove any references to:
- `npm install` or `npm run build`
- `DATA_DIR` environment variable
- `node` command in MCP config
- The MCP server tarball download

**Step 2: Update `plugins/claude-of-alexandria/README.md`**

Update the architecture section to reflect the new remote server design. Remove build instructions for the local MCP server.

**Step 3: Commit**

```bash
git add README.md plugins/claude-of-alexandria/README.md
git commit -m "docs: update installation docs for remote MCP server (v1.5.0)"
```

---

### Task 14: Update CI workflow

**Files:**
- Modify: `.github/workflows/package-desktop.yml`

Remove the `Build MCP server tarball` step entirely. The remote server doesn't need to be packaged — it's deployed separately via `wrangler deploy`.

**Step 1: Edit the workflow**

Remove this entire step from `package-desktop.yml`:

```yaml
      - name: Build MCP server tarball
        run: |
          cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
          npm ci
          npm run build
          cd ../../../..
          mkdir -p desktop-zips
          tar czf desktop-zips/claude-of-alexandria-mcp.tar.gz \
            -C plugins/claude-of-alexandria/servers \
            claude-of-alexandria-mcp/dist \
            claude-of-alexandria-mcp/data/biblical.sqlite \
            claude-of-alexandria-mcp/package.json \
            claude-of-alexandria-mcp/package-lock.json
```

Also remove the `Set up Node.js` step if it's only used by the tarball build (check if the skill ZIP step uses Node — it doesn't, so Node.js setup can be removed too).

**Step 2: Verify the remaining workflow**

The workflow should now only:
1. `actions/checkout@v4`
2. Create skill ZIPs
3. Create or update GitHub Release

**Step 3: Commit**

```bash
git add .github/workflows/package-desktop.yml
git commit -m "ci: remove MCP server tarball build step — server is now remote"
```

---

### Task 15: Remove local server directory

**Prerequisites:** Parity tests must be passing (Task 11). The plugin .mcp.json must be updated to the remote URL (Task 12).

**Step 1: Verify nothing in the codebase depends on the local server anymore**

```bash
grep -r "claude-of-alexandria-mcp" plugins/ .github/ docs/ \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="*.ts" --include="*.md" \
  | grep -v "claude-of-alexandria-mcp-worker" \
  | grep -v "node_modules"
```

Expected: only `.mcp.json` should reference it — and you just updated that to the URL form. If anything else appears, investigate before proceeding.

**Step 2: Remove the local server directory from git**

```bash
git rm -r plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/
```

**Step 3: Verify `biblical.sqlite` is gone**

```bash
ls plugins/claude-of-alexandria/servers/
```

Expected: only `claude-of-alexandria-mcp-worker/` remains.

**Step 4: Commit**

```bash
git commit -m "feat(mcp): remove local Node.js/SQLite server — replaced by Cloudflare Worker"
```

**Step 5 (optional): Remove biblical.sqlite from git history**

The 71MB SQLite file is in git history. To remove it (this rewrites history — coordinate with any collaborators):

```bash
# Using git filter-repo (preferred):
git filter-repo --path plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/data/biblical.sqlite --invert-paths

# Or using BFG:
bfg --delete-files biblical.sqlite
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

**Warning:** This rewrites history. Force-push is required after. Only do this if the repo size is a real concern and you have coordinated with any collaborators.

---

### Task 16: Bump version to 1.5.0 and release

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Modify: `plugins/claude-of-alexandria/.claude-plugin/manifest.json`
- Modify: `CHANGELOG.md`

**Step 1: Read CHANGELOG.md to understand current format**

Read `CHANGELOG.md` to see the existing version entries and format.

**Step 2: Update `marketplace.json`**

In `.claude-plugin/marketplace.json`, change all occurrences of `"1.4.0"` to `"1.5.0"`.

**Step 3: Update `manifest.json`**

In `plugins/claude-of-alexandria/.claude-plugin/manifest.json`, update the version field to `"1.5.0"`.

**Step 4: Add CHANGELOG entry**

Add a new entry at the top of the `[Unreleased]` section or create a new `[1.5.0]` heading:

```markdown
## [1.5.0] - 2026-02-20

### Added
- Remote MCP server deployed to Cloudflare Workers + D1 — no local Node.js required
- Health check endpoint (`GET /health`) with D1 connectivity probe
- CORS support for all MCP endpoint responses
- Response caching via Workers Cache API for static biblical reference data

### Changed
- `.mcp.json` now uses a single URL instead of `node` command + local server path
- Morphology tool defaults to 5000-row limit to prevent unbounded responses

### Removed
- Local Node.js/SQLite MCP server (`servers/claude-of-alexandria-mcp/`)
- `biblical.sqlite` database file from repository
- MCP server tarball from GitHub Actions release workflow
```

**Step 5: Commit and tag**

```bash
git add .claude-plugin/marketplace.json plugins/claude-of-alexandria/.claude-plugin/manifest.json CHANGELOG.md
git commit -m "chore(release): bump version to 1.5.0 — remote MCP server on Cloudflare Workers"
git tag v1.5.0
```

**Step 6: Push**

```bash
git push origin main --tags
```

The GitHub Actions workflow will create the release with the skill ZIPs.

---

## Verification Checklist

Before closing this plan as complete, confirm all items:

- [ ] `GET /health` returns `{"status":"ok","db":"connected"}` with HTTP 200
- [ ] `GET /health` when D1 is unreachable returns HTTP 503 (simulate by temporarily breaking the binding in wrangler.toml — not strictly required)
- [ ] `OPTIONS /mcp` returns HTTP 204 with CORS headers
- [ ] `GET /` returns HTTP 404
- [ ] All 4 MCP tools return data (smoke test in Task 10)
- [ ] Parity test passes: `python3 parity-test.py --url <workers_url>` — all tests pass
- [ ] Claude Code plugin loads the remote URL and tools appear in `/mcp`
- [ ] `biblical.sqlite` is removed from the working tree
- [ ] `servers/claude-of-alexandria-mcp/` directory is removed
- [ ] No TypeScript errors: `npm run typecheck` in the worker directory
- [ ] `CHANGELOG.md` updated with all changes
- [ ] Version bumped to 1.5.0 in both `marketplace.json` and `manifest.json`
- [ ] Tag `v1.5.0` pushed, GitHub Actions release created

---

## Recommended next step

Invoke `/review-plan` to validate this plan before execution.

After review, two execution options:

**1. Subagent-Driven (this session)** — dispatch fresh subagent per task, review between tasks

**2. Parallel Session (separate)** — open new session with kombajn-dev:build, batch execution with checkpoints

Which approach?
