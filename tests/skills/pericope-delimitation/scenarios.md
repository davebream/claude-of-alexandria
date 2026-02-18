# Pericope Delimitation Skill - Test Scenarios

## Overview

This skill validates whether a user-provided passage constitutes a coherent discourse unit
and recommends extensions/contractions based on linguistic evidence.

**Testing approach:**
1. **Boundary scenarios** - Test start/end boundary detection
2. **Verdict scenarios** - Test VALID / EXTEND / CONTRACT / ADJUST outputs
3. **Evidence scenarios** - Test correct use of Levinsohn/Masoretic/genre data
4. **Resistance scenarios** - Test that agent uses data, not memory

---

## Scenario 1: Truncated NT Pericope (EXTEND)

**Setup:**
```
/pericope-delimitation Phil 1:3-8
```

**Expected Verdict:** EXTEND to Phil 1:3-11

**Why it must pass:**
- Phil 1:3-8 ends mid-argument: the thanksgiving (v.3-6) is followed by grounds (v.7-8) but the prayer request (v.9-11) completes the unit
- Levinsohn: No discourse discontinuity between 1:8 and 1:9
- Epistolary convention: εὐχαριστῶ...ἐπιτελέσει...καρπὸν δικαιοσύνης is a single rhetorical movement

**What to watch for:**
- Does agent correctly identify weak end boundary at 1:8?
- Does agent recommend extension to 1:3-11 specifically?
- Does agent cite Levinsohn data (not just memory) for continuity at 1:9?
- Does agent cite epistolary genre conventions?
- Does agent offer alternative (minimum viable pericope = 1:3-6)?

**Expected WITHOUT skill:** Agent may validate 1:3-8 or give vague extension advice.

**Expected WITH skill:** EXTEND verdict with specific Levinsohn evidence and verse citation.

---

## Scenario 2: Valid NT Pericope (VALID)

**Setup:**
```
/pericope-delimitation Phil 1:1-11
```

**Expected Verdict:** VALID (thanksgiving-prayer period)

**Why it must pass:**
- Phil 1:1-11 = complete epistolary unit (salutation + thanksgiving + prayer)
- Confirmed start: epistolary openings are standard
- Confirmed end: καρπὸν δικαιοσύνης completes the prayer unit
- Levinsohn: Disclosure formula γινώσκειν at 1:12 marks NEXT unit

**What to watch for:**
- Does agent correctly identify confirmed start and end boundaries?
- Does agent cite the γινώσκειν formula at 1:12 as next-unit marker?
- Does agent identify this as the complete thanksgiving-prayer period?

---

## Scenario 3: Over-Extended NT Passage (CONTRACT)

**Setup:**
```
/pericope-delimitation Phil 1:1-2:11
```

**Expected Verdict:** CONTRACT — split at Phil 1:27 or 2:1

**Why it must pass:**
- Phil 1:1-2:11 spans at minimum two major units:
  - 1:1-11: Salutation + thanksgiving-prayer
  - 1:12-26: Timothy's situation / Paul's chains
  - 1:27-2:11: Paraenesis beginning (Εὐχαριστῶ pattern ends, conduct command begins)
- Levinsohn: Situated change of theme marker at 1:27

**What to watch for:**
- Does agent identify multiple units within the passage?
- Does agent suggest specific split point(s)?
- Does agent explain what discourse features mark the boundaries?

---

## Scenario 4: Valid OT Narrative Pericope (VALID or MINOR ADJUST)

**Setup:**
```
/pericope-delimitation Genesis 37:2-11
```

**Expected Verdict:** VALID (Joseph's dreams unit)

**Why it must pass:**
- Gen 37:2 opens with toledot formula (אֵלֶּה תּוֹלְדוֹת) - major structural marker
- Two dreams (37:5-7, 37:9-10) form complete unit
- 37:11 closes with summary (brothers were jealous)
- Masoretic: פ marker confirms break after 37:1 (checking data)

**What to watch for:**
- Does agent identify the toledot formula as structural opener?
- Does agent consult Masoretic data for Gen 37?
- Does agent identify the two-dream structure as a complete unit?

---

## Scenario 5: First Dream Sub-Unit (VALID by data)

**Setup:**
```
/pericope-delimitation Genesis 37:5-8
```

**Expected Verdict:** VALID (first dream episode is a Masoretic sub-unit)

**Why:** Masoretic data shows both פ and ס at 37:5 AND 37:8, with פ at 37:9 confirming next unit. The first dream + brothers' reaction (37:5-8) is a data-confirmed sub-unit within the larger toledot section.

**What to watch for:**
- Does agent check Masoretic data and find markers at 37:5 and 37:8?
- Does agent note that 37:5-11 (both dreams) is available for broader study?
- Does agent identify the toledot formula at 37:2 as macro-structural frame?
- Does agent note the internal setumah at 37:7?

**Note:** Original prediction assumed no marker at 37:5. Data proves otherwise. Updated after GREEN phase testing.

---

## Scenario 6: Cross-Unit OT Passage (CONTRACT)

**Setup:**
```
/pericope-delimitation Genesis 37:1-38:30
```

**Expected Verdict:** CONTRACT — separate at 38:1 (Tamar episode is interpolation)

**Why it must pass:**
- Gen 38 is the Judah-Tamar interpolation between Joseph scenes
- Masoretic: פ marker likely present at 38:1
- Narrative resumption formula at 39:1 explicitly restarts Joseph story
- Teaching these as a single unit distorts both narratives

**What to watch for:**
- Does agent identify Gen 38 as a structurally distinct unit?
- Does agent cite the narrative resumption at 39:1?
- Does agent check Masoretic data for markers between 37 and 39?

---

## Scenario 7: Single Verse (EXTEND)

**Setup:**
```
/pericope-delimitation John 3:16
```

**Expected Verdict:** EXTEND — minimum unit is 3:1-21 (Nicodemus discourse) or 3:14-21 (discourse climax)

**Why it must pass:**
- John 3:16 is embedded in the Nicodemus dialogue
- No discourse boundary at 3:16 — it's mid-argument
- Johannine discourse structure requires larger unit

**What to watch for:**
- Does agent recognize a single verse cannot be a pericope in discourse terms?
- Does agent recommend minimum viable unit?
- Does agent cite the discourse context?

---

## Scenario 8: Micro-Book Whole Letter (VALID)

**Setup:**
```
/pericope-delimitation Philemon 1-25
```

**Expected Verdict:** VALID — entire letter is a single rhetorical unit

**Why it must pass:**
- Philemon is a single, tightly integrated letter
- All parts serve one purpose: appeal for Onesimus
- Standard epistolary structure: opening-body-closing

**What to watch for:**
- Does agent correctly identify entire letter as valid unit?
- Does agent identify the rhetorical unity?

---

## Scenario 9: Tightly Integrated Multi-Chapter NT Passage (VALID with sub-units)

**Setup:**
```
/pericope-delimitation Romans 9:1-11:36
```

**Expected Verdict:** VALID as a unit, with offer of sub-units for study

**Why it must pass:**
- Rom 9-11 is the Israel argument — a single sustained argument
- Begins with Paul's anguish (9:1-5), ends with doxology (11:33-36)
- Can be divided into sub-units but functions as one unit

**What to watch for:**
- Does agent validate the three-chapter unit?
- Does agent offer sub-units for practical teaching purposes?
- Does agent identify the doxology as closing marker?

---

## Scenario 10: Resistance Test — Agent Uses Data, Not Memory

**Setup:**
```
/pericope-delimitation Romans 1:16-17
```

**Resistance test:** Rom 1:16-17 is famously the "thesis statement." An agent using memory might validate this as a standalone unit because it's often cited as the propositio of Romans.

**Expected behavior WITH skill:**
- Agent checks Levinsohn data for discourse features at 1:16-17
- Agent checks if any boundary markers exist at 1:16 or 1:18
- Agent should find these verses are embedded in the letter opening (1:1-17) or mark the transition into the body
- Result: EXTEND or ADJUST with specific evidence

**What to watch for:**
- Does agent say "1:16-17 is the thesis/propositio" without checking data?
- Does agent check Levinsohn for boundary features?
- Does agent note that 1:18 begins the body without marking 1:16 as pericope start?

---

## Evidence Quality Scenarios

### Scenario 11: Citation Quality Check

For any scenario, the assessment must:
- Cite specific Levinsohn feature names (not just "discourse features")
- Cite specific Masoretic marker types (פ/ס, not just "ancient markers")
- Cite specific verse references for evidence
- Note when data is absent (e.g., "no Masoretic marker at X:Y")
- Distinguish between confirmed and inferred boundaries

### Scenario 12: Alternative Path When Data Is Sparse

**Setup:**
```
/pericope-delimitation Revelation 4:1-11
```

**Challenge:** Levinsohn data may have limited coverage of Revelation.

**Expected behavior:**
- Agent notes limited discourse data for Revelation
- Agent uses genre-specific markers (vision narrative, heavenly scene changes)
- Agent explicitly distinguishes evidence tiers: "Data-confirmed" vs "Genre-inferred"

---

## Success Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 1 (Phil 1:3-8) | EXTEND verdict; cites 1:12 γινώσκειν; recommends 1:3-11; offers 1:3-6 minimum |
| 2 (Phil 1:1-11) | VALID verdict; confirmed start and end; cites 1:12 as next-unit marker |
| 3 (Phil 1:1-2:11) | CONTRACT verdict; specific split point at 1:27 or 2:1 |
| 4 (Gen 37:2-11) | VALID; cites toledot formula; checks Masoretic data |
| 5 (Gen 37:5-8) | VALID; cites Masoretic markers at 37:5 and 37:8; notes 37:5-11 for broader study |
| 6 (Gen 37:1-38:30) | CONTRACT at 38:1; notes Tamar interpolation; cites 39:1 resumption |
| 7 (John 3:16) | EXTEND; explains single verse cannot be discourse unit |
| 8 (Philemon 1-25) | VALID; identifies rhetorical unity of whole letter |
| 9 (Rom 9:1-11:36) | VALID with sub-units offered; identifies doxology as closing |
| 10 (Rom 1:16-17) | EXTEND/ADJUST; checks Levinsohn data; doesn't rely on memory |

---

## Rationalization Patterns to Watch For

| Excuse | Why It's Wrong |
|--------|----------------|
| "1:16-17 is the propositio so it's a valid unit" | Memory overrides data — must check Levinsohn |
| "Any passage can be preached" | Pericope validity is a linguistic category, not preference |
| "The user chose these verses" | User choices don't override discourse structure |
| "It's a well-known passage" | Famous passages may still be mid-discourse |
| "Close enough to a boundary" | Weak boundaries must be stated, not rounded up |
| "I'll just note the issue" | Noting a structural problem doesn't validate the passage |
