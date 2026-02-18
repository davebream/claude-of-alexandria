# Exegetical Notes Skill - Baseline (RED Phase)

## Test Conditions

**Agent:** Claude without exegetical-notes skill loaded
**Date:** 2026-02-18
**Purpose:** Document failure modes before skill implementation

---

## Scenario 1: Phil 1:1-11 Complete Analysis

**Expected WITHOUT skill:**

An agent without this skill will:

**❌ No structured 10-section format**
Agent will produce prose commentary, not structured exegetical notes. May create
2-4 ad-hoc sections but will not follow the 10-section schema.

**❌ Lexical analysis from memory**
Agent will say:
- "ἐναρξάμενος is an aorist participle" (correct tense/mood, but voice unchecked)
- "Philippians is famous for its joy theme with χαίρω and χαρά appearing frequently"
- (No specific counts, no verse-level data, no morphology_parser.py citation)

**❌ No interpretive guardrail tiers**
Agent will produce undifferentiated commentary. May label some things as "debated"
but will not distinguish:
- Linguistic evidence (morphology)
- Discourse evidence (structure)
- Scholarly consensus (web-verified)
- Agent assessment (speculative)

**❌ No Tier 3 web search**
Agent will cite commentaries from training data without verifying current scholarly
positions. May fabricate citation details.

**❌ No verify_claims.py run**
Agent cannot run verify_claims.py without the skill. No Section 10 Verification.

**❌ No pericope check**
For Phil 1:3-8: agent will proceed directly to analysis without checking boundary validity.

**❌ No output file**
Agent will produce inline response. Notes will not be saved to
`~/.claude/exegetical-notes/`.

---

## Scenario 2: Lexical Data-Grounding Failure

**Predicted wrong output for Phil 1:1-11 lexical analysis:**

```
Key vocabulary:
- χαίρω/χαρά: Joy theme — appears throughout Philippians, marking the
  epistle's distinctive tone. Paul uses both verb and noun forms repeatedly.
- ἐπιτελέω (1:6): Complete/perfect — Paul's confidence that God will finish
  the work he began. The aorist participle ἐναρξάμενος... [voice not checked]
- φρονέω: Think/mindset — a major Philippians theme
```

**What's wrong:**
- No counts (χαίρω: 9x, χαρά: 5x)
- No verse references for occurrences
- ἐναρξάμενος voice unchecked (is active? middle? passive?)
- No morphology_parser.py citation
- "Throughout Philippians" — vague

---

## Scenario 3: Tier Confusion Failure

**Predicted without skill — Section 6 output:**

```
## Interpretive Issues

Some interpreters read Phil 1:6 as referring to sanctification progressing
until physical death ("day of Christ Jesus" = death). However, most scholars
understand "day of Christ Jesus" as the parousia. Paul's confidence is
eschatological, not biographical. [No source cited]
```

**What's wrong:**
- No tier labels (Tier 1/2/3/4)
- "Most scholars" — no citation
- No linguistic evidence cited (future indicative form)
- Agent assessment mixed with established fact
- No web search performed

---

## Scenario 4: Pericope Check Failure

**Input:** `/exegetical-notes Phil 1:3-8`

**Without skill, agent will:**
- Proceed directly to exegetical analysis
- Title it "Exegetical Notes: Philippians 1:3-8" without flagging the boundary issue
- Produce complete notes for a structurally incomplete passage
- May briefly note "some commentators extend this to 1:11" but won't stop to warn

---

## Summary of Baseline Failures

| Failure | Severity |
|---------|----------|
| Missing 10-section structure | High — no predictable format |
| Lexical analysis from memory (wrong voice for ἐναρξάμενος possible) | High — may introduce errors |
| No Tier 3 web search with real citations | High — cites training knowledge as scholarship |
| No tier labels for guardrails | High — interpretation quality opaque |
| No verify_claims.py | Medium — no self-checking |
| No pericope check | Medium — may analyze invalid passages |
| No file output | Low — can be requested separately |

**Core failure:** The agent will produce good-quality commentary from training knowledge
but it will be:
1. Unverified (no data citation)
2. Opaque (no tier labeling)
3. Unsystematic (no consistent format)
4. Unchecked (no verification step)

The skill exists to enforce all four properties: verified, labeled, systematic, checked.

---

## RED Phase Conclusion

Without the skill, Phil 1:1-11 analysis will:
- Miss the voice distinction in ἐναρξάμενος (middle, not active)
- Give vague joy vocabulary references without counts
- Mix Tier 1-4 claims without labeling
- Cite training-data commentaries without web verification
- Skip the verification step
- Not save to the output location

These are not catastrophic failures — the agent is knowledgeable. But the output
will be unverified and unstructured, defeating the purpose of exegetical notes
as a rigorous, citable artifact.
