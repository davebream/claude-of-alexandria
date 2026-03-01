# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] - 2026-03-02

### Added

- 4-tier intertextual hierarchy in `exegetical-notes` Section 8 — explicit citation, lexical connection, entity continuity, editorial tradition — replacing the previous Primary/Secondary labeling
- Cross-reference mode in `consult-biblical-scholar` with editorial tradition labeling and vote-based confidence
- Entity-aware `data-retriever` agent with PEOPLE/PLACES/EVENTS/CROSS_REFERENCES/LEXICON/VERSIFICATION/SPEAKER summary sections
- Entity and speaker tools integrated into `biblical-segmentation`, `argument-flow`, and `pericope-delimitation` skills
- Speaker attribution data consumed by `exegetical-notes` (Section 6) and `consult-biblical-scholar` for divine speech identification and prophetic mediated speech caveats

## [2.4.0] - 2026-03-01

### Added

- `query_speakers` tool — speaker attribution and quotation data from Clear Bible FCBH consensus dataset (1,285 speakers, 7,306 quotations), with divine speech filtering (`divinity_only`), range-based quotation overlap queries, and dual theological caveats for Christophany attribution and prophetic mediated speech
- Speaker and quotation schema: 2 tables with book/chapter/verse range indexes for efficient passage lookups
- Speaker routing in `data-retriever` agent — automatically queries speaker data for passages with verse ranges
- Clear Bible FCBH attribution in NOTICE.md

### Fixed

- D1 partial index subquery error — removed `idx_quot_divine` partial index unsupported by D1 SQLite, replaced with JOIN-based divine speech filtering
- Quotations book name format mismatch — `query_speakers` now uses `displayName` (title case) matching the quotations table format instead of `canonical` (lowercase)
- Stale Cloudflare Cache API responses surviving Worker redeployment — added `v2/` prefix to cache key path for cache busting

## [2.3.0] - 2026-03-01

### Added

- `query_people` tool — named individuals with cross-canonical appearances from Theographic/TIPNR (CC BY-SA 4.0 / CC BY 4.0), disputed identification flags (e.g., Junia), and high-frequency entity guards
- `query_places` tool — geographic locations with latitude/longitude coordinates, feature type classification, and cross-canonical appearances from Theographic/TIPNR
- `query_events` tool — timeline events with participants, locations, and Ussher/Masoretic-derived chronology caveat (~450 milestone events)
- `query_person_network` tool — family relationships and co-appearances for named individuals with depth 1-3 expansion, person disambiguation (slug/name/fuzzy), and high-frequency co-appearance guard
- Theographic entity schema: 12 tables for people (3,067), places (1,274), events (450), relationships (~10K), groups (23), and verse-entity junctions (~190K rows)

## [2.2.0] - 2026-03-01

### Added

- `query_lexicon` tool — Strong's-based word definitions from STEPBible TBESH/TBESG data (20,196 entries: 9,348 Hebrew + 10,846 Greek), with lookup by Strong's ID or lemma and compact mode
- `check_versification` tool — Hebrew-English verse numbering differences from UBS versification data (144 canonical mappings), with book-level, verse-level, and range queries
- `query_cross_references` tool — 344,799 editorial-tradition cross-reference pairs from OpenBible.info with vote counts, bidirectional queries (from/to/both), and configurable limits

## [2.1.1] - 2026-03-01

### Added

- OT morphology enrichment via Macula Hebrew — glosses, Strong's numbers, clause types, semantic frames, subject/participant references for all 39 OT books
- `fields` parameter on `query_morphology` with 4-level progressive disclosure: `basic` (default, backward-compatible), `syntax` (adds clause data + Strong's), `full` (adds glosses + semantic frames), `lexical` (compact word-study set)
- `strongs_filter` parameter on `query_morphology` to filter words by Strong's number within a verse range
- Strong's number normalization — `H430` and `H0430` both resolve correctly (zero-padded to 4 digits)
- OT enrichment routing in `data-retriever` agent — automatically requests `fields: "full"` for OT passages

### Fixed

- Output schema fields made optional for `lexical` mode compatibility (fields like `normalized`, `pos`, `parsing` are absent in lexical mode)

## [2.1.0] - 2026-03-01

### Added

- Genre-graduated redemptive-historical requirement for `exegetical-notes` Section 8 — epistles/narrative/prophecy require cross-testament links; wisdom literature and short personal letters have graduated expectations
- 3 stress tests for genre edge cases: Philemon 8-16 (short letter), Proverbs 10:1-7 (wisdom), 3 John 1-8 (minimal density)
- `query_theme` MCP tool to root README and plugin README tool tables
- Sub-agents section in root README with delegation chain diagram
- Automated test badge and counts in root README (89 tests)
- Available Agents section in plugin README

### Changed

- `exegetical-notes` Rule 5 verification capped to 5 risk-prioritized claims (morphological parsings, frequency counts, hapax claims) to prevent turn exhaustion
- Root README "The Problem" section expanded from 5 to 10 failure modes, grounded in RED-phase test evidence
- Root README "The Evidence" section now documents promptfoo infrastructure (41 RED + 47 GREEN + 1 smoke)
- Plugin README architecture section updated from v1.5.0 reference to current agent-based architecture
- Plugin README MCP tool count updated from eight to nine (added `query_theme`)

### Fixed

- Plugin manifest version mismatch: `plugin.json` was 1.11.0 while `marketplace.json` was 2.0.0 — both now 2.1.0
- 7 GREEN test failures from template/rule contradictions in exegetical-notes skill
- 3 GREEN test failures (S2 verse references, S3 tier labeling, S4 pericope check) in exegetical-notes skill

## [2.0.0] - 2026-02-27

### Added

- `data-retriever` sub-agent (Haiku) — fetches MCP biblical data and compresses into structured summaries with testament-aware routing
- `biblical-scholar` sub-agent (Sonnet) — scholarly analysis with three auto-detected modes (ANALYZE, VALIDATE, TRACE), confidence tiers, and source attribution
- `study-evaluator` sub-agent (Sonnet) — evaluates bible study outlines, transcripts, and methodology files against exegetical standards with drift classification
- Inter-agent delegation chain: study-evaluator → biblical-scholar → data-retriever
- Agents directory (`plugins/claude-of-alexandria/agents/`) for auto-discovered sub-agents

## [1.11.0] - 2026-02-27

### Added

- New `query_theme` MCP tool: cross-book distribution of a thematic keyword group across the entire NT or OT — shows every book where the theme appears, per-lemma chapter breakdowns, and totals sorted by density

## [1.10.0] - 2026-02-27

### Added

- 12 new thematic keyword groups: `deity`, `christology`, `prayer`, `word-revelation`, `light-darkness`, `humanity`, `humility-pride`, `wealth-poverty`, `gospel-mission`, `peoples-nations`, `prophecy`, `healing`
- Densified 4 sparse themes: `covenant` (added σπέρμα, μεσίτης), `oracle` (added προφητεία, λόγιον), `vanity` (added NT lemmas μάταιος/κενός/ματαιότης), `remnant` (added κατάλοιπος)
- `analyze-theme-gaps.py` script for empirical gap analysis against vocabulary corpus
- `seed-themes-only.sh` script for lightweight theme-only redeployment without full morphology re-import

## [1.9.4] - 2026-02-27

### Fixed

- MCP array parameters (`lemmas`, `features`) now accept both native JSON arrays and JSON-encoded strings from XML-based tool calling formats (fixes "expected array, received string" error when called from Claude Code)

## [1.9.3] - 2026-02-26

### Changed

- Added `query_themes_for_lemmas` to `argument-flow` allowed-tools for theme-aware vocabulary pass during connective analysis

## [1.9.2] - 2026-02-26

### Changed

- Added `query_themes_for_lemmas` to `exegetical-notes`, `consult-biblical-scholar`, and `biblical-segmentation` allowed-tools so agents can resolve lemmas to semantic themes during analysis

## [1.9.1] - 2026-02-26

### Changed

- Added `query_lemmas` to `exegetical-notes` and `consult-biblical-scholar` allowed-tools so agents can use cross-book lemma data during analysis

## [1.9.0] - 2026-02-26

### Added

- New `query_lemmas` MCP tool: cross-book lemma distribution across the biblical canon, showing where specific lemmas appear across all books in a testament with chapter-level frequency data
- `(lemma, testament)` index on `vocabulary` table for optimal cross-book query performance

## [1.8.0] - 2026-02-26

### Added

- New `query_themes_for_lemmas` MCP tool: resolves morphology lemmas into vocabulary theme names, bridging the gap between `query_morphology` and `query_vocabulary` in the automated pipeline
- `(lemma, testament)` index on `thematic_keywords` table for optimal reverse lookup performance

## [1.7.3] - 2026-02-26

### Fixed

- Corrected MCP tool prefix in all five skills — `mcp__claude-of-alexandria-mcp__` replaced with actual runtime name `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__` so `allowed-tools` auto-authorization works
- Added missing `allowed-tools` to `pericope-delimitation` skill (was the only skill without it)
- Replaced stale local file path references in `pericope-delimitation` with MCP tool calls
- Removed unused `Bash` and `Glob` from `exegetical-notes` and `consult-biblical-scholar` allowed-tools

## [1.7.2] - 2026-02-26

### Fixed

- Removed stale `Bash` and `Glob` from `biblical-segmentation` allowed-tools (data access is fully MCP-based now)
- Removed misleading `reference/levinsohn/` directory listing from segmentation skill (agents should use `query_discourse_features` MCP tool)

## [1.7.1] - 2026-02-26

### Fixed

- Stale Python script references (`verify_claims.py`, `sefaria_paragraphs.py`, `morphology_parser.py`, `vocabulary_parser.py`) left behind by the MCP migration in `exegetical-notes` and `pericope-delimitation` skills — replaced with MCP tool names
- `exegetical-notes` Rule 5 now instructs MCP-based cross-checking instead of referencing a script that was never available to the skill
- `exegetical-notes` README.md updated to list MCP tools instead of Python script dependencies
- Test evidence files updated to reflect current MCP-based skill behavior

## [1.7.0] - 2026-02-24

### Added

- `query_ot_quotes` MCP tool — OT quotations in NT passages, merging Levinsohn OT_quotes.json (691 entries) and STEPBible ot-in-nt data (471 entries) into 939 quotes with 1138 source references; supports verse range and OT book filters
- OT source gap-fill via OpenBible cross-references (CC BY) — 298 previously-sourceless quotes now have OT references (292 matched by confidence rank, 6 hardcoded: Heb 10:8-9 → Ps 40:6-8; Rom 4:22 → Gen 15:6; Rom 10:7 → Deut 30:13); coverage is now 100% across 1436 entries
- `argument-flow` skill — map the logical argument of an NT epistle passage using discourse markers and morphological data; produces a numbered proposition chain, connective analysis, and preachable summary

### Changed

- Semantic groups expanded from 13 to 69 (added `primary_genres` field for genre-aware vocabulary; new groups cover Pauline, General Epistles, Gospels, Hebrew Poetry, Wisdom, Prophetic, OT Narrative, and Apocalyptic sub-themes)
- `exegetical-notes` skill: added `query_ot_quotes` to `allowed-tools`; Section 8 now calls the MCP tool instead of referencing a static JSON file; added epistle-specific conjunction querying pattern with nine-connective reference table
- `consult-biblical-scholar` skill: added `query_ot_quotes` to `allowed-tools` and cross-reference tool table

## [1.5.1] - 2026-02-21

### Fixed

- `.mcp.json` missing `"type": "http"` field, causing Claude Code to silently skip the remote MCP server

## [1.5.0] - 2026-02-20

### Added

- Remote MCP server deployed to Cloudflare Workers + D1 — no local Node.js required
- Health check endpoint (`GET /health`) with D1 connectivity probe
- CORS support for all MCP endpoint responses
- Response caching via Workers Cache API (24-hour TTL) for static biblical reference data

### Changed

- `.mcp.json` now uses a single `url` field instead of `node` command + local server path
- Morphology tool defaults to 5000-row limit to prevent unbounded responses

### Removed

- Local Node.js/SQLite MCP server (`servers/claude-of-alexandria-mcp/`)
- `biblical.sqlite` database file (71 MB) from repository
- MCP server tarball from GitHub Actions release workflow

## [1.4.0] - 2026-02-20

### Added

- `consult-biblical-scholar` skill — scholarly Q&A with three auto-detected modes (MEANING, VALIDATE, CROSS-REFERENCE), graduated confidence (HIGH/MEDIUM/LOW/CANNOT ANSWER), formal analogy verdict system (SUPPORTED/COMPATIBLE/NOT SUPPORTED/INSUFFICIENT DATA), and hard epistemic boundaries with honest pushback when MCP data and scholarly sources are insufficient

## [1.3.0] - 2026-02-19

### Added

- MCP server (`claude-of-alexandria-mcp`) exposing four query tools: `query_discourse_features`, `query_paragraph_breaks`, `query_vocabulary`, `query_morphology`
- Pre-compiled SQLite database (71MB) bundling all reference data — no Python runtime required
- Claude Desktop support via the bundled MCP server

### Changed

- `biblical-segmentation` and `exegetical-notes` skills now call MCP tools instead of Python scripts, improving reliability and removing runtime dependencies
- Python parser scripts marked as archived (retained as reference for ETL validation)

## [1.2.0] - 2026-02-19

### Added

- GitHub Actions workflow to automatically package each skill as a ZIP file and attach to GitHub Releases, enabling direct download for Claude Desktop users

## [1.1.0] - 2026-02-18

### Added

- `allowed-tools` frontmatter to all three command files (`biblical-segmentation`, `pericope-delimitation`, `exegetical-notes`), pre-authorizing `Bash`, `WebSearch`, `Read`, `Write`, and `Glob` so users are not prompted for permission on every tool use

## [1.0.0] - 2026-02-10

### Added

- `biblical-segmentation` skill — divide biblical books into coherent teaching units for sermon series, Bible study, or devotional reading
- `pericope-delimitation` skill — validate whether a biblical passage constitutes a coherent discourse unit and check passage boundaries
- `exegetical-notes` skill — produce structured exegetical analysis of a biblical passage with lexical data, discourse features, and interpretive framework
- Slash commands for all three skills
- TDD verification artifacts (scenarios, baseline, verification) for all three skills
- Levinsohn GNT Discourse Features reference data for NT boundary analysis
- Masoretic paragraph marker reference data (Sefaria-Export) for OT boundary analysis
- Vocabulary frequency reference data for thematic option generation
- `levinsohn_parser.py`, `sefaria_paragraphs.py`, and `vocabulary_parser.py` scripts
- GitHub issue templates

### Fixed

- Plugin source path in `marketplace.json`
- Plugin manifest renamed from `manifest.json` to `plugin.json` for correct discovery
- Removed `disable-model-invocation` from commands
