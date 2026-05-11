# Design: Add D1 Schema and ETL for Confessional Documents (Creeds.json)

**Requirements:** N/A (requirements field is "skipped" — derived from GitHub issue #37 and pitch doc `.kombajn/pitches/2026-05-07-confessional-lookup-mcp-tool.md`)
**GitHub Issue:** #37

## Approach

Add three D1 tables for confessional documents sourced from Creeds.json (Unlicense) via a single TypeScript ETL script and a new migration file. The ETL script parses two structural formats (confession chapters and catechism Q&A), normalizes proof-text references through the existing `lookupBook()` utility, expands reference ranges to individual verse rows at ingestion time, and emits SQL INSERT statements to a file applied via `wrangler d1 execute`. A dedicated proof-text reference parser function handles the Creeds.json dot-notation format (`Ps.19.1-Ps.19.3`), is exported from the seed script, and is covered by a companion test file.

The schema uses a unified superset-column design for the sections table: confession sections use `chapter_number`, `section_number`, and `content`/`content_with_proofs`; catechism sections use `question_number`, `question`, and `answer`/`answer_with_proofs`. Columns not applicable to a format are NULL. This avoids UNION queries in the downstream `confessional_lookup` tool (F2) and simplifies proof-text JOINs.

The migration number is `0013` — not `0011` as stated in the issue — because `0011_add_lexicon_sources.sql` and `0012_drop_old_lexicon.sql` already exist on disk. The ETL script follows the exact pattern of existing scripts under `server/scripts/` and integrates into `server/scripts/seed-d1.sh`.

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A: Single ETL script + Wrangler migration (emit .sql file) | Follows existing `seed-d1.sh` pattern exactly; .sql output is inspectable before applying; no new tooling | Large INSERT files can be slow with `wrangler d1 execute` | **Chosen** |
| B: Streaming inserts via D1 REST API | No intermediate .sql file; progress feedback | Requires API credentials at run time; diverges from project pattern; over-engineered for 23k rows | Rejected |
| C: Separate parser module in `server/src/db/` | Parser importable at query time for future dynamic parsing | YAGNI — tool queries pre-expanded rows, parser not needed at runtime; runtime src/ tests require worker context | Rejected |
| D: Separate tables for confessions vs. catechisms | Cleaner per-format schemas; no nullable columns | UNION queries in tool; JOIN complexity on proof_texts; pitch architect explicitly recommended unified superset | Rejected |

## Components

### C1: Migration — `server/migrations/0013_add_confessional.sql`
**Approach:** DDL for three tables and their indexes. Follows the style of existing migrations (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS). All tables are prefixed `confessional_`.

**Table: `confessional_documents`** (~43 rows)
```sql
CREATE TABLE IF NOT EXISTS confessional_documents (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,   -- e.g. "westminster-confession-of-faith"
  title    TEXT NOT NULL,
  year     INTEGER,                -- year of original adoption
  tradition TEXT NOT NULL,         -- manual classification: reformed/lutheran/anglican/anabaptist/ancient/other
  format   TEXT NOT NULL CHECK(format IN ('confession', 'catechism')),
  authors  TEXT,                   -- JSON array of author strings, nullable
  source   TEXT NOT NULL DEFAULT 'Creeds.json'
);
```

**Table: `confessional_sections`** (~2,500 rows — unified superset for confession + catechism)
```sql
CREATE TABLE IF NOT EXISTS confessional_sections (
  id                   INTEGER PRIMARY KEY,
  document_id          INTEGER NOT NULL REFERENCES confessional_documents(id),
  -- Confession fields (NULL for catechisms)
  chapter_number       INTEGER,
  chapter_title        TEXT,
  section_number       INTEGER,
  content              TEXT,      -- plain text (no proof markers)
  content_with_proofs  TEXT,      -- text with [1], [2] markers
  -- Catechism fields (NULL for confessions)
  question_number      INTEGER,
  question             TEXT,
  answer               TEXT,      -- plain text
  answer_with_proofs   TEXT       -- text with [1], [2] markers
);
CREATE INDEX IF NOT EXISTS idx_conf_sections_document
  ON confessional_sections(document_id);
CREATE INDEX IF NOT EXISTS idx_conf_sections_chapter
  ON confessional_sections(document_id, chapter_number, section_number);
CREATE INDEX IF NOT EXISTS idx_conf_sections_question
  ON confessional_sections(document_id, question_number);
```

**Table: `confessional_proof_texts`** (~20,000+ rows — one row per verse per proof group)
```sql
CREATE TABLE IF NOT EXISTS confessional_proof_texts (
  id          INTEGER PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES confessional_sections(id),
  proof_group INTEGER NOT NULL,   -- maps to [1], [2] marker in content_with_proofs
  book        TEXT NOT NULL,      -- canonical book name (e.g. "psalms", "romans")
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conf_proof_scripture
  ON confessional_proof_texts(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_conf_proof_section
  ON confessional_proof_texts(section_id, proof_group);
```

**Effort:** S

### C2: Proof-Text Reference Parser
**File:** `server/scripts/seed-confessional.ts` (exported function) + `server/scripts/seed-confessional.test.ts`

**Approach:** Creeds.json proof-text references use a dot-notation format: `BookAbbrev.chapter.verse` for single verses and `BookAbbrev.chapter.verse-BookAbbrev.chapter.verse` for ranges. Examples: `Ps.19.1`, `1Cor.15.1-1Cor.15.4`, `Rom.8.28`.

The parser:
1. Splits on the `-` separator, yielding one or two endpoint strings.
2. Each endpoint is split on `.` to yield `[bookPart, chapter, verse]`. The book part may itself contain digits (e.g., `1Cor`).
3. Calls `lookupBook(bookPart)` to resolve the canonical book name. If `lookupBook` returns null, logs an unresolvable warning and skips that reference.
4. For a range, expands from `(startBook, startChapter, startVerse)` to `(endBook, endChapter, endVerse)` by iterating verses within each chapter, then chapters within the book. Cross-book ranges are unusual but possible (expand up to `endBook`).
5. Returns an array of `{ book: string, chapter: number, verse: number }` objects, one per verse.

**Edge cases the parser handles:**
- Single-verse reference: `Gen.1.1` → one row
- Same-chapter range: `Gen.1.1-Gen.1.5` → five rows
- Cross-chapter range: `Gen.1.28-Gen.2.3` → requires verse counts per chapter. Since D1 does not have verse metadata at ETL time, the ETL script bundles a static verse-count map (66 books × ~1,189 chapters) derived from the standard Protestant canon. This map is a constant in the seed script, not a database query.
- Cross-book range: `Rev.22.20-Rev.22.21` — within-book range within Revelation. Genuine cross-book ranges (ending in a different book from the start) are treated as two separate single-endpoint references each expanded through the end of the start book and from the beginning of the end book — per the approach used in Creeds.json itself.
- Unresolvable abbreviations: logged to stderr with document slug and section ID; ingestion continues (skip-and-warn, not abort).

**Test file:** `server/scripts/seed-confessional.test.ts` (Vitest or Bun test, matching whichever test runner is already configured for the server). Tests cover: single verse, same-chapter range, cross-chapter range, unresolvable abbreviation (returns empty array + warning), and one real Creeds.json example.

**Effort:** M

### C3: ETL Script — `server/scripts/seed-confessional.ts`
**Approach:** TypeScript script (Node/Bun compatible — no Cloudflare Worker runtime APIs). Runs in two phases:

**Phase 1 — Fetch Creeds.json source:**
Creeds.json is a GitHub repo. The ETL script fetches the aggregated JSON from the npm package `@NonlinearFruit/creeds` or from a direct GitHub raw URL. The script accepts an optional `--local <path>` flag to load from a local file (useful in CI without network access). The fetched JSON is a map of document slug → document object.

**Phase 2 — Transform and emit SQL:**
1. For each document in the source JSON:
   a. Check against the copyright exclusion list (hardcoded set of slugs). Skip excluded documents and log.
   b. Classify tradition from the hardcoded mapping (43 entries, e.g., `"westminster-confession-of-faith" → "reformed"`).
   c. Emit INSERT for `confessional_documents`.
2. For each section within the document:
   a. Detect format: presence of `Number` (catechism question number) vs `Chapter`/`Section` (confession) fields in the Creeds.json structure.
   b. Extract `Content` (plain text) and `ContentWithProofs` (text with `[1]`, `[2]` markers).
   c. Emit INSERT for `confessional_sections`.
3. For each proof-text group in the section:
   a. Call the proof-text reference parser (C2) for each citation string.
   b. Emit INSERT for each expanded verse row in `confessional_proof_texts`.
4. At the end: print a validation report: total documents, sections, proof-text rows, unresolvable references (count + list).

**Output:** the script writes to stdout (redirected by the shell wrapper) or to `--output <file>`. The `seed-d1.sh` wrapper passes the output file to `wrangler d1 execute`.

**Copyright exclusion list** (hardcoded in the script — to be enumerated from Creeds.json README before implementation, but tentatively includes):
- Chicago Statement on Biblical Inerrancy
- Chicago Statement on Biblical Hermeneutics
- Chicago Statement on Biblical Application
- Lausanne Covenant
- Amsterdam Declaration
- Any document where the Creeds.json README explicitly notes a copyright restriction

**Tradition classification map** (hardcoded, 43 entries):
- `reformed`: Westminster Confession, Westminster Shorter Catechism, Westminster Larger Catechism, Belgic Confession, Heidelberg Catechism, Canons of Dort, London Baptist Confession 1689, Second London Baptist Confession
- `ancient`: Apostles' Creed, Nicene Creed, Athanasian Creed, Chalcedonian Definition
- `lutheran`: Augsburg Confession, Luther's Small Catechism, Luther's Large Catechism
- `anglican`: Thirty-Nine Articles
- `other`: all remaining documents not fitting the above (Abstract of Principles, Savoy Declaration — edge cases noted in pitch)

**Effort:** L

### C4: Integration into `server/scripts/seed-d1.sh`
**Approach:** Add a step to `seed-d1.sh` that invokes the confessional ETL and applies its output to D1:

```bash
echo "Seeding confessional documents..."
npx tsx server/scripts/seed-confessional.ts --output /tmp/confessional-seed.sql
npx wrangler d1 execute "$DB_NAME" --file=/tmp/confessional-seed.sql --remote
echo "  Confessional documents seeded."
```

This step is added after the migration apply step and before any verification. The `--remote` flag matches existing seed steps. No changes to `wrangler.toml` are required.

**Effort:** S

### C5: Creeds.json Source Format Research
**Approach:** Before implementation, the ETL author must read the Creeds.json GitHub repo to confirm:
1. The exact JSON structure (document → chapters/sections → proofTexts fields).
2. The complete list of copyright-restricted documents from the README.
3. Whether 39 Articles is present (flagged in pitch as "to verify").
4. The exact proof-text citation format (dot notation confirmed in pitch, but delimiter variants need checking).

This is a prerequisite research task, not a deliverable in itself. Its output feeds C3's hardcoded maps. Documented here so the planner allocates time for it.

**Effort:** S

## Error Handling

**ETL errors:** The ETL script uses a skip-and-warn strategy for individual failures:
- Unresolvable book abbreviation → log to stderr, skip that proof-text reference, continue
- Missing required field in section → log to stderr, skip that section, continue
- Excluded document → log to stdout (informational), skip, continue
- Network failure fetching Creeds.json → fatal exit with clear error message; support `--local` flag as escape hatch

**Validation report:** At completion, the ETL script emits a structured summary to stdout: total documents ingested, total sections, total proof-text rows, count of unresolvable references, count of skipped copyright-excluded documents. Any unresolvable reference count > 0 is a warning (not a failure) — the ETL succeeds with partial data.

**Migration idempotency:** `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` ensure re-running the migration is safe.

**D1 INSERT idempotency:** The seed data uses `INSERT OR REPLACE` on slug-keyed documents and `INSERT OR IGNORE` on proof-text rows (keyed by section_id + proof_group + book + chapter + verse) to make re-seeding safe.

**Verse expansion bounds:** If a range endpoint specifies a verse number exceeding the known chapter's verse count (from the static map), clamp to the last verse and log a warning. This handles minor discrepancies between Creeds.json and the static canon verse-count table.

## Testing Strategy

**Unit tests (C2 — proof-text parser):** `server/scripts/seed-confessional.test.ts`
- Single-verse parse: `Ps.19.1` → `[{ book: "psalms", chapter: 19, verse: 1 }]`
- Same-chapter range: `Gen.1.1-Gen.1.5` → 5 rows
- Cross-chapter range: `Gen.1.28-Gen.2.3` → correct expansion using static verse-count map
- Unresolvable abbreviation: `Unkn.1.1` → `[]` + warning recorded
- Abbreviated NT book: `1Cor.15.3` → `[{ book: "1_corinthians", chapter: 15, verse: 3 }]`
- Format variant: `Rom.8.28` (no range) → one row

**ETL integration check:** Run the ETL against a single representative document (e.g., Westminster Shorter Catechism JSON) offline and assert row counts: expected number of sections, expected number of proof-text expansions.

**Schema validation:** After `wrangler d1 migrations apply --local`, run a `wrangler d1 execute --local` query to verify tables exist and a sample INSERT works.

**No MCP tool tests in this feature:** The `confessional_lookup` MCP tool is F2 (depends on F1). F2 owns its own tests.

## Stage Handoff

### Decisions Made
- Migration number is `0013` (not `0011` — `0011` and `0012` already exist)
- Unified superset-column sections table: NULL columns for format-incompatible fields
- Proof-text ranges expanded at ingestion to individual verse rows (not at query time)
- Static verse-count map bundled in the ETL script (no runtime DB dependency)
- Copyright exclusion list is hardcoded in the ETL script (not configurable at run time)
- Tradition classification is a hardcoded 43-entry map in the ETL script
- ETL emits SQL to a file; `seed-d1.sh` applies it with `wrangler d1 execute`
- `ContentWithProofs` stored alongside plain `Content`/`Answer` fields in sections table
- Single `tradition` TEXT field per document (not many-to-many)
- `INSERT OR REPLACE` for documents (slug-keyed), `INSERT OR IGNORE` for proof-texts

### Rejected Approaches
- Migration number `0011` — already taken by `0011_add_lexicon_sources.sql`
- Separate confession/catechism tables — adds UNION complexity in F2 tool queries
- Runtime range expansion in the MCP tool — adds query complexity, rejected per pitch architect
- Dynamic proof-text parser in `server/src/db/` — YAGNI, only needed at ETL time
- D1 REST API streaming inserts — diverges from project seed pattern
- Many-to-many tradition tags — over-engineered, single string is sufficient for filtering

### Open Questions
- **Creeds.json source access method:** Does the project prefer fetching from the npm package `@NonlinearFruit/creeds` or a raw GitHub URL? (Owner: implementer, Resolution: check if npm package exists; use raw GitHub URL as fallback)
- **Test runner for `seed-confessional.test.ts`:** The server's `package.json` test configuration needs checking — is it Vitest or Bun test? (Owner: implementer, Resolution: check `server/package.json` devDependencies before writing test file)
- **Copyright exclusion complete list:** The pitch lists 3 confirmed + "up to 7 other 20th-century statements." Must read Creeds.json README before implementation. (Owner: implementer, Resolution: required research task C5 before C3 coding begins)
- **39 Articles presence:** Verified present in Creeds.json (mentioned in pitch as "to verify"). (Owner: implementer, Resolution: check during C5 research)

### Constraints Carried Forward
- F2 (confessional_lookup tool) must query sections using document_id + chapter_number/section_number or question_number — no UNION queries needed with unified superset design
- F2 reverse lookup uses `SELECT DISTINCT section_id FROM confessional_proof_texts WHERE book = ? AND chapter = ? AND verse = ?` — simple equality, no range overlap logic
- F2 must respect `tradition` and `format` as filter columns (both indexed via document table)
- `confessional_documents.slug` is the stable external identifier F2 uses for document filtering
- `ContentWithProofs` field uses `[1]`, `[2]` bracket notation — F2 must document this in tool output
- The static verse-count map used for range expansion is in the ETL script; if F2 ever needs dynamic parsing, it must duplicate or extract this map

## Expert Consultation Log

| Expert | Gate Point | Category | Finding | Impact on Design |
|--------|-----------|---------|---------|-----------------|
| architect (built-in) | pre-approach | data-model | Agent unavailable — self-reviewed against pitch architect recommendations | Pitch architect recommendations carried forward: unified superset table, range expansion at ingestion, single tradition field, no FTS5 |
| architect (built-in) | approach-selection | data-model | Agent unavailable — self-reviewed | Option A selected on grounds of pattern conformance; Options B, C, D rejected per YAGNI and existing codebase conventions |

<!-- critic-findings
critic-rating: ADEQUATE
findings:
Domain 1 — Missing error propagation paths:
- C2 (parser): unresolvable book abbreviation error path is specified (skip-and-warn). Cross-book range boundary behavior is specified (treat as two independent endpoints). Verse count exceeding static map: clamped with warning. All paths covered.
- C3 (ETL): network failure is fatal with --local escape hatch. Missing field in section: skip-and-warn. Copyright exclusion: log-and-skip. Adequate.
- C4 (seed-d1.sh integration): if ETL exits non-zero, wrangler d1 execute is not reached — shell set -e semantics handle this.

Domain 2 — Invariant violations:
- The migration number (0013) contradicts the issue specification (0011). This is correct — the design explicitly notes the collision and provides the corrected number. No invariant violation; the design is right and the issue is stale.
- The `ContentWithProofs` field is present in the schema. No contradiction with the pitch requirement.

Domain 3 — Scope coverage gaps:
- Issue requires: migration, ETL seed script, proof-text reference parser with tests. All three are present as C1, C2+C3, and C2's test file.
- Copyright exclusion list enumeration is a prerequisite research task (C5). Present and allocated.
- Integration into seed-d1.sh (C4) is present.
- No orphan components; no orphan requirements.

Domain 4 — Assumption leakage:
- ASSUMPTION: The static verse-count map covers all 66 books correctly. This is a well-known, stable dataset (Protestant canon) — low risk but should be called out. Added to Open Questions and Error Handling (clamping behavior).
- ASSUMPTION: Creeds.json dot-notation format is consistent across all documents. The pitch says "confirmed" but also "delimiter variants need checking." C5 (research task) exists to validate this before C3 coding.
- ASSUMPTION: `wrangler` and `npx tsx` are available in the developer's environment. No mention of prerequisites. This is adequately handled by the existing seed-d1.sh pattern — same tools already required.

Domain 5 — Interface ambiguity:
- C1↔C2: The sections table schema is fully specified including field names and NULL semantics. The proof_texts table is fully specified with book (canonical string), chapter, verse (integers). Interface is clear.
- C2↔C3: The parser returns `{ book: string, chapter: number, verse: number }[]` — the return type is stated in the component description. Sufficient for implementation.
- C3↔C4: The ETL outputs to a file path passed via --output flag; seed-d1.sh passes this to wrangler d1 execute. Interface is clear.
- F1↔F2: Constraints Carried Forward section specifies the query patterns F2 must use. Interface adequately documented.

Overall: ADEQUATE. The design covers all requirements from the issue and pitch. The migration number correction is critical and correct. The main implementation risk is the Creeds.json source format research (C5) — if the format differs from the assumed dot-notation, C2 parser logic needs adjustment. This is acknowledged and allocated.
critic-findings -->
