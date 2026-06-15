# Understand: Add multi-hop cross-reference path tracing tool

**Source:** GitHub issue #59
**Issue:** https://github.com/davebream/claude-of-alexandria/issues/59
**Repo:** davebream/claude-of-alexandria
**State:** open
**Already-implemented:** not detected
**Generated:** 2026-06-15
**Budget used:** 0/5 linked resources, 0/3 subagents, 3/3 areas explored

## Original Requirements (verbatim)

> ## Description
>
> Add an MCP tool that finds a *chain* of cross-references connecting two arbitrary verses, traversing the existing `cross_references` graph hop by hop, rather than only returning the direct (1-hop) references for a single verse.
>
> ## Background
>
> The server currently exposes `query_cross_references`, which returns the cross-references for a single passage — a single hop out of the edge set (~340k edges, each carrying a `votes` weight) stored in the `cross_references` D1 table. There is no way to ask "how does passage A connect to passage B through intermediate links," which is the natural shape of typology and biblical-theology tracing (e.g. protoevangelium → seed-of-the-woman → offspring → fulfillment).
>
> ## Use Case / Problem
>
> A scholar tracing a theme across the canon wants to see the *path* between two passages — Genesis 3:15 to Revelation 12, say — with each intermediate verse and the provenance (vote weight) of each hop, not just the immediate neighbors of one verse. Today this requires repeated manual `query_cross_references` calls stitched together by hand.
>
> ## Proposed Solution
>
> Add a tool (working name `trace_cross_reference_path`) that:
>
> - Accepts a source reference, a target reference, and a `max_hops` bound (default small, e.g. 4).
> - Runs a bounded breadth-first search over the `cross_references` table (recursive CTE or in-memory traversal), using `votes` as an edge weight to prefer stronger links.
> - Returns the shortest / strongest path(s) as an ordered list of hops, each carrying the connecting verse and that edge's vote count, plus a `truncated: true` flag when the bound is hit so callers know the search was cut off rather than exhausted.
> - Returns an explicit "no path within N hops" result instead of erroring.
>
> Treat every hop as an *attributed* link ("the cross-reference set lists this connection with N votes"), never as an asserted theological claim — consistent with the project's data-grounding and theological-guardrail posture.
>
> ## Constraints
>
> - Must not scan the full ~340k-edge graph unbounded; the `max_hops` bound plus a per-query node/edge budget are required to stay within Workers/D1 limits.
> - Runs entirely on data already in the `cross_references` table — no new data ingestion.
> - Follow the repo's TDD methodology: a RED scenario proving the bare model cannot trace a sourced multi-hop path, and a GREEN scenario proving the tool returns an attributed, bounded path.

### Requirement Items (as stated)
- OR-1: Accepts a source reference, a target reference, and a `max_hops` bound (default small, e.g. 4).
- OR-2: Runs a bounded breadth-first search over the `cross_references` table (recursive CTE or in-memory traversal), using `votes` as an edge weight to prefer stronger links.
- OR-3: Returns the shortest / strongest path(s) as an ordered list of hops, each carrying the connecting verse and that edge's vote count, plus a `truncated: true` flag when the bound is hit.
- OR-4: Returns an explicit "no path within N hops" result instead of erroring.
- OR-5: Treat every hop as an *attributed* link, never an asserted theological claim.
- OR-6: Must not scan the full ~340k-edge graph unbounded; `max_hops` bound plus a per-query node/edge budget required to stay within Workers/D1 limits.
- OR-7: Runs entirely on data already in the `cross_references` table — no new data ingestion.
- OR-8: Follow the repo's TDD methodology: a RED scenario (bare model cannot trace a sourced multi-hop path) and a GREEN scenario (tool returns an attributed, bounded path).

### Acceptance Criteria (as stated)
- None explicitly stated in source. (No labeled AC block; criteria derived in `## Requirements` below.)

### Human Comment Updates (verbatim, if any)
- None.

## Issue Summary

The issue requests a new MCP tool (working name `trace_cross_reference_path`) that finds a *chain* of cross-references connecting two arbitrary verses by traversing the existing `cross_references` graph hop by hop, instead of returning only the 1-hop neighbors that `query_cross_references` already provides. The traversal is bounded by `max_hops` (default ~4) plus a node/edge budget, uses `votes` as an edge weight to prefer stronger links, and returns each hop as an *attributed* link (with its vote count) rather than an asserted theological claim. It must return an explicit "no path within N hops" result and a `truncated` flag, never error on absence of a path. No new data ingestion — it runs on the existing ~340k-edge table. The issue explicitly invokes the repo's TDD methodology (RED + GREEN). No unresolved decisions, disagreements, or deferred scope are flagged in the issue; there are no comments.

## Affected Areas

| Area | Confidence | Path(s) | Why affected |
|------|-----------|---------|--------------|
| Cross-reference tool module | confirmed | `server/src/tools/cross-references.ts` | New traversal logic lives beside the existing 1-hop tool; shares the `cross_references` table, `lookupBook`, `parseVerseRange` |
| MCP tool registration | confirmed | `server/src/index.ts:718` | New tool must be registered with `server.registerTool(...)` + a `DESC_*` description block, mirroring `query_cross_references` |
| Cross_references schema/indexes | confirmed | `server/migrations/0006_add_cross_references.sql`, `0014_add_xref_review_status.sql` | Traversal queries use `idx_xref_from` / `idx_xref_to`; `review_status = 'ok'` filtering must be preserved per existing convention |
| Unit tests (vitest) | confirmed | `server/src/tools/cross-references.test.ts` (or a new sibling test file) | TDD: failing test first, mocking `query()` from `../db/query.js` |
| Agent-level RED/GREEN (promptfoo) | likely | `tests/promptfoo/skills/...` | Issue invokes RED/GREEN methodology; current promptfoo suites are skill-scoped, no cross-ref dir exists yet — placement is a design decision |

## Key Code Locations

- `server/src/tools/cross-references.ts:36` — `queryCrossReferences()` — the existing single-hop tool; the new traversal mirrors its structure (input schema, `lookupBook`, `parseVerseRange`, `review_status='ok'`, votes-desc ordering, char-limit guard, `structuredContent`)
- `server/src/tools/cross-references.ts:9` — `CrossReferencesInputSchema` — Zod input pattern (`book` + optional `range`); the new tool needs source + target references (likely `from_book`/`from_range` + `to_book`/`to_range`)
- `server/src/tools/cross-references.ts:82-126` — two-separate-indexed-queries pattern ("never OR") — each BFS frontier expansion should issue indexed `from_book/from_chapter/from_verse` lookups, not a full-table OR scan
- `server/src/index.ts:228` — `DESC_CROSS_REFERENCES` — description-block convention for a new `DESC_TRACE_CROSS_REFERENCE_PATH`
- `server/src/index.ts:718-731` — `server.registerTool('query_cross_references', {...})` — registration + `cachedToolCall(...)` wrapper pattern to replicate
- `server/src/db/query.ts:11` — `query(sql, params)` — the single async D1 query primitive; D1/SQLite supports `WITH RECURSIVE` (not yet used anywhere in `src/`)
- `server/src/db/books.ts:156` — `lookupBook(input)` / `:180` `suggestBooks(input)` — book-name resolution + error suggestions, reused for both endpoints
- `server/src/tools/utils.ts:29` — `parseVerseRange(range)` — verse parsing reused to resolve each endpoint to chapter/verse
- `server/migrations/0006_add_cross_references.sql:15-16` — `idx_xref_from` / `idx_xref_to` — the indexes a bounded BFS must ride to avoid scanning ~340k edges
- `server/src/tools/cross-references.test.ts:6` — `vi.mock('../db/query.js')` — established unit-test pattern (mock `query()`, assert SQL + output shape)

## Contradictions & Gaps

No contradictions found between issue claims and codebase. The issue's technical premises are accurate:
- `query_cross_references` exists and returns single-hop references (`cross-references.ts:36`) — confirmed.
- The `cross_references` D1 table exists with a `votes` weight and from/to BCV columns (`0006_add_cross_references.sql`) — confirmed.
- ~340k edges and indexed from/to lookups — table + `idx_xref_from`/`idx_xref_to` confirmed; the ~340k count is from the tool description (`index.ts:230`), not independently counted here.
- `review_status = 'ok'` filtering is an existing convention (`0014_add_xref_review_status.sql`, enforced in `cross-references.ts:83,106`) — the new traversal should respect it so flagged/unresolved endpoints are not silently traversed (minor design consideration, not a contradiction).

## Related Open Work

No linked PRs in the issue. `tracker.adapter` is `local`, so no automated PR-overlap scan was run. The most recently merged related work is #66 (`feat(etl): track cross-reference provenance with review_status`) and #67 (lexicon gloss expansion) — both already on `main`; #66 introduced the `review_status` column this tool must respect.

| PR | Title | Area overlap | Status |
|----|-------|--------------|--------|
| #66 | track cross-reference provenance with review_status | `cross_references` table / review_status filter | merged |

## Domain Context

`cross_references` is an editorial-tradition association graph sourced from OpenBible.info (CC BY 4.0): each row is a directed verse→verse(-range) edge with a community `votes` weight indicating association strength. It is *not* an assertion of theological dependence — the project's guardrails require every reference to be presented as an *attributed* link ("the cross-reference set lists this with N votes"), never as a claim that passage A theologically grounds passage B. The new tool extends this from single-hop neighbor lookup to bounded path-finding between two passages, which is the natural shape of typology/biblical-theology tracing — but the same attribution discipline must hold for every intermediate hop. The `review_status` column (added in #66) flags edges whose endpoints did not cleanly resolve; the existing tool filters to `'ok'`, and the traversal should too.

## Implementation Signals

- **Files likely to change:**
  - `server/src/tools/cross-references.ts` — add `traceCrossReferencePath()` + input/output Zod schemas (reason: co-locate with the related single-hop tool, reuse helpers)
  - `server/src/index.ts` — add `DESC_TRACE_CROSS_REFERENCE_PATH`, import, and `server.registerTool('trace_cross_reference_path', ...)` (reason: tool must be registered to be exposed)
  - `server/src/tools/cross-references.test.ts` (or new `trace-cross-reference-path.test.ts`) — failing-first unit tests mocking `query()` (reason: TDD)
- **Events/contracts needing updates:** none (no event sourcing here). The MCP tool contract is the new tool's input/output schema; downstream MCP consumers gain a tool, none break.
- **Existing tests covering the area:** `server/src/tools/cross-references.test.ts` (SQL-shape + output-shape assertions, mocked `query()`).

## Complexity Assessment

| Signal | Value | Tier implication |
|--------|-------|-----------------|
| Affected areas | 5 | ≥4 → standard |
| Cross-directory spread | 3 (`server/src/tools`, `server/src` root, `server/migrations` + `tests/promptfoo`) | ≥3 → standard |
| Contradictions count | 0 | — |
| Pattern markers detected | none (no DDD/CQRS/ES) | — |

**Recommended tier:** standard

## Requirements

Derived from the issue and code-grounded analysis.

**Goals:**
- Add an MCP tool `trace_cross_reference_path` that finds bounded multi-hop path(s) between a source and target passage over the `cross_references` graph.
- Make the search bounded and Workers/D1-safe: respect `max_hops` (default ~4) plus a node/edge budget; expand each frontier via indexed from/to lookups, never a full-table scan.
- Prefer stronger links by using `votes` as an edge weight in path selection/ordering.
- Return attributed hops (connecting verse + that edge's vote count) and a `truncated` flag when the bound is hit; return an explicit "no path within N hops" result rather than erroring.
- Preserve the project's data-grounding/theological guardrails: every hop is an attributed cross-reference, never an asserted theological claim.

**Acceptance criteria:**

```
Given a source reference, a target reference, and max_hops = N
When a chain of cross-references of length ≤ N connects them
Then the tool returns an ordered path of hops, each carrying the connecting verse and that hop's vote count
```

```
Given a source and target with no connecting chain within max_hops
When the bounded search exhausts the budget
Then the tool returns an explicit "no path within N hops" result (no path found), not an error
```

```
Given a search whose frontier hits the max_hops or node/edge budget before exhausting the graph
When results are returned
Then the response carries truncated: true so the caller knows the search was cut off rather than fully exhausted
```

```
Given any returned path
When the response is rendered
Then each hop is framed as an attributed cross-reference (votes count present) and never as an asserted theological dependence
```

```
Given the existing review_status convention
When the traversal expands edges
Then it includes only review_status = 'ok' edges, consistent with query_cross_references
```

**Non-goals:**
- No new data ingestion or schema migration for new data (the issue forbids it; traversal runs on existing table data).
- Not replacing or changing `query_cross_references` behavior.
- No theological-relationship inference or ranking beyond the data-provided `votes` weight.
- No unbounded all-pairs/whole-graph analytics.

**Success metrics:**
- None specified in issue (functional acceptance via RED/GREEN + unit tests).

## Data Gaps

- `tracker.adapter` is `local`, not `github`; the issue body was supplied directly via `gh issue view #59` rather than the skill's GitHub-fetch path. Issue claims were validated against code, but no automated linked-PR/issue traversal (Phase 1 steps 1c–1e) was performed.
- The ~340k edge count and the OpenBible.info provenance are taken from the tool description string (`index.ts:230`), not independently re-counted against the live D1 table.
- RED/GREEN placement is unresolved: the issue invokes the repo's RED/GREEN methodology, but the server uses vitest unit tests while the repo's promptfoo RED/GREEN configs are skill-scoped and no cross-reference test dir exists. Whether "RED/GREEN" means vitest-level, promptfoo agent-level, or both is a design-stage decision.
- Exact input shape for the two endpoints (single `from_ref`/`to_ref` strings vs. `from_book`+`from_range` pairs mirroring the existing tool) is left to design.
