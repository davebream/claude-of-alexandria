# Distillate: Design — Add multi-hop cross-reference path tracing tool

**Stage:** Design

## Key Decisions
- New MCP tool `trace_cross_reference_path` in `server/src/tools/cross-references.ts`; registered in `server/src/index.ts` via `registerTool` + `cachedToolCall` + a `DESC_TRACE_CROSS_REFERENCE_PATH` block.
- Input: `from_book`/`from_range`, `to_book`/`to_range` (required single verses), `max_hops` (default 4, clamp 1–6), `min_votes` (default 1). `max_paths` NOT exposed in MVP — return the single strongest shortest path.
- Traversal: **complete-up-to-budget** bidirectional in-memory BFS. `votes DESC` orders neighbours and selects the winning equal-length path but NEVER prunes edges from traversal (preserves shortest-path completeness).
- Queries group the frontier by `(book, chapter)` and use scalar verse `IN` against `idx_xref_from`/`idx_xref_to` — reliably indexed; no composite row-value `IN`, no `OR`-chain. Build must confirm via `EXPLAIN QUERY PLAN` with per-node single-tuple fallback.
- Node identity = single verse `book|chapter|verse`. Range-valued `to` endpoints (`to_verse_start..to_verse_end`) are exploded into per-verse nodes, cap `RANGE_EXPLODE_CAP=8`.
- `parents` map stores the FULL stored edge + connecting verse; hops render verbatim (correct orientation even when traversed backward) — protects attribution guardrail.
- Bounds: `NODE_BUDGET=2000`, `EDGE_BUDGET=20000`. `truncated:true` on any budget/hop/range-explode cut; `found:false`+`truncated:false` = genuine exhaustion.

## Rejected Approaches
- Per-node `votes DESC` degree cap — prunes the only edge on a true shortest path → false negatives.
- Composite row-value `IN (VALUES ...)` — index use unverified/planner-dependent.
- SQLite recursive CTE — poor budget control, no `votes` weighting, no precedent in `src/`.
- Single `"Book C:V"` string input — needs a new BCV parser (book names contain spaces).
- Exposing `max_paths` in MVP — undefined semantics.

## Constraints for Downstream
- Preserve `query_cross_references` behaviour unchanged.
- Every hop is an attributed cross-reference (carry `votes`, render stored edge verbatim), never an asserted theological claim.
- Filter `review_status = 'ok'` consistently with the existing tool.
- No schema migration, read-only, no data ingestion.
- All budget knobs (`max_hops`, `NODE_BUDGET`, `EDGE_BUDGET`, `RANGE_EXPLODE_CAP`) are load-bearing for OR-6.
- TDD (OR-8): vitest unit tests mock `query()` from `../db/query.js`; tests must cover backward-edge orientation, range explosion, no-degree-cap-false-negative, no-path-not-error, truncated, single-verse short-circuit, invalid range, book-not-found, mid-traversal error. Promptfoo agent-level RED/GREEN placement is a planner decision.

## Interface Surface
- `TraceCrossReferencePathInputSchema` / `TraceCrossReferencePathOutputSchema` (Zod) exported from `cross-references.ts`.
- Output: `{ from_ref, to_ref, found, truncated, hops, max_hops, path: [{from_ref,to_ref,votes,connecting_ref}], summary: {nodes_visited,edges_examined,min_votes}, attribution, note? }`.
- New MCP tool name: `trace_cross_reference_path` (read-only, idempotent annotations).
