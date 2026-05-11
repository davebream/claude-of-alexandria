# Design: Add FTS5 Full-Text Search over Lexicon Definitions

**Requirements:** skipped (see GitHub issue #41)
**Stories covered:** N/A

## Approach

Add a `search` parameter to the existing `query_lexicon` MCP tool that enables meaning-based lookup — e.g., "which Greek word means 'love'?". When `search` is provided, the handler performs case-insensitive `LIKE` substring matches across the `gloss` and `definition` columns of all three lexicon source tables (`lexicon_lsj`, `lexicon_abbott_smith`, `lexicon_bdb`) and returns up to 20 matching entries.

**Mitigation chosen: Application-level LIKE queries (Option B).** This is the correct choice given the D1 FTS5 export bug (cloudflare/workers-sdk#9519), which can corrupt the entire D1 database when virtual tables are present during `wrangler d1 export`. The lexicon tables are bounded in size (~17,000 LSJ Greek entries, ~5,800 Abbott-Smith entries, ~8,600 BDB Hebrew entries — approximately 31,400 total rows across all three tables). LIKE queries on this volume are fast enough for a research assistant tool with a 20-result cap. No virtual tables, no separate D1 binding, no migration risk, no infrastructure overhead.

The `search` parameter is mutually exclusive with `strongs_ids` and `lemmas` — one of the three must be provided. The `compact` parameter remains compatible with `search` mode. Results are deduplicated by Strong's ID (LSJ takes precedence over Abbott-Smith for Greek; BDB for Hebrew). The `not_found` field is omitted from search results (it has no meaning when doing open-ended search). A `total_matches` hint is returned so callers know if results were capped.

**Why not FTS5 in a separate D1 binding (Option A):** Adds Wrangler config complexity, a separate migration/seed pipeline, an additional DB binding in `index.ts`, and a second cost center — all for a problem that doesn't exist when using LIKE. The FTS5 worker-sdk bug affects export (not runtime queries), so FTS5 in production would work, but the operational cost of managing two databases is unjustified when LIKE is sufficient.

**Why not wait or accept risk:** Option C (accept risk) puts the primary database at risk on every export invocation. Option D (wait) blocks the feature on an open upstream issue with no ETA.

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| B: LIKE queries (chosen) | No virtual tables, zero export risk, no infra overhead, sufficient for bounded tables | No relevance ranking, no stemming | Chosen |
| A: Separate D1 binding for FTS5 | Fully isolates FTS risk, proper full-text relevance ranking | Second DB to manage, Wrangler config changes, separate seed pipeline, dual migration management | Rejected — YAGNI given LIKE sufficiency |
| C: FTS5 in primary DB with documentation | Full FTS features, single DB | Export bug corrupts primary DB, requires operator discipline, downtime risk on export | Rejected — unacceptable risk to production data |
| D: Wait for upstream fix | Clean solution eventually | No ETA on cloudflare/workers-sdk#9519, blocks feature | Rejected — indefinite block |

## Components

### C1: Lexicon handler search branch (`server/src/tools/lexicon.ts`)
**Approach:** Add `search` field to `LexiconInputSchema` (Zod `z.string().optional()`, max 100 chars, describe "English meaning search term"). Update the mutual-exclusion guard to include `search` as a valid sole input — if `search` is provided with `strongs_ids` or `lemmas`, return `INVALID_INPUT`. Add a new code branch for the `search` path:

1. Normalize the search term: trim, lowercase.
2. Build the LIKE pattern: `%<term>%`.
3. Query all three source tables using `Promise.allSettled` (not `Promise.all`) so a failure on one table does not abort the others:
   - `SELECT strongs_id, gloss, original_word, transliteration, definition as lsj_definition FROM lexicon_lsj WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`
   - `SELECT strongs_id, gloss, original_word, transliteration, definition as abbott_smith_definition FROM lexicon_abbott_smith WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`
   - `SELECT strongs_id, gloss, original_word, transliteration, definition as bdb_definition FROM lexicon_bdb WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? LIMIT 20`
   Rejected promises from `allSettled` are recorded in `errors[]`; fulfilled results are merged. This matches the existing partial-result contract in other lookup paths.
4. Merge results into a `Map<strongs_id, SourceRow>`. Precedence: LSJ wins over Abbott-Smith for Greek (same Strong's ID); BDB is Hebrew-only (no collision). If Abbott-Smith matches a Strong's ID already in the map from LSJ, merge `abbott_smith_definition` into the existing entry.
5. Cap combined results at 20 (sort by Strong's ID prefix — G entries first, then H — for deterministic ordering). Note: each source table is queried with LIMIT 20; the true total matching entries in the database may exceed what is fetched. The 20-row cap per table plus deduplication means results are representative, not exhaustive.
6. Fetch UBS domains for all matched Strong's IDs (same join as the existing lookup paths).
7. Return `{ entries, results_capped, errors }` — note: no `not_found` field in search responses. `results_capped` is a boolean indicating whether the combined result set was trimmed to the 20-entry cap.

**Input validation additions:**
- `search` max length: 100 characters. Reject with `INVALID_INPUT` if longer.
- `search` minimum length: 2 characters. Reject with `INVALID_INPUT` if shorter (prevents runaway LIKE scans).
- Strip SQL wildcards from user input (`%` and `_`) before building the LIKE pattern to prevent unintended wildcard injection.

**File:** `server/src/tools/lexicon.ts`
**Effort:** M

### C2: Output schema update (`server/src/tools/lexicon.ts`)
**Approach:** Add `results_capped` field to `LexiconOutputSchema` (`z.boolean().optional()`). This boolean indicates whether the returned entries were trimmed to the 20-entry cap. A `total_matches` count would be misleading because each source table is individually capped at LIMIT 20 during query — the true number of matching entries in the database is not computed by LIKE queries without a separate COUNT. Using a boolean avoids overstating precision. The `not_found` field remains in the schema but is always `[]` for search responses.

**Performance note:** `LIKE '%term%'` substring queries defeat B-tree indexes and cause full-table scans. With ~31,400 total rows across three lexicon tables and a per-table LIMIT 20, this is acceptable: a full-table scan of 31k small rows on D1's SQLite is well within response time bounds for an interactive research tool. This is explicitly documented in the code (comment above the LIKE queries) and in this design. If table size grows significantly, adding a partial index on `LOWER(gloss)` or migrating to FTS5 (when the upstream bug is fixed) are the natural next steps.

Update `LexiconInput` type to reflect the new optional `search` field.

**File:** `server/src/tools/lexicon.ts`
**Effort:** S

### C3: Tool description update (`server/src/index.ts`)
**Approach:** Extend `DESC_LEXICON` to document the new `search` parameter. Add:
- Parameter description: `search` (string, optional): English meaning or concept to search for (e.g., "love", "redemption"). Searches gloss and full definitions across all lexicon sources. Returns up to 20 matches.
- Add an example: `- Meaning search: search="love"` (returns Greek and Hebrew words for love — callers can infer testament from Strong's ID prefix: G = Greek, H = Hebrew)
- Update the mutual-exclusion note: "Provide exactly one of: strongs_ids, lemmas, or search."
- Note that search results may be capped at 20 across all sources combined.

**File:** `server/src/index.ts`
**Effort:** S

## Error Handling

**Input validation errors** (all return `isError: true` with `INVALID_INPUT` code):
- All three parameters provided simultaneously → rejected.
- `search` + `strongs_ids` or `search` + `lemmas` → rejected.
- `search` length < 2 → rejected with "Search term must be at least 2 characters."
- `search` length > 100 → rejected with "Search term must be 100 characters or fewer."
- No parameters provided → rejected with existing `MISSING_INPUT` message (updated to mention `search`).

**Runtime errors**:
- D1 query failure on any of the three source tables: caught, added to `errors[]` array. Partial results (from tables that succeeded) are still returned. This matches the existing error handling pattern in `queryLexicon`.
- Empty search results: not an error — returns `{ entries: [], total_matches: 0, errors: [], not_found: [] }`.

**LIKE injection**:
- `%` and `_` are stripped from user input before building the LIKE pattern. This is not a security issue (D1 uses parameterized queries), but it prevents the pattern from becoming unintentionally broad (a bare `%` would match everything).

## Testing Strategy

Unit tests in `server/src/tools/` (if test harness exists — the existing `bible-text.test.ts` and `schemas.test.ts` suggest a Vitest/Jest setup):
- Search returning Greek results for "love"
- Search returning Hebrew results for "covenant"
- Search returning mixed Greek + Hebrew results for "grace"
- Search deduplication when LSJ and Abbott-Smith both match the same Strong's ID
- Input validation: search < 2 chars → INVALID_INPUT
- Input validation: search > 100 chars → INVALID_INPUT
- Input validation: search + strongs_ids → INVALID_INPUT
- Input validation: no params → MISSING_INPUT (existing test coverage should cover this, but verify `search` is mentioned in the message)
- Wildcard stripping: `search="%love%"` → still works (strips the `%` and searches for `love`)

Integration / smoke tests: The existing regression test suite at `tests/promptfoo/smoke/promptfooconfig-regression.yaml` should gain one scenario verifying `query_lexicon` with `search="love"` returns at least one Greek entry (G26, ἀγάπη, is the obvious expected result).

## Stage Handoff

### Decisions Made
- Use LIKE queries instead of FTS5 to avoid cloudflare/workers-sdk#9519.
- `search` is mutually exclusive with `strongs_ids` and `lemmas`.
- Minimum search term length is 2 characters to prevent full-table scans.
- Strip `%` and `_` wildcards from user input before building LIKE pattern.
- Results capped at 20 after deduplication across all three source tables.
- LSJ takes precedence over Abbott-Smith when both match the same Greek Strong's ID.
- Return `results_capped: boolean` rather than a total count — individual LIMIT 20 per source table makes a true total count unknowable without separate COUNT queries.
- Omit `not_found` from search responses (semantically undefined for open-ended search).
- `compact` mode remains compatible with search results.

### Rejected Approaches
- FTS5 virtual tables in primary DB — export bug risk unacceptable.
- Separate D1 binding for FTS5 — infrastructure overhead not justified by LIKE sufficiency.
- Waiting for upstream bug fix — no ETA, blocks the feature.

### Open Questions
- Should results be ordered? Currently proposed: Strong's ID prefix (G before H), then lexicographic by Strong's ID. An alternative is relevance ordering (gloss-only matches ranked above definition-only matches). This can be added in a follow-up without breaking the API. (owner: planner, resolution: implement simple G/H ordering now; relevance ranking deferred)
- When cloudflare/workers-sdk#9519 is eventually fixed, should FTS5 be added as an upgrade? This design keeps the API stable — the `search` parameter interface is identical whether backed by LIKE or FTS5. (owner: future initiative, resolution: revisit when upstream is fixed)

### Constraints Carried Forward
- D1 database must not have FTS5 virtual tables created in any migration until cloudflare/workers-sdk#9519 is resolved.
- Any future search enhancements must preserve the `search` parameter name and mutual-exclusion contract.

## Expert Consultation Log

| Expert | Gate Point | Category | Finding | Impact on Design |
|--------|-----------|---------|---------|-----------------|
| — | — | — | No consultations dispatched | — |

<!-- critic-findings
critic-rating: ADEQUATE
findings:
Domain 1 (Error propagation): Promise.all was flagged — a single D1 query failure would abort all three parallel queries. Fixed: replaced with Promise.allSettled so partial results are returned and failures are recorded in errors[].
Domain 2 (Invariant violations): total_matches was flagged as semantically misleading — individual LIMIT 20 per table means the true matching count is unknowable without COUNT queries. Fixed: renamed to results_capped (boolean), which accurately represents what is knowable.
Domain 3 (Scope coverage gaps): Issue requested "cleaner results" per testament. Design addresses this implicitly through Strong's ID prefix ordering (G before H) and documents that callers can infer testament from prefix. No structural gap.
Domain 4 (Assumption leakage): LIKE substring scan defeating B-tree indexes was implicit. Fixed: added explicit performance acknowledgment in C2 with size justification (31k rows, bounded, acceptable).
Domain 5 (Interface ambiguity): total_matches ambiguity resolved by the rename to results_capped boolean. Interface between C1 and C2 is now unambiguous.
critic-findings -->
