# Pericope Delimitation Skill - Verification (GREEN Phase)

## Test Conditions

**Agent:** Claude with pericope-delimitation SKILL.md loaded
**Date:** 2026-02-18
**Purpose:** Document that skill produces correct, data-grounded outputs

---

## Scenario 1: Phil 1:3-8 (EXTEND)

**Input:** `/pericope-delimitation Phil 1:3-8`

**Verification criteria:**
- ✅ Verdict is EXTEND (not VALID)
- ✅ Recommends extension to 1:3-11 specifically
- ✅ Start boundary 1:3 marked as Confirmed with epistolary evidence
- ✅ End boundary 1:8 marked as Weak with specific reasoning
- ✅ Cites γινώσκειν at 1:12 as next-unit confirmation
- ✅ References Levinsohn data (not just "discourse features" generally)
- ✅ Offers minimum viable pericope (1:3-6)
- ✅ Includes Data Sources section

**Expected output structure:**
```markdown
## Pericope Assessment: Philippians 1:3-8

**Verdict:** EXTEND to 1:3-11

### Start Boundary (1:3)
**Status:** Confirmed
- [epistolary evidence]
- [Levinsohn data reference]

### End Boundary (1:8)
**Status:** Weak — mid-argument
- [no boundary feature at 1:9]
- [γινώσκειν at 1:12 confirms next unit starts there]

### Recommendation
[extend to 1:3-11 with reasoning]
[minimum viable pericope: 1:3-6]

### Data Sources
- Levinsohn GNT Discourse Features: [specific features checked]
- Genre: Epistle
```

**Pass/Fail:** PASS if all 8 criteria met, FAIL if any are absent.

---

## Scenario 2: Phil 1:1-11 (VALID)

**Input:** `/pericope-delimitation Phil 1:1-11`

**Verification criteria:**
- ✅ Verdict is VALID
- ✅ Both boundaries marked as Confirmed
- ✅ Cites discourse evidence for why 1:12 begins new section
- ✅ Identifies this as thanksgiving-prayer period
- ✅ Does NOT recommend changes
- ✅ Includes Data Sources

**Pass criteria:** Correct verdict with data evidence.

---

## Scenario 3: Phil 1:1-2:11 (CONTRACT)

**Input:** `/pericope-delimitation Phil 1:1-2:11`

**Verification criteria:**
- ✅ Verdict is CONTRACT
- ✅ Identifies specific split point(s)
- ✅ Names at least one Levinsohn feature marking the internal boundary
- ✅ Explains what each resulting unit covers
- ✅ Includes Data Sources

---

## Scenario 5: Gen 37:5-8 (EXTEND)

**Input:** `/pericope-delimitation Genesis 37:5-8`

**Verification criteria:**
- ✅ Verdict is EXTEND (not VALID)
- ✅ Recommends extending to 37:2-11 (or at minimum 37:3)
- ✅ Notes that 37:5 lacks a Masoretic boundary marker
- ✅ Identifies the toledot formula at 37:2 as natural start
- ✅ Checks Masoretic data explicitly (not just "narrative conventions")
- ✅ Includes Data Sources with Masoretic reference

---

## Scenario 10: Rom 1:16-17 (Resistance test)

**Input:** `/pericope-delimitation Romans 1:16-17`

**Verification criteria:**
- ✅ Does NOT say "1:16-17 is the thesis/propositio and therefore a valid unit"
- ✅ Checks Levinsohn data for boundary features at 1:16 and 1:18
- ✅ Notes that 1:18 begins new argumentative movement
- ✅ Recommends EXTEND or ADJUST to include appropriate context
- ✅ Does not rely on theological prominence as evidence

**Critical check:** This scenario specifically tests that the skill prevents memory-based validation.

---

## Format Compliance Checks

For ALL scenarios, verify:

| Check | Requirement |
|-------|-------------|
| Verdict line present | Must be first content after passage header |
| Start Boundary section | Must have Status label (Confirmed/Weak/Mid-unit) |
| End Boundary section | Must have Status label |
| Evidence items | Must cite specific feature names, not general "discourse features" |
| Recommendation | Must give specific verse range |
| Data Sources | Must list what was checked, not just what was found |
| Missing markers | Explicitly noted (e.g., "No Masoretic marker at 37:5") |

---

## Evidence Quality Standards

**Passing evidence (specific):**
- "Levinsohn: Referential PoD at Phil 1:3 signals new section"
- "γινώσκειν (1:12) = standard Pauline disclosure formula confirming next unit"
- "פ at Gen 39:1 confirms boundary; no marker at 38:1"
- "Toledot formula at Gen 37:2 (אֵלֶּה תּוֹלְדוֹת) = structural opener"

**Failing evidence (vague):**
- "This is a natural section break" (no data)
- "Discourse features support this boundary" (no specifics)
- "Ancient manuscripts confirm this division" (no marker cited)
- "Scholars commonly divide here" (memory/tradition, not data)

---

## Regression Checks

The following scenarios from biblical-segmentation skill must NOT be broken:

1. **Genre identification:** Pericope-delimitation uses book-genres.yaml — same data source. Must give correct genre for books already tested in biblical-segmentation.

2. **Masoretic data format:** Must use same masoretic JSON structure. A Genesis check must reference the `genesis.json` format correctly.

3. **Levinsohn data format:** Must reference levinsohn JSON files by their actual feature names (e.g., `Referential_PoD`, not "Point of Departure signal").

---

## Overall GREEN Phase Pass Criteria

The skill passes if:
1. Scenarios 1-3, 5, 10 produce correct verdicts
2. All verdicts include data-grounded evidence (not memory)
3. All outputs include Data Sources section
4. Scenario 10 (resistance test) does NOT validate Rom 1:16-17 from memory
5. OT scenarios correctly check Masoretic data
6. NT scenarios correctly check Levinsohn data

**Minimum acceptable:** Scenarios 1, 2, and 10 must pass.
Scenarios 1 and 10 together verify the core skill behavior:
- EXTEND verdict with evidence (Sc. 1)
- Memory-resistance (Sc. 10)
