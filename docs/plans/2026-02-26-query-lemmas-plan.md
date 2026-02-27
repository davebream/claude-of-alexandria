# `query_lemmas` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add a `query_lemmas` MCP tool that returns cross-book distribution of specific lemma IDs across the biblical canon.

**Architecture:** New tool handler in `server/src/tools/lemmas.ts`, registered in `server/src/index.ts`. Single SQL query per testament against the `vocabulary` table with a new `(lemma, testament)` index. Book totals computed in JS from chapter-level data. Mixed-testament batches split and run in parallel.

**Tech Stack:** TypeScript, Zod 4, Cloudflare Workers, D1 SQLite, MCP SDK

**Design doc:** `docs/plans/2026-02-26-query-lemmas-design.md`

---

## Task 1: Add database index to all schema files

**Files:**
- Modify: `server/d1-seed/schema.sql:32` (after last vocabulary index)
- Modify: `server/scripts/d1-schema.sql:32` (after last vocabulary index)
- Modify: `server/scripts/seed-d1.sh:32` (after last vocabulary CREATE INDEX)

**Step 1: Add index to `server/d1-seed/schema.sql`**

After line 32 (`CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);`), add:

```sql
CREATE INDEX IF NOT EXISTS idx_vocab_lemma_testament ON vocabulary(lemma, testament);
```

**Step 2: Add same index to `server/scripts/d1-schema.sql`**

After line 32 (same position), add the identical line.

**Step 3: Add index to `server/scripts/seed-d1.sh`**

After line 32 (`npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);" --remote`), add:

```bash
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_vocab_lemma_testament ON vocabulary(lemma, testament);" --remote
```

**Step 4: Verify**

Run: `grep -n 'idx_vocab_lemma_testament' server/d1-seed/schema.sql server/scripts/d1-schema.sql server/scripts/seed-d1.sh`

Expected: 3 matches, one per file.

**Step 5: Commit**

```bash
git add server/d1-seed/schema.sql server/scripts/d1-schema.sql server/scripts/seed-d1.sh
git commit -m "feat(db): add (lemma, testament) index for cross-book queries"
```

---

## Task 2: Create `server/src/tools/lemmas.ts` — input/output schemas and helpers

**Files:**
- Create: `server/src/tools/lemmas.ts`

**Step 1: Write the file with schemas and testament detection helper**

```typescript
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { getAllBooks } from '../db/books.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LEMMAS = 50;
const D1_PARAM_LIMIT = 100;
const CHARACTER_LIMIT = 25_000;

// ─── Testament detection ──────────────────────────────────────────────────────

// OT lemmas use Strong's H-prefix (e.g. H7462b, H430).
// NT lemmas are bare Greek lexical forms (e.g. πατήρ, κύριος).
// There is no G-prefix convention in the data.
function isOtLemma(lemma: string): boolean {
  return lemma.length >= 2 && lemma[0] === 'H' && lemma[1] >= '0' && lemma[1] <= '9';
}

// ─── Canonical-to-display name map ────────────────────────────────────────────

// vocabulary table stores lowercase canonical names (e.g. "genesis", "1_corinthians").
// We need display names (e.g. "Genesis", "1 Corinthians") for the response.
let _displayMap: Record<string, string> | null = null;
function getDisplayMap(): Record<string, string> {
  if (!_displayMap) {
    _displayMap = {};
    for (const book of getAllBooks()) {
      _displayMap[book.canonical] = book.displayName;
    }
  }
  return _displayMap;
}

// ─── Input / Output schemas ───────────────────────────────────────────────────

export const LemmasInputSchema = {
  lemmas: z.array(z.string()).min(1).max(50).describe(
    'Lemma IDs to look up. OT: Strong\'s numbers (e.g. "H7462b"). NT: Greek lexical forms (e.g. "πατήρ"). 1–50 items. Mixed OK.'
  ),
};

export type LemmasInput = z.output<z.ZodObject<typeof LemmasInputSchema>>;

const DistributionEntry = z.object({
  lemma: z.string(),
  testament: z.enum(['ot', 'nt']),
  total_occurrences: z.number(),
  books_count: z.number(),
  distribution: z.record(z.string(), z.record(z.string(), z.number())),
});

export const LemmasOutputSchema = {
  lemmas: z.array(DistributionEntry),
  not_found: z.array(z.string()),
  total_requested: z.number(),
  total_found: z.number(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};
```

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`

Expected: No errors (schemas are valid Zod definitions, no handler yet).

**Step 3: Commit**

```bash
git add server/src/tools/lemmas.ts
git commit -m "feat(lemmas): add input/output schemas and testament detection helper"
```

---

## Task 3: Implement `queryLemmas()` handler

**Files:**
- Modify: `server/src/tools/lemmas.ts` (append after schemas)

**Step 1: Add the query handler**

Append to `server/src/tools/lemmas.ts`:

```typescript
// ─── Single-testament query ───────────────────────────────────────────────────

interface LemmaResult {
  lemma: string;
  testament: 'ot' | 'nt';
  total_occurrences: number;
  books_count: number;
  distribution: Record<string, Record<string, number>>;
}

async function queryForTestament(
  lemmas: string[],
  testament: 'ot' | 'nt'
): Promise<LemmaResult[]> {
  if (lemmas.length === 0) return [];

  // Defensive guard: 1 (testament) + N (lemmas) must fit D1's bind param limit
  if (1 + lemmas.length > D1_PARAM_LIMIT) {
    throw new Error(`D1 parameter limit exceeded: ${1 + lemmas.length} > ${D1_PARAM_LIMIT}`);
  }

  const displayMap = getDisplayMap();
  const placeholders = lemmas.map(() => '?').join(', ');

  const rows = await query(
    `SELECT v.lemma, v.book, v.chapter, v.frequency
     FROM vocabulary v
     WHERE v.testament = ? AND v.lemma IN (${placeholders})
     ORDER BY v.lemma, v.book, v.chapter`,
    [testament, ...lemmas]
  );

  // Group rows by lemma → book → chapter
  const grouped: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of rows) {
    const lemma = row.lemma as string;
    const book = row.book as string;
    const chapter = String(row.chapter);
    const freq = row.frequency as number;

    if (!grouped[lemma]) grouped[lemma] = {};
    if (!grouped[lemma][book]) grouped[lemma][book] = {};
    grouped[lemma][book][chapter] = freq;
  }

  // Build result array with display names and computed totals
  return Object.entries(grouped).map(([lemma, books]) => {
    const distribution: Record<string, Record<string, number>> = {};
    let totalOccurrences = 0;

    for (const [canonical, chapters] of Object.entries(books)) {
      const displayName = displayMap[canonical] ?? canonical;
      distribution[displayName] = chapters;
      for (const count of Object.values(chapters)) {
        totalOccurrences += count;
      }
    }

    return {
      lemma,
      testament,
      total_occurrences: totalOccurrences,
      books_count: Object.keys(distribution).length,
      distribution,
    };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function queryLemmas(args: LemmasInput): Promise<CallToolResult> {
  const { lemmas } = args;

  // Validation
  if (!lemmas || lemmas.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'EMPTY_LEMMAS', message: 'At least one lemma required.' } }) }],
      isError: true,
    };
  }

  if (lemmas.length > MAX_LEMMAS) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'LEMMA_LIMIT_EXCEEDED', message: `Maximum ${MAX_LEMMAS} lemmas per query. Split into batches.`, max: MAX_LEMMAS, received: lemmas.length } }) }],
      isError: true,
    };
  }

  // Partition by testament
  const otLemmas: string[] = [];
  const ntLemmas: string[] = [];
  for (const lemma of lemmas) {
    if (isOtLemma(lemma)) {
      otLemmas.push(lemma);
    } else {
      ntLemmas.push(lemma);
    }
  }

  // Query both testaments in parallel
  const [otResults, ntResults] = await Promise.all([
    queryForTestament(otLemmas, 'ot'),
    queryForTestament(ntLemmas, 'nt'),
  ]);

  const allResults = [...otResults, ...ntResults];

  // Compute not_found per testament
  const foundLemmas = new Set(allResults.map(r => r.lemma));
  const notFound = lemmas.filter(l => !foundLemmas.has(l));

  // Build response
  let result: Record<string, unknown> = {
    lemmas: allResults,
    not_found: notFound,
    total_requested: lemmas.length,
    total_found: allResults.length,
  };

  // Truncation: binary search for largest subset that fits under character limit.
  // Keeps the most-distributed lemmas (highest books_count).
  let serialized = JSON.stringify(result);
  if (serialized.length > CHARACTER_LIMIT && allResults.length > 1) {
    // Sort by books_count descending so index 0 = most-distributed
    const sorted = [...allResults].sort((a, b) => b.books_count - a.books_count);
    let lo = 1, hi = sorted.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = sorted.slice(0, mid);
      const probe = JSON.stringify({ ...result, lemmas: candidate });
      if (probe.length <= CHARACTER_LIMIT) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const truncatedList = sorted.slice(0, lo);
    result = {
      lemmas: truncatedList,
      not_found: notFound,
      total_requested: lemmas.length,
      total_found: allResults.length,
      truncated: true,
      truncation_message: `Response truncated from ${allResults.length} to ${truncatedList.length} lemmas. Use smaller batches to get full data.`,
    };
    serialized = JSON.stringify(result);
  }

  return {
    content: [{ type: 'text', text: serialized }],
    structuredContent: result,
  };
}
```

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add server/src/tools/lemmas.ts
git commit -m "feat(lemmas): implement queryLemmas handler with cross-book distribution"
```

---

## Task 4: Register `query_lemmas` in the MCP server

**Files:**
- Modify: `server/src/index.ts` (import, description constant, registerTool)

**Step 1: Add import**

After the last import (the `themes.js` import), add:

```typescript
import { queryLemmas, LemmasInputSchema, LemmasOutputSchema } from './tools/lemmas.js';
```

**Step 2: Add DESC_LEMMAS constant**

After `DESC_THEMES` (the last description constant, before the CORS section), add:

```typescript
const DESC_LEMMAS = `Query cross-book distribution of specific lemma IDs across the biblical canon.

Unlike query_vocabulary (which shows vocabulary within one book), this tool shows where specific lemmas appear across ALL books in a testament. Use after query_morphology identifies lemmas of interest.

OT lemmas use Strong's numbers (H-prefix, e.g., "H7462b"). NT lemmas use Greek lexical forms (e.g., "πατήρ", "κύριος"). Get these from query_morphology output (the "lemma" field).

Args:
  - lemmas (string[], required): 1–50 lemma IDs. OT: Strong's numbers like "H7462b". NT: Greek forms like "πατήρ". Mixed allowed.

Returns: { lemmas: [{lemma, testament, total_occurrences, books_count, distribution: {Book: {chapter: count}}}], not_found: string[], total_requested, total_found }

Note: No lexeme/gloss field is included. The calling agent already has morphology context with normalized forms from a prior query_morphology call.

Examples:
  - OT shepherd lemma across the canon: lemmas=["H7462b"]
  - Multiple NT lemmas: lemmas=["πατήρ", "πίστις"]
  - Mixed OT/NT for covenant study: lemmas=["H1285", "διαθήκη"]`;
```

**Step 3: Register the tool**

Before `return server;`, add — note the dedup+sort normalization matching the `query_themes_for_lemmas` pattern:

```typescript
  server.registerTool('query_lemmas', {
    title: 'Query Lemma Distribution',
    description: DESC_LEMMAS,
    inputSchema: LemmasInputSchema,
    outputSchema: LemmasOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize lemmas: dedup + sort for cache key stability.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_lemmas',
      normalizedArgs as unknown as Record<string, unknown>,
      () => queryLemmas(normalizedArgs as unknown as LemmasInput)
    );
  });
```

**Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`

Expected: No errors.

**Step 5: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): register query_lemmas tool with description and cache normalization"
```

---

## Task 5: Update `list_books` available tools

**Files:**
- Modify: `server/src/tools/list-books.ts` (AVAILABLE_TOOLS array)

**Step 1: Add query_lemmas to the array**

Add the `query_lemmas` entry after `query_vocabulary` in the `AVAILABLE_TOOLS` array:

```typescript
const AVAILABLE_TOOLS = [
  'query_morphology — word-level parsing for any book (OT + NT)',
  'query_vocabulary — lemma frequencies + thematic keywords (OT + NT)',
  'query_lemmas — cross-book lemma distribution (OT + NT)',
  'query_discourse_features — Levinsohn discourse markers (NT only)',
  'query_paragraph_breaks — Masoretic petuchah/setumah markers (OT only)',
  'query_ot_quotes — OT quotations in NT passages (NT only)',
  'query_themes_for_lemmas — resolve lemmas to vocabulary themes (OT + NT)',
] as const;
```

**Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add server/src/tools/list-books.ts
git commit -m "feat(list-books): advertise query_lemmas in available tools"
```

---

## Task 6: Local smoke test with `wrangler dev`

**Files:** None (verification only)

**Step 1: Start dev server**

Run: `cd server && npx wrangler dev`

Wait for the local server to start (should show a URL like `http://localhost:8787`).

**Step 2: Create the index on local D1**

Run in a separate terminal:

```bash
cd server && npx wrangler d1 execute claude-of-alexandria --command="CREATE INDEX IF NOT EXISTS idx_vocab_lemma_testament ON vocabulary(lemma, testament);" --local
```

**Step 3: Test with a simple MCP call**

Send a tools/call request via curl to the local MCP endpoint. The exact format depends on the MCP protocol, but a basic test:

```bash
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_lemmas","arguments":{"lemmas":["H430"]}}}'
```

Expected: A JSON response with `lemmas` array containing distribution data for H430 (Elohim) across OT books. Should have `books_count` > 1 and `not_found: []`.

**Step 4: Test error case**

```bash
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_lemmas","arguments":{"lemmas":[]}}}'
```

Expected: Error response with `EMPTY_LEMMAS` code.

**Step 5: Test not_found case**

```bash
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_lemmas","arguments":{"lemmas":["H430","H99999"]}}}'
```

Expected: `lemmas` array with H430 data, `not_found: ["H99999"]`.

**Note:** If the local D1 database is not seeded, these tests will return empty results. That's fine — the important thing is that the tool responds without errors and the response shape is correct.

---

## Task 7: Deploy, update docs, and release

**Files:** `README.md`, `plugins/claude-of-alexandria/README.md`, `server/src/index.ts`, `server/package.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`

**Step 1: Deploy to Cloudflare**

Run: `cd server && npx wrangler deploy`

Expected: Successful deployment.

**Step 2: Create the index on production D1**

Run:

```bash
cd server && npx wrangler d1 execute claude-of-alexandria --command="CREATE INDEX IF NOT EXISTS idx_vocab_lemma_testament ON vocabulary(lemma, testament);" --remote
```

Expected: Index created successfully.

**Step 3: Verify with a production MCP call**

Use Claude Code or Claude Desktop to call `query_lemmas` with a known OT lemma (e.g., `H430` for Elohim). Verify the response includes cross-book distribution.

**Step 4: Update READMEs**

Add `query_lemmas` to the MCP tool tables in both READMEs:

- `README.md` — add row `| \`query_lemmas\` | Cross-book lemma distribution | Both testaments |` to the tool table (after `query_themes_for_lemmas`)
- `plugins/claude-of-alexandria/README.md` — add row `| \`query_lemmas\` | Cross-book lemma distribution | Both |` to the tool table (after `query_themes_for_lemmas`), and update the tool count in the paragraph above the table ("seven tools" → "eight tools")

**Step 5: Commit version bump**

Update all version references from `'1.8.0'` to `'1.9.0'` (1.8.0 was taken by `query_themes_for_lemmas`):

- Update `server/src/index.ts` — McpServer constructor version and both health check version strings
- Update `server/package.json` version from `'1.7.0'` to `'1.9.0'`
- Update `.claude-plugin/marketplace.json` — both `metadata.version` and `plugins[0].version` from `'1.8.0'` to `'1.9.0'`
- Update `CHANGELOG.md` — add a `## [1.9.0]` section above `[1.8.0]`

```bash
git add -A
git commit -m "chore(release): bump version to 1.9.0"
```

---

## Dependency Order

```
Task 1 (index) ──┐
                  ├── Task 2 (schemas) ── Task 3 (handler) ── Task 4 (register) ── Task 5 (list-books) ── Task 6 (smoke test) ── Task 7 (deploy)
                  │
                  └── (Task 1 is independent but should go first)
```

Tasks 2–5 are sequential (each builds on the previous). Task 1 is independent but should be done first since the index is needed for the query to perform well.
