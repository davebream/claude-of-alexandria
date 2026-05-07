# Pitch: Expand query_lexicon and commentary_lookup inspired by TheologAI

**Date:** 2026-05-07
**Status:** materialized
**Expert input:** architect

## Problem

The `query_lexicon` tool is marked "concordance-level" precision — it returns gloss, transliteration, and morphology but lacks full scholarly definitions (BDB for Hebrew, LSJ/Abbott-Smith for Greek), pronunciation, derivation, and semantic domain classification. Agents doing word studies hit a wall and must tell users to consult published lexica.

A comprehensive **lexicon upgrade design already exists** (`docs/plans/2026-03-04-lexicon-upgrade-design.md`) that replaces the single `lexicon` table with four source-specific tables (LSJ, Abbott-Smith, BDB, UBS semantic domains). **This design was never implemented** — no migration 0011/0012 exist. The design also notes a **known Strong's H1-H9 bug** (unreachable due to zero-padding) that would be fixed as part of the migration.

TheologAI, another MCP server for biblical studies, takes a simpler approach: enriched Strong's entries (pronunciation, derivation, definition) plus FTS5 search over definitions, plus a historical documents corpus (creeds/confessions/catechisms). Studying their schema confirms the value of the unimplemented lexicon upgrade and surfaces two additional ideas: FTS5 over lexicon data, and confessional document lookup.

**What's already done (not in scope):**
- Morphology code expansion already exists in `server/src/db/parsing.ts` via `expandParsing()` — handles RMAC (NT), Hebrew compact JSON (OT), and legacy Greek JSON with format auto-detection. Past bugs with RMAC participle parsing and second perfect tense codes were fixed in v3.0.0. No additional morph code table is needed.
- Cross-references already have vote weighting, matching TheologAI's approach.
- Commentary full-text search was evaluated and deferred — existing verse-range lookup works well, BM25 ranking quality for theological prose is questionable.

## Proposed Work Items

### WI-1: Implement the lexicon upgrade (existing design)
- **Type:** feature
- **Effort:** L
- **Affected files:** `server/migrations/` (new 0011, 0012), `server/src/tools/lexicon.ts`, `server/d1-seed/`, `plugins/claude-of-alexandria/agents/data-retriever.md`, skill references
- **Dependencies:** none
- **Rationale:** The design at `docs/plans/2026-03-04-lexicon-upgrade-design.md` is already validated. It replaces the single `lexicon` table with 4 source-specific tables: `lexicon_lsj` (full LSJ Greek definitions from TFLSJ), `lexicon_abbott_smith` (NT-focused Greek from TBESG), `lexicon_bdb` (BDB Hebrew from eliranwong JSON), `lexicon_ubs_domains` (UBS semantic domain classifications). The tool handler JOINs across tables by Strong's ID, returning source-attributed definitions. Compact mode unchanged. Also fixes the H1-H9 Strong's ID zero-padding bug. All sources are CC-BY licensed. Includes 4 ETL scripts, consumer updates to data-retriever and skill references, and staged deployment with old table dropped after verification.
- **Issue-status:** created: #40

### WI-2: Add FTS5 full-text search over lexicon
- **Type:** feature
- **Effort:** M
- **Affected files:** `server/migrations/` (new migration after 0011), `server/src/tools/lexicon.ts`
- **Dependencies:** WI-1 (richer definition fields to index from LSJ/BDB)
- **Rationale:** Enables "which Greek word means 'love'?" queries — currently impossible since only ID and lemma lookup exist. With the lexicon upgrade providing full LSJ and BDB definitions, FTS5 over those fields becomes genuinely useful. Add a `search` parameter to `query_lexicon` rather than creating a new tool. Use `content=` strategy so FTS stays synced with source tables. D1 supports FTS5; the export limitation is a non-issue for seed-based databases. Consider indexing `lexicon_lsj.definition` and `lexicon_bdb.definition` in separate FTS tables (one per testament) for cleaner results.
- **Issue-status:** created: #41

### WI-3: Add confessional documents tool
- **Type:** feature
- **Effort:** L
- **Affected files:** `server/migrations/` (new migration), `server/src/tools/` (new tool), `server/d1-seed/`, `server/src/index.ts`
- **Dependencies:** none
- **Rationale:** Connects exegetical findings to confessional theology. Separate from `commentary_lookup` because access patterns differ fundamentally: commentaries are verse-indexed scholarly works; confessional documents are structured by article/chapter/question with proof texts. Schema: `confessional_documents` (id, title, tradition, year), `confessional_sections` (document_id, section_type, section_number, heading, text), `confessional_proof_texts` (section_id, book, chapter, verse_start, verse_end). Enables both directions: "What does WCF Chapter 3 say?" and "Which confessions cite Romans 8:28?" Scope: ecumenical creeds (Apostles', Nicene, Chalcedonian) + Reformed confessions (Westminster Standards, Three Forms of Unity, 1689 LBCF). All public domain.
- **Issue-status:** created: #42

## Codebase Context

**Existing lexicon upgrade design** (`docs/plans/2026-03-04-lexicon-upgrade-design.md`): Comprehensive, validated design covering schema, ETL pipeline (4 scripts), tool handler rewrite, consumer updates, and staged deployment. Never implemented — no migrations 0011/0012 exist.

**Current lexicon schema** (`server/migrations/0004_add_lexicon.sql`): 10 columns (strongs_id PK, disambiguated, testament, original_word, original_word_nfc, original_word_stripped, transliteration, morphology, gloss, meaning). 6 indexes. 20,196 entries from STEPBible TBESH/TBESG. Known bug: H1-H9 entries unreachable due to zero-padding.

**Morphology code expansion** (`server/src/db/parsing.ts`): Already handles three formats — RMAC strings (NT, post-v3.0.0), Hebrew compact JSON (OT Macula), and legacy Greek compact JSON — via `expandParsing()` with format auto-detection. Past compatibility bugs fixed: RMAC participle parsing (v3.0.0), second perfect tense code `R` (v3.0.0), Strong's number normalization H430/H0430 (v2.1.1).

**Current commentary schema** (`server/migrations/0010_add_bible_text.sql`): commentary_entries table with composite indexes. 6 commentaries across all 66 books.

**Cross-references** (`server/migrations/0006_add_cross_references.sql`): Already has vote weighting (matching TheologAI's approach).

**No existing GitHub issues** related to lexicon expansion, FTS, or confessional documents.

## Expert Input

**Architect assessment:**

- **Lexicon enrichment** via separate source tables (the existing design) is preferred over adding columns to the current table or using JSON blobs. Source-attributed definitions are more useful to agents than a single merged field.
- **FTS5 on D1** is confirmed supported. Use `content=` strategy. Export limitation is a non-issue for seed-based databases. Index definition fields from LSJ and BDB after the upgrade ships.
- **Historical documents** should be a separate tool (`confessional_lookup`), not an extension of `commentary_lookup`. Access patterns are fundamentally different (verse-indexed vs. document-structured).
- **Commentary FTS** deferred — large index, questionable BM25 for theology, existing verse lookup sufficient.
- **Morph code table** unnecessary — `expandParsing()` already does this in application code with format auto-detection.

## Open Questions

1. **Lexicon upgrade design freshness**: The design is from 2026-03-04. Are the data sources (TFLSJ, eliranwong BDB JSON, UBS SDBH/SDGNT) still available at the documented URLs? Do any need version bumps?
2. **UBS semantic domains**: The design notes a 30-minute JSON inspection gate — if UBS JSON lacks Strong's number keys, UBS domains are deferred. Has this inspection been done?
3. **Confessional scope**: Start with Westminster Standards + ecumenical creeds, or include Three Forms of Unity and 1689 LBCF from day one?
4. **D1 database size**: Current size should be checked (`wrangler d1 info`) to confirm headroom for new tables + FTS indexes.
5. **Abbott-Smith source decision**: The design chose TBESG bundled plain text over standalone TEI XML (YAGNI). TheologAI also uses STEPBible data rather than TEI XML — confirming this decision.
6. **Confessional document source data**: Where does the text come from? Manual entry (creeds are short enough), structured GitHub repos, or other? Blocking unknown for WI-3 effort estimate.
7. **Proof text granularity**: Some confessional proof texts cite entire chapters or partial verses. How are these represented in the schema?
8. **Breaking API change**: WI-1 changes response format (drops `meaning`, `lexical_precision`, `disambiguated`, `testament`, `morphology`). External MCP consumers may break. Consider versioning or deprecation period.

<!-- validation-findings
Validated by: architect
Date: 2026-05-07
Findings:
- WI-1 APPROVED: Design is validated, effort correctly sized. Resolve data source freshness and UBS inspection before starting.
- WI-2 DEFER OR REDESIGN: D1 FTS5 export bug (cloudflare/workers-sdk#9519) can brick the entire database on export attempt. Options: separate D1 database for FTS, application-level LIKE queries, or wait for bug fix. Do NOT add FTS5 virtual tables to primary database.
- WI-3 SEND BACK FOR SCOPING: Source data not identified (blocking unknown), proof-text format questions unresolved, effort should be L-XL not L. Scope initial set by ETL complexity, not user demand.
- ADDITIONAL RISKS: Breaking API change for external consumers (WI-1), D1 10GB limit check needed, seed deployment time growth, no rollback plan for WI-3.
- RECOMMENDED ORDER: WI-1 first (validated, highest value), WI-3 second (after scoping), WI-2 third (after FTS5 bug resolved).
-->
