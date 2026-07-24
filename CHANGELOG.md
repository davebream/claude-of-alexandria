# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MCP responses now carry a required `provenance` object naming every dataset used on that page, with creator, rights, source URL, version, and attribution. Heterogeneous records also expose `source_ids` (discourse, OT quotations, lexicon, commentaries, confessions). Full dataset detail is published at `/legal/datasets`, and the MCP sections of `NOTICE` / `server/NOTICE.md` are generated from the shared registry (`npm run generate-notices` / `npm run check-notices`).
- A small, offline, source-derived Torah boundary benchmark now checks Leviticus 1 and Genesis 11:1-9 in the biblical-segmentation and pericope-delimitation EXTENDED suites. Deterministic assertions require a complete gold-aligned proposal and witness-correct OSHB marker locations/types, while preserving published toledot hierarchy disagreements and leaving Prophecy/Poetry gold coverage explicitly deferred.
- `query_ot_structure` MCP tool for Old Testament passages, returning compact verse-edge syntax, participant-continuity, and speech-transition features from pinned Macula Hebrew lowfat XML and Clear Bible speaker-quotation data. The new data is loaded by a dedicated generated-in-runner D1 backfill rather than committed bulk SQL.
- The bundled Levinsohn Greek New Testament discourse-feature data can now be regenerated from its exact upstream revision with a committed extractor and SHA-256 lockfile. Each reference also preserves its upstream word-position index, so repeated forms in the same verse can be identified unambiguously while existing verse-level consumers remain compatible.
- A reproducible Masoretic paragraph-marker corruption audit now archives the 39 intentionally corrupt historical JSON files, byte-pinned Genesis/Ruth Sefaria sources, OSHB/WLC goldens, fixture hashes, incident notes, and current provenance records. The offline verifier proves the original letter-matching failure mode and prints corrected witness-scoped density metrics without changing production data.

### Changed

- Bulk D1 corpus imports and derived-data backfills are now explicit local maintainer operations with validation and a typed production-write confirmation; GitHub Actions no longer runs them automatically. Worker deployment and schema migrations remain automated.
- MCP server and marketplace versions bump to **5.0.0** (see `docs/mcp-v5-migration.md`). The edge cache namespace moves from `v8` to `v9` so stale v4 responses are not reused. SIL LGNTDF now returns its full prescribed attribution statement on every `query_discourse_features` and `query_ot_quotes` page; repository notices include the commercial-product and annual-reporting clauses.

### Fixed

- Place lookups for verses tagged under an alternate Theographic place name (for example Zion) now resolve to the canonical place (Jerusalem), instead of silently returning nothing because the duplicate place ID was never inserted into `places`. Psalm 126:4’s Negev mention remains absent in the pinned upstream dataset and is documented as a source gap, not a local drop.
- Restored nested scholar delegation in the promptfoo SDK provider on Claude Code 2.1.217 and later by opting into a maximum sub-agent spawn depth of three, using the canonical `Agent` tool name, and asserting the scholar-to-retriever handoff in the GREEN suite. The README now documents the equivalent interactive-shell setting and the reduced-confidence direct-MCP fallback when it is unset.
- `NOTICE` now clarifies that the git commit which introduced the NT Levinsohn discourse-feature data attributed it to OpenText.org, which is incorrect. A full comparison of all 33 feature files (52,257 records) against the upstream `biblicalhumanities/levinsohn` repository at a pinned commit found an exact match in content, order, and count, confirming the source already stated in `NOTICE` (SIL International / biblicalhumanities LGNTDF) is the correct one.
- Old Testament Masoretic paragraph markers — the encoded open- and closed-section divisions (petuchot and setumot) that record where a manuscript tradition divided the text — were mostly false positives, and have been rebuilt from source. Genesis listed 1,034 markers where the Leningrad Codex has 92; Ruth listed 39 where it has 1. The cause was an extraction that matched the bare Hebrew letters pe and samekh wherever they appeared in the running text, so ordinary words containing those letters were counted as paragraph breaks. Because the markers were so dense, a check for "is there a manuscript break near this boundary?" would confirm almost any proposed passage division — including wrong ones. The dataset is now generated from the OpenScriptures Hebrew Bible at a pinned commit by a generator that ships with the project, reads the explicit marker markup rather than letters in text, verifies every source file against a committed checksum, and refuses to write anything if a book fails validation. All 39 books now carry 3,162 markers total, matching the manuscript.
- Masoretic markers now record **where inside a verse** each one falls, so a boundary claim can be checked exactly. Previously a marker was recorded only against a verse number, which could not distinguish a break at the end of a verse from one in the middle of it — and 90 of the 3,162 markers fall mid-verse. A passage ending "after verse 13" is only supported by a marker at the *end* of verse 13; a mid-verse marker attests a subdivision inside that verse and is now reported as such. Verses carrying more than one marker (30 of them, such as the list of wall-builders in Nehemiah 3) are also kept as separate markers rather than collapsed into one.
- Psalms and Obadiah are now reported as having **no open/closed-section markers in this source**, rather than appearing to be books where no marker happened to be found. Each book now also carries coverage information stating explicitly that absence here may not be used as evidence against a proposed boundary. The distinction matters: Psalms is one of the three poetic books, whose structure can be carried by line arrangement and spacing that this kind of marker does not represent at all — so "this source has no marker layer for this book" is a statement about what was checked, whereas "no marker found here" reads as a finding about the text.
- Special scribal signs are now recorded on their own channel, fixing a false negative. The inverted nuns bracketing Numbers 10:35–36 are real marks in the manuscript, but because they are not open/closed-section markers the previous dataset dropped them — so that passage was reported as having "no manuscript support" when what it actually lacks is one particular *kind* of marker. Twenty such signs (inverted nuns, and large, small and suspended letter forms) are now published separately from paragraph markers, each labelled with how well its purpose is understood: the Numbers pair as a traditional delimitation, the Psalm 107 signs as uncertain in function. They are never counted as paragraph evidence.
- Verses carrying both marker types are now described accurately. 2 Samuel 16:13, 2 Chronicles 5:1 and Jeremiah 38:28 each carry two separate marks of **different kind at different places** — one inside the verse, one at its end — rather than a single boundary that is somehow both. The two kinds differ in how the scribe left the space, which is not the same as one being a stronger division than the other, so the data no longer implies a ranking.
- Marker data now declares **which manuscript tradition it follows**. Traditions genuinely disagree: the Leningrad Codex gives Genesis 92 markers where the Maimonides/Aleppo tradition gives 91. Without that declaration, any count could be attributed to some other witness and no "confirmed by manuscript" claim could be checked.
- The lemma-distribution tool (`query_lemmas`) now reports where a New Testament word actually occurs, instead of hiding words that appear only a couple of times in a book. Its counts were read from a precomputed table that had been built with a "significant vocabulary" filter — any word occurring fewer than three times in a given book was dropped — so, for example, μεταξύ ("meanwhile") in John 4:31 was reported as never appearing in John at all. NT distributions are now counted directly from the complete word-by-word text, giving exact per-book, per-chapter totals with nothing silently omitted. The Old Testament distributions and the `query_vocabulary` tool have also been made complete: the underlying vocabulary data was regenerated at the full threshold, so rare words that occur only once or twice in a book — such as רֵאשִׁית ("beginning") in Genesis — are now reported everywhere they appear.
- Tool results are no longer served stale after the underlying data changes. The server caches every tool response for up to 24 hours, and previously the only way to refresh it was to hand-edit a version string in the source — so after a data backfill, queries could keep returning the old (sometimes blank) answer for a full day. The cache is now keyed on a dedicated cache version that a maintainer can bump on deploy (or via a `CACHE_VERSION` setting), which immediately serves fresh data; deploying this change itself clears the previously stuck entries. The cache write also no longer delays the response.
- The version reported by the MCP server's handshake (`serverInfo.version`) and its `/health` endpoint is now taken from the server package version, so it always matches the released version. Previously it was a hardcoded string that release bumps did not touch, so both silently reported an old version (stuck at `3.4.0`) — making it impossible to tell from the live server which version was actually deployed.
- The Old Testament paragraph-marker tool (`query_paragraph_breaks`) now serves the corrected Masoretic dataset described above in production, and reports where each marker sits within its verse (whether it falls at the verse's end or mid-verse, and its position among multiple markers on the same verse) alongside the scribal graphic signs. This changes what the tool returns; it does not change how any consuming skill interprets that data.
- The `biblical-segmentation` skill's evidence checker no longer certifies a cited Masoretic paragraph marker as verified when only a substring-matching reference (e.g. a claim at 1:2 wrongly matched against the real marker at 1:23) or an internal within-verse marker exists at the cited verse. A marker now certifies a claim only when it sits at the exact chapter:verse cited, of the claimed type, and marks the end of that verse.
- The New Testament morphology reference data labelled the Greek word class that covers both the interrogative pronoun (τίς, "who?") and the enclitic indefinite pronoun (τις, "someone") as `interrogative_pronoun` — a name that describes only half of that class. All 27 New Testament book files now use `interrogative_indefinite_pronoun`, the precise label the data generator already produces, across 1,160 words. Lemma, parsing, and every count are unchanged.

### Changed

- The `pericope-delimitation` agent and `biblical-segmentation` skill no longer treat a Masoretic paragraph marker (a petuchah or setumah found in one manuscript) as proof that the biblical author or a final editor placed a literary boundary there. A marker now stands as graphic-witness evidence — a fact about what one named manuscript preserves — separately from the literary judgment of whether that spot is also a discourse boundary, which is now graded by how many independent signals agree there (the marker, plus syntax, genre formula, speaker or participant continuity, place, and time), using discrete labels (e.g. Strong Convergence, Moderate, Tentative) rather than a bare "Confirmed." The previous fixed rule that a petuchah always outranks a setumah in boundary strength is also removed — manuscript witnesses can disagree on which type marks a given break, so neither is treated as inherently stronger. Passages with no marker at all continue to be handled exactly as before: their absence is stated plainly and never silently upgraded or downgraded.

- Hebrew transliteration now covers dozens of additional common Old Testament words in the vocabulary, lemma, and theme tools — words like בֵּן (*bēn*, "son"), אֲשֶׁר (*ʾăšer*, "who/which"), and עַל (*ʿal*, "on") that previously came back blank because their sense-tagged Strong's number did not match the transliteration lookup. Coverage is added only where the underlying Strong's number maps to a single, unambiguous word, so a transliteration is never guessed; genuinely ambiguous or unattested entries stay blank as before.
- The `lemma_translit` field returned by the word-length tools (`query_morphology`, `query_lemmas`, `query_vocabulary`, `query_theme`, `query_themes_for_lemmas`) now documents in its own schema when and why the value can be `null` — an unpointed (consonantal) lemma, or a Strong's number that MACULA does not attest with a pointed lemma — and states that `null` is a defined, honest outcome, not an error and not a sign the word is missing from the text. Readers and downstream tools no longer have to guess whether a blank transliteration signals a bug.
- The `biblical-segmentation` skill's chiasmus-based slice constraints are now gated on demonstrability before they can block a boundary. Previously, any chiasmus center reported by the `argument-flow` agent — which explicitly labels chiastic pattern detection as an agent inference capped at MEDIUM confidence, not MCP data — was treated as an absolute "do not split" rule regardless of how well-evidenced the claim was, including a chiasm asserted by the user with no supporting evidence at all. A chiasmus now becomes a hard constraint only when it has explicit start/end boundaries, lexically or syntactically demonstrable correspondences, and a non-arbitrary center (criteria adapted from Blomberg's restrictive test for proposed chiastic structures, *Criswell Theological Review* 4.1, 1989). A chiasmus that does not meet this bar is surfaced as a soft, low/moderate-confidence advisory instead of vetoing an otherwise well-supported boundary. Contrast zones, dialogue boundaries, and conditional-consequence pairs are unaffected by this change and remain hard constraints as reported.

- The four scripts that generate the `biblical-segmentation` skill's committed morphology and vocabulary reference data (for the NT from MorphGNT/SBLGNT, for the OT from OpenScriptures/morphhb) now pin their upstream source to an exact commit and verify the SHA-256 of every downloaded file against a committed checksum lockfile before parsing. Previously the scripts recorded no source revision, so anyone re-running them could silently produce data that diverged from what ships — with no way to tell why. Re-running now fetches the same pinned revision and refuses to proceed if any input fails verification, making the committed data reproducible from its recorded provenance. A re-extraction at the pinned revision confirmed the shipped morphology and vocabulary data is unchanged, and two long-standing documentation notes were corrected to match it: the count of אֱלֹהִים (Elohim) in Genesis is **219** word tokens, not the "217" a stale note claimed (the note never matched the extractor's actual output); and Matthew's **1,068**-verse total is the correct figure for the SBL Greek New Testament, which as a critical text omits three verses the King James tradition includes (17:21, 18:11, 23:14) — it is the source edition's versification, not missing data. None of this changes what any MCP tool returns.

## [4.0.0] - 2026-07-21

### Changed

- Replaced the complete MCP tool contract in place on `/mcp`. All 26 tools now publish strict, complete input and output JSON Schemas; mode variants use discriminants; native arrays are required; and successful text content is guaranteed to match validated `structuredContent`.
- Renamed `query_theme` to `query_theme_distribution` without a compatibility alias. Bundled skills, agents, examples, the Python client, and promptfoo fixtures now use the v4 name and explicit modes.
- Added cursor pagination to the 21 tools that previously imposed silent row, verse, or character caps. Pages use deterministic ordering, opaque filter-bound cache-versioned cursors, and complete-record 25,000-character boundaries.
- Flattened discourse, person-network, commentary, confessional, and liturgical result collections so every returned record can be continued reliably. Liturgical readings now expose season slugs, season and reading themes, and explicit start/end coordinates.
- Replaced cross-reference path truncation flags with `complete` and typed termination reasons. Removed `list_books.available_tools`; MCP `tools/list` is authoritative.

### Added

- Added protocol-level `tools/list` and `tools/call` tests, AJV validation of emitted schemas, cursor integrity and reconstruction tests, description budgets, and a [v4 migration guide](docs/mcp-v4-migration.md).

## [3.5.0] - 2026-07-18

### Added

- Hebrew words now carry a dictionary-form SBL transliteration (`lemma_translit`) across the word-length tools (`query_morphology`, `query_lemmas`, `query_vocabulary`, `query_theme`, `query_themes_for_lemmas`) — previously only Greek dictionary forms were transliterated, so a non-Hebraist reader could see `ἀγάπη (agapē)` but not a Hebrew equivalent. The Hebrew value is derived deterministically from the already-stored pointed lemma (SBL Academic with spirantization) and marked as derived; surface transliteration and Greek forms are unchanged, and an unpointed lemma stays blank rather than guessed.

## [3.4.0] - 2026-07-17

### Added

- SBL transliteration alongside original-script Greek and Hebrew: `query_morphology` now returns `text_translit` (basic tier and up) and `lemma_translit` (syntax tier and up); the vocabulary, theme, and discourse tools return parallel transliterated forms as well, so word-length responses no longer require original-script literacy to read.
- New `passage-glossary` skill — produces a passage plus a deduplicated, MCP-grounded lemma glossary (a graded-reader study artifact).
- Controversy metadata layer: `query_controversies` MCP tool for looking up academically contested biblical topics (historicity, dating, authorship) by topic name or passage reference — returns a contentiousness rating plus balanced both-sides scholarly positions with sources. Backed by new `controversy_topics` and `controversy_passages` D1 tables seeded with 7 curated, scholarship-verified topics (Exodus dating, Daniel, Pentateuch authorship, Deutero-Isaiah, Conquest models, United Monarchy, Patriarchal narratives). A `chapter_contested` discovery flag on `query_events` surfaces controversy awareness during narrative event queries. Both-sides controversy wiring added to `consult-biblical-scholar` and `exegetical-notes` skills.
- `confessional_lookup` MCP tool with 4 query modes, backed by a new D1 schema and ETL for confessional documents (Creeds.json). The reference MCP server now exposes 23 tools.
- `search` parameter for the lexicon tool — LIKE-based substring queries across LSJ, Abbott-Smith, and BDB
- Adversarial red-team scenarios (prompt injection, multi-turn moralism pressure, theological manipulation persona) in EXTENDED configs for `exegetical-notes` and `pericope-delimitation` skills — tests skill resilience under adversarial user behavior
- Quarterly run cadence documentation for EXTENDED configs in `tests/promptfoo/README.md`
- Self-critique Step 9 in `exegetical-notes` skill — 5 binary checks before output delivery: indicative ground for imperative-dominated passages, redemptive-historical link for non-wisdom genres, Tier 3 citation format, verification data quality, and section completeness. Maximum 1 revision iteration if any check fails.

### Changed

- The `exegetical-notes` and `consult-biblical-scholar` skills now render Greek and Hebrew words as original script plus SBL transliteration (e.g. `ἀγάπη (agapē)`), sourced from the MCP data — word-study output reads like scholarly material without requiring original-script literacy. `biblical-segmentation` renders discourse-marker Greek in bare script honestly, since its data source supplies no transliteration for those words.
- Lexicon definitions replaced single-table glosses with multi-source scholarly definitions
- Pinned all promptfoo model IDs from floating `claude-sonnet-4-6` / `sonnet` to dated `claude-sonnet-4-6-20250514` across YAML configs and SDK provider files, preventing silent behavior drift when new model versions are released

## [3.3.0] - 2026-04-21

### Fixed

- Corrected tool name from `Task` to `Agent` in all agent frontmatter (`tools` field) and skill frontmatter (`allowed-tools` field), plus all instruction text references — agents that delegate to sub-agents now specify the correct Claude Code tool name, enabling actual nested agent spawning

## [3.2.0] - 2026-04-11

### Added

- `propose_theme.py` — Python utility script for proposing new biblical themes for `semantic_groups.yaml`, with two modes:
  - **Directed mode**: user names a theme, lexicon search surfaces OT/NT candidates with cross-testament pairing and corpus co-occurrence validation via MCP
  - **Discovery mode**: gap analysis finds high-frequency lemmas not yet covered by existing themes, clusters by shared gloss keywords
- `mcp_client.py` — thin MCP HTTP client for querying lexicon, vocabulary, theme, and book data; handles SSE transport, retry logic, and error envelopes
- Output directory `server/scripts/output/` (gitignored) for generated YAML candidate proposals with evidence reports

## [3.1.0] - 2026-03-02

### Added

- `data-retriever` agent now routes `query_syntax` and `query_variants` with SYNTAX_SUMMARY and VARIANTS_SUMMARY output sections, including `SKIPPED_OT` routing for NT-only tools
- `exegetical-notes` Section 4 leverages OpenGNT glosses and Strong's numbers; Section 8 adds `query_variants` for edition comparison with provenance caveat for single-scholar OpenGNT glosses
- `argument-flow` skill integrates `query_syntax` for clause-level structure data in connective analysis
- `pericope-delimitation` skill uses word-level Levinsohn discourse boundaries for precise boundary detection
- `consult-biblical-scholar` skill references `query_syntax` and `query_variants` for NT data enrichment
- Phase 6 RED/GREEN TDD scenarios for OpenGNT and OpenText.org data integration across updated skills

### Fixed

- Regression assertion for Strong's number formatting — agent zero-padding (`H430` → `H0430`) now accepted alongside unpadded form
- Regression assertion for KJV entity names — both KJV forms (`Phebe`, `Priscilla`) and modern forms (`Phoebe`, `Prisca`) now accepted
- S8 GREEN rubric handles empty `query_syntax` results gracefully (data gap from unavailable OpenText source)

## [3.0.0] - 2026-03-02

### Added

- NT morphology data replaced with OpenGNT (OGNT v3, CC BY-SA 4.0) — 138,013 words with RMAC parsing, Louw-Nida semantic domains, dual gloss layers (OGNT context-sensitive + TBESG context-insensitive), and Strong's numbers
- `query_variants` tool — textual variant comparison across 9 critical editions (Byzantine, NA27, NA28, NIV Greek, SBLGNT, Textus Receptus, Tregelles, Westcott-Hort, Tyndale House GNT) with edition filtering and variant type classification
- `query_syntax` tool — OpenText clause-level semantic role annotations (NT only, schema ready, awaiting data source availability)
- Word-level discourse boundaries in `query_discourse_features` — Levinsohn clause IDs, speech markers, and boundary types from OpenGNT data (47,379 entries)
- NT enrichment fields on `query_morphology`: `gloss_tbesg` (TBESG context-insensitive gloss), `louw_nida` (semantic domain code), `louw_nida_domain` (domain label) in `full` and `lexical` modes
- RMAC (Robinson's Morphological Analysis Codes) parsing support — tense, voice, mood, person, number, case, gender expansion for all NT verb, noun, and adjective forms
- OpenGNT extraction script (`extract-opengnt.py`) for reproducible ETL from OGNT source data

### Fixed

- RMAC participle parsing — `V-PAP-NSM` now correctly produces case/number/gender instead of person/number (mood-aware segment dispatch)
- RMAC second perfect tense code `R` now maps to "perfect" (was unmapped, produced raw code)
- Discourse features query missing SQL LIMIT — unbounded query could return entire book's data; now capped at 5000 rows
- Discourse features response missing CHARACTER_LIMIT guard — large books could exceed 25K character limit; now truncates with metadata
- Variants edition filter now validates against known edition codes before querying
- Health endpoint and MCP server version updated from stale 1.9.4/1.11.0 to 3.0.0
- `DESC_MORPHOLOGY` tool description updated to reflect NT enrichment is now live (was stale "returns null until Phase 5" note)

### Changed

- **BREAKING**: NT morphology data source changed from MorphGNT/SBLGNT to OpenGNT (OGNT v3). Parsing format changed from compact JSON to RMAC codes. NT word counts and positions may differ slightly.
- Cache version bumped from `v2/` to `v3/` to invalidate stale MorphGNT-era cached responses

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
