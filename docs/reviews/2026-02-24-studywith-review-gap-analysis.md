# StudyWith Review — Gap Analysis Against Claude of Alexandria

> **Date:** 2026-02-24
> **Source:** StudyWith Bible Study Methodology Comprehensive Assessment (6-agent parallel research)
> **Scope:** Cross-reference review findings against current claude-of-alexandria tooling
> **Categories:** Quick wins, new MCP tools, new skills, missing data, completely new additions

---

## What's NOT Relevant to Us

Several review findings are about StudyWith's *study methodology skills* (devotional guidance, centering steps, Swedish method Share phase, application dimensions, third translation). We don't do those. Our tools are analytical infrastructure: data serving + exegetical analysis. The review's MVP items 1-3 don't apply here.

---

## 1. Quick Wins (existing data/infrastructure, minimal effort)

| # | What | Why | Effort |
|---|------|-----|--------|
| **Q1** | **Serve OT_quotes.json via MCP tool** | We *already have* this data at `reference/levinsohn/OT_quotes.json` — NT verses mapped to their OT quotation Greek text. But there's no MCP tool to query it. The `exegetical-notes` Section 8 template references "OT_quotes.json for NT passages" but the agent has to Read the bundled file instead of querying structured data. | ~half day — new `query_ot_quotes` tool, schema + handler, seed data into D1 |
| **Q2** | **Expand semantic_groups.yaml** | We have 13 groups. Missing obvious families: suffering/persecution, kingdom/reign, death/resurrection, creation, temple/worship, sin/transgression, redemption/ransom, judgment/wrath. The data sources (MorphGNT Strong's, OSHB) are already in our pipeline. | ~2 hours — YAML additions + thematic_keywords D1 inserts |
| **Q3** | **Psalm sub-genre notes in book-exceptions.yaml** | `book-genres.yaml` says `psalms: hebrew_poetry` and defers to book-exceptions. But book-exceptions only has anthology handling rules, not sub-genre classification (lament, trust, royal, wisdom, thanksgiving, imprecatory). Scholarship has well-established classifications. | ~2 hours — YAML additions |
| **Q4** | **Make Daniel's genre split actionable** | Currently just a YAML comment: `daniel: prophetic # Chs. 1-6 narrative, 7-12 apocalyptic`. The `biblical-segmentation` skill can't use a comment programmatically. Add to `book-exceptions.yaml` as a genre-split entry. | ~30 min |
| **Q5** | **Conjunction/particle querying for epistles** | Our morphology table already has pos data including conjunctions. An agent can already do `pos_filter: "conjunction"` on `query_morphology`. But the review's "argument flow" need is about *logical connectives* specifically (γάρ, οὖν, δέ, ἀλλά, ἵνα, ὥστε, εἰ). Adding a `word_filter` for these is already possible but not documented as a pattern in any skill. Quick win: add a "Logical Connective Query" pattern to `exegetical-notes` for epistle genre. | ~1 hour — skill documentation update |

---

## 2. New MCP Tools

| # | Tool | Dataset | License | What it enables |
|---|------|---------|---------|-----------------|
| **T1** | **query_ot_quotes** | Levinsohn OT_quotes.json (already bundled) | CC BY-SA (same as rest of Levinsohn) | Query which OT passages are quoted in a given NT range. Returns verse, quoted Greek text. Critical for intertextual analysis and cross-reference verification. |
| **T2** | **query_cross_references** | Treasury of Scripture Knowledge (TSK) | Public domain | ~500K structured cross-reference links. Currently cross-references are agent-generated (training data or web search). This makes them data-grounded. Serves the review's "intertextual echoes" and "cross-reference validation" needs. |
| **T3** | **query_text** | Berean Standard Bible (BSB) or World English Bible (WEB) | BSB: CC BY 4.0 / WEB: Public domain | Serve actual passage text. Currently our tools provide metadata *about* the text (morphology, discourse) but not the text itself. Makes the pipeline self-contained. Also enables: multi-translation comparison if we serve both. |
| **T4** | **query_lxx** | CCAT LXX morphological analysis (Rahlfs text) | Various CC licenses; check specific dataset | LXX-MT comparison for OT studies. Verify how NT authors quote the OT (from LXX or directly from Hebrew?). Enables the review's "LXX comparison notes" for Hebrew poetry. |

**Priority:** T1 is highest (we already have the data, just need the tool). T3 next (makes everything self-contained). T2 and T4 are larger data ingestion projects.

---

## 3. New Skills

| # | Skill | What it does | Review finding it addresses |
|---|-------|-------------|---------------------------|
| **S1** | **poetic-analysis** | Dedicated Hebrew poetry skill: identify parallelism types (synonymous, antithetic, synthetic, climactic), chiastic structures, strophe/stanza boundaries, inclusio patterns. Uses Masoretic markers + morphology + (future) cantillation data. | "Missing poetic structure (parallelism, chiasm) for Hebrew poetry" — review's P1 finding |
| **S2** | **argument-flow** | For epistles: generate clause-level logical flow showing main propositions, grounds (γάρ-clauses), inferences (οὖν), conditions (εἰ), purpose (ἵνα), and subordination. Essentially "Mounce's phrasing method" as a structured output. Uses discourse features + morphology + conjunction filtering. | "Missing discourse analysis / argument flow for epistles" — review's P0 finding |
| **S3** | **intertextual-analysis** | Systematic identification of quotations (from OT_quotes data), allusions (shared vocabulary via `query_vocabulary`), verbal echoes, and typological patterns across testaments. Deeper than the cross-reference section in exegetical-notes. | "Intertextual echoes underrepresented" + "Only quotations and allusions captured" |

**Not recommended as new skills (already covered):**
- Canonical context — Better as an enhancement to `exegetical-notes` Section 1 (add a "Redemptive-Historical Placement" sub-section) rather than a standalone skill
- Literary device identification — Better as an enhancement to `exegetical-notes` Section 2 (Internal Structure) or folded into `poetic-analysis`

---

## 4. Missing Data We Already Have Access To But Forgot

| # | Data | Where it lives | What we're missing |
|---|------|----------------|-------------------|
| **D1** | **OT_quotes.json — not in D1** | Bundled at `reference/levinsohn/OT_quotes.json` | Has NT→OT quotation mappings with Greek text. Never ingested into D1, never served via MCP. The exegetical-notes template references it but agents have to Read a flat file. |
| **D2** | **Psalm titles/superscriptions** | Available in OSHB (which we already use for OT morphology) | Contain genre (מִזְמוֹר), authorship (לְדָוִד), liturgical (לַמְנַצֵּחַ), and musical direction. We use OSHB for morphology but don't extract superscription metadata. |
| **D3** | **Hebrew cantillation marks (ta'amei hamikra)** | Available in Sefaria/Leningrad Codex data (which we already use for Masoretic markers) | Accent marks encode phrase-level structure: major disjunctive marks (atnach, sof-pasuq) vs. conjunctive marks. We extract petuchah/setumah from Sefaria but ignore cantillation. Critical for Hebrew poetry analysis — they show the verse's internal syntactic structure. |
| **D4** | **Levinsohn feature coverage gaps** | We serve 6 default features but the dataset has 30+ | Features like `Thematic_Prominence`, `Over-encoding`, `Focus+`, `Cataphoric_Focus` are in our bundled JSONs and presumably in D1, but aren't in the default feature set. Skills may not know to request them. |

---

## 5. Completely New Data / Tools / Skills

| # | What | Dataset/Source | License | Value |
|---|------|---------------|---------|-------|
| **N1** | **LXX morphological database** | CCAT Rahlfs LXX, or Tyndale House STEP Bible LXX data | CC BY (STEP Bible); check CCAT terms | Enables MT-LXX comparison, verifies how NT quotes OT, crucial for OT exegetical-notes and the poetic-analysis skill. The review calls this out specifically for Psalm 23. |
| **N2** | **TSK cross-reference database** | Treasury of Scripture Knowledge | Public domain (1890) | ~500K reference links. Structured, machine-readable. Can be filtered/ranked. Replaces agent-generated cross-references with data-grounded ones. |
| **N3** | **Bible text via MCP** | BSB (CC BY 4.0) + WEB (public domain) | Open | Two translations from different philosophies (BSB = formal-mediating, WEB = formal). Makes the pipeline self-contained. Also addresses the review's "only 2 translations" finding for StudyWith. |
| **N4** | **Textual criticism notes** | UBS apparatus (restricted) vs. free alternatives: CNTTS apparatus, or Tyndale House GNT variant notes | Check per-dataset | Systematic variant data instead of ad hoc mentions. The review says "mentioned ad hoc where significant." |
| **N5** | **Theological controversy reference data** | Authored internally (YAML files) | Our own | `reference/traditions/` with files like `predestination.yaml`, `eschatology.yaml`, `spiritual-gifts.yaml`. Loaded by skills when debated passages are encountered. Maps: topic → key passages → Protestant traditions → representative scholars per tradition. |

---

## Priority Recommendation

### Do first (builds on what we have)
1. **Q1** — Serve OT_quotes via MCP (data exists, needs D1 ingestion + tool)
2. **Q5** — Document conjunction querying pattern for epistles in exegetical-notes
3. **Q2** — Expand semantic groups
4. **S2** — Argument-flow skill (highest-value gap per review, and we have the discourse + morphology data already)

### Do next (new data ingestion)
5. **T3** — Bible text via MCP (BSB/WEB)
6. **T2** — TSK cross-references
7. **S1** — Poetic-analysis skill (after getting cantillation data)
8. **D3** — Extract cantillation marks from Sefaria data

### Phase 3 (larger projects)
9. **N1** — LXX database
10. **S3** — Intertextual-analysis skill
11. **N5** — Theological controversy reference data

---

## Verdict

The review is solid work. Most of its findings hit real gaps in our data layer and skill coverage, even though many of its methodology recommendations (centering steps, anti-hallucination, application dimensions) don't apply to our analytical tooling.

---

## Current State Reference

**Skills (4):** biblical-segmentation, pericope-delimitation, exegetical-notes, consult-biblical-scholar

**MCP Tools (5):** list_books, query_discourse_features, query_paragraph_breaks, query_vocabulary, query_morphology

**Data:** Levinsohn discourse features (30+ feature types), Masoretic petuchah/setumah markers, MorphGNT/SBLGNT (NT), OSHB morphhb (OT), vocabulary frequencies + clusters, 13 semantic groups, OT quotes in NT (bundled JSON, not MCP-served), book genres, genre methodology, compositional debates, book exceptions

**D1 Tables:** discourse_features, paragraph_markers, vocabulary, vocabulary_clusters, thematic_keywords, morphology
