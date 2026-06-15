# Design: Expand abbreviated parenthetical glosses for lexicon search recall

**Requirements:** .kombajn/implement-expand-abbreviated-parenthetical-glosses-for-lexicon-search-recall/understand/T1-understand.md
**Stories covered:** OR-1, OR-2, OR-3, OR-4, OR-5, OR-6, OR-7, OR-8

## Approach

The parenthetical abbreviation notation (`BASE(-suffix1, -suffix2)`) lives in the stored `gloss` column, not in the user's query. A user searching for "whenever" has no abbreviated form to expand — the abbreviated form `when(-ever)` exists only in the database. The technically correct fix is **gloss-side expansion at search time**: fetch a candidate superset of rows from D1 using a broadened SQL predicate, then in JavaScript expand each candidate's gloss to its full spelled-out variants and keep only those rows where the user's term matches one of the expanded forms.

The SQL broadening strategy uses a second `OR` clause on the existing LIKE predicate:

```sql
WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ?
   OR LOWER(gloss) LIKE '%(-'
```

The third clause (`LIKE '%(-'`) fetches all rows whose gloss contains the opening of a parenthetical suffix group. These are the rows that could produce an expanded match. After fetching, a JavaScript post-filter applies `expandParentheticalGloss(gloss)` to each candidate and discards any row not matched by either the original direct LIKE pattern or the expansion check.

This approach requires no schema changes, no new tables, no FTS5, and no mutation of displayed gloss text. It is self-contained in `server/src/tools/lexicon.ts`, deterministic, and pure. The broadened fetch is slightly wider than the final result set but the overlap is small (only rows with `(-` in the gloss), and the 20-result cap already limits the practical superset size.

## Requirements Traceability

| Requirement | Source Text | Status | Design Coverage | Justification / Evidence |
|-------------|-------------|--------|-----------------|--------------------------|
| OR-1 | Add `expandParentheticalGloss(gloss: string): string[]` in `lexicon.ts` | Kept | C1 | Helper implemented as pure TypeScript function in `lexicon.ts` |
| OR-2 | Use expanded set to build search predicate | Modified | C2 | Gloss-side expansion (not query-side) — the understand report's Frame Challenge confirms this is the coherent reading; per dispatch prompt resolution |
| OR-3 | Apply only where parenthetical notation appears | Kept | C1, C2 | Helper only expands when gloss matches `BASE(-suffix)` pattern; SQL broadening limited to `LIKE '%(-'` rows |
| OR-4 | Expand the query predicate rather than rewriting stored glosses | Kept | C2 | Displayed gloss is never mutated; only the match logic changes |
| OR-5 | Query-time expansion, self-contained, no FTS5 dependency | Kept | C1, C2 | Pure application-level TypeScript change; no schema migration |
| OR-6 | Deterministic, rule-based expansion only | Kept | C1 | `expandParentheticalGloss` is a pure regex/string-split function; no model involvement |
| OR-7 | Pure string-rule transformation; no new tables | Kept | C1, C2 | No schema changes; one new TS function + modified search branch |
| OR-8 | TDD: RED/GREEN scenario for expanded form matching abbreviated gloss | Kept | C3 | One RED test (search for "whenever", mock returns "when(-ever)", assert miss); one GREEN test (same, assert hit after fix) |

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A: Gloss-side broadened SQL fetch + JS post-filter (chosen) | No schema changes; coherent with OR-3/OR-4; deterministic; no lossy inversion | Slightly broader SQL fetch (all rows with `(-` in gloss); requires post-filter loop | **Chosen** |
| B: Query-side inversion (derive abbreviated base from user's spelled-out term) | Avoids extra SQL fetch | Lossy and non-deterministic; cannot reliably infer base from expanded form; defeats purpose of the feature | Rejected — per understand report Frame Challenge resolution and dispatch prompt |
| C: Precomputed `search_keys` column migration | Fastest query; no post-filter | Schema change required; FTS5 migration dependency; violates OR-5, OR-7 | Rejected — explicitly deferred by OR-5 and OR-7 |

## Components

### C1: `expandParentheticalGloss` helper

**Covers:** OR-1, OR-3, OR-6
**File:** `server/src/tools/lexicon.ts`
**Approach:**

Pure TypeScript function. Parse rules:

1. Match the pattern `BASE(-PART1, PART2, ...)` where the gloss has a single parenthetical group and the first element inside the parens starts with `-`. Regex: `/^(.+?)\((-[^)]+)\)(.*)$/`
2. If no match (gloss has no `(-` group, or first element does not start with `-`): return `[gloss]` unchanged (OR-3: leave richer entries untouched).
3. Split the captured inner string on `,` and trim each part.
4. For each part:
   - If it starts with `-` (leading hyphen): expanded form = `base + part.slice(1)` (suffix concatenation, no hyphen in output). E.g., base=`when`, part=`-ever` → `whenever`.
   - If it does not start with `-` (edge case, e.g. a standalone word): append as-is.
5. Return `[base, ...expandedForms]` where `base` is the text before the `(`.
6. Lowercase normalization is applied by the caller (the search branch already lowercases via `LOWER(gloss)` in SQL and `term` sanitization); the helper operates on the raw gloss string but callers compare lowercased.

Examples:
- `"when(-ever)"` → `["when", "whenever"]`
- `"thus(-ly)"` → `["thus", "thusly"]`
- `"light(-en, -ning)"` → `["light", "lighten", "lightning"]`
- `"where(-ever, -fore)"` → `["where", "wherever", "wherefore"]`
- `"love"` → `["love"]` (no parenthetical, unchanged)
- `"Bel and the Dragon"` → `["Bel and the Dragon"]` (parens present but first element not `-`; leave untouched)

**Effort:** S

### C2: Modified search branch — broadened SQL + JS post-filter

**Covers:** OR-2, OR-3, OR-4, OR-5, OR-7
**File:** `server/src/tools/lexicon.ts` (lines 378–527, search branch)
**Approach:**

1. Existing `term` and `pattern` variables remain unchanged for the direct LIKE match.
2. Add a second broadening pattern: `'%(-'` (a constant literal — not parameterized, as it does not depend on user input).
3. For each of the three table queries (LSJ, Abbott-Smith, BDB), add a third SQL condition:

   ```sql
   WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ?
      OR LOWER(gloss) LIKE '%(-'
   ```

   Pass `[pattern, pattern]` as before — the third clause has no bound parameter (literal string in SQL). This fetches: (a) rows matching the user's term directly, and (b) rows whose gloss contains any parenthetical suffix abbreviation.

4. After `Promise.allSettled` resolves and before building the `entryMap`, apply a JS post-filter on each result set:

   ```typescript
   function glossMatchesTerm(gloss: string, term: string): boolean {
     const expanded = expandParentheticalGloss(gloss);
     return expanded.some(form => form.toLowerCase().includes(term));
   }
   ```

   Keep a row if `LOWER(gloss) LIKE '%term%'` (the original condition, already satisfied by the direct SQL match) OR if `glossMatchesTerm(row.gloss, term)` returns true.

5. Rows passing the filter are inserted into the `entryMap` exactly as before (no change to merge/dedup logic, sort order, 20-result cap, UBS domain join, or response format).

**Note on SQL literal vs. parameter:** The `'%(-'` clause is a constant not derived from user input; it is not parameterized. This is safe — no injection risk. The existing parameterized pattern (`?`) handles the user's sanitized term.

**Note on LIMIT:** The current SQL uses `LIMIT 20` per source table. With the broadened fetch, rows with `(-` in their gloss are included as candidates even if they do not ultimately pass the JS post-filter. At ~31,400 total rows and the prevalence of `(-` patterns being limited (STEPBible data subset), the candidate count per table remains well within the `LIMIT 20` window. If there is concern, the limit can be raised to, say, `LIMIT 40` on the SQL query while retaining the 20-result cap on the final merged result. This is a calibration decision for the implementer; the design supports either.

**Effort:** S

### C3: TDD — RED/GREEN test scenarios

**Covers:** OR-8
**File:** `server/src/tools/lexicon.test.ts`
**Approach:**

Add two new `describe` blocks after the existing test suites:

**Unit tests for `expandParentheticalGloss`** (exported or tested via search behavior):
- `when(-ever)` → `["when", "whenever"]`
- `thus(-ly)` → `["thus", "thusly"]`
- `light(-en, -ning)` → `["light", "lighten", "lightning"]`
- `love` (no parens) → `["love"]`
- Gloss with non-suffix parens (e.g. `Bel and the Dragon`) → unchanged

**Search integration tests (mock-based, following existing pattern):**

RED scenario (documents the miss — written first, before the fix, expected to fail):
```typescript
it('[RED] search for "whenever" misses gloss "when(-ever)" without expansion', async () => {
  mockQuery.mockResolvedValueOnce([
    { strongs_id: 'G3698', gloss: 'when(-ever)', ... }
  ]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const result = await queryLexicon({ search: 'whenever' });
  const body = JSON.parse(result.content[0].text);
  expect(body.entries).toHaveLength(0); // miss confirmed
});
```

GREEN scenario (written to pass after the fix):
```typescript
it('[GREEN] search for "whenever" hits gloss "when(-ever)" with expansion', async () => {
  mockQuery.mockResolvedValueOnce([
    { strongs_id: 'G3698', gloss: 'when(-ever)', ... }
  ]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const result = await queryLexicon({ search: 'whenever' });
  const body = JSON.parse(result.content[0].text);
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0].strongs_id).toBe('G3698');
  expect(body.entries[0].gloss).toBe('when(-ever)'); // displayed gloss unchanged
});
```

Also add: regression test confirming non-parenthetical glosses (`"love"`) are unaffected.

**Effort:** S

## Error Handling

No new failure modes are introduced. The `expandParentheticalGloss` helper is a pure function that cannot throw: it performs only regex matching and string operations on its input. If the regex does not match, it returns `[gloss]` unchanged. The JS post-filter wraps it inside the existing `lsjResult.status === 'fulfilled'` branch — a failure at this level would require a programming error (e.g. null passed for `gloss`), which is guarded by the `SourceRow` type having `gloss: string`. The existing `Promise.allSettled` structure and error accumulation into `errors[]` are unchanged.

## Testing Strategy

Unit tests using Vitest with `vi.mock('../db/query.js')` — the existing test pattern. No real D1 database is needed. Tests are co-located in `server/src/tools/lexicon.test.ts`. The `expandParentheticalGloss` helper is exported (or has its behavior tested through the search function) and covered with table-driven unit tests. The RED/GREEN approach satisfies OR-8: RED documents the miss before the fix; GREEN confirms the hit after. All 197 lines of existing tests must remain green.

## Stage Handoff

### Decisions Made
- Gloss-side expansion is the correct interpretation: expand candidates from stored glosses, not from the user's query (Frame Challenge resolved per understand report and dispatch prompt)
- SQL broadening uses a literal `LIKE '%(-'` clause (constant, not parameterized) to fetch the candidate superset without a schema change
- `expandParentheticalGloss` only expands when the parenthetical group's first element starts with `-` (suffix marker); all other parenthetical patterns are left unchanged (OR-3)
- Leading-hyphen suffixes are concatenated to the base without the hyphen in the output form (e.g., `when` + `-ever` → `whenever`, not `when-ever`)
- The SQL `LIMIT 20` per table is retained; if the broadened fetch saturates this limit before including all direct matches, calibration (raising to LIMIT 40) is deferred to the implementer

### Rejected Approaches
- Query-side inversion — lossy and non-deterministic; cannot reliably infer abbreviated base from user's spelled-out term
- Precomputed `search_keys` column — requires schema migration; explicitly deferred by OR-5 and OR-7
- FTS5 virtual table — blocked by `cloudflare/workers-sdk#9519`

### Open Questions
- If the broadened SQL fetch (`LIKE '%(-'`) returns >= 20 rows per table (saturating `LIMIT 20`) before the direct LIKE match rows are included, direct matches could be excluded from the candidate set. This is unlikely given the corpus size, but the implementer should verify by checking how many rows contain `(-` in the seed data and consider raising the per-table limit if needed. (owner: human, resolution: verify against seed data during implementation)

### Constraints Carried Forward
- `expandParentheticalGloss` must never mutate the returned `gloss` field in any `SourceRow` — the displayed gloss is always the verbatim stored value (OR-4)
- The helper must return `[input]` unchanged for any gloss where the parenthetical group's first element does not start with `-` (OR-3 boundary)
- No new tables, no schema migrations, no FTS5 (OR-5, OR-7)
- The expansion is purely at match time; it has no effect on the response's `gloss` field

## Expert Consultation Log

| Expert | Gate Point | Category | Finding | Impact on Design |
|--------|-----------|---------|---------|-----------------|
| — | pre-approach | default-dispatch (string-manipulation utility, single-file) | No external API, no security surface; keyword detection produced no forced dispatches; stakes assessed as low (deterministic string parsing with clear specification). Gate suppressed in suppress-adjacent posture: task is pure string manipulation with fully specified parse rules. | No impact — design proceeded from understand report and dispatch prompt constraints |

<!-- critic-findings
critic-rating: ADEQUATE
findings:
Domain 1 (Missing error propagation paths): expandParentheticalGloss is a pure function with no throw paths; post-filter is inside fulfilled branch. No issues.
Domain 2 (Invariant violations): The LIKE '%(-' broadening is a constant, not user-derived. The JS post-filter is additive over the existing entryMap merge. Limit 20 saturation edge case flagged in Open Questions. No invariant violations.
Domain 3 (Scope coverage gaps): All eight OR items are traced. Three components map cleanly to OR-1/3/6, OR-2/4/5/7, and OR-8. No orphan stories or components.
Domain 4 (Assumption leakage): One implicit assumption: the prevalence of '(-' rows in the seed data does not saturate the LIMIT 20 per table before direct matches appear. Surfaced in Open Questions with owner:human. Acceptable.
Domain 5 (Interface ambiguity): The expandParentheticalGloss contract is fully specified: input raw gloss string, output string[], no throw, unchanged for non-matching patterns. The glossMatchesTerm helper contract is inline. No ambiguity.
critic-findings -->
