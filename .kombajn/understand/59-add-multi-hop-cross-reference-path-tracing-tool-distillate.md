# Distillate: Understand — Add multi-hop cross-reference path tracing tool

**Stage:** Understand

## Key Decisions
- Tool will be a new server-side MCP tool (`trace_cross_reference_path`) co-located in `server/src/tools/cross-references.ts`, reusing `lookupBook`, `parseVerseRange`, the `review_status='ok'` filter, and the `cachedToolCall` + `server.registerTool` registration pattern at `server/src/index.ts:718`.
- Traversal must ride the existing `idx_xref_from` / `idx_xref_to` indexes with bounded per-frontier indexed lookups (the existing "two indexed queries, never OR" discipline) — never a full ~340k-edge scan.
- Recommended tier: **standard** (5 affected areas, 3-way cross-directory spread, no DDD/CQRS markers).

## Rejected Approaches
- None rejected at understand stage. Input shape (single `from_ref`/`to_ref` strings vs. `from_book`+`from_range` pairs) and BFS-vs-recursive-CTE traversal mechanism are left open for design.

## Constraints for Downstream
- `confirmed` locations: `cross-references.ts:36` (queryCrossReferences pattern), `index.ts:718` (registration), `db/query.ts:11` (`query()` primitive — D1 supports `WITH RECURSIVE`, not yet used in src), `migrations/0006` (indexes), `migrations/0014` (review_status convention from #66).
- Hard non-goals: no new data ingestion, no schema migration for new data, no change to `query_cross_references`, no theological inference beyond `votes`, no unbounded traversal.
- Guardrail: every hop is an *attributed* cross-reference (carries vote count), never an asserted theological claim.
- Must return explicit "no path within N hops" (not an error) and a `truncated` flag when bounds are hit.
- TDD required: vitest unit tests mock `query()` from `../db/query.js` (see `cross-references.test.ts`). RED/GREEN placement (vitest vs. promptfoo agent-level vs. both) is a design decision.

## Interface Surface
- New MCP tool contract: `trace_cross_reference_path` input schema (source ref, target ref, `max_hops` default ~4, optional node/edge budget) and output schema (ordered hops with connecting verse + votes, `truncated` flag, no-path result). Exact field names TBD in design.
