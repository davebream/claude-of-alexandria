---
review_outcome: needs-revision
dimensions:
  - id: design-alignment
    score: 4
    evidence:
      - "All 5 design components (C1–C5) map to plan tasks — unchanged from R1"
      - "Migration DDL in Task 2 matches design C1 DDL precisely"
      - "CreedsDocument interface correctly models Metadata/Data structure per design"
  - id: task-granularity
    score: 3
    evidence:
      - "Tasks 1-4 are S/M effort and appropriately bounded"
      - "Task 5 is L but logically cohesive (one file, one function)"
      - "6-task decomposition is appropriate for L-complexity feature"
  - id: dependency-ordering
    score: 4
    evidence:
      - "Tasks 1 and 2 correctly parallel and genuinely independent"
      - "Task 3 → Task 1; Task 4 → Task 3; Task 5 → Task 1 + Task 4; Task 6 → Task 5 — all correct"
      - "No ordering inversions introduced by revision"
  - id: verification-coverage
    score: 2
    evidence:
      - "Task 5 Step 3 test command passes --local /tmp/creeds-test/wsc.json (a file path) but the implementation treats --local as a directory, iterating CREEDS_FILENAMES via join(localDir, slug+'.json'). The test will load 0 documents from the named file."
      - "Expected output in Step 3 says 'Loading from local path' but code logs 'Loading from local directory'"
      - "The ETL main() loop accesses doc.Slug, doc.Name, doc.Year, doc.Questions, doc.Chapters directly on the iteration variable, but documents[] is Array<{ slug: string; doc: CreedsDocument }> — these fields are undefined at runtime. This means every document is silently skipped (doc.Slug === undefined → 'Document without Slug' warning → skip)"
      - "section.ProofTexts accessed at lines 971 and 1002, but ConfessionSection and CatechismQuestion interfaces declare Proofs (not ProofTexts) — all proof-text rows silently dropped"
    suggested_fix: "1) Fix ETL loop destructuring: change `for (const doc of documents)` to `for (const { slug, doc: creedsDoc } of documents)` and access creedsDoc.Metadata.Title, creedsDoc.Metadata.Year, creedsDoc.Data for transformation. 2) Fix ProofTexts → Proofs field name in loop at lines 971 and 1002. 3) Fix Task 5 Step 3 --local test to either: (a) pass a directory path containing slug-named files, or (b) update the implementation to accept a single file path when --local is a file. Whichever is chosen, align expected log output to match."
  - id: test-coverage
    score: 3
    evidence:
      - "RC-2 addressed: cross-book range test added (Mal.4.5-Matt.1.1 → 3 verses)"
      - "8 parser test cases now present covering all edge cases including cross-book"
      - "RC-3 addressed: --local missing-argument guard present in main()"
      - "Test count inconsistency: Task 3 says '8 tests fail', Task 4 Step 2 says 'all 8 tests pass', but Task 4 Done When says '7 parser tests' and Task 5 Step 5 says '7 tests still pass'"
  - id: incremental-delivery
    score: 4
    evidence:
      - "Phase 1: migration applied locally + research notes — functional schema"
      - "Phase 2: parser independently tested"
      - "Phase 3: ETL generates SQL, counts verified"
      - "Phase 4: F2 simulation query passes"
  - id: effort-distribution
    score: 4
    evidence:
      - "Task 5 (L) holds well under 50% of total complexity"
      - "6-task decomposition is correct for L feature"
  - id: scope-inference
    score: 3
    evidence:
      - "Remote D1 apply step explicitly deferred as manual deployment action (Task 6 Step 7) — correct boundary, concrete plan reference"
      - "F2 MCP tool deferred to separate feature — stated in plan header and Stage Handoff"
      - "Author metadata enrichment (authors column NULL) acknowledged inline with rationale"
---

# Plan Review: Add D1 Schema and ETL for Confessional Documents (F1) — R2

**File:** `.kombajn/plans/2026-05-11-f1-confessional-d1-schema-etl.md`
**Design Doc:** `.kombajn/plans/2026-05-11-confessional-d1-schema-etl-design.md`
**Verdict:** Needs Revision
**Round:** R2

---

## Prior-Round Resolution

The R1 review found two critical issues (CI-1, CI-2) and three recommended changes (RC-1, RC-2, RC-3). The revision addressed them as follows:

| R1 Item | Status | Notes |
|---------|--------|-------|
| CI-1: speculative dist/creeds.json URL | Fixed | Individual-file fetch loop now implemented; URL verification gate added in Task 1 Step 2 and Task 5 Step 1 |
| CI-2: /path/to/ placeholder in Task 2 Step 1 | Fixed | ls command now uses `ls server/migrations/ \| sort \| tail -5` |
| RC-1: npm code path dead end | Fixed | npm package research and install step removed |
| RC-2: cross-book range test | Fixed | Mal.4.5-Matt.1.1 test case added (8th test case) |
| RC-3: --local missing-argument guard | Fixed | Guard present in main() at line 870-873 |

All five R1 items are correctly addressed. However, the revision introduced three new issues in the ETL `main()` function body that must be fixed before execution.

## Design Alignment

Strong. Unchanged from R1 — all five design components map to plan tasks with no gaps:

| Design Component | Plan Task |
|-----------------|-----------|
| C1 — Migration DDL | Task 2 |
| C2 — Parser + Tests | Tasks 3 + 4 |
| C3 — ETL main() | Task 5 |
| C4 — seed-d1.sh integration | Task 6 |
| C5 — Research | Task 1 |

The `CreedsDocument` interface correctly models the `{ Metadata, Data }` structure. The migration DDL remains accurate.

## Requirements Traceability

N/A — no requirements artifact. Feature manifest records `requirements: "skipped"`. Design derives from GitHub issue #37 and pitch doc.

## Incremental Delivery

Pass — each phase produces a testable increment, unchanged from R1 assessment.

## Effort Distribution

Pass — Task 5 (L) holds well under 50% of total complexity. No task dominates the decomposition.

## Project Structural Checks

No `project.json` found — section omitted.

## Project Concerns (review stage)

No `project.json` found — section omitted.

## Out of Scope

- Remote D1 apply step — declared as manual deployment action (Task 6 Step 7), with rationale that remote credentials are not available in automated runs.
- F2 (confessional_lookup MCP tool) — explicit separate feature with dependency declared in initiative manifest.
- FTS/search over confessional content — design scopes only schema + ETL; FTS was explicitly rejected during design.
- Author metadata enrichment — `authors` column seeded as NULL; Creeds.json provides no structured author data. Noted inline.

## Summary

The five issues from R1 are all correctly resolved. However, the revision introduced three concrete bugs in the ETL `main()` body: (1) an iteration variable destructuring mismatch that causes every document to be silently skipped, (2) a `ProofTexts` vs `Proofs` field name mismatch that causes all proof-text rows to be silently dropped, and (3) a `--local` argument semantics mismatch between the implementation (expects a directory) and the validation step (passes a file path). These bugs would produce an ETL that generates a SQL file with zero documents, zero sections, and zero proof-text rows — the validation report would show `Documents ingested: 0`, failing the Task 5 "Done when" criterion with no obvious error message.

## Critical Issues (must fix before execution)

**CI-3: ETL loop variable shadowing — all documents silently skipped**

The `documents` array is typed as `Array<{ slug: string; doc: CreedsDocument }>`. The iteration variable is named `doc`:

```typescript
for (const doc of documents) {
  const slug = doc.Slug;  // undefined — doc is { slug, doc }, not CreedsDocument
```

`doc.Slug` is `undefined` because `doc` is a wrapper object `{ slug, doc }`, not the `CreedsDocument` itself. The guard `if (!slug) { ... continue; }` immediately skips every document. The `Slug` field does not exist anywhere on `{ slug: string; doc: CreedsDocument }` — the slug is the `slug` property (lowercase), and the document is in `doc.doc` (which TypeScript would flag as `doc.doc.Metadata.Title` etc.).

Similarly: `doc.Name`, `doc.Year`, `doc.Questions`, `doc.Chapters` are all `undefined` at runtime.

**Fix:** Change the loop to destructure correctly:

```typescript
for (const { slug, doc: creedsDoc } of documents) {
  // slug is already the string from the CREEDS_FILENAMES loop
  if (COPYRIGHT_EXCLUDED_SLUGS.has(slug)) { ... }

  const tradition = getTradition(slug);
  // Access Metadata fields:
  const title = creedsDoc.Metadata.Title;
  const year = creedsDoc.Metadata.Year ? parseInt(creedsDoc.Metadata.Year) : null;
  const data = creedsDoc.Data;
  // Detect format via CreedFormat or data shape:
  const isArray = Array.isArray(data);
  const format = creedsDoc.Metadata.CreedFormat?.toLowerCase() === 'catechism' ? 'catechism' : 'confession';
  // ...
```

**CI-4: ProofTexts vs Proofs field name mismatch — all proof-text rows silently dropped**

The `CreedsDocument` type definitions (written in the revision, noting "Proofs is the field name (not ProofTexts)") declare:

```typescript
interface ConfessionSection {
  Proofs: ProofEntry[];  // NOT ProofTexts
}
interface CatechismQuestion {
  Proofs: ProofEntry[];  // NOT ProofTexts
}
```

But the ETL `main()` code accesses:

```typescript
for (const pt of section.ProofTexts ?? []) {  // line 971 — always []
for (const pt of q.ProofTexts ?? []) {         // line 1002 — always []
```

Because `section.ProofTexts` is `undefined` (TypeScript optional chaining `?? []` silently returns `[]`), all proof-text expansion is skipped. The ETL will produce a `proof_count = 0` with no warning — completely silent data loss.

**Fix:** Change both occurrences to use `Proofs`:

```typescript
for (const pt of section.Proofs ?? []) {
// and
for (const pt of q.Proofs ?? []) {
```

**CI-5: --local argument semantics mismatch between implementation and validation step**

The `main()` implementation treats `--local` as a **directory path** and iterates all `CREEDS_FILENAMES`:

```typescript
const filePath = join(localDir, `${slug}.json`);
```

But Task 5 Step 3 passes a **file path** to `--local`:

```bash
npx tsx scripts/seed-confessional.ts --local /tmp/creeds-test/wsc.json
```

This will attempt `join('/tmp/creeds-test/wsc.json', '1695_baptist_catechism.json')` for every slug — every file will fail to read and be skipped, producing 0 documents. The expected output in the step ("Loaded 1 documents") is unreachable.

Additionally, the expected log message ("Loading from local path") does not match the actual code ("Loading from local directory").

**Fix:** Either:
- (a) Change the validation step to download all files to a directory and pass the directory: `mkdir -p /tmp/creeds-test && curl ... > /tmp/creeds-test/westminster_shorter_catechism.json && npx tsx ... --local /tmp/creeds-test`
- (b) Change the implementation to accept a single file path as `--local` (for single-document testing) with a separate `--local-dir` for directory mode

Option (a) is simpler and consistent with the implementation's design.

## Recommended Changes

**RC-4: Reconcile test count (7 vs 8) across task done-criteria**

Task 3 "Done when" correctly says "8 tests fail." Task 4 "Done when" says "all 7 parser tests pass" — this is wrong after the cross-book test (RC-2) was added. Task 5 Step 5 says "all 7 tests still pass." Update Task 4 Done When and Task 5 Step 5 to reference "8 tests."

**RC-5: Consider TypeScript strict null checks for doc.doc field access**

After fixing CI-3, the `creedsDoc.Data` field is typed as a union of four array/object types. The format detection should use `creedsDoc.Metadata.CreedFormat` (already modeled in the type) rather than checking `doc.Questions` (which was the old approach). The plan should specify which field to use for format detection — `Metadata.CreedFormat` values are documented in the code comments as `'Confession' | 'Catechism' | 'Canon' | 'Creed'`.

## Ready Tasks (can proceed as-is)

- **Task 1** (research) — research steps are thorough, URL verification gate is present, research notes gate Tasks 3 and 4
- **Task 2** (migration DDL) — DDL is correct, placeholder path is fixed, smoke-test steps are well-specified
- **Task 3** (parser tests) — all 8 test cases are correctly specified (cross-book test is present); test file is independent of the ETL main() bugs
- **Task 4** (parser implementation) — parser logic (`parseProofTextRef`, `VERSE_COUNTS`, `findRangeDash`) is correct and unaffected by the main() iteration bugs
- **Task 6** (seed-d1.sh integration) — integration step is well-specified and unaffected by main() bugs

Tasks 5's Step 2 (ETL main body) requires CI-3, CI-4, and CI-5 fixes before it is executable.

## Open Questions

1. **Format detection field:** After fixing CI-3, should format detection use `creedsDoc.Metadata.CreedFormat` (already modeled) or infer from data shape (`Array.isArray(data)` + content fields)? The plan should specify this explicitly since some documents (Canon, Creed formats) are neither confession nor catechism and would produce 0 sections under the current binary `confession | catechism` format check.

2. **Canon and Creed format documents:** The `CreedsDocument` type includes `CanonArticle[]` and `CreedData` as possible `Data` shapes. The ETL only handles `ConfessionChapter[]` (confession) and `CatechismQuestion[]` (catechism). Documents with `CreedFormat: 'Canon'` or `CreedFormat: 'Creed'` will be ingested as `confessional_documents` rows but have zero sections. Is this intentional, or should they be skipped?

## Evidence Reversals

None.

## Agent Findings

### code-reviewer: Needs Revision

**Critical Issues:**

- **CI-3:** Loop variable `doc` in the ETL `for (const doc of documents)` loop shadows the wrapper object `{ slug, doc }`. Accessing `doc.Slug`, `doc.Name`, `doc.Year`, `doc.Questions`, `doc.Chapters` returns `undefined` — every document is skipped via the `if (!slug) { continue; }` guard. Zero documents ingested.

- **CI-4:** `section.ProofTexts` and `q.ProofTexts` accessed in proof-text expansion loops, but the TypeScript interfaces declare `Proofs` as the field name (noted inline in the type comment). All proof-text rows silently dropped.

- **CI-5:** `--local` implementation uses directory semantics (`join(localDir, slug + '.json')`), but Task 5 Step 3 validation passes a file path. Validation will load 0 documents. Expected log message doesn't match code.

**R1 Fixes Confirmed:**

- CI-1 fixed: individual-file fetch loop correctly implemented; `CREEDS_BASE_URL` set to confirmed URL; URL verification gate in Task 1 Step 2 and Task 5 Step 1.
- CI-2 fixed: `ls server/migrations/ | sort | tail -5` (no placeholder).
- RC-1 fixed: no npm package research or install steps.
- RC-2 fixed: cross-book range test (Mal.4.5-Matt.1.1) present as 8th test case.
- RC-3 fixed: `--local` missing-argument guard present.

**Ready Tasks:** Task 1, Task 2, Task 3, Task 4, Task 6 (all unaffected by main() bugs).

### quality-reviewer: Needs Revision

**Assessment:**

TDD discipline is intact: Tasks 3 (red) and 4 (green) correctly ordered, full regression check in Task 4 Step 3. The cross-book test addition (RC-2) brings the test suite to 8 cases covering all documented edge cases.

The ETL main() body bugs (CI-3, CI-4) are correctness failures that would manifest as data integrity issues — the validation report shows correct-looking numbers but with zero data. This is a quality failure because the validation step cannot detect empty output as an error (it doesn't assert minimum row counts).

**Recommended Changes:**

- Add minimum-count assertions to Task 5 Step 4 (e.g., `section_count > 100` for a single document test to catch silent skip).
- Resolve test count discrepancy (7 vs 8) in Task 4 done-criteria.

### api-expert: Needs Revision

**Assessment:**

R1 critical issues (CI-1, CI-2) are correctly addressed. The individual-file fetch loop over `CREEDS_FILENAMES` is the correct pattern for the Creeds.json repo which has no aggregate file.

**New Issues:**

- CI-3 and CI-4 are data layer correctness failures that appear in the API contract verification step: AC-5 ("parser tests pass") will pass because the parser is correct, but AC-8 would succeed even with a broken ETL main(). There is no acceptance test that verifies `section_count > 0` after running the ETL — the contract does not catch silent data loss.

- Task 5 Step 1 URL verification (`curl -o /dev/null -w "%{http_code}"`) is a good gate. Recommend it also check the `CREEDS_FILENAMES` count matches expectations (43 filenames) to catch any additions or removals in the upstream repo.

**Ready Aspects:** Task 1 research gate, Task 2 migration, Task 3/4 parser, Task 6 integration.

## Stage Handoff

### Decisions Made

- Contract gate passed: F1-contract.yaml exists, parses cleanly, has 8 blocking acceptance tests
- No CI-skip markers found in any code block
- Critic rating was ADEQUATE — full review dispatched
- R1 fixes (CI-1, CI-2, RC-1, RC-2, RC-3) confirmed correctly applied
- Three new critical issues (CI-3, CI-4, CI-5) identified in the revised ETL main() body

### Rejected Approaches

- Ready verdict — three concrete runtime bugs prevent safe execution of Task 5
- Blocked verdict — no design alignment failures; bugs are implementation-level and fixable

### Open Questions

- Format detection field for Canon/Creed documents (owner: plan author, resolution: specify in Task 5 Step 2)
- Canon/Creed format handling — zero-section documents may be acceptable; plan should state this explicitly

### Constraints Carried Forward

- F2 must be implemented after F1 completes (F2 depends on F1 in initiative manifest)
- `parseProofTextRef` signature `(citation: string) => VerseRef[]` is the API contract for F1 tests
- `--remote` flag in seed-d1.sh requires Cloudflare credentials — remote seeding is manual

<!-- critic-miss
reviewer-found-issues-not-in-critic:
- CI-3: ETL loop variable destructuring mismatch — for (const doc of documents) accesses doc.Slug etc. but documents[] is Array<{slug, doc}> — all documents silently skipped. Critic rated the plan ADEQUATE but missed this structural bug.
- CI-4: ProofTexts vs Proofs field name mismatch — critic explicitly noted "Proofs is the field name (not ProofTexts)" in its findings but did not flag the ETL main() code using ProofTexts.
- CI-5: --local directory vs file path semantics mismatch between implementation and validation step.
reviewer-verdict: Needs Revision
critic-rating: ADEQUATE
critic-miss -->
