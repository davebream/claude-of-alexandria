# Distillate: Plan — Add multi-hop cross-reference path tracing tool

**Stage:** Plan

## Key Decisions
- 3 phases / 3 tasks, all TDD (failing tests first against the mocked `query()` seam):
  - Task 1 (P1): schemas + endpoint resolution + errors + same-verse short-circuit. Run `vitest -t 'resolution'`.
  - Task 2 (P2): bounded BFS traversal + path reconstruction in one cohesive function. Run `vitest -t 'traversal'`.
  - Task 3 (P3): MCP registration in `index.ts` + query-plan verification + full `npm run test && npm run typecheck`.
- Query-plan verification has a fail-safe forcing function: default to per-node single-tuple equality queries if no EXPLAIN harness confirms the grouped scalar-`IN` rides the index.

## Rejected Approaches
- Splitting traversal (C3) and reconstruction (C4) into separate tasks — non-compiling intermediate state; merged into Task 2.
- A dedicated migration/index task — existing indexes suffice; no schema change.

## Constraints for Downstream
- `traceCrossReferencePath` MUST catch its own `query()` errors — there is NO `index.ts` tool-call try/catch wrapper (`cachedToolCall` at `:482` does not wrap the handler). An uncaught throw violates OR-4.
- `cachedToolCall` registration MUST use `args as unknown as Record<string, unknown>` (all 23 existing registrations do; omitting fails typecheck).
- `min_votes` default is **1** (intentional divergence from `queryCrossReferences`'s default 2) — do not "correct" it.
- Every hop renders verbatim from the stored edge with `votes`; filter `review_status = 'ok'`; preserve `query_cross_references` unchanged.
- All four budget knobs (`max_hops`, `NODE_BUDGET=2000`, `EDGE_BUDGET=20000`, `RANGE_EXPLODE_CAP=8`) are load-bearing for OR-6 and each has a test pin (range-explode, budget-exhaustion, max_hops, char-limit).
- Read-only; no schema migration; no data ingestion.

## Interface Surface
- Files: modify `server/src/tools/cross-references.ts` (schemas + `traceCrossReferencePath`), `server/src/tools/cross-references.test.ts` (new `resolution` + `traversal` describe blocks), `server/src/index.ts` (import + `DESC_TRACE_CROSS_REFERENCE_PATH` + `registerTool` → tool count 24).
- Reuse: `lookupBook`/`suggestBooks` (`books.ts`), `parseVerseRange` (`utils.ts`), `query()` (`db/query.ts`), `cachedToolCall` (`index.ts:482`).
- Sprint contract: `.kombajn/implement-add-multi-hop-cross-reference-path-tracing-tool/contracts/T1-contract.yaml` (AC-1..AC-6, all blocking).
