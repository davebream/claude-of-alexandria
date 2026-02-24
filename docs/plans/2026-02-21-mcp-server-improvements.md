# MCP Server Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Migrate the MCP server from low-level `Server` class with manual handlers to `McpServer` with `registerTool()`, fully leveraging every SDK feature: Zod input/output schemas, `structuredContent`, tool annotations, rich descriptions, a discovery tool, and response size guards.

**Architecture:** Replace the manual `TOOLS` array + `switch` dispatch in `index.ts` with `McpServer.registerTool()` calls. Each tool gets:
- **`inputSchema`** — Zod shapes for automatic input validation (eliminates all `as string` casts)
- **`outputSchema`** — Zod shapes declaring structured output format (enables typed `structuredContent`)
- **`structuredContent`** — Return typed objects alongside text content (clients can parse without JSON.parse)
- **`annotations`** — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`
- **`title`** — Human-readable display name
- **`description`** — Rich multi-line description with args, returns, examples

The per-request server factory pattern stays — `McpServer` supports `connect(transport)` the same way `Server` does. Tool handler functions in `tools/*.ts` shift from `Record<string, unknown>` args to typed Zod-inferred params and return `CallToolResult` with both `content` and `structuredContent`.

**Tech Stack:** TypeScript, MCP SDK 1.26.0 (`McpServer`, `registerTool`), Zod 4 (already installed as SDK peer dep), Cloudflare Workers + D1, `WebStandardStreamableHTTPServerTransport`

**SDK Version Note:** The `McpServer` class and `registerTool()` API are available in the already-installed SDK 1.26.0 at `@modelcontextprotocol/sdk/server/mcp.js`. Zod 4.3.6 is already in `node_modules` as an SDK dependency. No new packages need to be installed — just add `zod` to `package.json` dependencies to make the import explicit.

**Zod Import Path:** Use `import { z } from 'zod'`. With Zod 4.x, this re-exports the v4 API. Task 1 includes a verification step to confirm schemas produced by this import are compatible with the SDK's `ZodRawShapeCompat` type (which expects `z4.$ZodType`). If the verification fails, switch all imports to `import { z } from 'zod/v4'`.

**SDK Behavior Notes:**
- `isError: true` responses skip output schema validation (SDK source: `if (result.isError) { return; }` in `validateToolOutput`). Error returns do not need `structuredContent`.
- `outputSchema` without `structuredContent` on a success response will throw: `"Tool X has an output schema but no structured content was provided"`. **Every success return MUST include `structuredContent` when `outputSchema` is defined.**
- `ToolCallback` signature is `(args, extra)` where `extra` carries `RequestHandlerExtra` (sessionId, abort signal). The `extra` parameter is ignored for now but available for future use (e.g., cancellable D1 queries).

**registerTool features used:**
| Feature | Status | Purpose |
|---------|--------|---------|
| `title` | All tools | Human-readable display name |
| `description` | All tools | Rich multi-line with args/returns/examples |
| `inputSchema` | All tools | Zod shapes -> auto-validated, typed params |
| `outputSchema` | All tools | Zod shapes -> typed structured output |
| `annotations` | All tools | readOnly, non-destructive, idempotent, closed-world |
| `structuredContent` | All tools | Typed output alongside text content |

---

## Deferred Items (Out of Scope)

These were identified in the audit but are not addressed in this plan:

- **Thread DB through params** — Replace module-level `_db` with request-scoped context. Low impact since D1 bindings are identical across concurrent requests in the same isolate.
- **Version deduplication** — Cosmetic. The hardcoded version in 3 places is fine for now.
- **Cache invalidation on schema changes** — Noted risk, no action needed for static data.
- **Automated integration tests** — The new typed interfaces (Zod schemas, `CallToolResult` return types) make the codebase much more amenable to automated testing. Consider a follow-up plan to add integration tests for each tool's happy path and error path.

---

## Task 1: Add Zod as Explicit Dependency and Verify Import

**Files:**
- Modify: `server/package.json`

**Step 1: Add zod to dependencies**

Zod is already in `node_modules` (SDK peer dep), but it's not in `package.json`. Make it explicit:

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.10.0",
  "zod": "^4.0.0"
}
```

**Step 2: Install to update lockfile**

Run: `cd server && npm install`
Expected: `package-lock.json` updated, no errors.

**Step 3: Verify import and SDK compatibility**

Create a temporary test file to confirm Zod schemas from `import { z } from 'zod'` are recognized by the SDK's `registerTool`:

```typescript
// test-zod-compat.ts (temporary, delete after verification)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
server.registerTool('test_tool', {
  inputSchema: { name: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  console.log('args.name type:', typeof args.name); // Should be string, not unknown
  return { content: [{ type: 'text' as const, text: 'ok' }] };
});
console.log('registerTool with Zod v4 schemas: OK');
```

Run: `cd server && npx tsx test-zod-compat.ts`
Expected: No errors. If it fails with type or runtime errors, switch to `import { z } from 'zod/v4'`.

Delete the test file after verification.

**Step 4: Commit**

```
feat(server): add zod as explicit dependency for input validation
```

---

## Task 2a: Add Zod Input Schemas and Type Tool Handler Params

Add Zod input schemas to each tool file and change handler signatures from `Record<string, unknown>` to typed params. Remove all `as string` / `as string | undefined` casts. Keep existing return type (`Promise<unknown>`) unchanged — `CallToolResult` migration happens in Task 2c.

**Files:**
- Modify: `server/src/tools/discourse.ts`
- Modify: `server/src/tools/paragraphs.ts`
- Modify: `server/src/tools/vocabulary.ts`
- Modify: `server/src/tools/morphology.ts`

**Step 1: Define Zod input schemas in each tool file**

Each tool exports its Zod schema and a typed handler function.

**`server/src/tools/discourse.ts`**:

```typescript
import { z } from 'zod';

export const DiscourseInputSchema = {
  book: z.string().describe('NT book name (any common form, e.g., "John", "1 Cor", "Romans")'),
  features: z.array(z.string()).optional().describe(
    'Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage'
  ),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
};

export type DiscourseInput = z.output<z.ZodObject<typeof DiscourseInputSchema>>;
```

Change handler signature from:
```typescript
export async function queryDiscourseFeatures(args: Record<string, unknown>): Promise<unknown>
```
to:
```typescript
export async function queryDiscourseFeatures(args: DiscourseInput): Promise<unknown>
```

Remove all `as string` / `as string | undefined` casts — args are now typed by Zod. The return type stays `Promise<unknown>` for now.

Apply the same pattern to all 4 tool files.

**`server/src/tools/paragraphs.ts`**:
```typescript
export const ParagraphsInputSchema = {
  book: z.string().describe('OT book name (any common form, e.g., "Genesis", "Gen", "Psalms")'),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
};
```

**`server/src/tools/vocabulary.ts`**:
```typescript
export const VocabularyInputSchema = {
  book: z.string().describe('Book name (any common form, e.g., "Romans", "Gen", "Psalms")'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
  theme: z.string().optional().describe('Thematic keyword group (e.g., "joy", "faith", "covenant"). Use list_books tool to see available themes.'),
  check_clustering: z.boolean().optional().describe('Include precomputed vocabulary concentration clusters'),
  min_frequency: z.number().optional().describe('Minimum total lemma frequency to include (default: 1)'),
  limit: z.number().optional().describe('Max lemmas returned (default: 200, max: 500)'),
};
```

**`server/src/tools/morphology.ts`**:
```typescript
export const MorphologyInputSchema = {
  book: z.string().describe('Book name (any common form, e.g., "John", "Gen", "Hebrews")'),
  range: z.string().describe('Verse range: "1:1-1:11" (multi-verse) or "1:6" (single verse). Format: chapter:verse-chapter:verse'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
  pos_filter: z.string().optional().describe('Filter by part of speech (e.g., "verb", "noun", "adjective", "preposition")'),
  word_filter: z.string().optional().describe('Filter by exact word form — matches against text, normalized form, or lemma'),
};
```

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```
refactor(server): add Zod input schemas and type tool handler params

Each tool file now exports a Zod schema and accepts typed params
instead of Record<string, unknown>. Eliminates all `as string` casts.
```

---

## Task 2b: Migrate index.ts to McpServer with registerTool

Replace `Server` + manual handlers + `TOOLS` array + `switch` statement with `McpServer` + `registerTool()` calls. Handlers still return `Promise<unknown>` — index.ts wraps results in `CallToolResult` at the callback level (same as current behavior).

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Update imports**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { setDb } from './db/query.js';
import { queryDiscourseFeatures, DiscourseInputSchema } from './tools/discourse.js';
import { queryParagraphBreaks, ParagraphsInputSchema } from './tools/paragraphs.js';
import { queryVocabulary, VocabularyInputSchema } from './tools/vocabulary.js';
import { queryMorphology, MorphologyInputSchema } from './tools/morphology.js';
```

**Step 2: Update cachedToolCall return type**

The `cachedToolCall` function must return `CallToolResult` now, since `registerTool` callbacks expect `CallToolResult`:

```typescript
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
```

**Step 3: Rewrite createServer() with McpServer**

Remove the `TOOLS` array, `ListToolsRequestSchema` handler, and `CallToolRequestSchema` handler with switch statement. Replace with `McpServer` + `registerTool()`:

```typescript
function createServer(): McpServer {
  const server = new McpServer(
    { name: 'claude-of-alexandria-mcp', version: '1.6.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool('query_discourse_features', {
    title: 'Query Discourse Features',
    description: 'Query Levinsohn NT discourse features for a given book and chapter range. NT books only.',
    inputSchema: DiscourseInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    return cachedToolCall('query_discourse_features', args as unknown as Record<string, unknown>, async () => {
      const result = await queryDiscourseFeatures(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
  });

  // ... same pattern for other 3 tools

  return server;
}
```

Note: The `args as unknown as Record<string, unknown>` double cast is needed because the Zod-inferred type is not directly assignable to `Record<string, unknown>` (string index signature mismatch). This cast is only for the cache key generation in `stableStringify`. The handler receives the properly typed args.

**Step 4: Preserve AUTH BOUNDARY comment**

The rewrite MUST preserve this comment from the current `index.ts`:

```typescript
// AUTH BOUNDARY: This server is intentionally unauthenticated. It serves read-only,
// public-domain biblical reference data. If write operations, user-specific data,
// or administrative endpoints are ever added, authentication becomes mandatory.
```

**Step 5: Keep CORS, health check, 405 handler, transport unchanged**

The fetch handler body stays the same. Only the `createServer()` function changes.

**Step 6: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 7: Commit**

```
refactor(server): migrate to McpServer with registerTool

Replace low-level Server + manual ListTools/CallTool handlers with
McpServer.registerTool(). Tool annotations and SDK-managed routing
replace the switch dispatch. cachedToolCall updated to return
CallToolResult.
```

---

## Task 2c: Move CallToolResult Construction into Tool Handlers

Each handler shifts from returning raw objects to returning `CallToolResult` directly. This removes the wrapping layer in `index.ts` — each handler owns its own response formatting.

**Files:**
- Modify: `server/src/tools/discourse.ts`
- Modify: `server/src/tools/paragraphs.ts`
- Modify: `server/src/tools/vocabulary.ts`
- Modify: `server/src/tools/morphology.ts`
- Modify: `server/src/index.ts` (remove wrapping in registerTool callbacks)

**Step 1: Update handler return types**

Change each handler from `Promise<unknown>` to `Promise<CallToolResult>`:

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function queryDiscourseFeatures(args: DiscourseInput): Promise<CallToolResult>
```

**Step 2: Wrap success returns**

Each handler's success path returns both `content` and `structuredContent`:

```typescript
// Success case — provide BOTH text and structured content:
const result = { book: bookInfo.displayName, chapter_range: chapterRange ?? 'all', features, summary, available_features: availableFeatures };
return {
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
};
```

**Step 3: Wrap error returns**

Error cases return `isError: true` (no `structuredContent` needed — SDK skips output validation for errors):

```typescript
// Error case:
return {
  content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: '...' } }) }],
  isError: true,
};
```

**Step 4: Simplify registerTool callbacks in index.ts**

Remove the wrapping layer — handlers now return `CallToolResult` directly:

```typescript
server.registerTool('query_discourse_features', { ... },
  async (args, _extra) => cachedToolCall(
    'query_discourse_features',
    args as unknown as Record<string, unknown>,
    () => queryDiscourseFeatures(args)
  )
);
```

**Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```
refactor(server): move CallToolResult construction into tool handlers

Each handler now returns CallToolResult directly with both content
and structuredContent. Removes the wrapping layer from index.ts
registerTool callbacks.
```

---

## Task 3: Add list_books Discovery Tool

Create the discovery tool before output schemas so all 5 tools exist when Task 4 adds output schemas to all of them.

**Files:**
- Create: `server/src/tools/list-books.ts`
- Modify: `server/src/index.ts` (register the new tool)

**Step 1: Create list-books.ts**

```typescript
import { z } from 'zod';
import { getAllBooks } from '../db/books.js';
import { query } from '../db/query.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const ListBooksInputSchema = {
  testament: z.enum(['nt', 'ot']).optional().describe(
    'Filter by testament. Omit to list all 66 books.'
  ),
  include_themes: z.boolean().optional().describe(
    'Include available thematic keyword groups for vocabulary queries (default: false)'
  ),
};

export type ListBooksInput = z.output<z.ZodObject<typeof ListBooksInputSchema>>;

export async function listBooks(args: ListBooksInput): Promise<CallToolResult> {
  const allBooks = getAllBooks();
  const filtered = args.testament
    ? allBooks.filter(b => b.testament === args.testament)
    : allBooks;

  const ot = filtered.filter(b => b.testament === 'ot').map(b => b.displayName);
  const nt = filtered.filter(b => b.testament === 'nt').map(b => b.displayName);

  const result: Record<string, unknown> = {
    total: filtered.length,
    ot: ot.length > 0 ? ot : undefined,
    nt: nt.length > 0 ? nt : undefined,
    available_tools: [
      'query_morphology — word-level parsing for any book (OT + NT)',
      'query_vocabulary — lemma frequencies + thematic keywords (OT + NT)',
      'query_discourse_features — Levinsohn discourse markers (NT only)',
      'query_paragraph_breaks — Masoretic petuchah/setumah markers (OT only)',
    ],
  };

  if (args.include_themes) {
    const themeRows = await query(
      'SELECT DISTINCT theme, testament FROM thematic_keywords ORDER BY testament, theme',
      []
    );
    const themes: Record<string, string[]> = { ot: [], nt: [] };
    for (const row of themeRows) {
      const t = row.testament as string;
      if (t === 'ot' || t === 'nt') themes[t].push(row.theme as string);
    }
    result.themes = themes;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
```

**Step 2: Register in index.ts**

```typescript
import { listBooks, ListBooksInputSchema } from './tools/list-books.js';

server.registerTool('list_books', {
  title: 'List Biblical Books',
  description: `List all available biblical books and their testaments. Use this tool first to discover what data is available before querying specific tools.

Optionally include available thematic keyword groups for use with query_vocabulary's theme parameter.

Args:
  - testament (string, optional): "nt" or "ot" to filter. Omit for all 66 books.
  - include_themes (boolean, optional): Include available thematic keyword groups (default: false)

Returns: { total, ot: string[], nt: string[], available_tools: string[], themes?: {ot: string[], nt: string[]} }`,
  inputSchema: ListBooksInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args, _extra) => cachedToolCall('list_books', args as unknown as Record<string, unknown>, () => listBooks(args)));
```

**Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```
feat(server): add list_books discovery tool with theme listing
```

---

## Task 4: Add Output Schemas for All Tools

Each tool declares a Zod `outputSchema` alongside its `inputSchema`. The SDK uses this to validate `structuredContent` before sending it to the client. This also makes the tool's output format discoverable to MCP clients.

**Files:**
- Modify: `server/src/tools/discourse.ts`
- Modify: `server/src/tools/paragraphs.ts`
- Modify: `server/src/tools/vocabulary.ts`
- Modify: `server/src/tools/morphology.ts`
- Modify: `server/src/tools/list-books.ts`
- Modify: `server/src/index.ts` (pass outputSchema to registerTool)

**Step 1: Define output schemas**

Add these alongside the input schemas in each tool file. Error responses don't need an output schema — they use `isError: true` and the SDK skips validation.

**`server/src/tools/discourse.ts`**:
```typescript
export const DiscourseOutputSchema = {
  book: z.string(),
  chapter_range: z.string(),
  features: z.record(z.string(), z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    word: z.string().nullable(),
    feature_description: z.string().nullable(),
  }))),
  summary: z.record(z.string(), z.number()),
  available_features: z.array(z.string()),
};
```

**`server/src/tools/paragraphs.ts`**:
```typescript
export const ParagraphsOutputSchema = {
  book: z.string(),
  chapter_range: z.string(),
  markers: z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    type: z.string(),
  })),
  summary: z.object({
    petuchot: z.number(),
    setumot: z.number(),
    total: z.number(),
  }),
};
```

**`server/src/tools/vocabulary.ts`**:

Vocabulary has two response shapes (with/without theme). Use a `response_type` discriminator field:

```typescript
const LemmaEntry = z.object({
  lemma: z.string(),
  total: z.number(),
  by_chapter: z.record(z.string(), z.number()),
});

const ClusteringSchema = z.object({
  has_clustering: z.boolean(),
  notable_count: z.number(),
  clusters: z.array(z.object({
    lemma: z.string(),
    concentration: z.number(),
    chapter_range: z.string(),
    total_occurrences: z.number(),
  })),
}).nullable();

export const VocabularyOutputSchema = {
  response_type: z.enum(['full', 'themed']).describe('Discriminator: "full" when no theme filter, "themed" when theme filter used'),
  book: z.string(),
  testament: z.string(),
  // Present when response_type = "full"
  lemmas: z.array(LemmaEntry).optional(),
  total_lemmas: z.number().optional(),
  returned: z.number().optional(),
  // Present when response_type = "themed"
  theme: z.string().optional(),
  thematic_matches: z.array(LemmaEntry).optional(),
  // Always
  clustering: ClusteringSchema.optional(),
  // Present when truncated
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};
```

The handler must add `response_type: 'full'` or `response_type: 'themed'` to the result object:

```typescript
// Without theme:
return {
  content: [...],
  structuredContent: { response_type: 'full', book: ..., testament: ..., lemmas: ..., ... },
};

// With theme:
return {
  content: [...],
  structuredContent: { response_type: 'themed', book: ..., testament: ..., theme: ..., thematic_matches: ..., ... },
};
```

**`server/src/tools/morphology.ts`**:
```typescript
export const MorphologyOutputSchema = {
  book: z.string(),
  range: z.string(),
  testament: z.string(),
  words: z.array(z.object({
    verse: z.string(),
    position: z.number(),
    text: z.string(),
    normalized: z.string().nullable(),
    lemma: z.string(),
    pos: z.string(),
    parsing: z.record(z.string(), z.string()).nullable(),
  })),
  summary: z.object({
    total_words: z.number(),
    by_pos: z.record(z.string(), z.number()),
  }),
};
```

**`server/src/tools/list-books.ts`**:
```typescript
export const ListBooksOutputSchema = {
  total: z.number(),
  ot: z.array(z.string()).optional(),
  nt: z.array(z.string()).optional(),
  available_tools: z.array(z.string()),
  themes: z.object({
    ot: z.array(z.string()),
    nt: z.array(z.string()),
  }).optional(),
};
```

**Step 2: Pass outputSchema to registerTool in index.ts**

```typescript
import { DiscourseInputSchema, DiscourseOutputSchema } from './tools/discourse.js';

server.registerTool('query_discourse_features', {
  title: 'Query Discourse Features',
  description: DISCOURSE_DESCRIPTION,
  inputSchema: DiscourseInputSchema,
  outputSchema: DiscourseOutputSchema,
  annotations: { ... },
}, async (args, _extra) => { ... });
```

Apply to all 5 tools.

**Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```
feat(server): add Zod output schemas and structuredContent to all tools

Adds outputSchema to every registerTool call. The SDK validates
structuredContent against the schema before sending to clients.
Vocabulary uses response_type discriminator for full/themed shapes.
```

---

## Task 5: Write Rich Tool Descriptions

**Files:**
- Modify: `server/src/index.ts` (description string constants, co-located with registerTool calls)

**Step 1: Write descriptions**

Each description should include: purpose, args explanation, return schema, examples, and error behavior. Store as constants at the top of `index.ts`.

**`query_discourse_features`**:
```
Query Levinsohn's New Testament discourse features for a given book and chapter range.

Returns discourse-grammatical features like historical present, left dislocation, tail-head linkage, and reported speech markers that signal narrative structure and information flow. NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "John", "1 Cor", "Revelation", "Rom")
  - features (string[], optional): Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage. Use without filter first to see available_features in the response.
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, features: { [name]: [{chapter, verse, word, feature_description}] }, summary: { [name]: count }, available_features: string[] }

Examples:
  - Historical presents in Mark 1-5: book="Mark", chapter_range="1-5", features=["historical_present"]
  - All discourse features in Romans: book="Romans"
  - Left dislocations in John: book="John", features=["left_dislocation"]
```

**`query_paragraph_breaks`**:
```
Query Masoretic paragraph markers (petuchah and setumah) for an Old Testament book.

Petuchah (open) and setumah (closed) markers are ancient paragraph divisions in the Hebrew Masoretic text that indicate structural breaks in the narrative or discourse. OT books only.

Args:
  - book (string, required): OT book name in any common form (e.g., "Genesis", "Gen", "Psalms", "Isa")
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, markers: [{chapter, verse, type}], summary: {petuchot, setumot, total} }

Examples:
  - All markers in Genesis 1-3: book="Genesis", chapter_range="1-3"
  - Paragraph structure of Isaiah: book="Isaiah"
```

**`query_vocabulary`**:
```
Query vocabulary frequencies, thematic keyword matches, and clustering data for any biblical book.

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
  - Vocabulary clusters in Genesis: book="Genesis", check_clustering=true
```

**`query_morphology`**:
```
Query word-level morphological parsing data for a verse range in any biblical book.

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
  - Find occurrences of "logos" in John 1: book="John", range="1:1-1:18", word_filter="logos"
```

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```
docs(server): enrich tool descriptions with args, returns, and examples
```

---

## Task 6: Add Response Size Guard

**Files:**
- Modify: `server/src/tools/vocabulary.ts`

**Step 1: Add CHARACTER_LIMIT constant and truncation**

Add at the top of `vocabulary.ts`:

```typescript
const CHARACTER_LIMIT = 25_000;
```

Before returning the final result in `queryVocabulary`, check the serialized size:

```typescript
const resultObj = { response_type: 'full' as const, book: bookInfo.displayName, testament, lemmas: lemmaList, ... };
const serialized = JSON.stringify(resultObj);

if (serialized.length > CHARACTER_LIMIT) {
  // Reduce lemma list by half and re-serialize
  const truncatedList = lemmaList.slice(0, Math.ceil(lemmaList.length / 2));
  const truncatedResult = {
    ...resultObj,
    lemmas: truncatedList,
    returned: truncatedList.length,
    truncated: true,
    truncation_message: `Response truncated from ${lemmaList.length} to ${truncatedList.length} lemmas. Use min_frequency or limit parameters to narrow results.`,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
    structuredContent: truncatedResult,
  };
}

return {
  content: [{ type: 'text', text: serialized }],
  structuredContent: resultObj,
};
```

**Important:** The truncated return MUST include `structuredContent` — omitting it from a success response when `outputSchema` is defined causes the SDK to throw.

Apply the same pattern to the thematic branch.

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```
feat(server): add response size guard for vocabulary queries
```

---

## Task 7: Bump Version, Deploy, and Verify

**Files:**
- Modify: `server/package.json` (version bump to 1.6.0)
- Modify: `server/src/index.ts` (version in `createServer()` — already 1.6.0 from Task 2b, plus health check version)

**Step 1: Bump package.json version**

```json
"version": "1.6.0"
```

**Step 2: Update the health check version**

The health check in `index.ts` hardcodes `version: '1.5.0'`. Update to `1.6.0`.

**Step 3: Final typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 4: Local smoke test**

Run: `cd server && npx wrangler dev`

Test health endpoint:
```bash
curl http://localhost:8787/health
```
Expected: `{"status":"ok","version":"1.6.0","db":"connected"}`

Test tool listing via MCP:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}
}'
```
Expected: Response includes 5 tools (4 existing + list_books), each with annotations and outputSchema.

Test list_books:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "list_books", "arguments": { "include_themes": true } }
}'
```
Expected: JSON with 66 books, OT/NT split, theme list.

Test Zod validation — wrong type for required field:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "query_morphology", "arguments": { "book": 42, "range": "1:1" } }
}'
```
Expected: Zod validation error (not a crash).

Test Zod validation — missing required fields:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 4, "method": "tools/call",
  "params": { "name": "query_morphology", "arguments": {} }
}'
```
Expected: Zod validation error listing missing `book` and `range`.

Test Zod validation — invalid enum value:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 5, "method": "tools/call",
  "params": { "name": "query_vocabulary", "arguments": { "book": "Romans", "testament": "invalid" } }
}'
```
Expected: Zod validation error for `testament` enum.

Test Zod validation — wrong type for optional numeric:
```bash
curl -X POST http://localhost:8787/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 6, "method": "tools/call",
  "params": { "name": "query_vocabulary", "arguments": { "book": "Romans", "limit": "not-a-number" } }
}'
```
Expected: Zod validation error for `limit`.

**Step 5: Commit version bump**

```
chore(server): bump version to 1.6.0
```

**Step 6: Deploy**

Run: `cd server && npm run deploy`
Expected: Wrangler deploys to `coa.davebream.com`.

**Step 7: Verify production**

```bash
curl https://coa.davebream.com/health
curl -X POST https://coa.davebream.com/mcp -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}
}'
```

---

## Summary

| Task | What Changes | Risk |
|------|-------------|------|
| 1. Add Zod dep + verify import | `package.json` + import compatibility test | None |
| 2a. Zod input schemas | All 4 tool files (typed params, remove casts) | Low |
| 2b. McpServer migration | `index.ts` (McpServer, registerTool, cachedToolCall types) | Medium — structural |
| 2c. CallToolResult in handlers | All 4 tool files + `index.ts` (return type migration) | Low |
| 3. list_books tool | New file + register | Low |
| 4. Output schemas | All 5 tool files + `index.ts` (outputSchema, vocab discriminator) | Low — additive |
| 5. Rich descriptions | Description strings in `index.ts` | None |
| 6. Response size guard | `vocabulary.ts` only | Low |
| 7. Version bump + deploy | Config + deploy + verify (expanded smoke tests) | Low |

**registerTool coverage per tool after completion:**

| Tool | title | description | inputSchema | outputSchema | annotations | structuredContent |
|------|-------|-------------|-------------|--------------|-------------|-------------------|
| `list_books` | Yes | Yes | Yes | Yes | Yes | Yes |
| `query_discourse_features` | Yes | Yes | Yes | Yes | Yes | Yes |
| `query_paragraph_breaks` | Yes | Yes | Yes | Yes | Yes | Yes |
| `query_vocabulary` | Yes | Yes | Yes | Yes | Yes | Yes |
| `query_morphology` | Yes | Yes | Yes | Yes | Yes | Yes |
