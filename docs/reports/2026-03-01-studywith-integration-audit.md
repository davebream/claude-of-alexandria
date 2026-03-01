# StudyWith × Claude of Alexandria Integration Audit

**Date:** 2026-03-01
**Auditor:** Claude of Alexandria maintainer
**Scope:** Full read-only audit of `/Users/dawid/code/studywith` integration with the Claude of Alexandria plugin
**CoA Version:** Current `main` branch

---

## Executive Summary

StudyWith is a well-architected mobile Bible study companion that uses Claude of Alexandria as its scholarly research backbone during content authoring. The 3-phase pipeline (scaffold → research → author/validate) is sound, and the theological guardrails are among the best I've seen in any consumer Bible study product.

However, **the team is using roughly 60% of CoA's capability surface.** Three MCP tools are entirely absent from the research pipeline, one production skill (`biblical-segmentation`) is referenced but not properly wired, and a sub-agent (`study-evaluator`) designed specifically for their use case sits completely unused. The theme-selection step in `package-research` uses a manual guessing heuristic when a deterministic MCP tool exists for exactly that purpose — and I've confirmed with live MCP data that the guessing approach would fail for Psalm 23.

The 3 existing packages (John 1:1-18, Psalm 23:1-6, Romans 8:28-39) are theologically excellent. Cross-references are accurate and well-sourced. The argument-flow for Romans 8 and the poetic-structure for Psalm 23 are high quality. One package (John 1:1-18) has a research dossier; the other two do not, suggesting they predate the pipeline.

The series infrastructure is skeletal — each series has exactly 1 package (total_days: 1). The `series-research` command correctly delegates to `biblical-segmentation` but has only `list_books` in its allowed-tools, missing the MCP tools that would make series planning data-driven.

**Bottom line:** Strong foundation, significant untapped potential, a few concrete errors to fix.

---

## 1. Wrong Usages

### 1.1 CRITICAL: Theme Selection Uses Guessing Instead of `query_themes_for_lemmas`

**Location:** `.claude/commands/package-research.md`, Step 2 Round 2

**What they do:** After getting morphology data, the command instructs the agent to:
1. Extract 5-10 key lemmas manually
2. Call `list_books(include_themes: true)` to get theme names
3. "Match key lemmas against the returned theme list" using "semantic domain guessing"

**What they should do:** Call `query_themes_for_lemmas` with the extracted lemmas. This tool exists precisely to map lemmas → themes deterministically.

**Proof this fails:** I ran `query_themes_for_lemmas` on Psalm 23:1's key lemmas:
- Input: `["H7462b", "H2637", "H4210", "H3068"]` (shepherd, lack, psalm, YHWH)
- Result: Only H3068 matched (→ "deity" theme). H7462b (shepherd) matched **zero themes**.

The manual approach would have the agent look at "shepherd" and guess themes like "shepherd" or "leadership" — but "shepherd" is not an available OT theme name. The agent would either guess wrong or skip themed vocabulary entirely. With `query_themes_for_lemmas`, you'd know immediately that the shepherd lemma isn't indexed under any theme, and you'd try other passage lemmas (e.g., חֶסֶד/H2617a for "love" or "covenant" themes) instead of guessing blindly.

**Fix:** Replace the guessing heuristic with:
```
1. Extract lemmas from morphology
2. Call query_themes_for_lemmas(lemmas, testament)
3. Use matched themes for query_vocabulary(theme=...)
4. If no matches, try broader lemma set or skip themed vocab
```

### 1.2 Missing MCP Tools in `package-research` Allowed-Tools

**Location:** `.claude/commands/package-research.md`, YAML frontmatter

**Current allowed-tools list:**
- `list_books` ✅
- `query_morphology` ✅
- `query_vocabulary` ✅
- `query_discourse_features` ✅
- `query_paragraph_breaks` ✅
- `query_ot_quotes` ✅

**Missing from allowed-tools (available in CoA):**
- `query_lemmas` ❌ — cross-book lemma distribution
- `query_themes_for_lemmas` ❌ — lemma-to-theme resolution (see §1.1)
- `query_theme` ❌ — canonical theme distribution across a testament

The `guardrails-auditor` command correctly includes `query_lemmas` and `query_themes_for_lemmas` in its allowed-tools. The inconsistency suggests these tools were added to the auditor later but never backported to the research command.

### 1.3 Duplicate MCP Calls Between Steps 2 and 3

**Location:** `.claude/commands/package-research.md`

**What happens:**
- Step 2 makes direct MCP calls: `query_morphology`, `query_vocabulary`, `query_discourse_features`, etc.
- Step 3 invokes `exegetical-notes` skill, which internally spawns `data-retriever` agent, which calls the **same MCP tools**.

The same morphology, vocabulary, and discourse data is fetched twice — once by the command's direct calls and once by the skill's internal data-retriever. This doubles API costs for those tools.

**Root cause:** CoA skills are self-contained (they spawn their own data-retriever). The `package-research` command also needs raw data for dossier sections. Neither side has a "pre-fetched data" passthrough.

**Mitigation options:**
1. Accept the duplication (simplest; MCP calls are cheap on edge SQLite)
2. Restructure: run skills first, then only call MCP tools for data the skills don't surface
3. Feature request to CoA: add optional `pre_fetched_data` parameter to skills

**Severity:** Low (performance, not correctness). Each MCP call hits Cloudflare D1 edge SQLite — fast and cheap. But worth noting.

### 1.4 John 1:1-18 Genre Classification

**Location:** `content/packages/john-1-1-18/manifest.json`

**Current:** `"reading_mode": "discourse"`

**Issue:** John 1:1-18 is a theological prologue with strong hymnic/poetic elements. Many scholars (Brown, Barrett, Bultmann) consider vv.1-5 and 9-14 to be a pre-Johannine hymn. The passage contains parallelism, chiastic structure, and rhythmic patterns more characteristic of poetry than discourse argumentation.

**Consequence:** The `discourse.md` genre guide tells the agent to "track connectors (therefore, for, because, so that)" — but the Johannine prologue doesn't have epistolary connectors. It has poetic staircase parallelism. The agent would look for logical argument flow in a text that operates through imagery and repetition.

**Recommendation:** Either:
- Change `reading_mode` to `"poetic"` and add a `poetic-structure.md` file
- Use `genre_modifiers: ["poetic-elements"]` and add a note in the manifest pointing to `genre-switch.md`
- Create a `reading_mode: "hymnic"` category (would require new genre guide)

The `genre-switch.md` guide already handles embedded genre changes (it even cites Philippians 2:6-11 as an example). John 1:1-18 is a prime candidate.

---

## 2. Capability Gaps

### 2.1 HIGH: `biblical-segmentation` Skill — Referenced But Under-Wired

**Location:** `.claude/commands/series-research.md`

The `series-research` command correctly mentions `biblical-segmentation` in its execution flow (Step 4) and lists capabilities it handles (micro-book limits, anthology mode, integrity safeguards). But its `allowed-tools` only includes `list_books` — no MCP tools for the segmentation skill to use.

**What `biblical-segmentation` can do (untapped by StudyWith):**
- Present 2-4 structurally valid segmentation options with methodology labels
- Validate against Masoretic paragraph markers (OT) and Levinsohn discourse features (NT)
- **Reading Slice mode** — split verse ranges into SOAP-sized study portions (3-10 verses per slice)
- Handle contested books (Revelation, Isaiah, Hebrews, Zechariah, Job, Song of Songs) with multiple scholarly frameworks
- Thematic segmentation using vocabulary clustering data
- 33 tested scenarios covering all book types

**Reading Slice mode is a perfect fit for SOAP.** The `series-research` command already documents that SOAP needs 5-10 verses per session and includes a "SOAP Sub-Pericope Slicing" section. But it manually describes how to request slices instead of using the skill's built-in Reading Slice mode, which does this with MCP data backing.

**Impact:** Series planning is currently the weakest link in the pipeline. `biblical-segmentation` would make it the strongest.

**Fix:** Add segmentation-relevant MCP tools to `series-research` allowed-tools:
```yaml
allowed-tools: Read, Write, Glob, Bash, Skill, ToolSearch, WebSearch,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__list_books,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_themes_for_lemmas,
  mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_theme
```

### 2.2 HIGH: `study-evaluator` Agent — Completely Unused

**What it does:** Evaluates Bible study materials for exegetical fidelity. Spawns `biblical-scholar` agent for reference analysis, then compares each study point against scholarly data.

**Drift types it detects:**
- MORALISM — "try harder" without gospel grounding
- FLATTENING — collapsing covenant distinctions
- DECONTEXTUALIZATION — verses ripped from literary context
- GENRE VIOLATION — wrong methods for text type
- EISEGESIS — reading meaning into text
- THERAPEUTIC — reducing theology to self-help
- TRIVIALIZING — diminishing the text's weight

**Overall verdicts:** SOUND, SOUND_WITH_DRIFT, SIGNIFICANT_DRIFT, UNSOUND

**Why StudyWith should use it:**
1. **Package QA** — Run it on each completed `study-notes.md` and `guardrails.md` before shipping
2. **Methodology audit** — Feed `soap.md` and `swedish.md` as methodology inputs; detect if the methodology templates themselves introduce drift
3. **Eval supplement** — The `package-eval` command uses promptfoo for structural checks (verbosity, question count, stage markers); `study-evaluator` would add theological checks
4. **Regression testing** — After editing a package, run study-evaluator to confirm no drift was introduced

**Integration point:** Add to `package-eval` or create a new `/package-theology-check` command.

### 2.3 MEDIUM: `query_theme` Tool — Unused in Research Pipeline

**What it does:** Shows where a thematic keyword group appears across ALL books in a testament. Books sorted by density (most occurrences first).

**What it would add to StudyWith:**
- `context.md` enrichment: "The theme of covenant love (chesed) appears most densely in Psalms (248×), Jeremiah (30×), and Genesis (20×). Psalm 23's use of chesed connects it to this broader OT covenant tradition."
- `cross-references.md` enrichment: Instead of training-data-based cross-references, the tool would surface which books are thematically closest to the study passage
- Series planning: For a "Psalms of Comfort" series, `query_theme(theme="refuge", testament="ot")` would show exactly which psalms concentrate the refuge vocabulary, enabling data-driven series composition

### 2.4 MEDIUM: `query_lemmas` Tool — Unused in Research Pipeline

**What it does:** Shows where specific lemmas appear across the entire testament.

**Demonstrated value:** I ran `query_lemmas(["H7462b"])` (shepherd lemma from Psalm 23:1) and got:
- 127 total occurrences across 9 books
- Densest in Ezekiel (32×, mostly ch.34), Genesis (17×), Jeremiah (27×)
- Ezekiel 34 alone has 31 occurrences — the great shepherd chapter

This data would significantly enrich Psalm 23's `cross-references.md`. Currently, the cross-references file mentions Ezekiel 34:15 as a single secondary reference. With `query_lemmas`, the team would see that Ezekiel 34 is the OT's most concentrated shepherd passage (31× the same lemma) — transforming it from a secondary reference to a primary thematic parallel.

### 2.5 MEDIUM: `consult-biblical-scholar` — Only VALIDATE Mode Used

**Current usage:** `guardrails-auditor` invokes VALIDATE mode to check claims against scholarly evidence.

**Unused modes:**
- **MEANING mode** — Could be used during `package-research` Phase B to get scholarly explanations of difficult terms. Would feed directly into `key-words.md` with confidence-tiered analysis.
- **CROSS-REFERENCE mode** — Finds related passages with scholarly evidence and confidence tiers. Currently, cross-references are manually curated. This mode would surface allusions the team might miss and grade connection strength.

### 2.6 LOW: Discourse Features Not Cited in `argument-flow.md`

**Location:** `content/packages/romans-8-28-39/en/argument-flow.md`

The argument-flow file is well-structured but doesn't cite Levinsohn's discourse features. I ran `query_discourse_features` on Romans 8 and found:
- **10 left dislocations** — including 4 in v.30 (the golden chain). The repeated relative pronoun (οὓς) with left dislocation is a discourse-level signal that the chain structure is deliberate, not just a stylistic choice.
- **2 tail-head linkages** in v.17

The argument-flow file correctly identifies the golden chain but attributes it to rhetorical analysis rather than grounding it in discourse grammar data. Adding Levinsohn's left-dislocation evidence would elevate the analysis from "interpretive observation" to "linguistically demonstrated structure."

---

## 3. Series & Package Authoring Improvements

### 3.1 Series Are Skeletal

Each series JSON has exactly 1 package:
- `gospel-of-john.json`: `"packages": ["john-1-1-18"], "total_days": 1`
- `psalms-of-comfort.json`: `"packages": ["psalm-23-1-6"], "total_days": 1`
- `romans-core.json`: `"packages": ["romans-8-28-39"], "total_days": 1`

A "series" with 1 day is not a series. The infrastructure is correct (JSON schema, API endpoints, series context injection into system prompt) but the content is placeholder-level.

**Recommendation:** Run `/series-research romans --method soap --sessions 12-20` to produce a full segmentation plan for Romans, then scaffold packages for each session. The `biblical-segmentation` skill with Reading Slice mode would produce SOAP-sized portions with structural integrity.

### 3.2 Two Packages Lack Research Dossiers

Only `john-1-1-18` has a `research-dossier.md`. Psalm 23 and Romans 8:28-39 do not.

This means those packages were likely authored before the `package-research` pipeline existed, or the pipeline wasn't run for them. The content quality is still high (suggesting manual scholarly work), but there's no audit trail of which MCP data informed the authoring.

**Recommendation:** Run `/package-research psalm-23-1-6` and `/package-research romans-8-28-39` retroactively to generate dossiers. This provides an evidence trail and may surface data the original authoring missed.

### 3.3 Polish Translation Issues

**Location:** `content/series/romans-core.json`

```json
"pl": {
  "title": "Rzymian: Serce Ewangelii"
}
```

"Rzymian" is the genitive form used in "List do Rzymian" (Letter to the Romans). As a standalone series title, it should be either:
- "Rzymianie: Serce Ewangelii" (Romans: Heart of the Gospel) — nominative
- "List do Rzymian: Serce Ewangelii" — full form

The current form reads like a truncated prepositional phrase.

### 3.4 Token Budget Monitoring

The content-authoring-guide specifies a 16K token ceiling per package with a 12K warning threshold. I don't see any tooling that calculates current token usage of a package. The `package-eval` command tests prompt quality but doesn't report token counts.

**Recommendation:** Add a token-counting step to `package-scaffold` or `package-eval` that runs `tiktoken` or a similar counter on all package files and compares against the budget.

### 3.5 Missing `argument-flow.md` Reference in Discourse Genre Guide

**Location:** `content/genres/discourse.md`

The genre guide tells agents to "track connectors" and "distinguish assertions from supporting evidence" but doesn't reference the `argument-flow.md` file that exists in discourse packages. The `buildSystemPrompt.ts` function correctly injects argument-flow content into the system prompt, but the genre guide itself doesn't mention it as a resource.

This means the genre guide and the argument-flow content operate independently instead of reinforcing each other. A simple addition to `discourse.md` would help: "Refer to the argument-flow analysis for the proposition chain and connective inventory of this passage."

---

## 4. Biblical Scholarship Assessment

### 4.1 Overall Quality: Excellent

The StudyWith packages demonstrate strong scholarly foundations:

**Cross-references are accurate and well-sourced.** I verified both packages' cross-references against MCP OT quotes data:
- Romans 8:36 ← Psalm 44:22 (direct quote): **confirmed by MCP** and correctly identified in the cross-references file
- John 1:1-18 has zero formal OT quotations per MCP: **correctly handled** — the cross-references file uses "↔" (connection) notation for allusive echoes (Genesis 1:1, Exodus 34:6, etc.) rather than claiming direct quotes

**Key-words analysis is linguistically grounded.** Psalm 23's key-words file includes:
- Correct Strong's numbers (H7462 for רָעָה)
- Morphological analysis (participle form indicating ongoing action)
- ANE cultural context (shepherd as royal title)
- LXX renderings for intertestamental connections
- Commentary citations (deClaissé-Walford NICOT)

**Poetic-structure analysis is sophisticated.** The Psalm 23 file identifies:
- Two-metaphor architecture (shepherd → host)
- Pronoun shift at v.4 (He → You) — a genuine structural insight
- Parallelism types per verse
- Chiastic structure centered on "You are with me"

**Argument-flow analysis is sound.** Romans 8:28-39:
- Correctly identifies the proleptic aorist in ἐδόξασεν (v.30)
- Notes the four-fold Christological argument in v.34
- Identifies ὑπερνικῶμεν as "super-conquer" hapax
- Tracks logical connectors (ὅτι, γάρ, ἀλλά, δέ)

### 4.2 Guardrails: Strong but Possibly Over-Aggressive

The John 1:1-18 guardrails reportedly contain 32 candidate misreadings, all marked NOT SUPPORTED. While I couldn't verify every entry, having 100% NOT SUPPORTED verdicts is unusual. Some common interpretive approaches (e.g., "logos as impersonal divine attribute" in Philo's sense) should be COMPATIBLE WITH CAVEATS rather than flatly NOT SUPPORTED, since Philo's usage is part of the historical background John engages with, even if John goes beyond it.

**Recommendation:** Re-audit John 1:1-18 guardrails using `consult-biblical-scholar VALIDATE` mode with more nuanced claims. Some "NOT SUPPORTED" entries may need reclassification to "COMPATIBLE" or "PARTIALLY SUPPORTED" to avoid overcorrecting.

### 4.3 Legal Genre Guide: Contested Classification

**Location:** `content/genres/legal.md`

The guide says: "Classify: moral, civil, ceremonial." This tripartite division is a traditional Reformed/Westminster categorization that, while useful pedagogically, is debated in biblical scholarship. Many OT scholars (e.g., Wenham, Milgrom, Goldingay) argue these categories are not inherent in the text and can lead to premature filtering ("that's just ceremonial law, we can ignore it").

**Recommendation:** Add a brief note: "This classification is one helpful framework (following Westminster Confession 19.3-5), but the Torah itself doesn't label laws this way. Some scholars prefer a holistic reading that finds principled application through covenant-fulfillment rather than category-based filtering."

This doesn't require changing the guide's practical advice — just adding an epistemological caveat that prevents the framework from being treated as self-evident.

### 4.4 Discourse Guide: Missing Chiastic Structures

**Location:** `content/genres/discourse.md`

The guide emphasizes linear logical flow (connectors, assertions, premises) but doesn't mention chiastic or concentric structures, which are common in epistles. Romans 8:31-39 is often analyzed as chiastic. Galatians, Philippians, and Hebrews all contain significant chiastic patterns.

**Recommendation:** Add a note on chiastic structure recognition: "Some epistolary passages use concentric (chiastic) structure alongside linear argument. Watch for mirrored themes (A-B-C-B'-A') that place the theological center in the middle rather than at the end."

### 4.5 Methodology Constraints and Scholarly Depth

**SOAP "one question per response" rule:** Pedagogically sound for the ADHD-first design philosophy but limits the agent's ability to guide compound observations in complex passages. For passages like Romans 8:28-39, the Observation phase naturally invites "What do you notice about the verb tenses in v.30? How does that connect to v.28?" — two related but distinct observations that are artificially split into separate turns.

**Swedish "2 sentences max" rule:** Very restrictive for scholarly engagement. When a user's 💡 lightbulb observation touches on a significant theological insight (e.g., the pronoun shift in Psalm 23:4), 2 sentences may not be enough to affirm the insight, connect it to the passage's structure, and invite deeper exploration.

These aren't errors — they're deliberate UX trade-offs. But they create a tension between scholarly depth and accessibility that the team should monitor through eval data.

### 4.6 Psalm 23 — Correct Genre Treatment

Psalm 23 is correctly classified as `reading_mode: "poetic"` with `sub_genre: "psalm-of-trust"`. The `poetic-structure.md` file exists (unlike John 1:1-18's missing treatment), and the content is excellent. The pronoun-shift analysis is a genuine scholarly insight that many study guides miss.

### 4.7 Romans 8:28-39 — Correct Genre Treatment

Romans 8:28-39 is correctly classified as `reading_mode: "discourse"` with `sub_genre: "soteriological-doxology"`. The `argument-flow.md` file exists and correctly maps the logical structure. The use of Greek connectors (ὅτι, γάρ, ἀλλά) is accurate.

---

## 5. Opportunities & Quick Wins

### Quick Win 1: Add 3 MCP Tools to `package-research` Allowed-Tools (5 minutes)

Add `query_lemmas`, `query_themes_for_lemmas`, and `query_theme` to the `package-research.md` YAML frontmatter. Then update Step 2 Round 2 to use `query_themes_for_lemmas` instead of the manual guessing heuristic.

**Impact:** Correct theme selection, richer dossiers, no more silent failures on passages where theme names don't match lemma semantics.

### Quick Win 2: Run `study-evaluator` on All 3 Packages (30 minutes)

Feed each package's `study-notes.md` + `guardrails.md` to the `study-evaluator` agent. This will produce a SOUND/SOUND_WITH_DRIFT/SIGNIFICANT_DRIFT/UNSOUND verdict for each, plus itemized findings.

**Impact:** Theological QA for existing content. May surface drift patterns the team isn't aware of.

### Quick Win 3: Generate Missing Research Dossiers (1 hour)

Run `/package-research psalm-23-1-6` and `/package-research romans-8-28-39` to create evidence trails for the two packages that lack dossiers.

**Impact:** Audit trail, potential data gaps surfaced, consistency across all packages.

### Quick Win 4: Add `query_lemmas` Step for Cross-References (15 minutes per package)

After morphology data is collected, run `query_lemmas` on 3-5 theologically significant lemmas from the passage. Use the cross-book distribution to verify and enrich `cross-references.md`.

**Example for Psalm 23:** `query_lemmas(["H7462b"])` reveals Ezekiel 34 has 31 occurrences of the shepherd lemma — making it the OT's densest shepherd passage. This should be a Primary cross-reference, not a secondary one.

### Quick Win 5: Fix Polish Series Title (2 minutes)

Change `"Rzymian: Serce Ewangelii"` to `"List do Rzymian: Serce Ewangelii"` in `content/series/romans-core.json`.

### Quick Win 6: Add `consult-biblical-scholar CROSS-REFERENCE` to Package Authoring (15 minutes)

Add a step in `package-author.md` Phase C that invokes `consult-biblical-scholar` in CROSS-REFERENCE mode for the passage. This would produce evidence-graded cross-references to supplement or validate the manually curated ones.

### Quick Win 7: Wire MCP Tools Into `series-research` (10 minutes)

Add discourse features, paragraph breaks, vocabulary, and morphology MCP tools to the `series-research` allowed-tools list. This enables `biblical-segmentation` (invoked in Step 4) to use MCP data for boundary validation instead of relying solely on the skill's internal data-retriever.

### Larger Opportunity: Full Series Build

The infrastructure for multi-day series exists (JSON schema, API endpoints, system prompt injection, `series-research` command). The gap is content. Running `series-research` for Romans, Gospel of John, and Psalms would produce segmentation plans that can then be scaffolded into full series with 10-20 packages each.

**Recommended first series expansion:** Romans (epistle, discourse genre, currently 1 package). Run `/series-research romans --method soap --sessions 15` to produce a SOAP-optimized 15-session series covering the full book.

### Larger Opportunity: Eval-Integrated Theological QA

Currently, `package-eval` tests structural quality (verbosity, question count, stage markers, emoji policy). Adding `study-evaluator` as a theological eval layer would create a complete QA pipeline:

1. **Structural QA** (promptfoo) — Does the agent follow methodology rules?
2. **Theological QA** (study-evaluator) — Is the content exegetically sound?
3. **Adversarial QA** (guardrails-auditor) — Can the agent be led into misinterpretation?

---

## Appendix A: CoA Capability Matrix vs. StudyWith Usage

| CoA Capability | Available | Used by StudyWith | Notes |
|---|---|---|---|
| **Skills** | | | |
| `pericope-delimitation` | ✅ | ✅ | Used in package-research Step 1 |
| `exegetical-notes` | ✅ | ✅ | Used in package-research Step 3 |
| `argument-flow` | ✅ | ✅ | Used for discourse packages |
| `consult-biblical-scholar` | ✅ | ⚠️ Partial | Only VALIDATE mode used; MEANING and CROSS-REFERENCE modes unused |
| `biblical-segmentation` | ✅ | ⚠️ Referenced | series-research references it but lacks MCP tool permissions |
| **MCP Tools** | | | |
| `list_books` | ✅ | ✅ | Used in research and series commands |
| `query_morphology` | ✅ | ✅ | Used in package-research |
| `query_vocabulary` | ✅ | ✅ | Used in package-research |
| `query_discourse_features` | ✅ | ✅ | Used in package-research (NT only) |
| `query_paragraph_breaks` | ✅ | ✅ | Used in package-research (OT only) |
| `query_ot_quotes` | ✅ | ✅ | Used in package-research (NT only) |
| `query_lemmas` | ✅ | ❌ Not used | Available in guardrails-auditor but missing from research |
| `query_themes_for_lemmas` | ✅ | ❌ Not used | Replaced by manual guessing in package-research |
| `query_theme` | ✅ | ❌ Not used | Would enrich context.md and series planning |
| **Sub-Agents** | | | |
| `data-retriever` | ✅ | ✅ (indirect) | Skills spawn it internally; not directly invoked |
| `biblical-scholar` | ✅ | ✅ (indirect) | Spawned by consult-biblical-scholar skill |
| `study-evaluator` | ✅ | ❌ Not used | Perfect fit for package QA |
| `pericope-delimitation` (agent) | ✅ | ✅ (indirect) | Used via skill |
| `argument-flow` (agent) | ✅ | ✅ (indirect) | Used via skill |
| `smoke-test` | ✅ | N/A | Pipeline verification only |

## Appendix B: MCP Data Spot-Checks

### B.1: Romans 8:28-39 OT Quotes

```
query_ot_quotes("Romans", "8:28-8:39")
→ 2 direct quotes, both from Psalm 44:22 (v.36)
→ Cross-references file correctly identifies this ✅
→ Isaiah 50:8-9 allusion (vv.33-34) not in MCP data (allusions not tracked) but correctly noted as thematic parallel ✅
```

### B.2: John 1:1-18 OT Quotes

```
query_ot_quotes("John", "1:1-1:18")
→ 0 formal quotations
→ Cross-references file correctly uses allusive connections (↔), not formal quotation claims ✅
```

### B.3: Psalm 23:1 Theme Resolution

```
query_themes_for_lemmas(["H7462b", "H2637", "H4210", "H3068"], "ot")
→ Only H3068 (YHWH) matched → "deity" theme
→ H7462b (shepherd) matched ZERO themes
→ Manual guessing approach in package-research would fail here ❌
```

### B.4: Shepherd Lemma Distribution

```
query_lemmas(["H7462b"])
→ 127 occurrences across 9 OT books
→ Densest: Ezekiel (32×, ch.34=31), Jeremiah (27×), Genesis (17×)
→ Psalm 23 cross-references file lists Ezekiel 34:15 as single secondary reference
→ MCP data shows Ezekiel 34 should be a PRIMARY cross-reference (31× same lemma) ⚠️
```

### B.5: Romans 8:30 Discourse Features

```
query_discourse_features("Romans", chapter_range="8", features=["left_dislocation"])
→ 10 left dislocations in chapter 8
→ 4 in v.30 (the golden chain: προώρισεν, ἐκάλεσεν, ἐδικαίωσεν, ἐδόξασεν)
→ argument-flow.md identifies the chain but doesn't cite discourse grammar evidence ⚠️
```

---

## Appendix C: Recommendations Priority Matrix

| # | Recommendation | Effort | Impact | Priority |
|---|---|---|---|---|
| 1 | Fix theme selection → use `query_themes_for_lemmas` | 30 min | HIGH | P0 |
| 2 | Add 3 missing MCP tools to `package-research` | 5 min | HIGH | P0 |
| 3 | Wire MCP tools into `series-research` | 10 min | HIGH | P0 |
| 4 | Run `study-evaluator` on existing packages | 30 min | MEDIUM | P1 |
| 5 | Generate missing research dossiers | 1 hr | MEDIUM | P1 |
| 6 | Add `query_lemmas` to cross-references workflow | 15 min/pkg | MEDIUM | P1 |
| 7 | Fix John 1:1-18 genre classification | 30 min | MEDIUM | P1 |
| 8 | Add `consult-biblical-scholar CROSS-REFERENCE` mode | 15 min | MEDIUM | P2 |
| 9 | Add chiastic structure note to discourse genre guide | 5 min | LOW | P2 |
| 10 | Fix Polish series title | 2 min | LOW | P2 |
| 11 | Add legal genre epistemological caveat | 5 min | LOW | P2 |
| 12 | Build full series (Romans, John, Psalms) | Days | HIGH | P2 |
| 13 | Integrate `study-evaluator` into eval pipeline | Hours | HIGH | P3 |

---

---

## 6. Eval & Testing: Trust Boundaries and Integration Strategy

### 6.1 Current State: Two Independent Test Suites

**StudyWith eval suite** (`apps/api/evals/`):
- Tests the **runtime study agent** during conversations
- 7 deterministic assertion modules: verbosity, question-stacking, stage-markers, stage-marker-presence, emoji-rules, citation-format, polish-calques
- LLM-as-judge rubrics for crisis response, gate enforcement, guardrail compliance
- 63 test cases across SOAP + Swedish × 3 packages (Polish locale)
- Custom promptfoo provider using AI SDK `generateText` (bypasses Mastra overhead)
- 3-layer caching for cost control
- Persona simulation (Haiku student ↔ Gemini agent, 10 personas × 6 turns)

**CoA eval suite** (`tests/promptfoo/`):
- Tests **skills and agents** in isolation
- RED/GREEN phase separation (bare model vs. skill-enhanced)
- MCP evidence assertions (tool calls, Levinsohn/Masoretic citations, confidence tiers)
- Theological guardrail enforcement (5 canonical guardrails)
- Grader calibration suite (validates LLM judge accuracy on known outputs)
- claude-agent-sdk provider with MCP server connection
- Opus grader for llm-rubric assertions

### 6.2 Overlap Analysis: What They Actually Test

| Concern | CoA Tests | StudyWith Tests | Overlap? |
|---|---|---|---|
| MCP data quality | Skills use MCP data correctly | N/A (runtime agent uses pre-packaged content) | **None** |
| Scholarly accuracy | Morphology, tiers, sources | N/A (baked into content files) | **None** |
| Pericope boundaries | Verdict + evidence quality | N/A (run during authoring only) | **None** |
| Theological guardrails | Skills produce correct guardrails | Agent follows pre-packaged guardrails | **Different layers** |
| Confidence tiers | Declared in skill output | N/A | **None** |
| Crisis response | N/A | Agent handles grief/rejection | **None** |
| Methodology compliance | N/A | SOAP/Swedish rules enforced | **None** |
| Stage markers | N/A | Emitted at correct depth | **None** |
| Language quality | N/A | Polish calques, citation format | **None** |
| Emoji policy | N/A | SOAP=none, Swedish=symbols | **None** |

**Key insight:** There is virtually zero duplication between the suites. They test completely different layers:
- **CoA tests the scholarship layer** — does the tool produce correct scholarly data?
- **StudyWith tests the pedagogy layer** — does the agent teach correctly with pre-packaged content?

The gap is in the **middle** — nobody tests whether the content produced by CoA skills was correctly integrated into StudyWith packages.

### 6.3 The Trust Contract: What StudyWith Can Delegate to CoA

If CoA's GREEN suite passes, StudyWith can trust these guarantees without re-testing them:

| CoA Guarantee | GREEN Tests That Prove It | StudyWith Can Skip |
|---|---|---|
| Pericope boundaries are data-grounded | 7 scenarios + adversarial resistance | Re-validating passage boundaries after authoring |
| Morphology data is MCP-sourced, not training-memory | ADV1 (resist memory-based morphology) | Checking if key-words.md cites real data |
| Exegetical notes have all 10 sections | S1 (Phil 1:1-11 completeness) | Verifying research dossier section structure |
| Confidence tiers are correctly assigned | S4 (Phil 2:5-11) + S6 (contested monogenes) | Auditing tier labels in content |
| Scholarly sources are named, not vague | S7 (Rom 3:21-26) + CAL-5 calibration | Checking source quality in study-notes |
| Anti-moralism guardrail enforced | theological-guardrails.yaml (5 checks) | Testing guardrail theological correctness |
| Argument-flow produces proposition chains | S1 (Phil 2:1-4) + ADV1 (user pushback) | Verifying argument-flow.md structure |
| Consult-biblical-scholar VALIDATE is evidence-based | S2, S3, S6 (verdicts with morphology) | Re-auditing guardrails-auditor output quality |

**What this means practically:** StudyWith does NOT need to test whether `study-notes.md` content is exegetically sound — that's CoA's job, and CoA has GREEN tests proving it works. StudyWith only needs to test that the content is correctly loaded and used by the runtime agent.

### 6.4 What StudyWith SHOULD Test (But Currently Doesn't)

These are tests that fall in the gap between CoA's skill quality and StudyWith's runtime behavior:

#### A. Content Integration Tests (New Category)

**Purpose:** Verify that CoA skill output was correctly transformed into package content files.

```yaml
# Example: content-integration/promptfooconfig.yaml
tests:
  - description: "INT-01: study-notes.md references MCP-sourced data"
    vars:
      study_notes: "file://content/packages/john-1-1-18/en/study-notes.md"
    assert:
      # Key-words should reference morphology data
      - type: icontains
        value: "morphology"
      # Or specific linguistic terms that prove MCP origin
      - type: javascript
        value: "output.includes('aorist') || output.includes('participle') || output.includes('lemma')"

  - description: "INT-02: guardrails.md contains VALIDATE verdicts"
    vars:
      guardrails: "file://content/packages/john-1-1-18/en/guardrails.md"
    assert:
      - type: javascript
        value: |
          const verdicts = ['SUPPORTED', 'NOT SUPPORTED', 'COMPATIBLE', 'INSUFFICIENT'];
          return verdicts.some(v => output.includes(v));

  - description: "INT-03: cross-references cite OT/NT books that MCP confirms"
    # Verify cross-refs against query_ot_quotes data
```

#### B. `study-evaluator` Regression Tests (After Applying Suggestion §2.2)

**Purpose:** Run CoA's study-evaluator agent on completed packages to detect theological drift.

```yaml
# Example: theology-check/promptfooconfig.yaml
providers:
  - file://../../tests/promptfoo/providers/with-skill.yaml

tests:
  - description: "THEO-01: John 1:1-18 study-notes pass exegetical fidelity check"
    vars:
      prompt: |
        Evaluate these study notes for John 1:1-18 for exegetical fidelity:
        {{study_notes}}
    assert:
      - type: icontains
        value: "SOUND"
      - type: not-icontains
        value: "UNSOUND"
      - type: not-icontains
        value: "SIGNIFICANT_DRIFT"
```

This is NOT duplicating CoA's tests — CoA tests that the study-evaluator agent works correctly. This test uses study-evaluator as a tool to validate StudyWith content.

#### C. Pipeline Smoke Test (End-to-End)

**Purpose:** Verify the full authoring pipeline produces valid output. Run monthly or after CoA updates.

```yaml
# Thin test: does the pipeline still work?
tests:
  - description: "PIPE-01: package-research produces dossier with expected sections"
    vars:
      prompt: "/package-research john-1-1-18"
    assert:
      - type: icontains
        value: "MORPHOLOGY"
      - type: icontains
        value: "VOCABULARY"
      - type: icontains
        value: "Confidence"
      - type: javascript
        value: "output.includes('Gaps') || output.includes('CANNOT ANSWER')"
```

#### D. Theme Pipeline Test (After Applying Fix §1.1)

**Purpose:** Regression test that the fixed theme selection pipeline works.

```yaml
tests:
  - description: "THEME-01: query_themes_for_lemmas resolves Psalm 23 shepherd lemma"
    # After morphology extraction, themes_for_lemmas should be called
    # and should handle unmatched lemmas gracefully
    vars:
      prompt: "Run /package-research psalm-23-1-6"
    assert:
      - type: javascript
        value: |
          // Should mention themed vocabulary was attempted
          return output.includes('Themed vocabulary') || output.includes('theme');
      - type: not-icontains
        # Should NOT silently skip themed vocab
        value: "Themed vocabulary not queried — key lemmas did not match"
```

### 6.5 Tests StudyWith Can Remove or Simplify

After establishing the trust contract with CoA:

| Current StudyWith Test | Why It Can Be Simplified | New Form |
|---|---|---|
| SOAP-08 / SWE-08 guardrail enforcement | CoA guarantees guardrails content quality (GREEN tests). StudyWith only needs to test that the agent *follows* them, not that they're *correct*. | Keep the test but simplify rubric — check redirection behavior, don't re-evaluate theological correctness |
| Cross-reference accuracy (SWE-08 lists 13 valid refs) | If CoA `query_ot_quotes` + `query_lemmas` are used during authoring, cross-refs are data-grounded. | Replace hardcoded ref lists with a structural check ("agent only cites refs from package content") |
| Gate enforcement (SOAP-07) | Gates are authored from CoA skill output. If CoA tests pass, gate content is sound. | Keep behavioral test, drop content correctness check |

### 6.6 Recommended Test Architecture After Applying All Suggestions

```
                    ┌─────────────────────────────────────────────┐
                    │           CoA GREEN Test Suite              │
                    │  (Trust boundary — passes ⟹ skills work)   │
                    │                                             │
                    │  • Skill quality (5 skills, 40+ scenarios)  │
                    │  • MCP data accuracy                        │
                    │  • Theological guardrails (5 canonical)     │
                    │  • Confidence tier correctness              │
                    │  • Grader calibration (5 calibrations)      │
                    └──────────────────┬──────────────────────────┘
                                       │
                              CoA output feeds into
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │    StudyWith Content Integration Tests       │
                    │    (NEW — bridges CoA output → packages)     │
                    │                                             │
                    │  • Content files reference MCP data          │
                    │  • Guardrails contain VALIDATE verdicts      │
                    │  • Cross-refs align with query_ot_quotes     │
                    │  • study-evaluator verdicts: SOUND            │
                    │  • Research dossiers exist for all packages   │
                    └──────────────────┬──────────────────────────┘
                                       │
                           Packages loaded into agent
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │     StudyWith Runtime Agent Tests            │
                    │     (Existing — pedagogy layer)              │
                    │                                             │
                    │  • Methodology compliance (SOAP/Swedish)     │
                    │  • Stage markers at correct depth            │
                    │  • Verbosity, question-stacking              │
                    │  • Emoji policy, citation format             │
                    │  • Crisis response (Sonnet judge)            │
                    │  • Gate behavioral enforcement               │
                    │  • Guardrail behavioral enforcement          │
                    │  • Polish calques                            │
                    │  • Persona simulation (multi-turn)           │
                    └─────────────────────────────────────────────┘
```

### 6.7 CoA Version Pinning

StudyWith should pin the CoA plugin version they depend on. If CoA updates its skills (e.g., changes the exegetical-notes 10-section format to 12 sections), StudyWith's content integration tests would catch the mismatch. But pinning prevents surprise breakage.

**Recommended approach:**
1. Pin CoA plugin version in `.claude/settings.json` or marketplace config
2. Run CoA smoke test (`npm run eval:smoke` from CoA repo) as part of StudyWith CI when CoA version changes
3. Content integration tests run after any CoA update to verify compatibility

### 6.8 Promptfoo Config Unification

Both repos use promptfoo but with different provider architectures:
- CoA: `claude-agent-sdk` provider (skills invoked via agent SDK)
- StudyWith: Custom `provider.ts` (AI SDK `generateText`, bypasses Mastra)

The content integration tests (§6.4) should use CoA's `with-skill.yaml` provider pattern since they need skill access. StudyWith's runtime tests should continue using their custom provider since they test the Mastra agent behavior.

**Don't unify the providers.** They test different things and need different setups. But DO share the `theological-guardrails.yaml` assertion file — CoA already maintains canonical guardrail definitions. StudyWith can import these rather than maintaining separate guardrail rubrics in their SOAP/Swedish test datasets.

### 6.9 Quick Win: Import CoA's Theological Guardrails Assertions

CoA maintains `tests/promptfoo/assertions/theological-guardrails.yaml` with 5 canonical guardrail definitions (anti-moralism, christ-centeredness, context-primacy, genre-governance, covenantal-awareness). StudyWith's SOAP-08 and SWE-08 tests check guardrail enforcement but write their own rubrics.

**Recommendation:** Reference CoA's canonical guardrail definitions in StudyWith's test rubrics. This ensures both repos enforce the same theological standard, and updates to CoA's guardrails automatically propagate to StudyWith's tests.

This can be done via a shared assertion file, a git submodule, or simply by copying the 5 guardrail descriptions into StudyWith's assertion directory with a comment noting the source version.

---

*Report generated by Claude of Alexandria maintainer. All MCP data verified against live CoA edge database.*
