# Pericope Delimitation Skill - Baseline (RED Phase)

## Test Conditions

**Agent:** Claude (Sonnet) without pericope-delimitation skill loaded
**Date:** 2026-02-18
**Purpose:** Document failure modes before skill implementation
**Method:** Subagent execution with no skill access, web search disabled

---

## Executive Summary

**Key Finding:** Agent verdicts are significantly better than predicted. Natural discourse analysis instincts are strong — the agent correctly identified 3 of 4 tested passages as needing boundary adjustment. However, methodology is consistently memory-based with no data citation, no structured output format, and no formal boundary assessment.

**Predictions vs Reality:**

| Scenario | Predicted Verdict | Actual Verdict | Prediction Accuracy |
|----------|------------------|----------------|---------------------|
| Phil 1:3-8 | Validate as unit | Correctly recommended extending to 1:3-11 | Prediction WRONG |
| Phil 1:1-2:11 | Vague "too long" | Detailed analysis, identified split at 1:27 | Prediction WRONG |
| Gen 37:5-8 | Validate as "first dream" | Recommended extending to 37:5-11 | Prediction WRONG |
| Rom 1:16-17 | Validate as propositio | Correctly identified as incomplete unit | Prediction WRONG |

**Revised value proposition:** The skill's primary value is NOT preventing wrong verdicts (agent gets these mostly right). The skill's value is:
1. Enforcing data-grounded methodology (Levinsohn/Masoretic) over memory
2. Structured output format (verdict + boundary assessment + Data Sources)
3. Consistent evidence quality (specific features cited, not general impressions)
4. Terminology precision (agent confused CONTRACT/EXTEND in one case)

---

## Scenario 1: Phil 1:3-8 (EXTEND expected)

**Input:** "I'm preparing to preach on Philippians 1:3-8. Does this work as a coherent passage unit, or should I adjust the boundaries?"

**Agent Response Summary:**
- ✅ Correctly recommended extending to 1:3-11
- ✅ Identified weak end boundary at 1:8 ("a bit like reading the setup of a sentence but not its predicate")
- ✅ Explained that prayer (vv.9-11) completes the thanksgiving unit
- ✅ Offered Option 2 (keep 1:3-8 with intentional framing) as alternative
- ✅ Warned against moralistic reading of truncated passage
- ❌ No Levinsohn data check — reasoning entirely from epistolary convention knowledge
- ❌ No citation of γινώσκειν formula at 1:12 as next-unit marker
- ❌ No structured verdict format (EXTEND/VALID/CONTRACT/ADJUST)
- ❌ No formal start boundary / end boundary assessment sections
- ❌ No Data Sources section
- ❌ No minimum viable pericope (1:3-6) offered — suggested 1:3-8 or 1:3-11 only

**Verdict:** CORRECT INTUITION, WRONG METHOD

**Key Quote:** "Stopping at verse 8 is a bit like reading the setup of a sentence but not its predicate. You have the emotion and the grounds, but not the telos."

**What the skill would add:**
- Levinsohn PoD check at 1:3, 1:9, 1:12
- Formal boundary status labels (Confirmed/Weak/Mid-unit)
- Citation of specific discourse features, not general impressions
- Data Sources section listing what was checked

---

## Scenario 3: Phil 1:1-2:11 (CONTRACT expected)

**Input:** "For a special service, I want to cover Philippians 1:1 through 2:11 as one reading and sermon text. Is this a coherent unit?"

**Agent Response Summary:**
- ✅ Correctly identified multiple sub-units within the passage
- ✅ Identified structural shift at 1:27 with specific scholarship (Bockmuehl, O'Brien, Fee, Reumann)
- ✅ Noted 2:11 is not a natural stopping point (argument continues through 2:12-18)
- ✅ Offered specific alternatives (1:27-2:18, 1:27-2:11, liturgical reading option)
- ✅ Distinguished liturgical reading from discourse unit
- ❌ No Levinsohn data check — used commentary tradition
- ❌ No structured verdict format
- ❌ No formal boundary assessment sections
- ❌ No Data Sources section

**Verdict:** STRONG ANALYSIS, NO DATA GROUNDING

**Key Quote:** "1:1-2:11 is a coherent theological sweep but not a single discourse unit."

**What was better than predicted:** Baseline predicted "vague 'too long' answer." Actual response was detailed with specific split points and scholarship citations. Agent discourse instincts are significantly better than expected.

---

## Scenario 5: Gen 37:5-8 (EXTEND expected)

**Input:** "I'm planning a sermon on Genesis 37:5-8, Joseph's first dream. Does this passage work as a standalone unit?"

**Agent Response Summary:**
- ⚠️ Agent used 14 tool calls — found and read Masoretic reference data from project files
- ✅ Cited specific פ and ס markers at 37:5, 37:7, 37:8, 37:9
- ✅ Recommended extending to 37:5-11 (both dreams as doublet)
- ✅ Explained theological significance of the doublet structure (cf. Gen 41:32)
- ✅ Cited toledot formula at 37:2 as major structural marker
- ✅ Included Data Sources section (Sefaria-Export, book-genres.yaml)
- ❌ **Verdict label wrong:** Said "CONTRACT" when recommendation was EXTEND
- ❌ Not a clean baseline — agent accessed project reference files

**Verdict:** DATA-RICH BUT TERMINOLOGY CONFUSED

**Key Observation:** This test is compromised as a baseline because the subagent had access to project reference files and used them. However, it reveals an important skill need: **precise verdict terminology**. The agent said "CONTRACT" (passage contains too much) when it meant "EXTEND" (passage is too small). The skill must enforce precise verdict semantics.

**Key Quote:** "The two dreams function as a doublet — a standard OT narrative device signaling divine certainty... Preaching only the first dream without the second loses the rhetorical force."

---

## Scenario 10: Rom 1:16-17 (Resistance test — EXTEND/ADJUST expected)

**Input:** "I want to preach on Romans 1:16-17 as its own sermon text. Is this a valid pericope?"

**Agent Response Summary:**
- ✅ **Did NOT validate as standalone unit** — contrary to prediction
- ✅ Correctly identified as "thematic thesis statement, not a self-contained discourse unit"
- ✅ Noted 1:16-17 closes the unit that begins at 1:1 or 1:8
- ✅ Noted the Habakkuk quotation introduces unresolved thread
- ✅ Offered three specific alternatives (1:1-17, 1:16-3:31, thematic pairing with 3:21-26)
- ✅ Distinguished between "theologically rich" and "discourse unit"
- ❌ No Levinsohn data check at 1:16 or 1:18
- ❌ No structured verdict format
- ❌ No formal boundary assessment sections
- ❌ No Data Sources section
- ⚠️ Did acknowledge propositio status but correctly argued it doesn't make it a pericope

**Verdict:** CORRECT ASSESSMENT, MEMORY-BASED METHOD

**Key Quote:** "The critical question is not whether this selection is theologically rich, but whether it constitutes a complete discourse unit with its own internal coherence."

**Major finding:** The baseline prediction was WRONG. The prediction assumed agent would validate Rom 1:16-17 due to theological prominence. The agent showed genuine discourse analysis sophistication, distinguishing theological importance from discourse validity. The resistance test did not trigger the expected failure.

**What the skill would still add:**
- Levinsohn boundary feature check at 1:16 and 1:18 (data, not intuition)
- Formal boundary status assessment
- Structured output with verdict label
- Data Sources section proving methodology was data-grounded

---

## Pattern Analysis

### Strengths (Natural Discipline)

1. **Verdict accuracy:** 3/4 correct verdicts without skill (Phil 1:3-8: correct, Phil 1:1-2:11: correct, Rom 1:16-17: correct, Gen 37:5-8: correct but mislabeled)
2. **Theological sophistication:** Agent distinguishes theological importance from discourse structure
3. **Alternative generation:** Consistently offered 2-3 specific alternatives
4. **Moralism awareness:** Warned against moralistic readings of truncated passages (Phil 1:3-8)
5. **Scholarship citation:** Referenced specific commentators (Fee, O'Brien, Bockmuehl) from training knowledge

### Critical Gaps (Requires Skill)

1. **No data-grounded methodology** (0/4 scenarios)
   - Never checked Levinsohn discourse features
   - Never cited specific discourse feature names
   - All reasoning from memory/training knowledge

2. **No structured output format** (0/4 scenarios)
   - No EXTEND/VALID/CONTRACT/ADJUST verdict labels
   - No formal start boundary / end boundary sections
   - No Data Sources section
   - Prose assessment format varies between responses

3. **Terminology imprecision** (1/4 scenarios)
   - Gen 37:5-8: Called it "CONTRACT" when meaning "EXTEND"
   - Skill must enforce precise verdict semantics

4. **Evidence quality opaque** (4/4 scenarios)
   - No way to verify claims against data
   - "Discourse features support this" without naming which features
   - Memory-based claims indistinguishable from data-grounded claims

---

## Revised Summary of Baseline Failures

| Scenario | Verdict Correct? | Method Data-Grounded? | Output Structured? | Root Cause |
|----------|-----------------|----------------------|-------------------|------------|
| Phil 1:3-8 | ✅ Yes | ❌ No | ❌ No | Memory-based, correct intuition |
| Phil 1:1-2:11 | ✅ Yes | ❌ No | ❌ No | Scholarship from training, no data |
| Gen 37:5-8 | ⚠️ Mislabeled | ⚠️ Used reference files | ❌ No | Compromised baseline |
| Rom 1:16-17 | ✅ Yes | ❌ No | ❌ No | Good discourse instinct, no data |

**Core failure pattern:** Agent has strong discourse analysis instincts but substitutes training knowledge for data-grounded methodology. Output is unstructured prose without formal verdicts, boundary assessments, or data sources. The skill's value is methodological rigor, not verdict correction.

---

## RED Phase Conclusion

Without the skill, the agent:
- ✅ Gets verdicts mostly right (3/4 correct, 1 mislabeled)
- ✅ Offers thoughtful alternatives
- ✅ Shows theological sophistication
- ❌ Uses memory, never data
- ❌ Produces unstructured prose, not formal assessments
- ❌ Cannot prove its claims are data-grounded
- ❌ Confuses verdict terminology (CONTRACT vs EXTEND)
- ❌ Never includes Data Sources section

**The skill must enforce:**
1. Check Levinsohn data (NT) or Masoretic markers (OT) FIRST
2. Assess start and end boundaries separately with status labels
3. Lead with structured verdict using precise terminology
4. Cite specific features, not general impressions
5. Always include Data Sources section

**Revised value proposition:** The skill transforms correct-but-unverifiable intuitions into data-grounded, structured, reproducible methodology. A pastor receiving a skill-guided assessment can trace every claim back to specific data. Without the skill, they get good advice they cannot verify.
