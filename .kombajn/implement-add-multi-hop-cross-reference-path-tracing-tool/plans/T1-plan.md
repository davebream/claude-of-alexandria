# Multi-hop cross-reference path tracing tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add an MCP tool `trace_cross_reference_path` that returns a bounded, attributed chain of cross-references connecting two verses over the existing `cross_references` D1 graph.

**Architecture:** Complete-up-to-budget bidirectional in-memory BFS in TypeScript over per-frontier indexed queries (frontier grouped by `(book, chapter)` + scalar verse `IN`). Node identity is a single verse; range-valued `to` endpoints are exploded into per-verse nodes. The `parents` map stores each full stored edge + connecting verse so hops render verbatim (correct orientation). `votes` orders/selects but never prunes traversal. Co-located in `cross-references.ts`, registered in `index.ts`.

**Tech Stack:** TypeScript, Cloudflare Workers, D1 (SQLite), Zod, `@modelcontextprotocol/sdk`, vitest.

---

## Context Files

> Pre-load these files at the start of each build phase.

| File | Source | Confidence |
|------|--------|-----------|
| `server/src/tools/cross-references.ts` | understand: Key Code Locations; design: C1–C4 | confirmed |
| `server/src/tools/cross-references.test.ts` | understand: Implementation Signals; design: C6 | confirmed |
| `server/src/index.ts` | understand: Key Code Locations (`:718`); design: C5 | confirmed |
| `server/src/db/query.ts` | understand: Key Code Locations (`:11`) | confirmed |
| `server/src/db/books.ts` | understand: Key Code Locations (`:156`) | confirmed |
| `server/src/tools/utils.ts` | understand: Key Code Locations (`:29`) | confirmed |
| `server/migrations/0006_add_cross_references.sql` | understand: Key Code Locations | confirmed |

---

## Out of Scope

> Explicitly document what will NOT be done in this plan.

- No schema migration or data ingestion — read-only over existing `cross_references` rows.
- No change to `query_cross_references` behaviour or its schemas.
- No `max_paths` / k-best multi-path enumeration — returns the single strongest shortest path.
- No theological-relationship inference; only data-provided `votes` weighting.
- No agent-level promptfoo RED/GREEN scenario in this plan — vitest is the OR-8 TDD layer; promptfoo is an optional follow-up (design Open Question).
- No new index or `ANALYZE`; relies on existing `idx_xref_from` / `idx_xref_to`.

---

### Task 1: Input/output schemas + endpoint resolution

**Implements:** OR-1, OR-4 (partial), OR-5 (output shape) → C1, C2
**Depends on:** none
**Phase:** 1 — Schema & resolution
**Done when:** `TraceCrossReferencePathInputSchema` / `TraceCrossReferencePathOutputSchema` are exported from `cross-references.ts`; `traceCrossReferencePath()` resolves both endpoints, returns `BOOK_NOT_FOUND` / `INVALID_RANGE` errors and the same-verse zero-hop short-circuit; new tests pass; `npm run typecheck` clean.

**Files:**
- Modify: `server/src/tools/cross-references.ts` (add schemas + `traceCrossReferencePath` skeleton)
- Test: `server/src/tools/cross-references.test.ts` (add a `describe('traceCrossReferencePath — resolution')` block)

**Step 1: Write failing tests for resolution + error shapes**
Cover: book-not-found → `isError` with `suggestions`; invalid range → `isError` `INVALID_RANGE`; multi-verse range (e.g. `from_range: "3:15-16"`) → `isError` `INVALID_RANGE` ("single verse"); same source/target verse → `found: true`, `hops: 0`, `path: []`, not an error. Mock `query()` via the existing `vi.mock('../db/query.js')` pattern.

**Step 2: Run tests, verify they fail**
Run: `cd server && npx vitest run src/tools/cross-references.test.ts -t 'resolution'`
Expected: FAIL (`traceCrossReferencePath` not exported). The `-t 'resolution'` filter scopes the run to the new `describe('traceCrossReferencePath — resolution')` block so the RED signal is not muddied by the legacy `queryCrossReferences` suites.

**Step 3: Add Zod schemas**
Add `TraceCrossReferencePathInputSchema` (`from_book`, `from_range`, `to_book`, `to_range` required strings; `max_hops?` number default 4 clamp 1–6; `min_votes?` number default 1) and `TraceCrossReferencePathOutputSchema` per design C1 (`from_ref`, `to_ref`, `found`, `truncated`, `hops`, `max_hops`, `path[]` with `{from_ref,to_ref,votes,connecting_ref}`, `summary{nodes_visited,edges_examined,min_votes}`, `attribution`, optional `note`).
> Note: `min_votes` default is **1**, which intentionally diverges from `queryCrossReferences`'s default of `2` (`cross-references.ts:49`). The lower floor maximizes connectivity for path-finding; do not "correct" it to 2.

**Step 4: Implement endpoint resolution + short-circuit**
Reuse `lookupBook`/`suggestBooks` (mirror `cross-references.ts:40-47`) and `parseVerseRange`. Reject ranges where `startVerse != endVerse || startChapter != endChapter` with `INVALID_RANGE`. Same-verse → return zero-hop `found:true` result. Defer traversal (return a `found:false` placeholder is acceptable here; Task 2 fills it in).

**Step 5: Run tests, verify they pass**
Run: `cd server && npx vitest run src/tools/cross-references.test.ts`
Expected: PASS.

**Step 6: Commit**
```bash
git add server/src/tools/cross-references.ts server/src/tools/cross-references.test.ts
git commit -m "feat(mcp): add trace_cross_reference_path schemas and endpoint resolution"
```

---

### Task 2: Bounded BFS traversal engine + path reconstruction

**Implements:** OR-2, OR-3, OR-4, OR-5, OR-6, OR-7 → C3, C4
**Depends on:** Task 1
**Phase:** 2 — Traversal core
**Done when:** `traceCrossReferencePath` performs the bounded BFS and returns an ordered attributed path; all traversal tests pass; `npm run typecheck` clean.

**Files:**
- Modify: `server/src/tools/cross-references.ts` (traversal + reconstruction)
- Test: `server/src/tools/cross-references.test.ts` (add `describe('traceCrossReferencePath — traversal')`)

**Step 1: Write failing planted-graph tests (RED)**
Drive `query()` with a `mockImplementation` that returns edges for queried `(book, chapter, from_verse IN/to_verse_start IN)` so a small graph is planted. Assertions:
- **GREEN path:** a 2-hop chain A→M→B returns `path` of length 2, hops ordered A→M then M→B, each with correct `votes` and `connecting_ref` = M.
- **SQL shape:** issued SQL contains `review_status = 'ok'`, `votes >=`, `from_chapter = ?` with `from_verse IN (` (and the symmetric `to_book = ? ... to_verse_start IN (`); no `OR ` chain; no `VALUES (` composite row-value `IN`.
- **Backward-orientation:** a path reachable only via the `to`-side query still emits each hop's `from_ref`/`to_ref` matching the stored row orientation (not swapped).
- **Range explosion:** an edge whose `to` range spans `15-16` lets a target verse `16` be found (path through the non-start verse).
- **No degree-cap false-negative:** a length-2 path whose connecting edge has low `votes` (e.g. 1) is still returned (no pruning).
- **No path:** disconnected planted graph → `found:false`, `truncated:false`, `isError` falsy.
- **Truncated (max_hops):** `max_hops: 1` on a 2-hop-only graph → `found:false`, `truncated:true`.
- **Truncated (range-explode cap):** plant a `to` range wider than `RANGE_EXPLODE_CAP` (>8 verses) on a frontier edge → `truncated:true` (only the start verse was enqueued).
- **Truncated (node/edge budget):** plant a graph (or pass a test-only reduced budget) that exceeds `NODE_BUDGET`/`EDGE_BUDGET` before reaching the target → `truncated:true`. (All four budget knobs are load-bearing for OR-6 and each needs a pin.)
- **Char-limit guard:** plant a path long enough to approach `CHARACTER_LIMIT` (25_000) → `truncated:true`, the ordered `path` stays adjacency-intact (interior hops NOT dropped — a connected path can only flag, not thin), and cosmetic fields (`note`) are omitted to save budget (per design C4).
- **Summary counters:** assert `summary.nodes_visited` / `summary.edges_examined` reflect the planted graph and `summary.min_votes` echoes the input.
- **Mid-traversal error:** `query()` rejects on the 2nd call → result `isError` truthy, no partial `path`.

**Step 2: Run tests, verify they fail**
Run: `cd server && npx vitest run src/tools/cross-references.test.ts -t 'traversal'`
Expected: FAIL. The `-t 'traversal'` filter scopes to the new `describe('traceCrossReferencePath — traversal')` block; the Task 1 `resolution` block and legacy suites stay out of the RED signal.

**Step 3: Implement the BFS engine**
Per design C3: frontier of single-verse node keys; `visited: Set`; `parents: Map<key, {edge, connectingVerse, prev}>`. Per hop ≤ `max_hops`, group frontier by `(book, chapter)`, issue the two indexed queries (scalar verse `IN`), expand **all** qualifying neighbours (ordered `votes DESC`), explode `to` ranges into per-verse nodes (cap `RANGE_EXPLODE_CAP = 8` → else start verse + `truncated`), enforce `NODE_BUDGET = 2000` / `EDGE_BUDGET = 20000`, stop when target dequeued.
> **Internal try/catch is load-bearing — there is NO `index.ts` tool-call wrapper.** `cachedToolCall` (`index.ts:482`) does not wrap the handler in try/catch (the only try/catch in `index.ts` are the cache-write guard and the `/health` probe). A thrown `query()` error therefore escapes raw unless `traceCrossReferencePath` catches it itself. Wrap the whole traversal in `try { ... } catch { return { isError: true, ... } }` so a mid-traversal rejection aborts, discards the partial `parents` map, and returns `isError` (never a partial path, never an uncaught throw — preserves OR-4's non-error contract).

**Step 4: Implement path reconstruction + output formatting**
Per design C4: walk `parents` from target to source; emit each hop verbatim from the stored edge (`from_ref`, `to_ref` with range suffix per `cross-references.ts:144-152`, `votes`, `connecting_ref`); set `found`/`hops`/`truncated`/`summary`/fixed `attribution`; apply `CHARACTER_LIMIT = 25_000` guard (sets `truncated`). Return `content[0].text` + `structuredContent`.

**Step 5: Run tests, verify they pass**
Run: `cd server && npx vitest run src/tools/cross-references.test.ts -t 'traversal'`
Expected: PASS. Then run the whole file unfiltered (`npx vitest run src/tools/cross-references.test.ts`) to confirm no regression in the legacy suites.

**Step 6: Commit**
```bash
git add server/src/tools/cross-references.ts server/src/tools/cross-references.test.ts
git commit -m "feat(mcp): implement bounded BFS traversal for trace_cross_reference_path"
```

---

### Task 3: MCP registration + index-plan verification + full suite

**Implements:** OR-1, OR-8 → C5, C6
**Depends on:** Task 2
**Phase:** 3 — Registration & verification
**Done when:** `trace_cross_reference_path` is registered in `index.ts`; `npm run typecheck` and `npm run test` (vitest) both pass; the grouped scalar-`IN` query is **either** confirmed index-using via `EXPLAIN QUERY PLAN` **or** the per-node single-tuple fallback is applied by default (fail-safe — see Step 3).

**Files:**
- Modify: `server/src/index.ts` (import, `DESC_TRACE_CROSS_REFERENCE_PATH`, `server.registerTool` + `cachedToolCall`)

**Step 1: Add the DESC block and registration**
Mirror `index.ts:228` (`DESC_CROSS_REFERENCES`) and `:718-731`. Description documents: bounded `max_hops`, attributed-not-asserted framing, `found`/`truncated` semantics, single-verse refs required, example Genesis 3:15 → Revelation 12. Register with `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`.
> **Match the existing `cachedToolCall` arg cast exactly** — all 23 registrations pass `args as unknown as Record<string, unknown>` (e.g. `index.ts:730`). Use:
> `cachedToolCall('trace_cross_reference_path', args as unknown as Record<string, unknown>, () => traceCrossReferencePath(args))`
> Omitting the cast fails `npm run typecheck` (the Step 2 gate).

**Step 2: Verify typecheck + tool count**
Run: `cd server && npm run typecheck`
Expected: clean. Tool count `grep -c "server.registerTool" src/index.ts` → 24.

**Step 3: Verify query plan rides the index (design Open Question / critic 4.2)**
Confirm the grouped `from_book = ? AND from_chapter = ? AND from_verse IN (...)` shape matches the leading columns of `idx_xref_from`/`idx_xref_to`. If a local D1/`wrangler` or `sql.js` harness is available, run `EXPLAIN QUERY PLAN` on a representative query and confirm `SEARCH ... USING INDEX idx_xref_from`. **Forcing function (fail-safe):** if no EXPLAIN harness is reachable in the worktree (vitest mocks `query()` and never touches real SQLite), do NOT ship the unverified grouped-`IN` query — default to the per-node single-tuple equality form (`from_book=? AND from_chapter=? AND from_verse=? ...`), which is unconditionally index-using, and re-run Task 2 tests under it. Only keep the grouped-`IN` form when EXPLAIN positively confirms index use. Record which form shipped, and the EXPLAIN result if run, in the commit body.

**Step 4: Run full test + typecheck gate**
Run: `cd server && npm run test && npm run typecheck`
Expected: all pass.

**Step 5: Commit**
```bash
git add server/src/index.ts
git commit -m "feat(mcp): register trace_cross_reference_path tool"
```

---

## Expert Consultation Log

| Expert | Gate Point | Category | Finding | Impact on Plan |
|--------|-----------|---------|---------|---------------|
| critic | design-critic (design stage) | adversarial-design | 3 CRITICAL + 3 MAJOR resolved in design revision | Covered in design stage (see design doc log) — plan tasks encode the corrected model |
| critic | plan-critic (Step "Critic Review") | adversarial-plan | ADEQUATE; 4 MAJOR mechanical defects (args cast, false wrapper rationale, missing budget/range-explode test pins, missing -t filters) + 2 MINOR | Plan revised: cast fixed, internal try/catch made load-bearing, truncation/char-limit/summary test pins added, -t filters added, query-plan fallback forcing function, min_votes divergence note |
| — | plan approach/section | — | No domain experts dispatched (autonomous, standard tier; internal read-only traversal) | — |

---

## Stage Handoff

### Decisions Made
- Three phases / three tasks: schemas+resolution (P1), BFS traversal+reconstruction as one cohesive task (P2), registration+query-plan verification+full-suite gate (P3).
- All TDD: each task writes failing tests first against the mocked `query()` seam, then implements.
- Traversal and reconstruction stay in one task to avoid an intermediate non-compiling split.
- Query-plan verification is an explicit build step with a per-node-fallback escape hatch (critic 4.2).

### Rejected Approaches
- Splitting traversal (C3) and reconstruction (C4) into separate tasks — would leave a non-compiling intermediate state; merged into Task 2.
- A dedicated migration/index task — existing `idx_xref_from`/`idx_xref_to` suffice; no schema change (OR-7).

### Open Questions
- D1 query-plan confirmation of grouped scalar-`IN` index use — resolved in Task 2/3 with per-node fallback. (owner: builder, resolution: Task 3 Step 3)
- Promptfoo agent-level RED/GREEN scenario — deferred as optional follow-up; vitest is the OR-8 layer. (owner: human, resolution: post-merge follow-up)

### Constraints Carried Forward
- Every hop renders verbatim from the stored edge and carries `votes` — attribution guardrail; never an asserted theological claim.
- Filter `review_status = 'ok'`; preserve `query_cross_references` unchanged.
- All budget knobs (`max_hops`, `NODE_BUDGET`, `EDGE_BUDGET`, `RANGE_EXPLODE_CAP`) are load-bearing for OR-6 — each has a test pin.
- `traceCrossReferencePath` must catch its own `query()` errors (no `index.ts` wrapper exists).
- `cachedToolCall` registration must use the `args as unknown as Record<string, unknown>` cast.
- Read-only; no schema migration; no data ingestion.

<!-- critic-findings
critic-rating: ADEQUATE
findings:
Plan rated ADEQUATE / REVISE. Four MAJOR mechanical defects, all incorporated:
- MAJOR (Domain 5): cachedToolCall snippet dropped the mandatory `args as unknown as Record<string, unknown>` cast (would fail the Task 3 typecheck gate). FIXED in Task 3 Step 1.
- MAJOR (Domain 5): design claimed a thrown query() error is caught by an index.ts tool wrapper — no such wrapper exists. FIXED: design Error Handling corrected; Task 2 Step 3 makes the internal try/catch explicit and load-bearing.
- MAJOR (Domain 4): RANGE_EXPLODE_CAP and node/edge budget truncation (load-bearing for OR-6) had no test pins; only max_hops truncation was covered. FIXED: Task 2 Step 1 adds range-explode, budget-exhaustion, char-limit, and summary-counter test pins.
- MAJOR (Domain 2): every test-run command ran the whole file with no -t filter, so "Expected: FAIL" never matched actual output. FIXED: Task 1 uses -t 'resolution', Task 2 uses -t 'traversal', full-file run retained in Task 3 Step 4.
- MINOR: Task 3 Step 3 EXPLAIN verification had no forcing function. FIXED: per-node fallback is now the fail-safe default when no EXPLAIN harness is available.
- MINOR: min_votes default-1 divergence from the existing tool's default-2 not surfaced. FIXED: Task 1 Step 3 note added.
Ordering (Domain 1) and component completeness (Domain 4: C1–C6 all pinned, all three design CRITICAL fixes test-pinned) were assessed sound.
critic-findings -->
