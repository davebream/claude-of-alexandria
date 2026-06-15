# Plan Review: Add multi-hop cross-reference path tracing tool

**File:** .kombajn/implement-add-multi-hop-cross-reference-path-tracing-tool/plans/T1-plan.md
**Design Doc:** .kombajn/implement-add-multi-hop-cross-reference-path-tracing-tool/designs/T1-design.md
**Verdict:** Ready
**Round:** R1
**Critic rating (plan):** ADEQUATE → full review

## Design Alignment

Aligned. All six design components C1–C6 map to plan tasks (C1/C2 → Task 1; C3/C4 → Task 2; C5 → Task 3; C6 distributed across Task 1/2 test steps). No scope creep. The three design CRITICAL fixes (range explosion, backward-edge orientation, no-degree-cap) are each test-pinned in Task 2 Step 1.

## Requirements Traceability

Full chain verified: OR-1..OR-8 → design C1–C6 → plan tasks. Task `Implements:` fields map OR items to tasks (Task 1: OR-1/4/5; Task 2: OR-2/3/4/5/6/7; Task 3: OR-1/8). No requirement dropped at any stage. All six contract ACs (AC-1..AC-6) have covering tasks: AC-1..AC-5 → Task 2 traversal tests; AC-6 → Task 3 typecheck+test gate.

## Incremental Delivery

Three phases, each a working increment. Phase 1 (schemas + resolution) is a legitimate foundation phase for a 2–3 phase plan. Phase 2 produces a working traversal. Phase 3 registers and gates. Not flagged.

## Effort Distribution

No single task >50% of total complexity. Task 2 (BFS + reconstruction) is the largest (merges C3-L + C4-M) but is justified in Stage Handoff (avoids a non-compiling intermediate split) and remains one cohesive TDD cycle with ~12 enumerated test pins. Acceptable; the one task a builder should watch for time.

## Project Structural Checks

`skills.review.structuralChecks` is `[]` — section omitted.

## Project Concerns (review stage)

`concerns` is `{}` — section omitted.

## CI-Skip Marker Detection

No CI-skip markers found in any fenced code block. Pass (silent).

## Out of Scope

- No agent-level promptfoo RED/GREEN scenario — vitest is the OR-8 TDD layer; promptfoo deferred as optional follow-up (acceptable: server convention is vitest; no cross-ref promptfoo dir exists).
- No schema migration / data ingestion — read-only over existing rows (acceptable: OR-7 forbids ingestion).
- No `max_paths` multi-path enumeration — single strongest shortest path only (acceptable: avoids undefined semantics; YAGNI).

## Summary

The plan is execution-ready. Both mandatory reviewers (code-reviewer, quality-reviewer) returned **Ready** with zero critical or important issues, having verified the four incorporated critic MAJOR findings against live source (the no-`index.ts`-wrapper claim, the `cachedToolCall` arg cast, the index column shape, and the `-t` filter / `describe`-block alignment all hold). Only optional info-level suggestions surfaced, two of which (stale `PER_NODE_DEGREE_CAP` in the design's OR-6 row; under-specified single-path char-limit behavior) were fixed during synthesis.

## Critical Issues (must fix before execution)

None.

## Recommended Changes

None blocking. Two non-blocking documentation fixes were applied during synthesis:
1. Removed the stale `PER_NODE_DEGREE_CAP` reference from the design's OR-6 traceability row (contradicted the no-degree-cap decision).
2. Specified single-path `CHARACTER_LIMIT` behavior in design C4 + plan Task 2 (keep adjacency-intact path, flag `truncated`, drop cosmetic fields — never thin interior hops).

## Ready Tasks (can proceed as-is)

All tasks (Task 1, Task 2, Task 3).

## Open Questions

- D1 query-plan confirmation of grouped scalar-`IN` index use — resolved by Task 3 Step 3's fail-safe (default to per-node single-tuple equality if no EXPLAIN harness). Builder note: if the fallback ships, relax the Task 2 SQL-shape assertion to match. (owner: builder)

## Evidence Reversals

None.

## Agent Findings

### code-reviewer: Ready
0 critical, 0 important. Verified all four incorporated critic MAJOR findings against live code (`index.ts:482-506` no handler try/catch; cast matches 23 registrations; `parseVerseRange` reject predicate correct; index columns `0006:15-16`). 3 optional info suggestions: new `mockImplementation` dispatch pattern (time budget), empty-string range test pin (optional), SQL-shape assertion changes if query-plan fallback triggers.

### quality-reviewer: Ready
Architecture sound; test coverage complete and RED-first; documentation (DESC block) first-class. Confirmed planted-graph mock strategy is realistic for the per-`(book,chapter,verse IN)` query seam (existing test file already inspects `mock.calls`). Two suggestions, both applied: single-path char-limit return shape under-specified; stale `PER_NODE_DEGREE_CAP` in design OR-6 row.

## Stage Handoff

### Decisions Made
- Verdict Ready at R1; two non-blocking design/plan doc fixes applied during synthesis.
- Plan-review ran in full (critic rated ADEQUATE, not STRONG); two mandatory reviewers, no specialist escalation (read-only internal traversal; no auth/PII/scale/external-API signals).

### Rejected Approaches
- Team-mode review — fell back to parallel subagent dispatch (robust path; small 3-task plan).

### Open Questions
- Query-plan fallback may change the Task 2 SQL-shape assertion (owner: builder, resolution: during Task 3 Step 3).

### Constraints Carried Forward
- `traceCrossReferencePath` must catch its own `query()` errors (no `index.ts` wrapper).
- `cachedToolCall` registration must use the `args as unknown as Record<string, unknown>` cast.
- Every hop renders verbatim from the stored edge with `votes`; `review_status='ok'`; preserve `query_cross_references`.
- All four budget knobs are load-bearing for OR-6 and test-pinned.
