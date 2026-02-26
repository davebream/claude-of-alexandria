# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
