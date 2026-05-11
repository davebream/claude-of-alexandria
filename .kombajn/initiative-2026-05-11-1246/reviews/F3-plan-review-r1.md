# Plan Review: F3 — Add FTS5 Full-Text Search over Lexicon Definitions (Lightweight)

**File:** `.kombajn/plans/2026-05-11-fts-lexicon-search-plan.md`
**Design Doc:** `.kombajn/plans/2026-05-11-fts-lexicon-search-design.md`
**Verdict:** Ready
**Mode:** Lightweight (critic rated STRONG)

## Structural Checks

| Check | Result | Notes |
|-------|--------|-------|
| Design alignment | Pass | All three design components (C1, C2, C3) plus the testing strategy have explicit plan tasks. No scope creep detected. |
| Requirements traceability | N/A | Requirements skipped per manifest — no requirements artifact exists. |
| Incremental delivery | Pass | Phase 1 produces a working, tested implementation; Phase 2 produces a fully documented tool; Phase 3 adds regression coverage. Each phase is independently verifiable. |
| Effort distribution | Pass | Task 1 holds the most complexity but appropriately so — it is the core implementation. No single task exceeds 50% of total complexity in a risky or unbalanced way. |

## Project Structural Checks

Skipped — no `project.json` found; `skills.review.structuralChecks` defaults to `[]`.

## Project Concerns (review stage)

Skipped — no `project.json` found; `concerns` defaults to `{}`.

## Out of Scope

- Relevance ranking (gloss-only matches ranked above definition-only matches) — deferred explicitly in plan's Stage Handoff Open Questions; current G/H + lexicographic ordering is deterministic and sufficient for an initial release.
- FTS5 upgrade path — deferred until cloudflare/workers-sdk#9519 is resolved; the `search` parameter interface is stable and the backing implementation can be swapped without an API break.
- Total match count — intentionally replaced with `results_capped: boolean`; the per-table LIMIT 20 makes a true count unknowable without additional COUNT queries.

## Summary

The plan covers all three design components (C1 search branch, C2 output schema, C3 tool description) across a logical three-task, three-phase structure. The critic (rated STRONG) found no ordering inversions, verification gaps, hidden dependencies, completeness gaps, or code accuracy issues. All lightweight structural checks pass. The contract exists at `.kombajn/initiative-2026-05-11-1246/contracts/F3-contract.yaml` with 6 blocking acceptance tests covering input validation, mutual exclusion, partial failure resilience, and TypeScript compilation.

## Critical Issues (must fix before execution)

None.

## Recommended Changes

None.

## Ready Tasks (can proceed as-is)

All tasks.

## Open Questions

None requiring plan author clarification. Relevance ranking and FTS5 upgrade are explicitly deferred and documented.

## Evidence Reversals

None.

## Agent Findings

No agents dispatched — lightweight path (critic rated STRONG).

## Stage Handoff

### Decisions Made
- Lightweight review path activated: critic rated the plan STRONG with no domain issues found.
- Contract gate passed: `F3-contract.yaml` exists, parses cleanly, and contains 6 blocking acceptance tests.
- All structural checks pass without agent dispatch.

### Rejected Approaches
- Full parallel agent review — bypassed because critic rating STRONG activates the lightweight path per review-plan skill protocol.

### Open Questions
- None (owner: —, resolution: —)

### Constraints Carried Forward
- D1 database must not have FTS5 virtual tables in any migration until cloudflare/workers-sdk#9519 is resolved.
- `search` parameter name and mutual-exclusion contract (exactly one of: `strongs_ids`, `lemmas`, `search`) must be preserved in any future enhancement.
- `results_capped` must remain a boolean (not an integer count) until per-source LIMIT is removed.
