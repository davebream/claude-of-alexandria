# Pericope Delimitation Skill - Verification (GREEN Phase)

## Test Conditions

**Agent:** Claude (Sonnet) with pericope-delimitation SKILL.md loaded
**Date:** 2026-02-18
**Method:** Subagent execution with skill as context, file access to reference data, web search disabled
**Purpose:** Verify that skill produces correct, data-grounded, structured outputs

---

## Results Summary

| Scenario | Expected | Actual | Verdict Correct? | Data-Grounded? | Structured? | Data Sources? | Result |
|----------|----------|--------|-----------------|----------------|-------------|---------------|--------|
| 1 (Phil 1:3-8) | EXTEND | EXTEND to 1:3-11 | ✅ | ✅ | ✅ | ✅ | **PASS** (8/8) |
| 2 (Phil 1:1-11) | VALID | VALID | ✅ | ✅ | ✅ | ✅ | **PASS** (6/6) |
| 3 (Phil 1:1-2:11) | CONTRACT | CONTRACT | ✅ | ✅ | ✅ | ✅ | **PASS** (5/5) |
| 5 (Gen 37:5-8) | EXTEND | VALID | ⚠️ See below | ✅ | ✅ | ✅ | **DATA-CORRECT** |
| 10 (Rom 1:16-17) | EXTEND/ADJUST | EXTEND to 1:8-17 | ✅ | ✅ | ✅ | ✅ | **PASS** (5/5) |

**Minimum acceptable (Sc 1, 2, 10): ALL PASS**
**Full set: 4/5 PASS, 1 data-correct deviation**

---

## Scenario 1: Phil 1:3-8 (EXTEND)

**Input:** `/pericope-delimitation Phil 1:3-8`

**Actual verdict:** EXTEND to 1:3-11

**Verification criteria:**
- ✅ Verdict is EXTEND (not VALID)
- ✅ Recommends extension to 1:3-11 specifically
- ✅ Start boundary 1:3 marked as Confirmed — cited εὐχαριστῶ formula and noted Referential PoD at 1:6 and Situational PoD at 1:4 as internal features
- ✅ End boundary 1:8 marked as Weak (mid-argument) — noted no PoD at 1:9, Cataphoric Focus tying 1:9 back to thanksgiving
- ✅ Cites γινώσκειν at 1:12 as Focus+ confirming next-unit onset
- ✅ References specific Levinsohn features: Referential_PoD, Situational_PoD, Cataphoric_Focus, Focus+, Over-encoding (checked, none found)
- ✅ Offers minimum viable pericope 1:3-6
- ✅ Data Sources section lists all features checked with verse references

**Evidence quality:** Specific feature names cited at specific verses. No vague "discourse features support this" language. Explicitly noted absence of features at 1:9.

**Key quote:** "The boundary at 1:12 is positively confirmed by both the disclosure formula ginoskein (Focus+ at 1:12) and Referential PoD (ta kat' eme at 1:12). This is the standard Pauline signal for new section onset."

**Result: PASS (8/8)**

---

## Scenario 2: Phil 1:1-11 (VALID)

**Input:** `/pericope-delimitation Phil 1:1-11`

**Actual verdict:** VALID

**Verification criteria:**
- ✅ Verdict is VALID
- ✅ Both boundaries marked as Confirmed — Start: epistolary prescriptio + Main clause at 1:1. End: Referential PoD + Focus+ (γινώσκειν) at 1:12 confirms next unit
- ✅ Cites discourse evidence for 1:12 boundary: Referential PoD (τὰ κατ' ἐμὲ) and Focus+ (γινώσκειν) at 1:12
- ✅ Identifies this as thanksgiving-prayer period with complete rhetorical arc
- ✅ Does NOT recommend changes — offers shorter option (1:3-11) if context requires but affirms 1:1-11 as preferable
- ✅ Data Sources section lists: Referential_PoD (1:6, 1:9, 1:12), Situational_PoD (1:4, 1:7), Over-encoding (none), Main_clauses (1:1, 1:3, 1:11, 1:12), Focus+ (1:2, 1:12)

**Evidence quality:** Internal features (PoDs at 1:6, 1:9) correctly identified as sub-movements within the unit, not independent boundaries. Agent explicitly distinguished internal articulation from section breaks.

**Key quote:** "These internal features confirm the passage has internal articulation (sub-units within a larger unit) but do not warrant contraction, because they all serve the single rhetorical movement of thanksgiving-to-prayer."

**Result: PASS (6/6)**

---

## Scenario 3: Phil 1:1-2:11 (CONTRACT)

**Input:** `/pericope-delimitation Phil 1:1-2:11`

**Actual verdict:** CONTRACT — passage contains at least four distinct discourse units

**Verification criteria:**
- ✅ Verdict is CONTRACT
- ✅ Identifies 5 specific sub-units with split points: 1:1-2 (prescriptio), 1:3-11 (thanksgiving-prayer), 1:12-26 (Paul's circumstances), 1:27-2:4 (exhortation), 2:5-11 (Christ hymn)
- ✅ Names Levinsohn features at each boundary: Ref PoD at 1:12 (τὰ κατ' ἐμὲ), Sit PoD at 1:27 (εἴτε ἐλθών), Sit PoD at 2:12 (καθὼς πάντοτε)
- ✅ Explains each unit with table format: range, unit name, key boundary evidence
- ✅ Data Sources section lists all Referential_PoD and Situational_PoD entries for Phil 1-2, Over-encoding (none), genre

**Evidence quality:** Exceptionally detailed. Every internal boundary backed by specific Levinsohn feature names at specific verses. Offered strongest single-pericope alternatives (1:27-2:11 or 1:3-11) if user needs a larger unit.

**Key quote:** "Do not treat 1:1-2:11 as a single pericope. This range spans the entire first movement of Philippians — from letter opening through christological climax."

**Result: PASS (5/5)**

---

## Scenario 5: Gen 37:5-8 (Data-Correct Deviation)

**Input:** `/pericope-delimitation Genesis 37:5-8`

**Expected verdict:** EXTEND to 37:2-11
**Actual verdict:** VALID

**What happened:** The scenario predicted that 37:5 lacks a Masoretic boundary marker. The actual data shows:
- פ (petucha) AND ס (setumah) at 37:5 — double-marked boundary
- פ (petucha) AND ס (setumah) at 37:8 — double-marked boundary
- פ at 37:9 confirms next unit begins there

The agent correctly followed Rule 1 (Data First, Memory Last) and found both boundaries confirmed by Masoretic markers. It returned VALID because the data supports 37:5-8 as a coherent sub-unit (first dream + brothers' reaction).

**Original scenario criteria vs actual results:**
- ❌ Verdict is EXTEND — agent returned VALID (but correctly based on data)
- ❌ Recommends extending to 37:2-11 — agent said 37:5-11 captures both dreams but 37:5-8 is independently valid
- ❌ Notes that 37:5 lacks a Masoretic marker — 37:5 HAS markers (scenario prediction was wrong)
- ✅ Identifies toledot formula at 37:2 as macro-structural frame
- ✅ Checks Masoretic data explicitly — cited specific markers at 37:5, 37:7, 37:8, 37:9
- ✅ Data Sources section with Masoretic reference

**Assessment:** The scenario's prediction was wrong, not the skill's behavior. The skill did exactly what it should: checked the data, found confirmed boundaries, returned VALID. This is Rule 1 working correctly. The scenarios.md should be updated to reflect that 37:5 has Masoretic markers.

**Key quote:** "If a broader study is intended, 37:5-11 captures both dreams as a pair. But 37:5-8 is independently valid as the first dream episode."

**Result: DATA-CORRECT DEVIATION — scenario prediction wrong, skill behavior correct**

---

## Scenario 10: Rom 1:16-17 (Resistance Test)

**Input:** `/pericope-delimitation Romans 1:16-17`

**Actual verdict:** EXTEND to 1:8-17 (or minimally 1:15-17)

**Verification criteria:**
- ✅ Does NOT say "1:16-17 is the thesis/propositio and therefore a valid unit" — explicitly rejects this: "The theological fame of 1:16-17 as 'the thesis of Romans' is a commentary convention, not a discourse-structural reality"
- ✅ Checks Levinsohn data: Referential_PoD at 1:8, 1:17, 1:19 (not 1:16); Situational_PoD at 1:8, 1:10, 1:15 (not 1:16, 1:17, 1:18); Over-encoding (none for Rom 1); Historical_Present (none); Reported_Speech (none)
- ✅ Notes 1:18 begins new argumentative movement: "ἀποκαλύπτεται γὰρ ὀργὴ θεοῦ — the revelation of God's wrath against ungodliness"
- ✅ Recommends EXTEND to 1:8-17 (full thanksgiving-body opening) or 1:15-17 (minimum)
- ✅ Does not rely on theological prominence — explicitly: "The Levinsohn data shows no boundary signal at 1:16"

**Start boundary analysis:** Correctly identified 1:16 as Mid-unit. Key evidence: "No Referential PoD at 1:16. No Situational PoD at 1:16. The verse begins with Οὐ γὰρ ἐπαισχύνομαι — the conjunction γάρ signals a continuation or grounding clause, not a new discourse unit."

**End boundary analysis:** Correctly identified 1:17 end as Confirmed. Key evidence: Referential PoD at 1:19 (τὸ γνωστὸν τοῦ θεοῦ) signals new subject at 1:18-19.

**Evidence quality:** Five Levinsohn feature categories checked (Referential_PoD, Situational_PoD, Over-encoding, Historical_Present, Reported_Speech). Absence of features at 1:16 explicitly noted. The γάρ-chain argument is specific and verifiable.

**Key quote:** "Starting at 1:16 severs a causal chain: 1:16 begins with γάρ ('for'), explicitly grounding the clause in what precedes it. A γάρ clause without its anchor is a fragment, not a unit."

**Result: PASS (5/5)**

---

## Format Compliance Checks

| Check | Sc 1 | Sc 2 | Sc 3 | Sc 5 | Sc 10 |
|-------|------|------|------|------|-------|
| Verdict line first | ✅ | ✅ | ✅ | ✅ | ✅ |
| Start Boundary with Status | ✅ Confirmed | ✅ Confirmed | ✅ Confirmed | ✅ Confirmed | ✅ Mid-unit |
| End Boundary with Status | ✅ Weak | ✅ Confirmed | ✅ Confirmed | ✅ Confirmed | ✅ Confirmed |
| Specific feature names | ✅ | ✅ | ✅ | ✅ | ✅ |
| Specific verse range in recommendation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Data Sources section | ✅ | ✅ | ✅ | ✅ | ✅ |
| Missing markers noted | ✅ (no PoD at 1:9) | N/A | N/A | N/A | ✅ (no PoD at 1:16) |

---

## Evidence Quality Assessment

**All scenarios used specific evidence (passing standard):**
- "Levinsohn: Referential PoD at Phil 1:12 (τὰ κατ' ἐμὲ) — confirms next section onset"
- "Focus+ at 1:12 (γινώσκειν) — disclosure formula confirming new unit"
- "Masoretic: petucha (פ) confirmed at 37:5 and 37:8; setumah (ס) confirmed at 37:5, 37:7, 37:8"
- "No Referential PoD at 1:16. No Situational PoD at 1:16."

**No scenarios used vague evidence (failing standard):**
- No "this is a natural section break"
- No "discourse features support this boundary"
- No "scholars commonly divide here"
- No unattributed memory claims

---

## Baseline Comparison

| Gap identified in RED phase | Fixed in GREEN? |
|-----------------------------|----------------|
| No data-grounded methodology (0/4 baseline scenarios) | ✅ All 5 scenarios checked Levinsohn/Masoretic data |
| No structured output format (0/4 baseline) | ✅ All 5 follow Verdict → Boundaries → Recommendation → Data Sources |
| Terminology imprecision (baseline: CONTRACT vs EXTEND confused) | ✅ All verdicts use correct terminology |
| Evidence quality opaque (4/4 baseline) | ✅ Specific feature names at specific verses throughout |
| No Data Sources section (0/4 baseline) | ✅ All 5 include Data Sources |

---

## Regression Checks

1. **Genre identification:** All scenarios correctly identified genre from book-genres.yaml (philippians = epistle, genesis = ot_narrative, romans = epistle) ✅
2. **Masoretic data format:** Scenario 5 correctly parsed genesis.json petuchot and setumot arrays ✅
3. **Levinsohn data format:** All NT scenarios referenced feature names matching JSON filenames (Referential_PoD, Situational_PoD, Focus+, Cataphoric_Focus, Over-encoding, Main_clauses, Historical_Present, Reported_Speech) ✅

---

## Scenarios.md Correction Needed

Scenario 5 (Gen 37:5-8) predicted "No Masoretic boundary marker at 37:5." The actual data shows both פ and ס at 37:5. The scenario should be updated to reflect this. The expected verdict should change from EXTEND to VALID (with note that 37:5-11 captures both dreams for broader study).

---

## Overall GREEN Phase Assessment

**The skill passes.**

1. ✅ Scenarios 1-3 and 10 produce correct verdicts
2. ✅ All verdicts include data-grounded evidence
3. ✅ All outputs include Data Sources section
4. ✅ Scenario 10 does NOT validate Rom 1:16-17 from memory
5. ✅ OT scenario correctly checks Masoretic data
6. ✅ NT scenarios correctly check Levinsohn data
7. ⚠️ Scenario 5 verdict differs from prediction but is data-correct

**Minimum acceptable (Sc 1, 2, 10): ALL PASS**

The skill transforms memory-based intuitions into data-grounded, structured, verifiable assessments. Every claim can be traced to a specific Levinsohn feature or Masoretic marker. The resistance test (Sc 10) confirms the skill prevents the most important failure mode: validating famous passages based on theological prominence rather than discourse data.
