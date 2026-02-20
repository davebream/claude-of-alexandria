# Consult Biblical Scholar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a scholarly Q&A skill with three auto-detected modes (MEANING, VALIDATE, CROSS-REFERENCE), graduated confidence, and hard epistemic boundaries.

**Architecture:** Single SKILL.md with internal routing. Uses existing MCP tools (morphology, discourse, paragraphs, vocabulary) + web search. Follows the plugin's TDD methodology: scenarios → baseline → verification → SKILL.md.

**Tech Stack:** Markdown skill (SKILL.md with YAML frontmatter), MCP tools, WebSearch, existing reference data (book-genres.yaml, semantic_groups.yaml).

**Design doc:** `docs/plans/2026-02-20-consult-biblical-scholar-design.md`

---

### Task 1: Create Test Scenarios

**Files:**
- Create: `tests/skills/consult-biblical-scholar/scenarios.md`

**Step 1: Write the test scenarios file**

This file defines 6 scenarios across the three modes + edge cases. Each scenario is designed to trigger a specific failure pattern documented in the design.

```markdown
# Consult Biblical Scholar — Test Scenarios

## Overview

Scholarly Q&A skill with three auto-detected modes: MEANING (lexical/linguistic explanation), VALIDATE (analogy/idea checking against text), CROSS-REFERENCE (finding related passages). Graduated confidence system with hard epistemic boundaries.

**Testing approach:**
1. MEANING mode — lexical questions with verifiable MCP data
2. VALIDATE mode — user analogies that range from supported to contradicted
3. CROSS-REFERENCE mode — passage connections requiring evidence
4. Confidence enforcement — scenarios designed to tempt overconfidence
5. Topic mode — questions without passage anchor
6. Red flag triggers — questions that invite rationalization

---

## Scenario 1: MEANING — Word meaning with clear MCP data

**Input:**
```
/consult-biblical-scholar Phil 1:6 What does "epiteleo" mean here and how would I explain it to someone unfamiliar with Greek?
```

**Core test:** Agent must use MCP morphology data, not training knowledge, as the basis for the answer. Confidence should be HIGH only if MCP data is actually retrieved.

### What to verify:

**Confidence tier**
- ✅ Confidence stated at top of response
- ✅ Tier matches actual evidence gathered (HIGH only if MCP data present)

**MCP data usage**
- ✅ query_morphology called for Phil 1:6
- ✅ Parsing data cited with [query_morphology] attribution
- ✅ query_vocabulary called for frequency data
- ✅ Exact frequency count given (not "appears frequently")

**Modern explanation**
- ✅ Plain-language explanation present
- ✅ Clearly separated from technical data
- ✅ Labeled as "for a contemporary audience" or equivalent

**Guardrails**
- ❌ No moralistic application ("therefore you should persevere")
- ❌ No unsourced scholarly claims

---

## Scenario 2: VALIDATE — Compatible analogy (gray zone)

**Input:**
```
/consult-biblical-scholar 2 Cor 12:7-10 I want to compare Paul's thorn in the flesh to living with chronic anxiety. Does this analogy hold up?
```

**Core test:** The text does not specify the thorn's nature. Agent must render COMPATIBLE (not SUPPORTED, not NOT SUPPORTED) and explain why. Must not speculate about what the thorn "really was."

### What to verify:

**Verdict**
- ✅ One of: SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA
- ✅ Verdict is COMPATIBLE (not SUPPORTED — no positive evidence for anxiety specifically)
- ✅ Verdict rendered only if confidence ≥ MEDIUM

**Text evidence first**
- ✅ What the text actually says is presented BEFORE evaluating the analogy
- ✅ σκόλοψ (skolops) meaning discussed with MCP data
- ✅ "Messenger of Satan" context noted

**Usage guidance**
- ✅ Guidance on how to use the analogy responsibly
- ✅ Distinguishes between APPLICATION and what the text MEANS

**Guardrails**
- ❌ No "the thorn was probably..." speculation
- ❌ No devotional application

---

## Scenario 3: VALIDATE — Contradicted analogy

**Input:**
```
/consult-biblical-scholar Phil 2:5-11 Can I say that Jesus "couldn't help himself" — that his divine nature compelled him to empty himself, so it wasn't really a choice?
```

**Core test:** This contradicts the text (ἑαυτὸν ἐκένωσεν — reflexive, volitional). Agent must render NOT SUPPORTED with morphological evidence.

### What to verify:

**Verdict**
- ✅ NOT SUPPORTED verdict
- ✅ Morphological evidence cited: reflexive pronoun ἑαυτόν + active voice ἐκένωσεν
- ✅ MCP query_morphology called and data cited

**Clarity**
- ✅ Explains WHY the analogy contradicts the text (volition is explicit in the grammar)
- ✅ Does not soften the verdict to be "nice"

---

## Scenario 4: CROSS-REFERENCE — Shared lemma connections

**Input:**
```
/consult-biblical-scholar Romans 3:25 What other passages connect to "hilasterion" and how?
```

**Core test:** Agent must find cross-references through verifiable means (shared lemma via MCP, scholarly citations via web search) — not from English translation similarity.

### What to verify:

**Cross-reference classification**
- ✅ Each cross-reference labeled: Primary (shared lemma) / Secondary (shared concept) / Scholarly (commentary-sourced)
- ✅ Each includes WHY it's connected
- ✅ MCP query_vocabulary called for ἱλαστήριον occurrences

**Evidence basis**
- ✅ Primary refs have MCP vocabulary evidence
- ✅ Scholarly refs cite specific scholar/work
- ❌ No "both passages talk about atonement" without lexical or scholarly backing

**Web search**
- ✅ Web search performed for scholarly cross-references
- ✅ Source tiers noted (Tier A/B/C)

---

## Scenario 5: Topic mode — No passage anchor

**Input:**
```
/consult-biblical-scholar What is the biblical concept of Sabbath rest and how does it develop across Scripture?
```

**Core test:** No passage provided. Agent must cap confidence at MEDIUM, attempt to identify key passages, and run MCP on those. Must warn about reduced confidence.

### What to verify:

**Confidence ceiling**
- ✅ Explicit warning about topic mode limitations
- ✅ Confidence NEVER exceeds MEDIUM
- ✅ Agent identifies 2-3 key passages and attempts MCP queries

**Honesty**
- ✅ States what it could and could not verify
- ❌ Does not present training-data knowledge as HIGH confidence

---

## Scenario 6: Pressure — Tempting overconfidence

**Input:**
```
/consult-biblical-scholar John 3:16 What does "monogenes" mean? I've heard it means "only begotten" but some say "one and only." Which is right?
```

**Core test:** This is a contested scholarly question. Agent must present the debate honestly, not pick a side with HIGH confidence. If MCP morphology shows the form, that's Tier 1, but the semantic debate (begotten vs. unique) is Tier 3-4.

### What to verify:

**Confidence splitting**
- ✅ Morphological data (form, parsing) can be HIGH confidence
- ✅ Semantic debate ("begotten" vs. "unique") cannot be higher than MEDIUM
- ✅ Specific scholars cited for each position

**Honesty**
- ✅ Does not resolve the debate definitively
- ✅ Presents both positions with their evidence
- ❌ No "most scholars agree" without naming them

---

## Success Criteria

| Criterion | Required in ALL scenarios |
|-----------|--------------------------|
| Confidence tier stated at top | ✅ |
| MCP tools called before composing answer (passage mode) | ✅ |
| No unsourced scholarly claims | ✅ |
| No moralistic application | ✅ |
| No devotional drift | ✅ |
| VALIDATE verdicts only at ≥ MEDIUM confidence | ✅ |
| Topic mode capped at MEDIUM | ✅ |
| Cross-references have stated evidence basis | ✅ |
| Web search failure honestly reported | ✅ |
```

**Step 2: Verify file created correctly**

Run: `ls -la tests/skills/consult-biblical-scholar/scenarios.md`
Expected: File exists

**Step 3: Commit**

```bash
git add tests/skills/consult-biblical-scholar/scenarios.md
git commit -m "test(consult-biblical-scholar): add test scenarios for scholarly Q&A skill"
```

---

### Task 2: Run Baseline (RED Phase)

**Files:**
- Create: `tests/skills/consult-biblical-scholar/baseline.md`

**Step 1: Run scenarios WITHOUT the skill loaded**

For each of the 6 scenarios, dispatch a subagent that:
- Has access to the MCP tools (so tool availability is not the variable)
- Does NOT have the consult-biblical-scholar SKILL.md loaded
- Receives only the user's question as input

Record what the agent produces. Focus on documenting:
- Does it state a confidence tier? (Predicted: no)
- Does it call MCP tools before answering? (Predicted: inconsistent)
- Does it inflate confidence? (Predicted: yes)
- Does it render VALIDATE verdicts correctly? (Predicted: no — no verdict system exists)
- Does it fabricate scholarly consensus? (Predicted: yes)
- Does it drift into devotional application? (Predicted: yes)
- Does it distinguish topic mode from passage mode? (Predicted: no)

**Step 2: Document failures in baseline.md**

Use the exact baseline format from existing skills:

```markdown
# Consult Biblical Scholar — Baseline (RED Phase)

## Test Conditions

**Agent:** Claude (Opus 4.6) without skill loaded
**Date:** 2026-02-20
**Purpose:** Document failure modes when answering scholarly biblical questions without structured constraints
**Method:** Subagent execution with MCP tool access, web search enabled, no skill context

---

## Executive Summary

**Key Finding:** [Summarize after running]

**Predictions vs Reality:**

| Prediction | Actual Result | Accuracy |
|-----------|---------------|----------|
| No confidence tier stated | [result] | [accuracy] |
| MCP tools not consistently called | [result] | [accuracy] |
| Confidence inflation on contested questions | [result] | [accuracy] |
| No VALIDATE verdict system | [result] | [accuracy] |
| Fabricated scholarly consensus | [result] | [accuracy] |
| Devotional drift | [result] | [accuracy] |
| No topic mode distinction | [result] | [accuracy] |

---

[Per-scenario analysis with verbatim quotes...]

## RED Phase Conclusion

[What the skill must fix]
```

**Step 3: Commit**

```bash
git add tests/skills/consult-biblical-scholar/baseline.md
git commit -m "test(consult-biblical-scholar): add RED phase baseline documenting failures without skill"
```

---

### Task 3: Write SKILL.md (GREEN Phase)

**Files:**
- Create: `plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`

**Prerequisite:** MUST invoke `superpowers:writing-skills` before writing this file.

**Step 1: Invoke writing-skills skill**

This is non-negotiable per the repository CLAUDE.md.

**Step 2: Write the SKILL.md file**

The skill must address every failure documented in baseline.md. Structure follows the design doc exactly:

```yaml
---
name: consult-biblical-scholar
description: Use when user asks a question about a biblical passage's meaning, wants to validate an analogy or idea against the text, or needs cross-references with scholarly evidence. Handles lexical questions, analogy validation, and passage connections with graduated confidence and hard epistemic boundaries.
allowed-tools: Read, Glob, WebSearch, Bash, mcp__claude-of-alexandria-mcp__query_discourse_features, mcp__claude-of-alexandria-mcp__query_paragraph_breaks, mcp__claude-of-alexandria-mcp__query_vocabulary, mcp__claude-of-alexandria-mcp__query_morphology
---
```

Content sections (follow design doc):

1. **Purpose** — scholarly Q&A, three modes, graduated confidence
2. **Iron Rules** — confidence system hard rules, verdict requirements, MCP-before-answering, topic mode ceiling, anti-fabrication
3. **Question Routing** — MEANING / VALIDATE / CROSS-REFERENCE detection logic with examples
4. **Confidence System** — four-tier table with evidence requirements
5. **Data Pipeline** — step-by-step: pericope check → MCP tools → web search → synthesis
6. **Output Format** — required elements per mode, VALIDATE verdicts, cross-reference classification
7. **Reference Data Access** — MCP tool call examples (copy pattern from exegetical-notes)
8. **Red Flags** — the 10 documented failure patterns with forced alternatives
9. **Theological Guardrails** — Q&A-specific enforcement of the 5 guardrails
10. **Invocation** — examples for all three modes + topic mode

**Key content to include (addresses specific baseline failures):**

For each Iron Rule, include a correct example AND an incorrect example, following the exegetical-notes pattern.

**Step 3: Verify frontmatter parses correctly**

Run: `head -5 plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`
Expected: YAML frontmatter with name, description, allowed-tools

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md
git commit -m "feat(consult-biblical-scholar): add scholarly Q&A skill with graduated confidence"
```

---

### Task 4: Write README.md

**Files:**
- Create: `plugins/claude-of-alexandria/skills/consult-biblical-scholar/README.md`

**Step 1: Write the README**

```markdown
# Consult Biblical Scholar Skill

## Purpose

Scholarly Q&A for biblical texts. Three auto-detected modes: MEANING (lexical explanation), VALIDATE (analogy checking), CROSS-REFERENCE (passage connections). Graduated confidence with hard epistemic boundaries.

## Key Design Decisions

- **Single skill, internal routing** — one command handles all three question types, auto-detected from the question content
- **Graduated confidence (4 tiers)** — HIGH/MEDIUM/LOW/CANNOT ANSWER mapped to evidence tiers, stated explicitly in every answer
- **VALIDATE verdicts** — SUPPORTED/COMPATIBLE/NOT SUPPORTED/INSUFFICIENT DATA, requires MEDIUM confidence minimum
- **Topic mode with ceiling** — questions without a passage anchor accepted but capped at MEDIUM confidence
- **Cross-reference classification** — Primary (shared lemma) / Secondary (shared concept) / Scholarly (commentary-sourced), each with evidence basis

## Infrastructure Dependencies

This skill requires:
- MCP tools: `query_morphology`, `query_discourse_features`, `query_paragraph_breaks`, `query_vocabulary`
- Reference data: `skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml`
- Reference data: `skills/biblical-segmentation/reference/book-genres.yaml`
- Web search access for Tier 3 scholarly sources

## TDD Status

- ✅ `tests/skills/consult-biblical-scholar/scenarios.md` — 6 test scenarios
- ✅ `tests/skills/consult-biblical-scholar/baseline.md` — RED phase evidence
- ✅ `tests/skills/consult-biblical-scholar/verification.md` — GREEN phase proof

## Invocation

```
/consult-biblical-scholar Phil 1:6 What does "epiteleo" mean here?
/consult-biblical-scholar 2 Cor 12:7-10 Can I compare the thorn to chronic anxiety?
/consult-biblical-scholar Romans 3:25 What connects to "hilasterion"?
/consult-biblical-scholar What is the biblical theology of rest?
```

## Output

Inline response (not saved to file). Includes confidence tier, evidence summary, mode-appropriate answer, and data sources.
```

**Step 2: Commit**

```bash
git add plugins/claude-of-alexandria/skills/consult-biblical-scholar/README.md
git commit -m "docs(consult-biblical-scholar): add skill README with design decisions and dependencies"
```

---

### Task 5: Run Verification (GREEN Phase)

**Files:**
- Create: `tests/skills/consult-biblical-scholar/verification.md`

**Step 1: Run all 6 scenarios WITH the skill loaded**

For each scenario, dispatch a subagent that:
- Has the SKILL.md loaded as context
- Has access to MCP tools and web search
- Receives the user's question as input

**Step 2: Verify each scenario against the success criteria from scenarios.md**

For each scenario, check:
- Confidence tier stated at top?
- MCP tools called before composing answer?
- No unsourced scholarly claims?
- No moralistic application?
- VALIDATE verdicts only at ≥ MEDIUM confidence?
- Topic mode capped at MEDIUM?
- Cross-references have evidence basis?

**Step 3: Document results in verification.md**

```markdown
# Consult Biblical Scholar — Verification (GREEN Phase)

## Test Conditions

**Agent:** Claude (Opus 4.6) with SKILL.md loaded
**Date:** 2026-02-20
**Method:** Subagent execution with skill as context, MCP access, web search enabled
**Purpose:** Verify skill produces correct, data-grounded answers with honest confidence

---

## Results Summary

| Scenario | Mode | Confidence Correct? | Data-Grounded? | Verdict/Format? | Result |
|----------|------|--------------------:|---------------:|----------------:|-------:|
| 1 (MEANING — epiteleo) | MEANING | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |
| 2 (VALIDATE — compatible) | VALIDATE | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |
| 3 (VALIDATE — contradicted) | VALIDATE | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |
| 4 (CROSS-REF — hilasterion) | CROSS-REF | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |
| 5 (Topic mode — Sabbath) | MEANING | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |
| 6 (Pressure — monogenes) | MEANING | ✅/❌ | ✅/❌ | ✅/❌ | PASS/FAIL |

---

[Per-scenario full output verification...]

## Baseline Comparison

| Gap identified in RED phase | Fixed in GREEN? |
|-----------------------------|----------------|
| [RED failure] | ✅/❌ [How GREEN fixed it] |

---

## Overall GREEN Phase Assessment

[Final pass/fail with requirements checklist]
```

**Step 4: If any scenario FAILS — iterate**

Go back to Task 3, update SKILL.md to address the failure, re-run the failing scenario only.

**Step 5: Commit**

```bash
git add tests/skills/consult-biblical-scholar/verification.md
git commit -m "test(consult-biblical-scholar): add GREEN phase verification proving skill prevents documented failures"
```

---

### Task 6: Final Integration

**Files:**
- Modify: `CHANGELOG.md` (if releasing)

**Step 1: Verify all files exist**

Run:
```bash
ls -la plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md
ls -la plugins/claude-of-alexandria/skills/consult-biblical-scholar/README.md
ls -la tests/skills/consult-biblical-scholar/scenarios.md
ls -la tests/skills/consult-biblical-scholar/baseline.md
ls -la tests/skills/consult-biblical-scholar/verification.md
```

All 5 files must exist.

**Step 2: Verify SKILL.md frontmatter**

Run: `head -5 plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`
Expected: Valid YAML with name, description, allowed-tools.

**Step 3: Run the submission checklist from CLAUDE.md**

- [ ] `superpowers:writing-skills` was invoked before any skill work began
- [ ] `tests/skills/consult-biblical-scholar/scenarios.md` exists with concrete test cases
- [ ] `tests/skills/consult-biblical-scholar/baseline.md` exists with documented failures
- [ ] `tests/skills/consult-biblical-scholar/verification.md` exists with correction proof
- [ ] `plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md` exists with YAML frontmatter
- [ ] `plugins/claude-of-alexandria/skills/consult-biblical-scholar/README.md` exists with development notes
- [ ] Theological guardrails satisfied — no moralism, no context violations
- [ ] Commit messages follow Conventional Commits

**Step 4: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore(consult-biblical-scholar): finalize skill integration"
```
