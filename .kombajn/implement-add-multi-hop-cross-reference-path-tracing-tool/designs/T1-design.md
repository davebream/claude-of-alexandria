# Design: Add multi-hop cross-reference path tracing tool

**Requirements:** .kombajn/understand/59-add-multi-hop-cross-reference-path-tracing-tool.md
**Stories covered:** OR-1..OR-8 (see Requirements Traceability)

## Approach

Add a new MCP tool, `trace_cross_reference_path`, to the Cloudflare-Workers MCP server. It finds a bounded chain of cross-references connecting a source verse to a target verse by traversing the existing `cross_references` D1 table hop by hop, instead of returning only the 1-hop neighbours that `query_cross_references` already provides. The tool lives in `server/src/tools/cross-references.ts` beside the existing single-hop tool, reuses `lookupBook`/`suggestBooks` (book resolution), `parseVerseRange` (endpoint parsing), the `review_status = 'ok'` filter, the `votes` weight, and the `db/query.ts` `query()` primitive, and is registered in `server/src/index.ts` with the same `server.registerTool(...)` + `cachedToolCall(...)` pattern as every other tool.

Traversal is a **bounded breadth-first search executed in TypeScript** over per-frontier indexed queries, not an unbounded graph scan and not a SQLite recursive CTE. Each hop expands the current frontier by issuing two indexed lookups — one against `idx_xref_from` (edges whose `from` endpoint is a frontier verse) and one against `idx_xref_to` (edges whose `to` range contains a frontier verse) — so the association is traversed bidirectionally, consistent with `query_cross_references`'s `direction: 'both'` semantics. The search is **complete up to budget**: it expands *every* `review_status = 'ok'`, `votes >= min_votes` neighbour of each frontier node, bounded by `max_hops` (default 4) plus an explicit node budget and edge budget. BFS by hop-count therefore preserves the shortest-path guarantee; `votes` is used only to (a) order neighbours so that among equal-length paths the stronger is preferred, and (b) select the final returned path — it never prunes edges out of the traversal (this is the fix for the degree-cap false-negative defect). When any budget is hit before the target is reached the result carries `truncated: true` (OR-3, OR-6). When no chain exists within the bounds the tool returns an explicit "no path" result with `found: false` — never an error (OR-4).

**Node identity is a single verse** `book|chapter|verse`. Because the `cross_references` `to` endpoint is a verse *range* (`to_verse_start`..`to_verse_end`, schema `0006:9-10`), a `to`-side neighbour whose range spans multiple verses is **exploded into one node per covered verse** (bounded by `RANGE_EXPLODE_CAP = 8`; beyond that, only the start verse is used and `truncated: true` is set). The `from` endpoint is always a single verse. This keeps adjacency correct: the next hop's indexed lookup keys on single verses, and the target verse matches if it is any covered verse of a discovered range.

To stay indexed without relying on composite row-value `IN (VALUES ...)` (whose index use is planner-dependent and unverified), each per-hop query **groups frontier verses by `(book, chapter)` and uses a scalar `IN` on the verse column**: `... WHERE from_book = ? AND from_chapter = ? AND from_verse IN (?, ?, ...) AND votes >= ? AND review_status = 'ok'` rides `idx_xref_from(from_book, from_chapter, from_verse, votes)` as an equality+range scan; the symmetric query rides `idx_xref_to`. This bounds query count to two per `(book, chapter)` group per hop.

Every hop in the returned path is rendered as an **attributed** cross-reference taken **verbatim from the stored edge** — its `from_ref`, `to_ref` (including the `to` range when `to_verse_end > to_verse_start`, per `cross-references.ts:145-148`), and `votes`. The `parents` map records the full stored edge plus the verse that connects it to the previous hop, so a backward-traversed edge is never rendered with swapped orientation. The response carries an attribution note stating that hops reflect the editorial cross-reference set, never an asserted theological dependence (OR-5). No schema migration and no data ingestion are introduced; the tool reads only existing rows (OR-7).

## Requirements Traceability

| Requirement | Source Text | Status | Design Coverage | Justification / Evidence |
|-------------|-------------|--------|-----------------|--------------------------|
| OR-1 | source ref + target ref + `max_hops` bound (default ~4) | Kept | C1, C2 | Input schema accepts `from_book`/`from_range`, `to_book`/`to_range`, `max_hops` (default 4, clamped). Splitting book+range mirrors `CrossReferencesInputSchema` (`cross-references.ts:9`) and reuses `parseVerseRange`. |
| OR-2 | bounded BFS over `cross_references`, `votes` as edge weight to prefer stronger links | Kept | C3 | Per-frontier indexed queries (`idx_xref_from`/`idx_xref_to`, grouped by book+chapter with scalar verse `IN`); `votes` orders neighbours and selects the final path but never prunes traversal (preserves shortest-path completeness). |
| OR-3 | return ordered path(s) with connecting verse + vote count per hop, `truncated: true` when bound hit | Kept | C3, C4 | `parents` map stores the full stored edge + connecting verse; reconstruction emits verbatim ordered hops carrying `votes`; budget/`max_hops`/range-explode-cap exhaustion sets `truncated`. |
| OR-4 | explicit "no path within N hops" instead of erroring | Kept | C4 | `found: false` result with non-error `content`; never `isError`. |
| OR-5 | every hop is an *attributed* link, never an asserted theological claim | Kept | C4 | Output frames hops as cross-reference edges with `votes`; response includes an attribution note; no claim language. |
| OR-6 | no unbounded full-graph scan; `max_hops` + per-query node/edge budget | Kept | C3 | `max_hops`, `NODE_BUDGET`, `EDGE_BUDGET`, `RANGE_EXPLODE_CAP` enforced; per-`(book,chapter)`-group queries keep query count bounded. (No per-node degree cap — pruning was rejected as it breaks shortest-path completeness; see Alternative A′.) |
| OR-7 | runs on existing `cross_references` data; no ingestion | Kept | C3 | Reads only; no migration. |
| OR-8 | TDD: RED (bare model can't trace sourced multi-hop path) + GREEN (tool returns attributed bounded path) | Kept | C6 | Vitest unit tests written RED-first mocking `query()`; promptfoo agent-level scenario placement deferred to plan (see Open Questions). |

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A: Bounded in-memory BFS, complete-up-to-budget, per-`(book,chapter)`-group scalar-`IN` indexed queries | Precise node/edge/hop budget control (the issue's hard constraint); preserves shortest-path completeness; `votes` orders/selects without pruning; definitely-indexed query shape; reuses existing index + patterns | Multiple D1 round-trips (bounded: 2 per book+chapter group per hop) | **Chosen** |
| A′: BFS with per-node `votes DESC` degree cap | Smaller fan-out | Pruning the 65th+ neighbour can drop the only edge on the true shortest path → false `found:false` against the AC | Rejected — violates the connectivity acceptance criterion (critic 2.1) |
| A″: composite row-value `IN (VALUES (?,?,?), ...)` per frontier batch | Fewer queries | SQLite index use for composite row-value `IN` is planner-dependent/unverified; if it scans, defeats OR-6 | Rejected — book+chapter grouping with scalar verse `IN` is reliably indexed (critic 4.2) |
| B: SQLite `WITH RECURSIVE` CTE | Single round-trip | Hard to bound node/edge budget precisely; runaway risk on high-degree nodes; awkward to weight by `votes` or pick "strongest"; bidirectional + range-valued `to` traversal clumsy; no recursive-CTE precedent in `src/` | Rejected — budget controllability is the dominant constraint (OR-6) |
| C: Repeated manual `query_cross_references` calls | No new code | Exactly the manual stitching the issue exists to eliminate | Rejected — restates the problem |

## Components

### C1: Input/Output Zod schemas
**Covers:** OR-1, OR-3, OR-4, OR-5
**Approach:** Add `TraceCrossReferencePathInputSchema` and `TraceCrossReferencePathOutputSchema` to `cross-references.ts`.
Input fields:
- `from_book: string`, `from_range: string` (**required**, single verse, e.g. `"3:15"`)
- `to_book: string`, `to_range: string` (**required**, single verse)
- `max_hops?: number` (default 4; clamped to `[1, 6]`)
- `min_votes?: number` (default 1; an explicit floor the caller may raise — documented as affecting connectivity)

Unlike `query_cross_references`, the ranges are **required and must be single verses** (a graph node is one verse); this divergence is documented in the tool description. `max_paths` is intentionally NOT exposed in the MVP — the tool returns the single strongest shortest path (see Open Questions / critic 2.2).
Output fields: `from_ref`, `to_ref`, `found: boolean`, `truncated: boolean`, `hops: number`, `max_hops: number`, `path: Array<{ from_ref: string; to_ref: string; votes: number; connecting_ref: string }>` (empty when `found:false`), `summary: { nodes_visited: number; edges_examined: number; min_votes: number }`, `attribution: string`, optional `note?: string`.
**Effort:** S

### C2: Endpoint resolution
**Covers:** OR-1
**Approach:** Resolve both endpoints with `lookupBook` (book-not-found → `isError` with `suggestBooks`, mirroring `cross-references.ts:40-47`) and `parseVerseRange` (invalid or missing → `isError` `INVALID_RANGE`). Reject multi-verse source/target ranges with `INVALID_RANGE` ("source and target must each be a single verse") — node identity is a single verse `book|chapter|verse`. If `from` and `to` resolve to the same verse, short-circuit: `found: true`, `hops: 0`, empty `path`.
**Effort:** S

### C3: Bounded BFS traversal engine (complete-up-to-budget)
**Covers:** OR-2, OR-6, OR-7
**Approach:** Internal `async` traversal function (not exported as a tool):
- Frontier = set of single-verse node keys at current depth. `visited: Set<nodeKey>`. `parents: Map<nodeKey, { edge: StoredEdge; connectingVerse: nodeKey; prev: nodeKey }>` — `edge` is the full stored row (`from_*`, `to_book`, `to_chapter`, `to_verse_start`, `to_verse_end`, `votes`) so reconstruction never re-derives orientation (critic 5.1).
- For each hop up to `max_hops`: group the frontier by `(book, chapter)` and issue two indexed queries per group:
  - `SELECT from_book,from_chapter,from_verse,to_book,to_chapter,to_verse_start,to_verse_end,votes FROM cross_references WHERE from_book = ? AND from_chapter = ? AND from_verse IN (?, ...) AND votes >= ? AND review_status = 'ok' ORDER BY votes DESC` (rides `idx_xref_from`; neighbour endpoint = the `to` range)
  - symmetric query: `WHERE to_book = ? AND to_chapter = ? AND to_verse_start IN (?, ...) AND votes >= ? AND review_status = 'ok' ORDER BY votes DESC` (rides `idx_xref_to`; neighbour endpoint = the single `from` verse)
  - Equality on the leading index columns + scalar `IN` on the verse column is reliably indexed (no composite row-value `IN`, no `OR`-chain).
- **Range explosion:** when a `to`-side neighbour spans `to_verse_start..to_verse_end`, enqueue one node per covered verse (cap `RANGE_EXPLODE_CAP = 8`; if exceeded, enqueue only `to_verse_start` and set `truncated = true`). The single connecting verse used for the next hop is recorded in `parents`.
- **No pruning:** expand every qualifying neighbour (subject only to `visited` and budgets). `votes DESC` ordering only determines which equal-length path wins, never which edges are traversed — this preserves the BFS shortest-path guarantee (critic 2.1).
- Stop early when the target verse is dequeued (or discovered inside an exploded range).
- Budgets: `NODE_BUDGET = 2000` distinct nodes, `EDGE_BUDGET = 20000` edges examined. Hitting `max_hops`, `NODE_BUDGET`, `EDGE_BUDGET`, or `RANGE_EXPLODE_CAP` before reaching the target sets `truncated = true` so the caller can distinguish a cut-short search from genuine exhaustion (critic 5.2: when `found:false` and `truncated:false`, no connecting chain exists in the `ok`/`min_votes` subgraph within `max_hops`; `note` records when `min_votes > 1` narrowed the subgraph).
- **Mid-traversal query failure:** a rejected D1 query aborts the whole traversal; the partial `parents` map is discarded and the tool surfaces `isError` (no partial path emitted) (critic 1.1).
**Effort:** L

### C4: Path reconstruction + output formatting
**Covers:** OR-3, OR-4, OR-5
**Approach:** Walk `parents` from target back to source. Each hop is emitted **verbatim from the stored edge** — `from_ref` = `"from_book from_chapter:from_verse"`, `to_ref` = `"to_book to_chapter:to_verse_start[-to_verse_end]"` (reusing the `cross-references.ts:144-152` formatting incl. the range suffix), `votes` = the stored vote count, and `connecting_ref` = the verse shared with the previous hop. The path is the ordered sequence of stored edges; consecutive hops are adjacent via `connecting_ref` (which may be either endpoint of a stored edge, since traversal is bidirectional) — orientation of each printed edge is always its true stored orientation. Set `found`, `hops`, `truncated`, `summary` counters, and a fixed `attribution` string ("Cross-reference edges reflect the OpenBible.info editorial tradition with community vote weights; each hop is an attributed association, not an asserted theological dependence."). Apply the `CHARACTER_LIMIT = 25_000` guard: unlike `query_cross_references` (which drops independent array elements), a single connected path cannot drop interior hops without breaking adjacency, so on overflow the tool **keeps the full ordered `path`** (adjacency intact) but sets `truncated: true` and drops the optional/cosmetic fields (omit `note`, trim `summary` to counts) to stay within budget; if even the bare path exceeds the limit it is still returned in full with `truncated: true` (a max-hops-6 path is small in practice). Return both `content[0].text` (JSON) and `structuredContent`.
**Effort:** M

### C5: MCP registration
**Covers:** OR-1
**Approach:** In `server/src/index.ts`: import `traceCrossReferencePath` + the two schemas; add a `DESC_TRACE_CROSS_REFERENCE_PATH` description block (documenting attributed-not-asserted framing, `max_hops` bound, `found`/`truncated` semantics, and example: Genesis 3:15 → Revelation 12); register via `server.registerTool('trace_cross_reference_path', { ..., annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async (args) => cachedToolCall('trace_cross_reference_path', args, () => traceCrossReferencePath(args)))`.
**Effort:** S

### C6: Tests
**Covers:** OR-8
**Approach:** Vitest unit tests in `server/src/tools/cross-references.test.ts` (or sibling `trace-cross-reference-path.test.ts`), `vi.mock('../db/query.js')`, written RED-first:
- planted 2-hop graph → returns ordered attributed path of length 2 with correct `votes` per hop (GREEN);
- issued SQL contains `review_status = 'ok'`, `votes >=`, `from_chapter = ?`/`from_verse IN (...)` (and the symmetric `to_*`) — indexed shape, no `OR` chain, no composite row-value `IN`;
- **backward-traversed edge renders with correct stored orientation** (path reached only via the `to`-side query still emits `from_ref`/`to_ref` matching the stored row, not swapped) (critic 5.1);
- **`to`-range neighbour is exploded** so a path through a non-start verse of a range is found (critic 4.1);
- **no degree-cap false-negative**: a length-2 path whose connecting edge is low-vote is still returned (critic 2.1);
- no connecting chain within `max_hops` → `found: false`, `isError` falsy (not an error), `truncated: false`;
- budget/`max_hops`/range-explode-cap exhausted before target → `truncated: true`;
- same source/target verse → `hops: 0`, `found: true`;
- multi-verse source/target range → `isError` `INVALID_RANGE`;
- book-not-found → `isError` with suggestions;
- mid-traversal `query()` rejection → `isError`, no partial path (critic 1.1).
**Effort:** M

## Error Handling

- **Book not found** → `isError: true`, `{ code: 'BOOK_NOT_FOUND', suggestions }` (mirrors existing tool).
- **Invalid range** → `isError: true`, `{ code: 'INVALID_RANGE' }`.
- **Multi-verse source/target range** → `isError: true`, `{ code: 'INVALID_RANGE' }` (a node must be a single verse).
- **No path within `max_hops`** → NOT an error: `found: false`, `path: []`. `truncated: false` means genuine exhaustion of the `ok`/`min_votes` subgraph; `truncated: true` means a budget (hops/node/edge/range-explode) cut the search short. `note` records when `min_votes > 1` narrowed connectivity.
- **Budget exhaustion** (node/edge/range-explode/char limit) → `truncated: true`; a shortest path already reconstructed is still returned.
- **Mid-traversal D1 query rejection** → the whole traversal aborts, the partial `parents` map is discarded, and the tool returns `isError` (no partial path). **There is no `index.ts` tool-call try/catch wrapper** (verified: `cachedToolCall` at `index.ts:482` does not wrap the handler; the only try/catch are the cache-write guard and `/health` probe), so `traceCrossReferencePath` MUST wrap its own traversal in `try/catch` and return `isError` — an uncaught throw would violate OR-4's non-error contract. The tool is read-only so there is no partial state to roll back.

## Testing Strategy

Primary TDD layer is **vitest unit tests** mocking `query()` — matching the established server convention (`cross-references.test.ts`), giving a fast RED→GREEN loop without a live D1. Tests assert SQL shape (indexed columns, `review_status='ok'`, `votes` filter, no `OR`), path correctness on a planted in-memory graph, and the non-error semantics of no-path/truncated. The `npm run typecheck` and `npm run test` (vitest) gates run in the build worktree. Agent-level promptfoo RED/GREEN (bare-model-can't-trace vs. tool-traces-attributed-path) is recommended as a follow-up but its placement is unresolved (see Open Questions) — the plan decides whether to include it now or defer.

## Stage Handoff

### Decisions Made
- New tool `trace_cross_reference_path` co-located in `cross-references.ts`; registered in `index.ts` via the standard `registerTool`+`cachedToolCall` pattern.
- Input mirrors the existing `book`+`range` split (`from_book`/`from_range`, `to_book`/`to_range`) rather than a single `"Book C:V"` string, to reuse `lookupBook`+`parseVerseRange`; ranges are required single verses.
- Traversal is **complete-up-to-budget** bounded in-memory BFS (no per-node degree-cap pruning); `votes` orders neighbours and selects the final path but never removes edges from traversal (preserves shortest-path completeness — critic 2.1).
- Per-hop queries group the frontier by `(book, chapter)` and use scalar verse `IN` against `idx_xref_from`/`idx_xref_to` (reliably indexed; avoids unverified composite row-value `IN` — critic 4.2).
- Node identity is a single verse; range-valued `to` endpoints are exploded into per-verse nodes (cap `RANGE_EXPLODE_CAP=8`) so adjacency through any verse of a range is correct (critic 4.1).
- `parents` stores the full stored edge + connecting verse; hops render verbatim from the stored row so bidirectional/backward traversal never swaps orientation (critic 5.1).
- `truncated` distinguishes budget-cut from genuine exhaustion; `note` records `min_votes`-narrowing (critic 5.2).
- Bidirectional traversal (both `from` and `to` directions) matching `direction: 'both'`.
- Bounds: `max_hops` default 4 (clamp 1–6), `NODE_BUDGET=2000`, `EDGE_BUDGET=20000`, `RANGE_EXPLODE_CAP=8`, `min_votes` default 1. `max_paths` not exposed in MVP.
- No schema migration; read-only; respects `review_status='ok'`.

### Rejected Approaches
- Per-node `votes DESC` degree cap — can prune the only edge on the true shortest path → false `found:false` against the AC (critic 2.1).
- Composite row-value `IN (VALUES (?,?,?), ...)` — index use is planner-dependent and unverified; book+chapter grouping with scalar verse `IN` is reliably indexed (critic 4.2).
- SQLite recursive CTE — poor node/edge budget control and `votes` weighting; no precedent in `src/`.
- Single `from_ref`/`to_ref` string input — would require a new BCV parser; book names contain spaces.
- Exposing `max_paths` in the MVP — semantics were undefined; ship the single strongest shortest path (critic 2.2).

### Open Questions
- Promptfoo agent-level RED/GREEN scenario: include now or defer? Server uses vitest; no cross-ref promptfoo dir exists. (owner: planner, resolution: decide in /plan — recommend vitest as the OR-8 TDD layer, promptfoo as optional follow-up) [CONTRADICTION sink: none]
- D1/SQLite query-plan confirmation: the build should run `EXPLAIN QUERY PLAN` (or a bounded-row integration check) to confirm the grouped scalar-`IN` queries ride `idx_xref_from`/`idx_xref_to` rather than scanning. (owner: builder, resolution: verify during build; fall back to per-node single-tuple equality queries if the plan scans — critic 4.2)

### Constraints Carried Forward
- Must preserve `query_cross_references` behaviour unchanged.
- Every hop must be presented as an attributed cross-reference (carry `votes`), never an asserted theological claim (theological guardrail).
- Must not scan the full ~340k-edge graph unbounded — all four budget knobs are load-bearing.
- Must filter `review_status = 'ok'` consistently with the existing tool.

## Expert Consultation Log

| Expert | Gate Point | Category | Finding | Impact on Design |
|--------|-----------|---------|---------|-----------------|
| critic | design-critic (Step 7b) | adversarial-design | 3 CRITICAL (range-node identity, backward-edge orientation, degree-cap false-negative) + MAJOR (composite row-value `IN` index, mid-traversal error, `max_paths` semantics) | Design revised: complete-up-to-budget BFS, range explosion, full-edge `parents` map, grouped scalar-`IN` queries, `max_paths` removed from MVP, error/`truncated` semantics tightened |
| — | section-validation | — | No domain experts dispatched (autonomous, standard tier; no security/external-API keywords; internal read-only traversal over existing data) | — |

<!-- critic-findings
critic-rating: WEAK
findings:
Initial design rated WEAK / REVISE. Three CRITICAL findings, all schema-grounded and all addressed in the revised design:
- CRITICAL 4.1 (assumption leakage): `cross_references.to_verse_start..to_verse_end` is a verse RANGE; collapsing to a single-verse node breaks adjacency. FIX: node identity = single verse; range-valued `to` endpoints exploded into per-verse nodes (RANGE_EXPLODE_CAP=8).
- CRITICAL 5.1 (interface ambiguity): bidirectional traversal dropped edge orientation; `parents` carried only {prev, votes}. FIX: `parents` stores the full stored edge + connecting verse; hops render verbatim from the stored row — backward-traversed edges never swap orientation. Protects the OR-5 attribution guardrail.
- CRITICAL 2.1 (invariant violation): per-node `votes DESC` degree cap could prune the only edge on the true shortest path → false `found:false` vs. the acceptance criterion. FIX: complete-up-to-budget BFS; `votes` orders/selects but never prunes traversal.
- MAJOR 4.2 (assumption): composite row-value `IN (VALUES ...)` index use is planner-dependent/unverified. FIX: group frontier by (book,chapter) + scalar verse `IN` (reliably indexed); build verifies via EXPLAIN QUERY PLAN with per-node fallback.
- MAJOR 5.2: added `truncated`/`note` semantics distinguishing budget-cut from genuine exhaustion and `min_votes`-narrowing.
- MAJOR 1.1: mid-traversal query rejection aborts traversal, discards partials, returns isError.
- MAJOR 2.2 / MINOR 3.1: `max_paths` removed from MVP; `min_votes` default lowered to 1 and documented.
- MINOR 1.2: ranges required and validated as single verses.
Architecture (bounded in-memory BFS over indexed per-frontier queries; recursive-CTE rejected) was assessed sound; revisions correct the graph model and attribution faithfulness without changing the approach.
critic-findings -->
