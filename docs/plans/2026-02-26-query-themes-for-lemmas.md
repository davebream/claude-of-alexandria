# `query_themes_for_lemmas` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add a 7th MCP tool that resolves lemmas from `query_morphology` into thematic keyword groups for `query_vocabulary`.

**Architecture:** New tool file `themes.ts` following the exact pattern of existing tools. Single SQL query against `thematic_keywords` table with lemma IN clause, post-processing in TypeScript. Lemma dedup+sort in `index.ts` before cache key generation.

**Tech Stack:** TypeScript, Zod 4, Cloudflare Workers, D1 (SQLite), MCP SDK

**Design doc:** `docs/plans/2026-02-26-query-themes-for-lemmas-design.md`

---

### Task 1: Add lemma index to schema

**Files:**
- Modify: `server/d1-seed/schema.sql:52` (after existing `idx_theme` line)
- Modify: `server/scripts/seed-d1.sh:40` (after existing `idx_theme` creation line)

**Step 1: Add index to schema.sql**

Add this line after line 52 (`CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);`):

```sql
CREATE INDEX IF NOT EXISTS idx_thematic_lemma ON thematic_keywords(lemma, testament);
```

**Step 2: Add index to seed-d1.sh**

Add this line after line 40 (`CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);" --remote`):

```bash
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_thematic_lemma ON thematic_keywords(lemma, testament);" --remote
```

**Step 3: Verify typecheck still passes**

Run: `cd server && npm run typecheck`
Expected: No errors (schema files are not TypeScript, but verify nothing broke)

**Step 4: Commit**

```bash
git add server/d1-seed/schema.sql server/scripts/seed-d1.sh
git commit -m "feat(schema): add (lemma, testament) index to thematic_keywords

Supports the reversed lookup direction needed by query_themes_for_lemmas:
lemma → theme (existing idx_theme covers theme → lemma)."
```

---

### Task 2: Create `themes.ts` tool file

**Files:**
- Create: `server/src/tools/themes.ts`

**Step 1: Create the tool file**

Create `server/src/tools/themes.ts` with the full implementation:

```typescript
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';

export const ThemesInputSchema = {
  lemmas: z.array(z.string()).min(1).max(100).describe(
    'Array of lemmas to resolve (Greek for NT, Strong\'s numbers for OT). Max 100.'
  ),
  testament: z.enum(['nt', 'ot']).describe(
    'Testament — must match the testament used in query_morphology'
  ),
  include_unmatched: z.boolean().optional().describe(
    'Include unmatched lemmas in response (default: true). Set false to reduce payload.'
  ),
};

export type ThemesInput = z.output<z.ZodObject<typeof ThemesInputSchema>>;

export const ThemesOutputSchema = {
  testament: z.string(),
  themes: z.array(z.string()),
  matches: z.record(z.string(), z.array(z.string())),
  unmatched: z.array(z.string()).optional(),
  total_lemmas: z.number(),
  matched_count: z.number(),
  unmatched_count: z.number(),
};

export async function queryThemesForLemmas(args: ThemesInput): Promise<CallToolResult> {
  const testament = args.testament;
  const includeUnmatched = args.include_unmatched ?? true;

  // Defense in depth: runtime guard matching vocabulary.ts:66-71
  if (testament !== 'nt' && testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_TESTAMENT', message: `Invalid testament: '${testament}'. Use 'nt' or 'ot'.` } }) }],
      isError: true,
    };
  }

  // Deduplicate and sort (caller in index.ts also normalizes for cache key,
  // but the handler must work correctly regardless)
  const uniqueLemmas = [...new Set(args.lemmas)].sort();

  if (uniqueLemmas.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'EMPTY_LEMMAS', message: 'At least one lemma is required.' } }) }],
      isError: true,
    };
  }

  // Build IN clause with dynamic placeholder count.
  // Testament is interpolated (validated enum) to reserve all 100 D1 bind slots for lemmas.
  const placeholders = uniqueLemmas.map(() => '?').join(', ');
  const sql = `
    SELECT lemma, theme
    FROM thematic_keywords
    WHERE lemma IN (${placeholders})
      AND testament = '${testament}'
    ORDER BY lemma, theme
  `;

  const rows = await query(sql, uniqueLemmas);

  // Build matches map: { lemma → theme[] }
  const matches: Record<string, string[]> = {};
  const themeCounts: Record<string, number> = {};

  for (const row of rows) {
    const lemma = row.lemma as string;
    const theme = row.theme as string;

    if (!matches[lemma]) matches[lemma] = [];
    matches[lemma].push(theme);

    themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
  }

  // Sort themes by match count desc, alphabetical tiebreaker
  const themes = Object.keys(themeCounts).sort((a, b) => {
    const countDiff = themeCounts[b] - themeCounts[a];
    if (countDiff !== 0) return countDiff;
    return a.localeCompare(b);
  });

  // Derive unmatched
  const unmatched = uniqueLemmas.filter(l => !matches[l]);

  const result: Record<string, unknown> = {
    testament,
    themes,
    matches,
    total_lemmas: uniqueLemmas.length,
    matched_count: uniqueLemmas.length - unmatched.length,
    unmatched_count: unmatched.length,
  };

  if (includeUnmatched) {
    result.unmatched = unmatched;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
```

**Step 2: Verify typecheck passes**

Run: `cd server && npm run typecheck`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add server/src/tools/themes.ts
git commit -m "feat: add queryThemesForLemmas tool handler

Resolves lemmas → thematic keyword groups with per-lemma mapping.
Single query against thematic_keywords with IN clause, post-processing
sorts themes by match count for pipeline auto-selection."
```

---

### Task 3: Register tool in `index.ts`

**Files:**
- Modify: `server/src/index.ts`

**Step 1: Add import**

After line 9 (`import { listBooks, ListBooksInputSchema, ListBooksOutputSchema } from './tools/list-books.js';`), add:

```typescript
import { queryThemesForLemmas, ThemesInputSchema, ThemesOutputSchema } from './tools/themes.js';
```

**Step 2: Add description constant**

After the `DESC_MORPHOLOGY` constant (ends around line 106), add:

```typescript
const DESC_THEMES = `Resolve lemmas from query_morphology into thematic keyword groups for use with query_vocabulary's theme parameter.

Accepts lemmas in the format returned by query_morphology for the given testament (Greek lemmas for NT, Strong's numbers for OT). Returns themes sorted by the number of matching lemmas (most relevant first).

Use this tool in the pipeline: query_morphology → query_themes_for_lemmas → query_vocabulary(theme=...).

Args:
  - lemmas (string[], required): 1–100 lemmas to resolve (e.g., ["χαίρω", "χαρά", "εἰρήνη"] for NT, ["H2617a", "H6664"] for OT)
  - testament (string, required): "nt" or "ot" — must match the testament used in query_morphology
  - include_unmatched (boolean, optional): Include unmatched lemmas in response (default: true). Set false to reduce payload for large passages.

Returns: { testament, themes: string[], matches: {lemma: themes[]}, unmatched?: string[], total_lemmas, matched_count, unmatched_count }

Examples:
  - Resolve NT lemmas: lemmas=["χαίρω", "χαρά", "εἰρήνη"], testament="nt"
  - Resolve OT Strong's codes: lemmas=["H2617a", "H6664", "H4941"], testament="ot"
  - Pipeline use (suppress unmatched): lemmas=[...from morphology...], testament="nt", include_unmatched=false`;
```

**Step 3: Add tool registration**

After the `query_ot_quotes` registration block (ends around line 253), add:

```typescript
  server.registerTool('query_themes_for_lemmas', {
    title: 'Resolve Lemmas to Themes',
    description: DESC_THEMES,
    inputSchema: ThemesInputSchema,
    outputSchema: ThemesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize lemmas BEFORE cachedToolCall so identical sets produce the same cache key.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_themes_for_lemmas',
      normalizedArgs as unknown as Record<string, unknown>,
      () => queryThemesForLemmas({ ...args, lemmas: normalizedLemmas } as unknown as import('./tools/themes.js').ThemesInput)
    );
  });
```

**Step 4: Bump server version**

Update the version string in `createServer()` (line 161) and the health check (line 282):

From `'1.7.0'` to `'1.8.0'` (both occurrences).

**Step 5: Verify typecheck passes**

Run: `cd server && npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: register query_themes_for_lemmas in MCP server

Adds tool registration with description, schemas, and cached handler.
Lemma normalization (dedup+sort) happens before cachedToolCall to ensure
stable cache keys regardless of input ordering."
```

---

### Task 4: Add to `AVAILABLE_TOOLS` in `list-books.ts`

**Files:**
- Modify: `server/src/tools/list-books.ts:28-34`

**Step 1: Add tool entry**

Add this line to the `AVAILABLE_TOOLS` array (after the `query_ot_quotes` entry, before the closing `] as const;`):

```typescript
  'query_themes_for_lemmas — resolve lemmas to vocabulary themes (OT + NT)',
```

**Step 2: Verify typecheck passes**

Run: `cd server && npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/tools/list-books.ts
git commit -m "feat: add query_themes_for_lemmas to AVAILABLE_TOOLS list

Ensures agents discover the new tool via list_books output."
```

---

### Task 5: Manual smoke test with local dev server

**Step 1: Start local dev server**

Run: `cd server && npm run dev`

**Step 2: Test with NT lemmas**

Send POST to `http://localhost:8787/mcp` with MCP `tools/call` request:

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["χαίρω", "χαρά", "εἰρήνη", "καί"],
        "testament": "nt"
      }
    }
  }' | python3 -m json.tool
```

Expected: Response with `themes` array (should include "joy" and "peace"), `matches` map, `unmatched` containing "καί", and correct counts.

**Step 3: Test with include_unmatched=false**

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["χαίρω", "καί"],
        "testament": "nt",
        "include_unmatched": false
      }
    }
  }' | python3 -m json.tool
```

Expected: Response without `unmatched` field.

**Step 4: Test with OT Strong's codes**

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["H1285", "H2617a"],
        "testament": "ot"
      }
    }
  }' | python3 -m json.tool
```

Expected: Response with themes including "covenant" (for H1285).

**Step 5: Test empty result (all function words)**

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["καί", "ὁ", "δέ"],
        "testament": "nt"
      }
    }
  }' | python3 -m json.tool
```

Expected: `themes: []`, `matched_count: 0`, all lemmas in `unmatched`.

**Step 6: Test dedup (duplicate lemmas)**

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["χαίρω", "χαίρω", "χαρά"],
        "testament": "nt"
      }
    }
  }' | python3 -m json.tool
```

Expected: `total_lemmas: 2` (post-dedup), not 3.

**Step 7: Stop dev server**

Ctrl+C to stop the Wrangler dev server.

---

### Task 6: Deploy schema and application

**Step 1: Apply the new index to remote D1**

This is a one-time command since the index uses `CREATE INDEX IF NOT EXISTS`:

```bash
cd server && npx wrangler d1 execute claude-of-alexandria \
  --command="CREATE INDEX IF NOT EXISTS idx_thematic_lemma ON thematic_keywords(lemma, testament);" \
  --remote
```

Expected: Success message.

**Step 2: Deploy the worker**

```bash
cd server && npm run deploy
```

Expected: Successful deployment to `coa.davebream.com`.

**Step 3: Verify remote deployment**

```bash
curl -s https://coa.davebream.com/health | python3 -m json.tool
```

Expected: `{ "status": "ok", "version": "1.8.0", "db": "connected" }`

**Step 4: Smoke test against production**

```bash
curl -s -X POST https://coa.davebream.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "query_themes_for_lemmas",
      "arguments": {
        "lemmas": ["χαίρω", "χαρά", "εἰρήνη"],
        "testament": "nt"
      }
    }
  }' | python3 -m json.tool
```

Expected: Same result as local test.

**Step 5: Commit version bump if not already committed**

Verify the version bump to 1.8.0 is included in the Task 3 commit. If not, create a separate release commit.

---

### Task 7: Update marketplace version and changelog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `.claude-plugin/marketplace.json` (version field)

**Step 1: Update marketplace.json version**

Bump the version in `.claude-plugin/marketplace.json` to match the new release.

**Step 2: Add changelog entry**

Add an entry under a new `## [1.8.0] - 2026-02-26` heading:

```markdown
### Added

- New `query_themes_for_lemmas` MCP tool: resolves morphology lemmas into vocabulary theme names, bridging the gap between `query_morphology` and `query_vocabulary` in the automated pipeline
- `(lemma, testament)` index on `thematic_keywords` table for optimal reverse lookup performance
```

**Step 3: Commit**

```bash
git add CHANGELOG.md .claude-plugin/marketplace.json
git commit -m "chore(release): bump version to 1.8.0"
```
