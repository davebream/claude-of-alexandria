# Exegetical Notes Skill - Baseline (RED Phase)

## Test Conditions

**Agent:** Claude (Sonnet) without exegetical-notes skill loaded
**Date:** 2026-02-18
**Purpose:** Document failure modes before skill implementation
**Method:** Subagent execution with no skill access, web search disabled

---

## Executive Summary

**Key Finding:** Agent produces high-quality theological commentary with good redemptive-historical awareness and anti-moralism instincts. However, output is unstructured (6 ad-hoc sections, not 10-section schema), lexical claims are unverified (no parser citations), interpretive evidence quality is opaque (no tier labeling), and no self-checking mechanism exists.

**Predictions vs Reality:**

| Prediction | Actual Result | Accuracy |
|-----------|---------------|----------|
| "2-4 ad-hoc sections" | 6 sections (I-VI) | Partially wrong — more structured than predicted |
| "ἐναρξάμενος voice unchecked" | Listed as "ho enarxamenos" — voice NOT specified | Confirmed |
| "Vague joy vocabulary references" | "joy or rejoicing 16 times" — approximate, no lemma distinction | Confirmed |
| "No tier labeling" | No Tier 1/2/3/4 labels | Confirmed |
| "Proceed without pericope check" | Validated Phil 1:3-8 as complete unit, no warning | Confirmed |

---

## Scenario 1: Phil 1:1-11 Complete Analysis

**Input:** "Please produce exegetical notes on Philippians 1:1-11 for my sermon preparation. I need lexical analysis of key Greek terms, the passage's internal structure, and any important interpretive issues."

**Agent Response Summary:**

### Structure
- ✅ Produced 6 sections: Literary Context, Internal Structure, Key Lexical Analysis, Interpretive Issues, Theological Synthesis, Homiletical Notes
- ❌ NOT the 10-section schema (missing: Propositional Summary, Exegetical Conclusions, Open Questions, Intertextual Links, Data Sources, Verification)
- ⚠️ More structured than predicted (6 sections, not "2-4")

### Lexical Analysis (Section III)
Agent analyzed 9 key terms: δοῦλοι, ἁγίοις, ἐπισκόποις/διακόνοις, κοινωνία, ἐπιποθέω, ἀγάπη, ἐπίγνωσις/αἴσθησις, δοκιμάζειν, εἰλικρινεῖς/ἀπρόσκοποι

**Confirmed failures:**
- ❌ **ἐναρξάμενος voice not specified** — listed as "ho enarxamenos (ὁ ἐναρξάμενος) — 'the one who began'" without parsing voice (middle, not active). This is the critical data-grounding test.
- ❌ **No lemma counts for joy vocabulary** — said "Philippians mentions joy or rejoicing 16 times across four chapters" (approximate, no lemma distinction between χαίρω and χαρά)
- ❌ **No query_morphology MCP tool citation** — all parsing from training knowledge
- ❌ **No query_vocabulary MCP tool citation** — all frequency claims unverified
- ❌ **No Strong's numbers** for any terms
- ⚠️ **Some parsing provided** but inconsistently — "pepoithos: Perfect tense participle from peitho" (correct tense) but no systematic morphological data

**Verbatim example of unverified lexical claim:**
```
epipotheo (ἐπιποθῶ) — "I long for/yearn for." An intensive compound verb.
The epi- prefix intensifies the longing.
```
No source cited. No morphological parsing. No frequency data. Training knowledge only.

### Interpretive Issues (Section IV — maps to Tier system)
Agent identified 4 issues: Overseer/deacon status, scope of "all," ergon agathon referent, eschatological frame

**Confirmed failures:**
- ❌ **No Tier 1/2/3/4 labels** — all evidence types mixed together
- ❌ **No web search for Tier 3 citations** — commentators mentioned without verification (Fee, Bockmuehl, Reumann named but no specific citations)
- ❌ **Agent assessment mixed with established fact** — "Most likely: the forensic/covenantal ground produces the moral fruit" presented without labeling as agent assessment
- ⚠️ **Some evidence differentiation** — separated "interpretive issues" from "theological synthesis," but not by evidence quality tier

**Verbatim example of tier confusion:**
```
"Most likely combination: they facilitated the gift, and their mention honors their
service without elevating them above 'all the saints.'"
```
This is an agent assessment (Tier 4) presented as conclusion without labeling.

### Missing Sections
- ❌ No Propositional Summary (1-2 sentence passage claim)
- ❌ No Exegetical Conclusions (numbered, grounded in data)
- ❌ No Open Questions (unresolved issues flagged)
- ❌ No Intertextual Links (OT quotations/allusions with citations)
- ❌ No Data Sources section
- ❌ No Verification section (data claim cross-check)
- ❌ No output file saved

### Theological Quality
- ✅ **Strong redemptive-historical awareness** — "The promise of v. 6 echoes the pattern of divine faithfulness throughout the canon: Genesis 15; Isaiah 46:10; John 6:37-40; Romans 8:29-30"
- ✅ **Anti-moralism guardrail naturally present** — "The grammatical structure is passive and divine... The indicative ground must control the sermon"
- ✅ **Christ-centered reading** — "Christ is both the locus of identity (en Christo Iesou, v. 1) and the source of affection (splanchna Christou, v. 8) and the means of righteousness (dia Iesou Christou, v. 11)"
- ✅ **Preachable application grounded in indicative** — "The passage moves from status... through partnership... to transformation... all grounded in God's completing work"

**Verdict:** HIGH-QUALITY CONTENT, UNVERIFIED AND UNSTRUCTURED

---

## Scenario 2: Lexical Data-Grounding Failure

**Predicted wrong output:**
```
- χαίρω/χαρά: Joy theme — appears throughout Philippians
- ἐναρξάμενος: aorist participle [voice not checked]
- φρονέω: Think/mindset — a major Philippians theme
```

**Actual output (verbatim excerpts):**
```
- "Philippians mentions joy or rejoicing 16 times across four chapters"
  [No lemma distinction: χαίρω=9x, χαρά=5x = 14, not 16]

- "ho enarxamenos (ὁ ἐναρξάμενος) — 'the one who began.' God is the grammatical subject."
  [Voice not specified — is it active? middle? passive?]

- "phronein (φρονεῖν) — 'to think/feel.' This verb is central to Philippians (used 10 times)."
  [Count cited without source. Is 10 correct? Cannot verify without parser.]
```

**Confirmed failures:**
- ❌ Joy vocabulary count wrong (claimed 16, actual χαίρω:9 + χαρά:5 = 14)
- ❌ ἐναρξάμενος voice not specified (should be aorist MIDDLE participle)
- ❌ φρονέω count of 10 cited without source
- ❌ No query_morphology MCP tool or query_vocabulary MCP tool citations
- ❌ All data from training knowledge — unverifiable

**This is the core failure the skill must fix.** Training knowledge produces plausible-but-wrong data (16 vs 14 for joy vocabulary). Only parser verification catches this.

---

## Scenario 3: Tier Confusion Failure

**Predicted output pattern:**
```
"Most scholars understand 'day of Christ Jesus' as the parousia. Paul's confidence
is eschatological, not biographical." [No source cited]
```

**Actual output (verbatim):**
```
"The horizon is not merely present holiness but readiness at the Parousia."
[Stated as fact — no tier label, no source]

"Most likely: the forensic/covenantal ground (justification in Christ) produces the
moral fruit."
[Agent assessment presented as conclusion]

"Paul's confidence (v. 6) is not in the Philippians' consistency but in the God who
completes His own work."
[Theological claim — no tier differentiation]
```

**Confirmed failures:**
- ❌ No Tier 1 (linguistic) evidence labels — morphological claims not distinguished
- ❌ No Tier 2 (discourse) evidence labels — structural claims not distinguished
- ❌ No Tier 3 (scholarly) evidence with web-verified citations
- ❌ No Tier 4 labels for agent assessments
- ❌ All evidence types mixed in continuous prose
- ❌ "Most likely" phrasing used without acknowledging it as agent assessment

---

## Scenario 4: Pericope Check Failure

**Input:** "Please produce exegetical notes on Philippians 1:3-8. I need the key Greek terms analyzed and the passage structure mapped out for my Wednesday night Bible study."

**Agent Response Summary:**
- ❌ **Proceeded directly to full analysis** — no boundary warning issued
- ❌ **Validated 1:3-8 as complete unit** — "Verses 3-8 constitute a complete thanksgiving period (a standard Pauline epistolary feature)"
- ❌ **Acknowledged 1:9 but drew wrong conclusion** — noted "verse 9 opens a new prayer petition" as evidence the unit ENDS at 1:8, when the prayer actually COMPLETES the unit
- ❌ No recommendation to extend to 1:3-11
- ❌ No warning before generating notes

**Verbatim boundary statement:**
```
"Note on boundaries: verse 9 opens a new prayer petition ('And this I pray, that...'),
marking the close of the thanksgiving. Verses 3-8 constitute a complete thanksgiving
period (a standard Pauline epistolary feature following Greco-Roman letter conventions)."
```

**This is a genuine failure.** The agent saw the evidence (v.9 opens prayer petition) but drew the wrong conclusion (this closes the unit rather than completing it). The thanksgiving-prayer is a single rhetorical movement in Pauline letters; the agent treated the prayer as a separate unit. This contrasts with Scenario 1 of the pericope-delimitation test, where the same agent correctly identified the extension need. The exegetical context (producing notes for a user-specified passage) creates compliance pressure that overrides discourse instincts.

**Key insight:** The pericope check failure is context-dependent. When asked "is this a valid pericope?" the agent correctly says EXTEND. When asked "produce notes on this passage," the agent validates the passage and proceeds. The skill must enforce the check regardless of task framing.

---

## Pattern Analysis

### Strengths (Natural Quality)

1. **Theological depth** — Redemptive-historical connections, Christ-centered reading, anti-moralism awareness all naturally present
2. **Lexical breadth** — Analyzed 9+ key terms with etymological and contextual discussion
3. **Preaching orientation** — Homiletical notes section with practical sermon guidance
4. **More structured than predicted** — 6 sections (not 2-4), with clear headings

### Critical Gaps (Requires Skill)

1. **Unverified lexical data** (confirmed)
   - Joy vocabulary count wrong (16 vs 14)
   - ἐναρξάμενος voice not specified
   - φρονέω count cited without source
   - No parser citations anywhere

2. **No tier labeling** (confirmed)
   - Agent assessments mixed with established facts
   - No evidence quality differentiation
   - "Most likely" claims without Tier 4 label

3. **No 10-section schema** (confirmed)
   - 6 ad-hoc sections instead
   - Missing: Propositional Summary, Exegetical Conclusions, Open Questions, Intertextual Links, Data Sources, Verification

4. **No pericope check** (confirmed)
   - Phil 1:3-8 validated as complete unit
   - Evidence for extension seen but conclusion reversed
   - Task framing overrides discourse instincts

5. **No self-checking** (confirmed)
   - No data claim cross-check
   - No Data Sources section
   - Wrong data (16 vs 14) would be caught by parser

---

## Summary of Baseline Failures

| Failure | Severity | Confirmed? |
|---------|----------|-----------|
| Missing 10-section structure | High — no predictable format | ✅ Yes (6 sections, not 10) |
| Lexical analysis from memory (wrong count, missing voice) | High — introduces errors | ✅ Yes (16 vs 14, voice omitted) |
| No Tier 3 web search with real citations | High — cites training knowledge as scholarship | ✅ Yes |
| No tier labels for guardrails | High — interpretation quality opaque | ✅ Yes |
| No data claim cross-check | Medium — no self-checking | ✅ Yes |
| No pericope check | Medium — validates invalid passages | ✅ Yes (Phil 1:3-8) |
| No file output | Low — can be requested separately | ✅ Yes |

---

## RED Phase Conclusion

Without the skill, the agent produces high-quality theological commentary that is:
1. **Unverified** — lexical claims from memory, demonstrably wrong in one case (16 vs 14)
2. **Opaque** — no tier labeling, agent assessments indistinguishable from data
3. **Unsystematic** — 6 ad-hoc sections, missing 4 critical sections
4. **Unchecked** — no verification step, no Data Sources, no pericope boundary check

The skill exists to enforce all four properties: **verified, labeled, systematic, checked**.

**The most telling failure:** The agent knows that v.9 "opens a new prayer petition" but validates Phil 1:3-8 as a complete unit anyway. Task framing ("produce notes on this passage") overrides discourse instincts that are demonstrably present when the task is "assess this boundary." The skill must make the pericope check mandatory regardless of task framing.
