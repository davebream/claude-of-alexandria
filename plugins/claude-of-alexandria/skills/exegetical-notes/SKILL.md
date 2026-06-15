---
name: exegetical-notes
description: Use when producing structured exegetical analysis of a biblical passage. Use when user asks for exegetical notes, verse analysis, passage study, word study with morphology, or detailed interpretive framework for a text. Always English output.
allowed-tools: Agent, Read, Write, WebSearch, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_ot_quotes, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_themes_for_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_theme, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_lexicon, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__check_versification, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_cross_references, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_people, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_places, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_events, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_speakers, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_syntax, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_variants, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__bible_lookup, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__commentary_lookup, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__parallel_text, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_controversies
version: 1.2.0
changed: "2026-06-15"
---

# Exegetical Notes

## Purpose

Produce structured, context-neutral exegetical analysis of a biblical passage.
Data-grounded. Always English. Output to file (default) or inline (`--output print`).

**Key constraint:** Every data claim must come from bundled data or web-verified scholarly sources.
Training knowledge supplements but never substitutes for data.

---

## Iron Rules

### Rule 1: Run Pericope Check First — Warning BEFORE Notes

Before generating notes, run a lightweight boundary check:

1. Identify passage boundaries
2. Check Levinsohn (NT) or Masoretic (OT) for boundary confirmation
3. **If boundaries are problematic:** Print the warning BEFORE the notes header. The warning is a standalone block that appears BEFORE `# Exegetical Notes:`. Do not embed it inside Section 1. Do not skip it.
4. **If user confirms problematic passage:** Proceed with note in Pericope Status

**Warning format (print this BEFORE the notes):**
```
⚠️ Boundary check: [Book] [Range] may be a partial unit.
[Specific issue with discourse evidence]
Recommended passage: [better range]

Proceeding with [original range] — boundary issue noted in Pericope Status.
```

**Correct output order for problematic boundaries:**
1. First: ⚠️ Boundary check warning (standalone)
2. Then: `# Exegetical Notes: [Book] [Range]` header and all 10 sections

**Wrong:** Embedding the boundary warning inside Section 1 without a standalone warning first.

### Rule 2: Lexical Analysis Uses query_morphology MCP Tool

Section 4 (Lexical Analysis) must:
- Use morphology data from data-retriever's `MORPHOLOGY_SUMMARY` (or direct `query_morphology` fallback)
- Cite actual counts from data-retriever's `VOCABULARY_SUMMARY` (or direct `query_vocabulary` fallback)
- Cite per-occurrence verse references from data-retriever's `VERSE_REFERENCES` (or direct `query_morphology` with `word_filter` fallback)
- Never say "appears frequently" — give exact count AND verse references
- Format: `lemma (reference): morph description [query_morphology]`

**Valid:** `ἐναρξάμενος (1:6): lemma ἐνάρχομαι, aorist middle participle, nom. sg. masc. [query_morphology]`
**Invalid:** `ἐναρξάμενος is an aorist participle meaning "having begun"`

### Rule 3: Tier All Interpretive Claims

Section 6 must use exactly four tiers, each labeled:

- **Tier 1: Linguistic Evidence** — morphology/grammar directly contradicts the misreading
- **Tier 2: Discourse Evidence** — Levinsohn features or structure contradicts
- **Tier 3: Scholarly Consensus** — web-search-verified with real citations
- **Tier 4: Agent Assessment** — the heading MUST read "Tier 4: Agent Assessment" (not "Interpretive Notes" or any other label). This distinguishes agent-derived opinion from established scholarly consensus.

Never mix tiers. If no Tier 3 source found after web search, state this explicitly.

### Rule 4: Tier 3 Source Quality

For web searches (Tier 3 guardrails):

**Prefer (Tier A):** NICNT, NIGTC, ICC, WBC, BECNT, Hermeneia, BNTC, AB, BDAG
**Accept (Tier B):** Study Bibles with scholarly notes, TDNT, ABD, NAC
**Use with caution (Tier C — always cite tier):** Popular commentaries (BST, TNTC), credentialed scholar blogs
**Reject (Tier D):** Devotional websites, AI content, uncredited blogs, forums

**Citation format (mandatory for all Tier 3 claims):**

Wrong: "Author argues that [claim]."
Correct: "Author (Title, Series, Year, p. N) argues that [claim]. [Tier A/B/C]"

Every Tier 3 citation MUST include: Author + (Title, Series, Year).
Page numbers when available. An author name alone is not a citation — it is
a name-drop. The tier label (A/B/C) must follow every citation.

If only Tier C sources found, state: "[Tier C source, use with caution]"

**Training-knowledge fallback:** If web search yields no usable source, cite a well-known
commentary from training knowledge using the standard citation format and mark it
"[training knowledge — verify before publication]". For major NT/OT passages, the agent
knows standard commentaries (e.g., O'Brien on Philippians, NIGTC; Fee, NICNT; Moo on
Romans, NICNT). A training-knowledge citation with a verification caveat is always
preferable to "No Tier A/B source located" with no named source at all.

If genuinely no source is known (rare for canonical passages), state:
"No Tier A/B source located for this claim."

### Rule 5: Cross-Check Data Claims Before Delivering

After generating the full notes, pick **up to 5** data claims to cross-check, prioritized by risk:

1. **At least 1 morphological parsing** (voice or mood — highest error risk)
2. **At least 1 frequency count** (verify exact number and verse references)
3. **Any hapax legomena claim** (if the notes assert a word appears only once)
4. **Remaining slots:** highest-consequence claims for the interpretation

For each selected claim, re-query the relevant MCP tool to confirm the cited value matches.
Report cross-check results in Section 10. If any mismatches: correct the claim before delivering.

Do NOT cross-check every data claim — this consumes tool-call budget needed for the full output.
5 risk-prioritized checks catch the most consequential errors.

### Rule 6: Exactly 10 Sections, Exactly These Names

The output format has exactly 10 sections. Use exactly these section titles:
1. Passage in Literary Context
2. Internal Structure
3. Propositional Summary
4. Lexical Analysis
5. Exegetical Conclusions
6. Interpretive Guardrails
7. Open Questions
8. Intertextual Links
9. Data Sources
10. Verification

**Do not rename sections.** Do not substitute "Homiletical Trajectories" for "Interpretive Guardrails." Do not substitute "Theological Themes" for "Exegetical Conclusions." Do not substitute "Discourse Structure" for "Internal Structure." Do not omit sections. Do not add sections. Do not reorder sections.

**Do not abbreviate the output** even if the user asks for "brief" or "essentials." All 10 sections are required for every invocation. The Verification section (Section 10) is never optional.

### Rule 8: Self-Critique Pass Before Delivery

After generating all 10 sections and completing the cross-check (Steps 5-7), run a mandatory self-critique pass (Step 8) with 5 binary checks before delivering output. This is not optional. Do not skip it because the notes "look correct." Do not convince yourself that "this passage doesn't need it."

The 5 checks are:
1. **Indicative ground** — If Section 2 shows imperative-dominated structure, Section 5 must identify the indicative theological basis for the commands. Imperatives without their warrant is moralism.
2. **Redemptive-historical link** — For non-wisdom genres, Section 8 must include at least one cross-testament redemptive-historical connection. Missing this flattens the biblical storyline.
3. **Tier 3 citation format** — Every Tier 3 citation in Section 6 must follow Author (Title, Series, Year) format. A name alone is not a citation.
4. **Verification data** — Section 10 must contain actual MCP re-query results with specific counts (claims checked, confirmed, corrected), not generic summaries.
5. **Section completeness** — All 10 sections must be present with exact required titles. No renaming, no omissions.

If any check fails: print a structured correction note, revise the failing section(s), and re-check. Maximum 1 revision iteration. If still failing after revision, deliver with an unresolved note in Section 10.

### Rule 7: Deliver Output

**File mode** (default, or `--output file`):
Save to:
```
~/.claude/exegetical-notes/{book_name}/{YYYY-MM-DD}-{chapter-verse-to-chapter-verse}.md
```
Examples:
- `~/.claude/exegetical-notes/philippians/2026-02-18-1-1-11.md`
- `~/.claude/exegetical-notes/genesis/2026-02-18-37-2-11.md`

After saving, report the saved path to user.

**Print mode** (`--output print`):
Output the complete notes inline in your response. Do not save to file. Do not summarize. Print ALL 10 sections in full, directly in the response. The user sees only what you print — if you save to file instead, the user gets nothing useful.

**Never ignore `--output print`.** If the invocation says `--output print`, you MUST print inline. Do not save to a file and return a summary. Do not "display" a summary of what you generated. Print the full document.

---

## Sub-Agent Delegation

This skill delegates MCP data gathering to the **data-retriever** agent (Haiku) for cost-efficient bulk data retrieval. The skill retains scholarly interpretation, section composition, and cross-checking.

**Delegation chain:**
```
exegetical-notes (skill, user's model)
  └─→ data-retriever (Haiku) — MCP tool calls + compression
```

**How to spawn:**
```
Agent tool:
  subagent_type: "claude-of-alexandria:data-retriever"
  prompt: "Gather all relevant data for [Book] [Range].
           Also call query_morphology with pos_filter: 'conjunction'"
```
Include the pos_filter request for NT epistles. Omit it for OT and non-epistolary books.

**Parsing data-retriever output:**
- `MORPHOLOGY_SUMMARY:` → data for Section 4 (Lexical Analysis)
- `CONJUNCTION_MORPHOLOGY:` → data for Section 2 (Internal Structure, epistle connectives)
- `DISCOURSE_SUMMARY:` → data for Sections 1-2 (context, structure) and pericope check
- `PARAGRAPH_MARKERS:` → OT boundary data for pericope check and Section 2
- `VOCABULARY_SUMMARY:` → data for Section 4 (frequencies, semantic groups)
- `VERSE_REFERENCES:` → data for Section 4 (per-occurrence verse locations for top lemmas)
- `OT_ENRICHMENT_SUMMARY:` → data for Section 4 (OT glosses, semantic frames — Cherith glosses are Tier 3)
- `OT_QUOTES_SUMMARY:` → data for Section 8 (Intertextual Links, Tier 1: Explicit citations)
- `CROSS_REFERENCES_SUMMARY:` → data for Section 8 (Tier 4: Editorial tradition candidates)
- `PEOPLE_SUMMARY:` → data for Section 8 (Tier 3: Entity continuity)
- `PLACES_SUMMARY:` → data for Section 8 (Tier 3: Entity continuity)
- `EVENTS_SUMMARY:` → data for Sections 1, 5 (narrative context, chronological framework)
- `LEXICON_SUMMARY:` → data for Section 4 (standard lexical definitions)
- `VERSIFICATION_NOTES:` → data for Section 9 (reference system notes)
- `LEMMA_DISTRIBUTION:` → data for Section 8 (Tier 2: Lexical connections)
- `THEME_MATCHES:` → data for Sections 5, 7 (theological themes)
- `SPEAKER_SUMMARY:` → data for Section 6a (speaker attribution)
- `SYNTAX_SUMMARY:` → data for Section 2 (clause-level structure, NT only — OpenText.org framework)
- `VARIANTS_SUMMARY:` → data for Section 8 (textual variants, NT only — edition comparison)
- `TOOL_RESULTS:` → data for Section 9 (Data Sources)

**Fallback:** If data-retriever spawn fails, fall back to direct MCP tool calls. Note the fallback in Section 9 (Data Sources).

**Direct MCP calls retained for:**
- Cross-check verification (Step 6) — must verify claims against fresh MCP data
- Supplementary queries discovered during section composition
- `query_controversies` (Step 2b) — always called directly by the skill, not delegated to data-retriever

---

## Workflow

```
Step 1: Parse invocation → book, range, --output, --context

Step 2: GATHER DATA via data-retriever agent
   → Spawn data-retriever via Agent tool (see Sub-Agent Delegation)
   → For NT epistles: include pos_filter: "conjunction" in the prompt
   → Parse compressed output into working data for all sections
   → If data-retriever fails: fall back to direct MCP tool calls

   Logical connectives for Section 2 (epistles):
   γάρ=grounds, οὖν=inference, δέ=contrast/continuation, ἀλλά=strong contrast,
   ἵνα=purpose, ὥστε=result, εἰ=condition, διότι/ὅτι=causal

Step 2b: CONTROVERSY CHECK (run after data-retriever, before composing sections)
   │
   ├─ Call `query_controversies` with the passage reference (e.g., book + chapter range)
   │  OR with the book/chapter slug if a topic keyword is known.
   │  Arg shape: `mode: "passage"` with `book` + `range` for passage-anchored notes;
   │  `mode: "topic"` with `topic` when a specific disputed topic is known;
   │  `mode: "list"` to enumerate all available controversy records.
   │  Example (passage): `query_controversies: {"mode": "passage", "book": "Exodus", "range": "12:1-40"}`
   │  Example (topic):   `query_controversies: {"mode": "topic", "topic": "exodus date"}`
   │  Also check the `chapter_contested` flag returned by `query_events` for the passage —
   │  a `true` flag is a secondary signal to call `query_controversies` if not already done.
   │
   ├─ If `query_controversies` returns non-empty `topics`:
   │  A. In Section 7 (Open Questions): add a subsection "## Contested Historical/Critical Questions"
   │     listing each controversy topic with:
   │     - A summary of the dispute
   │     - ALL major positions with their evidence and named scholars
   │     - The `neutrality_caveat` verbatim or nearly verbatim
   │     - A note: "This analysis does not resolve this dispute."
   │  B. In Section 5 (Exegetical Conclusions): do NOT assert a position on the contested
   │     dimension. If the conclusion requires the contested claim, label it:
   │     "[DISPUTED — see Section 7]" and present both positions.
   │  C. Confidence on the contested claim is LOW or MEDIUM at most, regardless of
   │     what the morphological or discourse data appears to support.
   │
   ├─ If `query_controversies` returns `{topics: []}` (no match):
   │  Proceed without a controversy block. No obligation to add one.
   │
   └─ If `query_controversies` call fails: note "Controversy check unavailable" in
      Section 7 and proceed normally.

Step 3: PERICOPE CHECK (MANDATORY — DO NOT SKIP)
   │
   ├─ Use DISCOURSE_SUMMARY (NT) or PARAGRAPH_MARKERS (OT) from data-retriever
   ├─ Check A: Do discourse markers indicate a break WITHIN the range?
   ├─ Check B: Does the passage TRUNCATE a larger discourse unit?
   │  │
   │  │  Truncation indicators (any ONE triggers a warning):
   │  │  - Passage ends mid-sentence or mid-clause chain
   │  │  - Subordinating connectives (ἵνα, ὅτι, γάρ) in subsequent verses
   │  │    link back to the passage's argument
   │  │  - Passage covers part of a recognizable form (thanksgiving,
   │  │    prayer, chiasm, inclusio) that extends beyond the endpoint
   │  │  - Standard pericope divisions (NA28/UBS paragraph markers,
   │  │    scholarly consensus) place the boundary differently
   │  │
   │  │  Example: Phil 1:3-8 truncates the thanksgiving prayer that
   │  │  runs through 1:11 (vv. 9-11 contain the prayer content
   │  │  introduced by the ἵνα clause). Recommend EXTEND to 1:3-11.
   │  │
   │  └─ If truncated → Boundaries PROBLEMATIC
   │
   ├─ Boundaries OK (both checks pass)? → Proceed to Step 4
   │
   └─ Boundaries PROBLEMATIC (either check fails)?
      │
      ├─ STOP. Print the ⚠️ warning BEFORE anything else.
      │  Format: "⚠️ Boundary check: [Book] [Range] may be a partial unit..."
      │  This warning must appear BEFORE the "# Exegetical Notes" header.
      │  Do NOT embed it in Section 1. Print it FIRST, separately.
      │
      └─ Then proceed to Step 4 (with boundary issue noted in Pericope Status)

Step 4: Web search for Tier 3 scholarly sources
   → Prefer Tier A/B (NICNT, NIGTC, ICC, WBC, BECNT, Hermeneia, BDAG)
   → Note author, title, publisher

Step 4.5: CITATION GROUNDING via commentary_lookup (MANDATORY for Tier A/B citations)
   │
   │  After drafting Tier 3 citations (Step 4 or during Section 6 composition):
   │
   │  For each Tier A/B citation that references a specific author's position:
   │  1. Call commentary_lookup for the passage to check if the cited commentary
   │     is available in the bundled dataset (adam-clarke, jamieson-fausset-brown,
   │     john-gill, keil-delitzsch, matthew-henry, tyndale)
   │  2. If the cited author IS in the bundled commentaries:
   │     - Verify the commentary text supports the attributed position
   │     - If CONFIRMED: retain the citation as-is
   │     - If CONTRADICTED: flag the discrepancy in the citation:
   │       "[commentary_lookup contradicts: commentary text says X, not Y — verify]"
   │     - If NO RESULT for that passage range: retain citation but add caveat:
   │       "[not verified via commentary_lookup — passage not covered]"
   │  3. If the cited author is NOT in the bundled commentaries (e.g., modern
   │     commentaries like Moo, Fee, O'Brien): the citation cannot be grounded
   │     via this tool. Mark it:
   │     "[training knowledge — verify before publication]"
   │
   │  This step prevents fabricated scholarly attributions from reaching the
   │  final output. A citation that cannot be verified is not removed — it is
   │  downgraded with an explicit caveat.
   │
   │  Available bundled commentaries: adam-clarke, jamieson-fausset-brown,
   │  john-gill, keil-delitzsch, matthew-henry, tyndale

Step 5: Generate ALL 10 sections using EXACT template titles (Rule 6)
   Every section is mandatory. Never skip, rename, or merge sections.
   Use data-retriever compressed summaries as the data foundation.

Step 6: Cross-check data claims against MCP tool output
   → Call MCP tools DIRECTLY to verify specific claims from the notes
   → This is a verification step — do not use data-retriever for cross-check

Step 7: Fix any mismatches found in cross-check

Step 8: SELF-CRITIQUE PASS (MANDATORY — DO NOT SKIP)
   │
   Run 5 binary checks against the generated notes before delivery:
   │
   ├─ Check 1: INDICATIVE GROUND
   │  Does Section 5 identify the indicative theological ground if
   │  imperatives dominate the passage (per Section 2 structure)?
   │  If Section 2 shows imperative-dominated structure and Section 5
   │  lacks an explicit indicative ground → FAIL
   │
   ├─ Check 2: REDEMPTIVE-HISTORICAL LINK
   │  Does Section 8 include a redemptive-historical connection for
   │  non-wisdom genres (epistle, narrative, prophecy, apocalyptic)?
   │  If genre is NOT wisdom/short-letter AND Section 8 lacks a
   │  redemptive-historical link → FAIL
   │
   ├─ Check 3: TIER 3 CITATION FORMAT
   │  Are all Tier 3 citations in Section 6 in
   │  Author (Title, Series, Year) format?
   │  If any Tier 3 citation is a name-drop without title/series → FAIL
   │
   ├─ Check 4: VERIFICATION DATA
   │  Does the Verification section (Section 10) show actual MCP
   │  re-query results with specific counts, not summaries?
   │  If Section 10 contains generic text without cross-check counts → FAIL
   │
   ├─ Check 5: SECTION COMPLETENESS
   │  Are all 10 sections present with the exact required titles?
   │  Are any sections missing or renamed? → FAIL
   │
   ├─ ALL CHECKS PASS? → Proceed to Step 9 (deliver)
   │
   └─ ANY CHECK FAILS?
      │
      ├─ Print structured correction report:
      │  "[SELF-CRITIQUE] Check N FAILED: [reason]. Correcting..."
      │
      ├─ Revise the failing section(s)
      │
      ├─ Re-run the 5 checks (max 1 revision iteration)
      │
      └─ If still failing after 1 revision: deliver with a
         "[SELF-CRITIQUE] Unresolved: Check N" note in Section 10

Step 9: DELIVER OUTPUT
   │
   ├─ --output print? → Print ALL 10 sections inline. Do NOT save to file.
   │                     Do NOT summarize. The full document goes in the response.
   │
   └─ --output file (or default)? → Save to file path. Report path to user.
```

---

## Output Format (All 10 Sections Required — Use Exact Titles)

```markdown
# Exegetical Notes: [Book] [Range]

**Generated:** [YYYY-MM-DD]
**Passage:** [Book Chapter:Verse-Chapter:Verse] (SBLGNT/NA28 for NT; MT/OSHB for OT)
**Genre:** [epistle | narrative | poetry | prophecy | wisdom | apocalyptic]
**Pericope Status:** [Valid unit | Extended from user input | Confirmed problematic — noted in Section 1]

---

## 1. Passage in Literary Context

[Where this unit sits in the book's argument or narrative arc]
[Connection to preceding unit — what it follows from]
[Connection to following unit — what leads into next section]
[If --context provided: reference the segmentation context]
[If pericope check found issues: note here]

## 2. Internal Structure

[Clause-level structure using discourse features]
[Table required:]

| Verses | Element | Function |
|--------|---------|----------|
| [range] | [label] | [discourse role] |

[Levinsohn feature names cited for internal divisions]
[Masoretic markers cited for OT internal structure]
[NT clause annotations from SYNTAX_SUMMARY (OpenText.org) when available — clause type and relation data for structural analysis]

## 3. Propositional Summary

[The passage's central proposition in 1-2 sentences]
[Secondary propositions if argument is complex]
[Keep strictly descriptive — no Tier 4 claims here]

## 4. Lexical Analysis

[For each key lemma:]
**[Greek/Hebrew] ([reference])**: lemma [lemma form], [full parsing] [query_morphology]
Gloss: "[translation]"
[Semantic group from semantic_groups.yaml if applicable]
Frequency in [book]: Nx (ch:v, ch:v, ...) [VERSE_REFERENCES or query_morphology word_filter]
[Significance for passage interpretation]

[Flag hapax legomena or unusual forms]
[Note semantic range if relevant to interpretive decision]

**OT gloss tier awareness** (OT passages only):
- Glosses from `OT_ENRICHMENT_SUMMARY` (Cherith/Andi Wu) are **Tier 3 — single-scholar translation**. Do NOT cite as lexical authority for semantic range arguments.
- For exegetical decisions about word meaning, consult `LEXICON_SUMMARY` (from `query_lexicon`) which provides source-attributed scholarly definitions (BDB for Hebrew).
- Format: "gloss: [Cherith gloss, Tier 3] — cf. lexicon: [BDB definition]"

**Lexicon integration** (when `LEXICON_SUMMARY` is available):
- `query_lexicon` returns source-attributed definitions: `lsj_definition` (LSJ for Greek), `abbott_smith_definition` (Abbott-Smith NT-focused Greek), `bdb_definition` (BDB for Hebrew)
- These are full scholarly entries — use as primary lexical authority for word studies
- A `sources` array identifies which lexica contributed to each entry
- Cross-reference Cherith glosses (OT) or OpenGNT inline glosses (NT) against the lexical definitions
- Note significant differences between contextual glosses and the scholarly lexical range

**NT gloss tier awareness** (NT passages only):
- OpenGNT provides two gloss sources: inline glosses (single-scholar contextual translations) and TBESG glosses (concordance-level definitions from `gloss_tbesg` field)
- When both glosses are available and **diverge**, report both as a "semantic range indicator": "OpenGNT gloss: [X] — TBESG gloss: [Y]"
- OpenGNT glosses are **single-scholar contextual translations** — do not cite as lexical authority
- TBESG glosses are concordance-level — more stable but less context-sensitive
- LSJ and Abbott-Smith definitions from `query_lexicon` are full scholarly entries — use as primary lexical authority for Greek word studies
- Louw-Nida domain codes (`louw_nida`, `louw_nida_domain`) group words by semantic domain — use for Section 4 semantic grouping alongside `semantic_groups.yaml`
- Strong's numbers from OpenGNT enable cross-referencing with `query_lexicon` for LSJ/Abbott-Smith definitions

## 5. Exegetical Conclusions

[Numbered list of defensible interpretive claims]
[Each grounded in sections 2-4]
[Example:]
1. [Claim grounded in morphology — cite the parsing]
2. [Claim grounded in discourse structure — cite the feature]
3. [Claim grounded in intertextual connection — cite the link]

[For passages dominated by imperative verbs: at least one conclusion must trace
the indicative theological ground within the discourse unit that warrants the
commands. Imperatives without their indicative base are moralism, not exegesis.]

[At least one conclusion must note the passage's theological connection to the
broader biblical arc — the full cross-testament link is developed in Section 8.
See Section 8 for genre-specific exceptions (wisdom literature, short letters).]

## 6. Interpretive Guardrails

### 6a. Speaker Attribution (from SPEAKER_SUMMARY)

[When SPEAKER_SUMMARY data is available:]
- **Who speaks:** List speakers with verse ranges and divine speech markers
- **Speaker transitions:** Note transitions as discourse markers (speaker change often signals unit boundaries)
- **Quotation types:** Note quotation types when varied (Normal/Dialogue/Implicit/Quotation/Hypothetical)
- **Divine speech:** Flag divine speech markers (is_divine=true) — theologically significant for revelation claims
- **Caveats:**
  - In prophetic literature: divinity_only captures direct divine speech only. Prophetic oracles mediated through the prophet are attributed to the prophet.
  - Angel-of-the-LORD attributions are dataset interpretations (MACULA/FCBH), not settled exegesis. Note as "dataset attribution" when theologically significant.

[When SPEAKER_SUMMARY is SKIPPED or EMPTY_RETURNED: state "No speaker attribution data available for this passage."]

### 6b. Common Misreadings

[For each common misreading:]

### [Misreading description]

**Tier 1: Linguistic Evidence**
[How morphology/grammar contradicts this reading]
[Cite: specific parsing, form, or grammatical construction]

**Tier 2: Discourse Evidence**
[How discourse structure contradicts this reading]
[Cite: specific Levinsohn feature or Masoretic marker]

**Tier 3: Scholarly Consensus** (web-verified)
[Citation: Author, Title, Publisher, Year, pp.]
[Tier level: A | B | C — state if C]

**Tier 4: Agent Assessment**
[Clearly labeled as agent assessment, not established fact]

## 7. Open Questions

[Unresolved exegetical issues where data is insufficient]
[Areas of genuine scholarly debate]
[Questions this analysis cannot settle]
[What additional research would be needed]

## 8. Intertextual Links

[Cross-references organized by the 4-tier intertextual hierarchy:]

**Tier 1: Explicit citations** (from `OT_QUOTES_SUMMARY`)
"Reference → [Explicit citation: formal quotation]"
[Only for NT passages quoting OT. List each OT quotation with its NT citation location.]

**Tier 2: Lexical connections** (from `LEMMA_DISTRIBUTION`)
"Reference → [Lexical connection: shared lemma X]"
[Cross-book lemma connections. Significant shared vocabulary between the passage and other biblical books.]

**Tier 3: Entity continuity** (from `PEOPLE_SUMMARY` + `PLACES_SUMMARY`)
"Reference → [Entity continuity: Person/Place appears in both source and target]"
[People and places that appear in the passage AND in other biblical books. Ground in entity data, not training knowledge.]

**Tier 4: Editorial tradition** (from `CROSS_REFERENCES_SUMMARY`)
"Reference → [Editorial tradition: TSK/OpenBible, N votes — candidate]"
[TSK-derived cross-references are editorial tradition candidates, NOT confirmed intertextual connections. Always label as "editorial tradition" with vote count. Never present as Tier 1-3 evidence.]

[Parallel passages with significant differences noted]

**Textual Variants** (from `VARIANTS_SUMMARY`, NT only)
[When VARIANTS_SUMMARY has data, note significant edition disagreements that affect interpretation:]
- List readings where critical editions diverge on text that impacts exegetical conclusions
- Format: "[verse]: [variant type] — editions [X,Y] read [A]; editions [Z,W] read [B]"
- Flag passages with major text-critical issues (e.g., Pericope Adulterae, Comma Johanneum, Mark 16:9-20)
- Attribution: "OpenGNT Edition Comparison Data (9 editions: Byzantine, NIV Greek, NA27, NA28, Textus Receptus, SBLGNT, Tregelles, Westcott-Hort, Tyndale House GNT)"
- Note: This is edition comparison data, not a full text-critical apparatus. It shows where editions diverge, not the underlying manuscript evidence.

**Redemptive-historical connection (genre-graduated, mandatory):**
- **Epistles, narrative, prophecy, apocalyptic:** At least one cross-testament link
  placing the passage in the redemptive-historical arc (Creation → Promise →
  Fulfillment → Consummation). For NT: trace to OT promise/fulfillment.
  For OT narrative/prophecy: note forward trajectory or typological significance.
- **Wisdom literature (Proverbs, Ecclesiastes, Song of Songs):** Connection encouraged
  but not mandatory. If present, ground in wisdom theology (e.g., Prov 8 → Col 1:15-17).
  If not naturally present, state: "This passage operates within wisdom genre where
  redemptive-historical connections are indirect."
- **Short personal letters (Philemon, 2-3 John, Jude):** A note connecting to broader
  Pauline/Johannine/apostolic theology suffices. Do not force OT connections where the
  text itself makes none.

## 9. Data Sources

- MorphGNT/SBLGNT (CC BY-SA 3.0) — morphological parsing via query_morphology MCP tool
- [OR for NT] OpenGNT (CC BY-NC-SA 4.0) — NT morphology with glosses, Strong's, Louw-Nida domains
- [OR for OT] MACULA Hebrew Linguistic Datasets (CC BY 4.0), Clear Bible, Inc. — OT morphology
- Levinsohn GNT Discourse Features (dataset 2016; book: Levinsohn 2000) — discourse analysis via query_discourse_features MCP tool
- [OR] Sefaria / OpenScriptures paragraph markers — Masoretic structure
- [NT clause annotations: OpenText.org (Porter's SFL framework) via query_syntax MCP tool]
- [NT edition comparison: OpenGNT 9-edition variant data via query_variants MCP tool]
- [Vocabulary source: query_vocabulary MCP tool with per-book data]
- [Semantic groups: semantic_groups.yaml]
- [Tier 3 sources: full citations as used in Section 6]

## 10. Verification

**MCP cross-check results:**
- Data claims checked: [N]
- Claims confirmed (PASS): [N]
- Claims corrected: [N — list each correction below if any]
- Claims not cross-checkable: [N — e.g., Tier 3 citations, semantic notes]
- Overall: [PASS | CORRECTED]

[If corrections made: list each original claim, the MCP query result, and the correction]
```

---

## Invocation Format

```
/exegetical-notes Phil 1:1-11
/exegetical-notes Phil 1:1-11 --output print
/exegetical-notes Genesis 37:2-11
/exegetical-notes Romans 3:21-26
/exegetical-notes Genesis 37:2-11 --context "segmentation: Joseph narrative, 8 sessions"
```

- `--output`: Optional. `file` (default) saves to disk. `print` outputs inline.
- `--context`: Optional. Provides segmentation context for Section 1.
- Book names accept abbreviations (Phil, Gen, Rom, etc.) or full names.
- Testament auto-detected from book name.

---

## Reference Data Access

### NT Morphological Data

Call `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology` with `{"book": "[Book]", "range": "[chapter:verse-chapter:verse]"}`

### OT Morphological Data

Call `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology` with `{"book": "[Book]", "testament": "ot", "range": "[chapter:verse-chapter:verse]"}`

### Vocabulary Frequencies

Call `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary` with `{"book": "[Book]", "testament": "[nt|ot]"}`

### Levinsohn Discourse Features (NT)

Call `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features` with `{"book": "[Book]"}`

### Masoretic Markers (OT)

Call `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks` with `{"book": "[Book]"}`

### Claim Verification

Cross-reference MCP tool output against cited verse and morphological claims.

### Semantic Groups

Located at: `skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml`

---

## Semantic Groups Reference

Key semantic families from `semantic_groups.yaml` (for Section 4 connections):

| Group | NT lemmas | OT Strong's |
|-------|-----------|-------------|
| Joy | χαίρω, χαρά | H8057, H8056 |
| Faith | πίστις, πιστεύω | H0539 |
| Love | ἀγάπη, ἀγαπάω | H0157, H2617 |
| Righteousness | δικαιοσύνη, δίκαιος | H6663, H6664 |
| Covenant | — | H1285 (בְּרִית) |
| Holy | — | H6918, H6944 |

---

## Common Failure Patterns (Red Flags)

| Failure | Prevention |
|---------|-----------|
| "χαρά appears frequently" | Call query_vocabulary: χαρά (5x) at 1:4, 1:25, 2:2, 2:29, 4:1 |
| Wrong voice in morphology | Always verify via query_morphology MCP tool |
| "Scholars agree..." without citation | Web search required; cite author/title/year |
| Mixing Tier 1 and Tier 4 | Label every tier claim explicitly |
| Tier 3 name-drop without title/series | Every Tier 3 claim: Author (Title, Series, Year). Name alone is not a citation. |
| Imperatives presented as freestanding moral instruction | When Section 2 shows imperative-dominated structure, Section 5 must identify the indicative ground (theological basis for the commands) within the discourse unit. Commands require their warrant. |
| Skipping Section 10 cross-check | Pick up to 5 risk-prioritized claims (Rule 5) and re-query MCP tools before delivering |
| No redemptive-historical note in Section 8 | Section 8 requires genre-graduated connection: epistles/narrative/prophecy → mandatory cross-testament link; wisdom → note if indirect; short letters → theological connection suffices |
| `--output print` but saved to file | If `--output print` is in the invocation, print ALL 10 sections inline. Never save to file and return a summary. |
| Renaming sections | Use the exact 10 section titles from the template. "Homiletical Trajectories" is not "Interpretive Guardrails." |
| Only 6 sections instead of 10 | Every invocation produces exactly 10 sections. No abbreviation, no "brief" mode. |
| User says "keep it brief" → skip sections | All 10 sections are mandatory. "Brief" may shorten prose within sections but never removes sections. |
| Proceeding past problematic pericope without warning | Pericope check is mandatory Step 1 |
| No logical connectives in epistle analysis | For epistles: query_morphology pos_filter "conjunction", map γάρ/οὖν/δέ/ἀλλά/ἵνα flow |
| TSK cross-reference cited as confirmed connection | Cross-references from CROSS_REFERENCES_SUMMARY are editorial tradition candidates (Tier 4). Always label: "Editorial tradition: TSK/OpenBible, N votes — candidate". Never present as Tier 1-3. |
| Entity data ignored for narrative characters | When PEOPLE_SUMMARY has data, use it for entity continuity in Section 8. Characters should be grounded in entity database, not training knowledge alone. |
| Speaker attribution data ignored in dialogue | When SPEAKER_SUMMARY has data, report speakers with divine flags and quotation types in Section 6a. Speaker transitions are discourse markers. |
| Cherith glosses cited as lexical authority | OT_ENRICHMENT_SUMMARY glosses (Cherith/Andi Wu) are Tier 3 single-scholar translations. For semantic range arguments, use LEXICON_SUMMARY (query_lexicon). |
| OpenGNT glosses cited as lexical authority | OpenGNT inline glosses are single-scholar contextual translations. For semantic range arguments, cross-reference with TBESG gloss and query_lexicon. Report divergences as semantic range indicators. |
| Textual variants ignored for disputed passages | When VARIANTS_SUMMARY shows edition disagreements in the passage, note them in Section 8. Major text-critical issues (Pericope Adulterae, longer ending of Mark, Comma Johanneum) must be flagged. |
| Clause annotations treated as definitive | SYNTAX_SUMMARY data from OpenText.org is one analytical framework (Porter's SFL). Present as structural evidence, not absolute fact. Data coverage varies by NT book. |
| Tier A/B citation not grounded via commentary_lookup | After drafting Tier 3 citations, call commentary_lookup for the passage. If the cited author is in the bundled set, verify the position. If not verifiable, mark "[training knowledge — verify before publication]". |
| Skipping self-critique pass | Step 8 is mandatory. Run all 5 binary checks before delivery. Do not assume "this passage doesn't need it." |
| Asserting one position on a flagged controversy | `query_controversies` returned a record but Section 5 asserts only one interpretive/historical position | When a controversy record is returned, label the contested claim "[DISPUTED — see Section 7]" and present both positions there. Do NOT collapse the debate into a single exegetical conclusion. |
| Skipping controversy check | Notes composed for a passage with contested historical or critical questions without calling `query_controversies` | Step 2b is mandatory after Step 2. A `{topics:[]}` result permits normal composition. Non-empty results require a "Contested Historical/Critical Questions" subsection in Section 7. |
| Self-critique finds moralistic Section 5 | If imperatives dominate (per Section 2) and Section 5 lacks indicative ground, the self-critique must catch this and revise before delivery |
| Self-critique finds missing redemptive-historical link | For non-wisdom genres, Section 8 must have a cross-testament link. Self-critique catches the omission and triggers revision |

---

## Example Output Fragment: Section 4 (Lexical Analysis)

```markdown
## 4. Lexical Analysis

**ἐναρξάμενος (1:6)**: lemma ἐνάρχομαι, aorist middle participle,
nominative singular masculine [query_morphology]
Gloss: "having begun"
Semantic note: Middle voice is significant — "begun in/among themselves" or
reflexive causative. Contrast with active voice ἐναρχόμενος (not attested here).
Frequency in Philippians: 1x (this passage) [query_vocabulary]

**ἐπιτελέσει (1:6)**: lemma ἐπιτελέω, future active indicative,
3rd person singular [query_morphology]
Gloss: "will complete/finish"
Temporal referent: ἄχρι ἡμέρας Χριστοῦ Ἰησοῦ — eschatological frame.
Frequency in Philippians: 1x [query_vocabulary]

**χαρά (1:4)**: lemma χαρά (noun), [not a verb form — check pos in morphology data]
Frequency in Philippians: 5x (1:4, 1:25, 2:2, 2:29, 4:1) [query_vocabulary]
Semantic group: Joy family — see also χαίρω (9x in Philippians) [semantic_groups.yaml]
```
