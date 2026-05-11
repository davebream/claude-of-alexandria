---
review_outcome: needs-revision
dimensions:
  - id: design-alignment
    score: 4
    evidence:
      - "All 5 design components (C1–C5) have at least one implementing task"
      - "Migration DDL in plan Task 2 matches design C1 DDL exactly (column names, CHECK constraint, indexes)"
      - "Parser return type VerseRef[] matches design C2 specification"
  - id: task-granularity
    score: 3
    evidence:
      - "Tasks 1-4 are each appropriately bounded (S/M effort)"
      - "Task 5 (ETL main) is L but logically cohesive and well-bounded by its single file"
  - id: dependency-ordering
    score: 4
    evidence:
      - "Tasks 1 and 2 correctly marked as parallel and are genuinely independent"
      - "Task 3 depends on Task 1 (needs confirmed citation format) — explicit in task header"
      - "Task 4 → Task 3; Task 5 → Task 1 + Task 4; Task 6 → Task 5 — all correct"
  - id: verification-coverage
    score: 2
    evidence:
      - "Task 2 Step 1 uses hardcoded '/path/to/server/migrations/' placeholder — builder cannot run this verbatim"
      - "Task 5 Step 2 primary fetch URL 'dist/creeds.json' is speculative; fallback code (fetch individual files) is described in a comment but not implemented — the actual code calls process.exit(1) on HTTP error"
      - "npm package install in Task 5 Step 1 is never consumed by ETL code; the main() always uses the GitHub URL"
    suggested_fix: "1) Fix Task 2 Step 1 ls command to use a relative path (ls server/migrations/). 2) Task 5: either implement the individual-file fallback OR remove the npm install step and document that only the GitHub URL is supported. 3) Reconcile npm package research (Task 1 Step 1, Task 5 Step 1) with the actual ETL fetch path."
  - id: test-coverage
    score: 3
    evidence:
      - "7 parser test cases cover single verse, range, cross-chapter, unresolvable, NT digit-prefix, no-range, and clamping"
      - "TDD red-green cycle properly specified: Task 3 (fail), Task 4 (pass)"
      - "Missing: no test for out-of-bounds chapter in VERSE_COUNTS lookup; no test for cross-book range expansion; integration (ETL pipeline) tested only via manual wrangler commands"
  - id: incremental-delivery
    score: 4
    evidence:
      - "Phase 1 end: migration applied locally + research notes — functional schema exists"
      - "Phase 2 end: parser tested independently (7 tests green)"
      - "Phase 3 end: ETL runs against local D1 with verified counts"
      - "Phase 4 end: F2 simulation query passes — data usable by downstream tool"
  - id: effort-distribution
    score: 4
    evidence:
      - "Task 5 (L) is largest but holds well under 50% of total complexity"
      - "Tasks 4+5 together form the core but are logically separable and sequenced correctly"
  - id: scope-inference
    score: 3
    evidence:
      - "Task 6 Step 7 (remote apply) is explicitly out of scope for the automated plan — declared as manual deployment action"
      - "F2 MCP tool implementation is explicitly deferred to a separate feature (F2)"
      - "FTS/search indexing on confessional content is not included — acceptable because the design scopes only schema + ETL"
---

# Plan Review: Add D1 Schema and ETL for Confessional Documents (F1)

**File:** `.kombajn/plans/2026-05-11-f1-confessional-d1-schema-etl.md`
**Design Doc:** `.kombajn/plans/2026-05-11-confessional-d1-schema-etl-design.md`
**Verdict:** Needs Revision
**Round:** R1

---

## Design Alignment

Strong alignment. All five design components map to plan tasks with no gaps and no out-of-scope additions:

| Design Component | Plan Task |
|-----------------|-----------|
| C1 — Migration DDL | Task 2 |
| C2 — Parser + Tests | Tasks 3 + 4 |
| C3 — ETL main() | Task 5 |
| C4 — seed-d1.sh integration | Task 6 |
| C5 — Research | Task 1 |

The migration DDL in the plan body matches the design DDL precisely. The parser return type `VerseRef[]` matches the design C2 specification. The unified superset-column design (NULL columns per format) is correctly implemented.

## Requirements Traceability

N/A — no requirements artifact. Design derives from GitHub issue #37 and pitch doc. The feature manifest records `requirements: "skipped"`.

## Incremental Delivery

Each phase produces a testable increment:

- **Phase 1 end:** Three-table schema applied locally; research notes confirm source format
- **Phase 2 end:** `parseProofTextRef` function independently tested (7 Vitest tests green)
- **Phase 3 end:** ETL generates valid SQL; counts verified against local D1
- **Phase 4 end:** F2 simulation query returns results from seeded data

Pass — nothing is deferred to a "big bang" at the end.

## Effort Distribution

Effort is well-distributed. Task 5 (L) is the largest but is logically cohesive (one file, one function). No task holds >50% of total complexity. The 6-task decomposition is appropriate for the L-complexity feature.

## Project Structural Checks

No `project.json` found — `skills.review.structuralChecks` is absent. Section omitted.

## Project Concerns (review stage)

No `project.json` found — `concerns` is absent. Section omitted.

## Out of Scope

- Remote D1 apply step — declared as manual deployment action in Task 6 Step 7. Acceptable because remote credentials are not available in automated runs.
- F2 (confessional_lookup MCP tool) — separate feature with its own plan. Correct boundary.
- FTS/search over confessional content — not in scope for this schema+ETL feature. Acceptable: the design explicitly excludes FTS5.
- Author metadata enrichment — `authors` column is NULL in seeded data because Creeds.json lacks structured author data. Explicitly noted in ETL code.

## Summary

The plan is well-structured, follows TDD discipline, and maps cleanly to the design. Dependencies are correctly ordered and all design components are covered. Two issues prevent a Ready verdict: (1) a speculative fetch URL in Task 5 whose fallback is not actually implemented in the code, creating a likely runtime failure path; and (2) a hardcoded placeholder path in Task 2 Step 1 that a builder cannot run verbatim. A third minor issue — the npm package installation in Task 5 Step 1 is disconnected from the actual ETL fetch path — should be reconciled for clarity.

## Critical Issues (must fix before execution)

**CI-1: Task 5 ETL fetch URL is speculative and fallback is unimplemented**

The primary fetch URL in Task 5 Step 2 is `https://raw.githubusercontent.com/NonlinearFruit/creeds/master/dist/creeds.json`. Examining Task 1's research steps (Steps 3-5), individual documents are fetched from `/data/<slug>.json` paths, not a `dist/creeds.json` aggregate. A `dist/` directory may not exist in the Creeds.json repo. The catch block comments "Fetch individual files via the API listing" but the code immediately calls `process.exit(1)` — the fallback is not implemented. If this URL 404s (likely), the ETL exits fatally on every run.

**Fix:** After Task 1's research confirms the source URL, Task 5 Step 2 should use the confirmed URL. Either: (a) specify the correct aggregate URL (if one exists), or (b) implement the individual-file fetch loop (iterate over confirmed document slugs from research, fetch each from `/data/<slug>.json`, assemble the array). Alternatively, document that `--local` is required when the aggregate URL is unavailable and update the `seed-d1.sh` integration to pre-fetch documents.

**CI-2: Task 2 Step 1 uses an unresolvable placeholder path**

```bash
ls /path/to/server/migrations/ | sort | tail -5
```

The `/path/to/` prefix is a template placeholder that will fail when run. A builder executing this verbatim gets an error and cannot verify the migration number.

**Fix:** Replace with a relative path: `ls server/migrations/ | sort | tail -5` (assuming CWD is the repo root) or `ls $(pwd)/server/migrations/ | sort | tail -5`.

## Recommended Changes

**RC-1: Reconcile npm package research with ETL implementation**

Task 1 Step 1 checks for `@NonlinearFruit/creeds` npm package existence. Task 5 Step 1 conditionally installs it. However, the ETL `main()` code always fetches from a raw GitHub URL and never uses the npm package. Either:
- Remove the npm package research and installation steps (simplify to GitHub URL only), or
- Implement npm package loading as the primary path (e.g., `import data from '@NonlinearFruit/creeds/dist/creeds.json'` if the package exports this)

**RC-2: Add a test for cross-book range expansion**

The design explicitly mentions cross-book ranges as an edge case, and the `expandRange` function implements it. There is no test covering this path. Add one test case to `seed-confessional.test.ts` covering a cross-book boundary range to prevent regressions.

**RC-3: Guard against missing `--local` path argument**

In `main()`: `const localPath = localIndex !== -1 ? args[localIndex + 1] : null`. If `--local` is the last argument with no following value, `args[localIndex + 1]` is `undefined`, and `readFileSync(undefined, 'utf-8')` throws an unhelpful error. Add a guard:
```typescript
if (localIndex !== -1 && !args[localIndex + 1]) {
  console.error('[seed-confessional] --local flag requires a path argument');
  process.exit(1);
}
```

## Ready Tasks (can proceed as-is)

- Task 3 (write parser tests) — test cases are well-specified and unambiguous
- Task 4 (implement parser) — implementation is complete and correct relative to test specifications; `VERSE_COUNTS` map is accurate for the Protestant canon
- Task 2 (migration DDL) — DDL is correct; only fix needed is the `ls` placeholder in Step 1 (minor)
- Task 1 (research) — research steps are thorough and correctly gate downstream implementation

## Open Questions

1. **Does Creeds.json have a single aggregate JSON file?** The plan assumes `dist/creeds.json` exists. If not, which fetch strategy should the ETL use? (Owner: implementer during C5 research; Resolution: check GitHub repo structure during Task 1)

2. **Is `@NonlinearFruit/creeds` npm package intended as the primary source?** If yes, implement npm loading in ETL; if no, remove the npm installation step from Task 5 Step 1.

3. **Should the cross-book range test be added before or as part of Task 3?** The design mentions it as an edge case — adding it during Task 3 (red phase) would be the correct TDD discipline.

## Evidence Reversals

None — this is R1 (first review round).

## Agent Findings

### code-reviewer: Needs Revision

**Critical Issues:**
- Task 2 Step 1 uses placeholder path `/path/to/server/migrations/` — builder cannot execute verbatim
- Task 5 fetch URL `dist/creeds.json` is speculative; catch block promises a fallback that isn't implemented

**Recommended Changes:**
- Fix placeholder path in Task 2 Step 1
- Guard against `--local` with missing argument
- Reconcile npm package research with ETL code (npm is installed but never used)

**Ready Tasks:**
- Task 1 (research steps are well-specified)
- Task 3 (test cases are clear and correct)
- Task 4 (parser implementation matches tests)

### quality-reviewer: Ready (with recommendations)

**Assessment:**
- TDD discipline is properly applied: Task 3 writes tests first, Task 4 implements to green, full suite regression check in Task 4 Step 3
- 7 test cases are specific and well-targeted; cover the main failure modes
- Missing: cross-book range test (code path exists, no test); out-of-bounds chapter test
- Integration testing is manual (wrangler commands) — consistent with project pattern but not automated
- Documentation quality is adequate: ETL has JSDoc, validation report, research notes

**Recommended Changes:**
- Add cross-book range test case to Task 3
- Add chapter out-of-bounds test case to Task 3

### api-expert: Needs Revision

**Critical Issues:**
- Primary fetch URL in Task 5 is speculative (`dist/creeds.json`). The individual file pattern from Task 1 (`/data/<slug>.json`) suggests no aggregate URL exists. ETL will fail at runtime if this URL is wrong.
- The npm package integration path (Task 1 Step 1, Task 5 Step 1) is disconnected from the actual ETL fetch implementation — creates false confidence that the npm source is available as fallback

**Assessment of external integration:**
- GitHub raw URL fetch: correct pattern, no auth required for public repos
- `--local` flag: useful CI escape hatch, but missing argument guard
- No retry logic: acceptable per design (fatal exit + `--local` escape hatch)
- `wrangler d1 execute --file` pattern: matches existing project seed pattern

## Stage Handoff

### Decisions Made

- Contract gate passed: F1-contract.yaml exists, parses cleanly, has 8 blocking acceptance tests (AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-10)
- No CI-skip markers found in any code block
- Critic rating was ADEQUATE — full review dispatched
- Two critical issues identified; verdict is Needs Revision

### Rejected Approaches

- Blocking verdict — design alignment is strong and no Blocked-level structural failures were found
- Ready verdict — two critical issues (CI-1, CI-2) must be fixed before a builder can execute the plan without errors

### Open Questions

- Creeds.json aggregate JSON URL (owner: implementer during Task 1, resolution: check repo structure before Task 5)
- npm package vs. GitHub URL strategy (owner: plan author, resolution: choose one and remove the dead code path)

### Constraints Carried Forward

- F2 must be implemented after F1 completes (F2 depends on F1 in initiative manifest)
- The `--remote` flag in seed-d1.sh requires Cloudflare credentials — remote seeding is manual deployment
- `parseProofTextRef` signature `(citation: string) => VerseRef[]` is now the API contract for F1 tests and ETL

<!-- critic-miss
reviewer-found-issues-not-in-critic:
- CI-1: Speculative fetch URL (dist/creeds.json) whose fallback is described in a comment but not implemented in the catch block code — critic noted Task 6 Step 7 remote verification gap but missed the primary fetch URL gap in Task 5
- CI-2: Hardcoded /path/to/ placeholder in Task 2 Step 1 ls command — critic verified path correctness of the lookupBook import but did not scan shell commands for placeholder text
reviewer-verdict: Needs Revision
critic-rating: ADEQUATE
critic-miss -->
