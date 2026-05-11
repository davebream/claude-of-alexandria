# F3: Add FTS5 Full-Text Search over Lexicon Definitions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add a `search` parameter to the `query_lexicon` MCP tool that enables English meaning-based lookup (e.g., "which Greek word means 'love'?") using case-insensitive LIKE substring queries across all three lexicon tables.

**Architecture:** API change to `query_lexicon` — extends the existing Zod input schema with a `search` field, adds a new execution branch in `queryLexicon()`, and updates the tool description string in `index.ts`. No database migrations, no new tables, no new files beyond unit tests.

**Tech Stack:** TypeScript, Zod (schema validation), D1 SQLite (parameterized queries via `query()`), Vitest (unit tests), Cloudflare Workers MCP server.

---

## Context Files

> Pre-load these files at the start of each build phase. Derived from design's affected components (no understand report for this feature).

| File | Source | Confidence |
|------|--------|------------|
| `server/src/tools/lexicon.ts` | design: C1 + C2 affected components | design |
| `server/src/index.ts` | design: C3 affected component | design |
| `server/src/tools/schemas.test.ts` | design: Testing Strategy — existing test harness pattern | design |
| `tests/promptfoo/smoke/promptfooconfig-regression.yaml` | design: Testing Strategy — regression smoke suite | design |

---

### Task 1: Extend LexiconInputSchema and add the search branch in lexicon.ts

**Implements:** C1 (search branch), C2 (output schema) from design
**Depends on:** nothing
**Phase:** 1 — Core logic

**Files:**
- Modify: `server/src/tools/lexicon.ts`

#### Step 1.1: Write failing unit tests first

Create `server/src/tools/lexicon.test.ts` with the following test skeleton. These tests will fail until the implementation is in place.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryLexicon } from './lexicon.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('queryLexicon search — input validation', () => {
  it('rejects search term shorter than 2 characters', async () => {
    const result = await queryLexicon({ search: 'a' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search term longer than 100 characters', async () => {
    const result = await queryLexicon({ search: 'a'.repeat(101) } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search combined with strongs_ids', async () => {
    const result = await queryLexicon({ search: 'love', strongs_ids: ['G26'] } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search combined with lemmas', async () => {
    const result = await queryLexicon({ search: 'love', lemmas: ['ἀγάπη'] } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects empty input (no search, no strongs_ids, no lemmas)', async () => {
    const result = await queryLexicon({} as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('MISSING_INPUT');
    // Error message should mention all three options including 'search'
    expect(body.error.message).toMatch(/search/i);
  });
});

// ── Wildcard stripping ────────────────────────────────────────────────────────

describe('queryLexicon search — wildcard stripping', () => {
  it('strips % and _ wildcards before building LIKE pattern', async () => {
    // search="%love%" should behave as if user searched for "love"
    mockQuery.mockResolvedValue([
      { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love' },
    ]);

    const result = await queryLexicon({ search: '%love%' } as any);
    expect(result.isError).toBeFalsy();

    // Verify the actual SQL pattern passed to query() was '%love%' (LIKE pattern),
    // not '%%love%%' (which would happen if wildcards weren't stripped first).
    const calls = mockQuery.mock.calls;
    const likePatterns = calls.flatMap(c => c[1] as string[]).filter(v => String(v).startsWith('%'));
    expect(likePatterns.every(p => !p.includes('%%'))).toBe(true);
  });
});

// ── Search results ────────────────────────────────────────────────────────────

describe('queryLexicon search — result shape', () => {
  it('returns Greek entries matching "love"', async () => {
    // Three sequential calls: LSJ, Abbott-Smith, BDB — then UBS domains
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love, affection' },
      ])
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', abbott_smith_definition: 'love' },
      ])
      .mockResolvedValueOnce([]) // BDB — no Hebrew matches
      .mockResolvedValueOnce([]); // UBS domains

    const result = await queryLexicon({ search: 'love' } as any);
    expect(result.isError).toBeFalsy();

    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].strongs_id).toBe('G26');
    // Both LSJ and Abbott-Smith definitions merged into one entry
    expect(body.entries[0].lsj_definition).toMatch(/love/i);
    expect(body.entries[0].abbott_smith_definition).toMatch(/love/i);
    // No not_found field in search responses
    expect(body.not_found).toBeUndefined();
    // results_capped field present
    expect(typeof body.results_capped).toBe('boolean');
  });

  it('deduplicates when LSJ and Abbott-Smith match the same Strong ID', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love (LSJ)' },
      ])
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', abbott_smith_definition: 'love (AS)' },
      ])
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'love' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1); // deduplicated — not two entries for G26
    expect(body.entries[0].lsj_definition).toMatch(/LSJ/);
    expect(body.entries[0].abbott_smith_definition).toMatch(/AS/);
  });

  it('returns Hebrew entries for "covenant"', async () => {
    mockQuery
      .mockResolvedValueOnce([]) // LSJ — no Greek matches
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([
        { strongs_id: 'H1285', gloss: 'covenant', original_word: 'בְּרִית', transliteration: 'berit', bdb_definition: 'covenant, treaty' },
      ])
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'covenant' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries.some((e: any) => e.strongs_id === 'H1285')).toBe(true);
  });

  it('sets results_capped=true when combined results reach 20', async () => {
    // Simulate 20 LSJ results — cap should fire
    const lsjRows = Array.from({ length: 20 }, (_, i) => ({
      strongs_id: `G${String(i + 1).padStart(4, '0')}`,
      gloss: `word${i}`,
      original_word: `word${i}`,
      transliteration: `w${i}`,
      lsj_definition: `definition${i}`,
    }));

    mockQuery
      .mockResolvedValueOnce(lsjRows) // LSJ hits cap
      .mockResolvedValueOnce([{ strongs_id: 'G9999', gloss: 'extra', original_word: 'extra', transliteration: null, abbott_smith_definition: 'extra' }])
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'word' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.results_capped).toBe(true);
    expect(body.entries.length).toBeLessThanOrEqual(20);
  });

  it('is compatible with compact=true', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await queryLexicon({ search: 'love', compact: true } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries[0]).toHaveProperty('strongs_id');
    expect(body.entries[0]).toHaveProperty('gloss');
    expect(body.entries[0]).toHaveProperty('transliteration');
    // compact mode: no definition fields
    expect(body.entries[0].lsj_definition).toBeUndefined();
    expect(body.entries[0].abbott_smith_definition).toBeUndefined();
  });

  it('handles partial D1 failure gracefully (Promise.allSettled contract)', async () => {
    // LSJ fails, BDB succeeds — should return BDB results not an error
    mockQuery
      .mockRejectedValueOnce(new Error('D1 timeout on lsj')) // LSJ fails
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([
        { strongs_id: 'H1285', gloss: 'covenant', original_word: 'בְּרִית', transliteration: 'berit', bdb_definition: 'covenant' },
      ])
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'covenant' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.entries.some((e: any) => e.strongs_id === 'H1285')).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0); // error recorded
  });
});
```

#### Step 1.2: Run tests to confirm they fail

```bash
cd /path/to/worktree/server
npx vitest run src/tools/lexicon.test.ts
```

Expected: All tests fail — `search` property not recognized, `queryLexicon` returns MISSING_INPUT for `{}`.

#### Step 1.3: Implement the search branch in `lexicon.ts`

Make the following changes to `server/src/tools/lexicon.ts`:

**1. Extend `LexiconInputSchema`** — add `search` field after `lemmas`:

```typescript
export const LexiconInputSchema = {
  strongs_ids: jsonArray(z.array(z.string()).min(1).max(20)).optional()
    .describe("Array of Strong's numbers (e.g., [\"H1961\", \"G3056\"]). Max 20."),
  lemmas: jsonArray(z.array(z.string()).min(1).max(20)).optional()
    .describe('Array of Greek/Hebrew lemmas to look up. Max 20.'),
  search: z.string().min(2).max(100).optional()
    .describe('English meaning or concept to search for (e.g., "love", "redemption"). Searches gloss and full definitions across all lexicon sources. Returns up to 20 matches. Mutually exclusive with strongs_ids and lemmas.'),
  compact: z.boolean().optional()
    .describe('If true, return only strongs_id, gloss, transliteration (default: false)'),
};
```

**2. Update `LexiconInput` type** — the Zod inference picks up `search` automatically since it derives from `LexiconInputSchema`. No manual change needed — verify with TypeScript compiler.

**3. Add `results_capped` to `LexiconOutputSchema`**:

```typescript
export const LexiconOutputSchema = {
  entries: z.array(z.object({
    strongs_id: z.string(),
    gloss: z.string(),
    original_word: z.string().optional(),
    transliteration: z.string().nullable().optional(),
    lsj_definition: z.string().nullable().optional(),
    abbott_smith_definition: z.string().nullable().optional(),
    bdb_definition: z.string().nullable().optional(),
    ubs_semantic_domains: z.array(z.object({
      code: z.string(),
      name: z.string(),
    })).optional(),
    sources: z.array(z.string()).optional(),
  })),
  not_found: z.array(z.string()),
  results_capped: z.boolean().optional(),
  errors: z.array(z.string()),
};
```

**4. Update the MISSING_INPUT guard** — include `search` in the error message:

```typescript
// Validate: at least one parameter required
if (!args.strongs_ids && !args.lemmas && !args.search) {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      error: { code: 'MISSING_INPUT', message: "At least one of 'strongs_ids', 'lemmas', or 'search' is required." }
    }) }],
    isError: true,
  };
}
```

**5. Update the mutual-exclusion guard** — reject combinations with `search`:

```typescript
// Validate: mutual exclusivity
const inputCount = [args.strongs_ids, args.lemmas, args.search].filter(Boolean).length;
if (inputCount > 1) {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      error: { code: 'INVALID_INPUT', message: "Provide exactly one of: 'strongs_ids', 'lemmas', or 'search'." }
    }) }],
    isError: true,
  };
}
```

**6. Add the search branch** — insert after the `} else if (args.lemmas) {` block (before the final `const result = ...` line):

```typescript
} else if (args.search) {
  // ─── Meaning search via LIKE queries ─────────────────────────────────
  // NOTE: LIKE '%term%' defeats B-tree indexes (full-table scan). This is
  // intentional and acceptable: ~31,400 total rows across three lexicon tables
  // is well within D1 SQLite response time bounds for an interactive tool.
  // If table size grows significantly, consider a partial index on LOWER(gloss)
  // or FTS5 once cloudflare/workers-sdk#9519 is resolved.

  // Sanitize: strip SQL wildcard characters to prevent unintended broadening.
  // This is NOT a security issue (parameterized queries prevent injection),
  // but '%' or '_' in user input would make the pattern unintentionally broad.
  const term = args.search.trim().toLowerCase().replace(/[%_]/g, '');
  const pattern = `%${term}%`;

  const entryMap = new Map<string, SourceRow>();

  // Run all three table queries concurrently. Use Promise.allSettled so a
  // failure on one source does not abort results from the others.
  const [lsjResult, asResult, bdbResult] = await Promise.allSettled([
    query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as lsj_definition
       FROM lexicon_lsj WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`,
      [pattern, pattern]
    ),
    query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as abbott_smith_definition
       FROM lexicon_abbott_smith WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`,
      [pattern, pattern]
    ),
    query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as bdb_definition
       FROM lexicon_bdb WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`,
      [pattern, pattern]
    ),
  ]);

  // Collect errors from rejected promises
  if (lsjResult.status === 'rejected') {
    errors.push(`LSJ search failed: ${lsjResult.reason}`);
  }
  if (asResult.status === 'rejected') {
    errors.push(`Abbott-Smith search failed: ${asResult.reason}`);
  }
  if (bdbResult.status === 'rejected') {
    errors.push(`BDB search failed: ${bdbResult.reason}`);
  }

  // Merge LSJ results (primary Greek source — wins precedence over Abbott-Smith)
  if (lsjResult.status === 'fulfilled') {
    for (const row of lsjResult.value) {
      entryMap.set(row.strongs_id as string, {
        strongs_id: row.strongs_id as string,
        gloss: row.gloss as string,
        original_word: row.original_word as string,
        transliteration: row.transliteration as string | null,
        lsj_definition: row.lsj_definition as string | null,
        abbott_smith_definition: null,
        bdb_definition: null,
        ubs_semantic_domains: [],
        sources: ['lsj'],
      });
    }
  }

  // Merge Abbott-Smith results — merge into existing LSJ entry if present
  if (asResult.status === 'fulfilled') {
    for (const row of asResult.value) {
      const existing = entryMap.get(row.strongs_id as string);
      if (existing) {
        existing.abbott_smith_definition = row.abbott_smith_definition as string | null;
        if (!existing.sources!.includes('abbott-smith')) existing.sources!.push('abbott-smith');
      } else {
        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: null,
          abbott_smith_definition: row.abbott_smith_definition as string | null,
          bdb_definition: null,
          ubs_semantic_domains: [],
          sources: ['abbott-smith'],
        });
      }
    }
  }

  // Merge BDB results (Hebrew — no Strong's ID collision with Greek)
  if (bdbResult.status === 'fulfilled') {
    for (const row of bdbResult.value) {
      entryMap.set(row.strongs_id as string, {
        strongs_id: row.strongs_id as string,
        gloss: row.gloss as string,
        original_word: row.original_word as string,
        transliteration: row.transliteration as string | null,
        lsj_definition: null,
        abbott_smith_definition: null,
        bdb_definition: row.bdb_definition as string | null,
        ubs_semantic_domains: [],
        sources: ['bdb'],
      });
    }
  }

  // Deterministic ordering: Greek entries (G prefix) before Hebrew (H prefix),
  // then lexicographic by Strong's ID within each group.
  const allEntries = [...entryMap.values()].sort((a, b) => {
    const aPrefix = a.strongs_id.startsWith('G') ? 0 : 1;
    const bPrefix = b.strongs_id.startsWith('G') ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.strongs_id.localeCompare(b.strongs_id);
  });

  const resultsCapped = allEntries.length > 20;
  entries = allEntries.slice(0, 20);

  // Fetch UBS domains for matched entries
  if (entries.length > 0) {
    const allFoundIds = entries.map(e => e.strongs_id);
    const ph = allFoundIds.map(() => '?').join(', ');
    try {
      const ubsRows = await query(
        `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph})`,
        allFoundIds
      );
      for (const row of ubsRows) {
        const entry = entryMap.get(row.strongs_id as string);
        if (entry) {
          entry.ubs_semantic_domains!.push({ code: row.domain_code as string, name: row.domain_name as string });
          const ubsSource = (row.strongs_id as string).startsWith('G') ? 'ubs-sdgnt' : 'ubs-sdbh';
          if (!entry.sources!.includes(ubsSource)) entry.sources!.push(ubsSource);
        }
      }
    } catch (e) {
      errors.push(`UBS domains lookup failed: ${e}`);
    }
  }

  // Build search-specific result (no not_found field)
  const searchResult = {
    entries: entries.map(e => formatEntry(e, compact)),
    results_capped: resultsCapped,
    errors,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(searchResult) }],
    structuredContent: searchResult,
  };
}
```

> **Note:** The `compact` variable is declared before the existing `strongs_ids` branch. The search branch uses it the same way. The `notFound` variable is only populated by the other branches — search does not use it and omits `not_found` from its response.

#### Step 1.4: Run unit tests to confirm they pass

```bash
cd /path/to/worktree/server
npx vitest run src/tools/lexicon.test.ts
```

Expected: All tests pass. If `D1 timeout` partial-failure test fails, check that `Promise.allSettled` is used (not `Promise.all`) — the three table queries must run via `allSettled` even though they look sequential due to `await`.

#### Step 1.5: Run the full server test suite

```bash
cd /path/to/worktree/server
npx vitest run
```

Expected: All existing tests still pass. Zero regressions.

#### Step 1.6: Type-check

```bash
cd /path/to/worktree/server
npx tsc --noEmit
```

Expected: No type errors.

#### Step 1.7: Commit

```bash
git add server/src/tools/lexicon.ts server/src/tools/lexicon.test.ts
git commit -m "feat(lexicon): add search parameter with LIKE queries across LSJ, Abbott-Smith, BDB"
```

---

### Task 2: Update tool description in index.ts

**Implements:** C3 from design
**Depends on:** Task 1 (DESC_LEXICON must document the parameter that now exists in the schema)
**Phase:** 2 — Integration

**Files:**
- Modify: `server/src/index.ts` (lines ~186–199 — the `DESC_LEXICON` constant)

#### Step 2.1: Locate DESC_LEXICON

In `server/src/index.ts`, find the `const DESC_LEXICON` constant (currently around line 186). It currently ends after the Hebrew lemma example.

#### Step 2.2: Replace DESC_LEXICON

Replace the entire `DESC_LEXICON` string with:

```typescript
const DESC_LEXICON = `Query Strong's-based word definitions from multi-source scholarly lexicons.

Returns lexical entries with source-attributed definitions from LSJ (Liddell-Scott-Jones for Greek), Abbott-Smith (NT-focused Greek), BDB (Brown-Driver-Briggs for Hebrew), and UBS semantic domain classifications. Supports lookup by Strong's number, original language lemma, or English meaning search.

Args:
  - strongs_ids (string[], optional): Array of Strong's numbers (e.g., ["H1961", "G3056"]). Max 20.
  - lemmas (string[], optional): Array of Greek/Hebrew lemmas to look up. Max 20.
  - search (string, optional): English meaning or concept to search for (e.g., "love", "redemption"). Searches gloss and full definitions across all lexicon sources. Returns up to 20 matches. Min 2 chars, max 100 chars.
  - compact (boolean, optional): If true, return only strongs_id, gloss, transliteration (default: false).

Provide exactly one of: strongs_ids, lemmas, or search.

Search results may be capped at 20 entries across all sources combined (results_capped: true). Callers can infer testament from the Strong's ID prefix: G = Greek (NT), H = Hebrew (OT).

Examples:
  - Greek word study: strongs_ids=["G3056"]
  - Hebrew word study: strongs_ids=["H7225"]
  - Greek lemma: lemmas=["λόγος"]
  - Hebrew lemma: lemmas=["רֵאשִׁית"]
  - Meaning search: search="love" (returns ἀγάπη, אַהֲבָה, and related words)
  - Concept search: search="redemption" (returns λύτρον, גָּאַל, and related words)`;
```

#### Step 2.3: Type-check again

```bash
cd /path/to/worktree/server
npx tsc --noEmit
```

Expected: No type errors. The string change has no type implications, but it is good practice to run after any `index.ts` edit.

#### Step 2.4: Commit

```bash
git add server/src/index.ts
git commit -m "feat(lexicon): update query_lexicon tool description to document search parameter"
```

---

### Task 3: Add regression smoke test scenario

**Implements:** Design testing strategy — integration smoke test for search path
**Depends on:** Task 1 and Task 2 (tests the deployed behavior, not the schema)
**Phase:** 3 — Verification

**Files:**
- Modify: `tests/promptfoo/smoke/promptfooconfig-regression.yaml`

#### Step 3.1: Locate the query_lexicon section

Open `tests/promptfoo/smoke/promptfooconfig-regression.yaml`. Find the `R3c: query_lexicon handles mixed Greek+Hebrew batch` scenario (around line 96). The new scenario will be inserted immediately after it.

#### Step 3.2: Insert the new smoke scenario

Add the following YAML block immediately after the R3c scenario block:

```yaml
  - description: "R3d: query_lexicon search mode returns Greek result for 'love' (F3)"
    vars:
      prompt: >
        Use the query_lexicon tool with search="love".
        Return the raw tool output only, no analysis.
    assert:
      - type: javascript
        value: |
          const out = context.vars?.output || output || '';
          const lower = out.toLowerCase();
          // G26 = agape — the canonical Greek word for love; must appear in search results
          return lower.includes('g0026') || lower.includes('agape') || lower.includes('ἀγάπη') || lower.includes('agapē');
      - type: javascript
        value: |
          // results_capped field must be present (boolean, not a key error)
          const match = out.match(/results_capped["\s:]+(\w+)/i);
          if (!match) return false;
          const val = match[1].toLowerCase();
          return val === 'true' || val === 'false';
```

#### Step 3.3: Verify YAML is valid

```bash
python3 -c "import yaml; yaml.safe_load(open('tests/promptfoo/smoke/promptfooconfig-regression.yaml'))" && echo "YAML valid"
```

Expected: `YAML valid` printed.

#### Step 3.4: Run the regression suite (requires deployed server)

This test requires the MCP server to be deployed and accessible. Run via MCP tool if in an agent session:

```
run_evaluation({ configPath: "tests/promptfoo/smoke/promptfooconfig-regression.yaml", timeoutMs: 120000 })
```

Or from the terminal (outside a Claude Code session):

```bash
cd tests/promptfoo
npx promptfoo eval --no-cache -c smoke/promptfooconfig-regression.yaml
```

Expected: R3d passes — `agape` or `G0026` or `ἀγάπη` appears in the response, and `results_capped` is present.

> **Note:** If the server is not yet deployed (this plan runs before F4 which handles deployment), skip this step and note it as "Pending deployment." The YAML change is still committed so it is ready when the server is live.

#### Step 3.5: Commit

```bash
git add tests/promptfoo/smoke/promptfooconfig-regression.yaml
git commit -m "test(lexicon): add R3d regression scenario for query_lexicon search mode"
```

---

## Stage Handoff

### Decisions Made
- Use `Promise.allSettled` (not `Promise.all`) for the three parallel LIKE queries — partial results returned even if one D1 table query fails.
- Strip `%` and `_` from user input before building LIKE pattern — prevents unintentionally broad queries; this is not a security fix (D1 uses parameterized queries).
- Return `results_capped: boolean` (not `total_matches: int`) — individual LIMIT 20 per source table makes a true total count unknowable without separate COUNT queries.
- Omit `not_found` from search responses — semantically undefined for open-ended search.
- Greek entries (G prefix) sorted before Hebrew (H prefix), then lexicographic within each group.
- `compact` mode remains compatible with search results — reuses existing `formatEntry()` helper.
- Min search term length: 2 chars (prevents runaway full-table scans on single-character queries).
- Max search term length: 100 chars (bounded in Zod schema).
- No database migration required — LIKE queries operate on existing columns.
- No new files created beyond `server/src/tools/lexicon.test.ts`.

### Rejected Approaches
- FTS5 virtual tables in primary DB — export bug (cloudflare/workers-sdk#9519) risks corrupting the primary DB on every `wrangler d1 export` invocation.
- Separate D1 binding for FTS5 — infrastructure overhead (second DB, second seed pipeline, Wrangler config changes) not justified when LIKE is sufficient for bounded table sizes (~31,400 rows).
- `total_matches` count field — misleading because per-source LIMIT 20 means the true total is not known without COUNT queries; replaced with `results_capped` boolean.
- `Promise.all` for table queries — aborts all results when one table fails; replaced with `Promise.allSettled`.

### Open Questions
- Relevance ordering (gloss-only matches ranked above definition-only matches) — deferred to a follow-up; current ordering is deterministic but not relevance-ranked. (owner: future initiative)
- FTS5 upgrade path — the `search` parameter interface is stable; backing it with FTS5 instead of LIKE is a non-breaking internal change once cloudflare/workers-sdk#9519 is resolved. (owner: future initiative)

### Constraints Carried Forward
- D1 database MUST NOT have FTS5 virtual tables created in any migration until cloudflare/workers-sdk#9519 is resolved.
- The `search` parameter name and mutual-exclusion contract (exactly one of: `strongs_ids`, `lemmas`, `search`) must be preserved in any future enhancement.
- `results_capped` must remain a boolean (not an integer count) until per-source LIMIT is removed.

<!-- critic-findings
critic-rating: STRONG
findings:
Domain 1 (Ordering inversions): No issues. Task 1 creates the implementation, Task 2 updates the description, Task 3 adds the regression test. Each task can only succeed after the prior task's artifacts exist (schema must exist before description documents it; server must be deployed before smoke test passes).
Domain 2 (Verification gaps): No issues. Step 1.4 runs unit tests, Step 1.5 runs the full suite, Step 1.6 type-checks — all three verification steps directly test the goal of Task 1. Task 2's only verification is `tsc --noEmit` which is appropriate for a string constant change with no behavior. Task 3 verifies the smoke YAML with `python3 yaml.safe_load` before committing.
Domain 3 (Hidden dependencies): One clarification added — Task 3 now explicitly notes that the regression test requires a deployed server and documents the skip path if running before F4 deployment. No hidden mutable-state sharing between tasks.
Domain 4 (Completeness): All three design components covered: C1 (search branch in lexicon.ts) → Task 1, C2 (output schema `results_capped` field) → Task 1, C3 (DESC_LEXICON update) → Task 2. Testing strategy → Task 1 (unit tests) + Task 3 (regression).
Domain 5 (Code accuracy): Inline TypeScript snippets compile against the described interfaces — `LexiconInputSchema` shape, `SourceRow` interface, `formatEntry()` signature, `query()` call patterns, and `Promise.allSettled` destructuring all match the existing code in `lexicon.ts`. The Vitest mock pattern (`vi.mock`, `vi.mocked`, `mockResolvedValueOnce`) matches the Vitest API.
critic-findings -->
