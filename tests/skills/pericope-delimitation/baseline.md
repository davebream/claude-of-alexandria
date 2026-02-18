# Pericope Delimitation Skill - Baseline (RED Phase)

## Test Conditions

**Agent:** Claude without pericope-delimitation skill loaded
**Date:** 2026-02-18
**Purpose:** Document failure modes before skill implementation

---

## Scenario 1: Phil 1:3-8 (EXTEND expected)

**Input:** `/pericope-delimitation Phil 1:3-8`

**Expected result WITHOUT skill:**

Agent without the skill will likely:
- Validate the passage without checking Levinsohn data
- Say "Phil 1:3-8 works well as a preaching unit" based on training knowledge
- Miss the weak end boundary at 1:8
- Not recommend extension to 1:3-11 with specific discourse evidence
- Possibly suggest: "You could extend to 1:11 if you want the prayer"

**Failure mode:** Agent relies on memory of common commentary traditions
("Phil 1:3-8 is the thanksgiving section") rather than checking discourse data.

**Specific failures:**
- ❌ No Levinsohn feature check at 1:8-1:9 boundary
- ❌ No citation of γινώσκειν formula at 1:12 as next-unit marker
- ❌ No structured verdict format (EXTEND/VALID/CONTRACT/ADJUST)
- ❌ No alternative (minimum viable pericope 1:3-6)
- ❌ No Data Sources section

---

## Scenario 2: Phil 1:1-11 (VALID expected)

**Input:** `/pericope-delimitation Phil 1:1-11`

**Expected result WITHOUT skill:**

Agent will:
- Correctly validate this passage (it IS valid)
- But reasoning will be from training knowledge, not data
- May say "Phil 1:1-11 is commonly studied together" not "Levinsohn shows γινώσκειν at 1:12 confirms next-unit boundary"

**Failure mode:** Correct verdict, wrong methodology. Will not:
- ❌ Check Levinsohn data for 1:12 boundary confirmation
- ❌ Cite specific discourse features
- ❌ Structure as start boundary / end boundary assessment
- ❌ Include Data Sources section

---

## Scenario 3: Phil 1:1-2:11 (CONTRACT expected)

**Input:** `/pericope-delimitation Phil 1:1-2:11`

**Expected result WITHOUT skill:**

Agent may:
- Give vague answer: "This is a lot of material for one pericope"
- Suggest dividing at 1:27 or 2:1 based on training knowledge
- Not check Levinsohn for specific boundary markers
- Not structure the response as a formal pericope assessment

**Failure mode:** Correct intuition but no evidence, no structured output.

---

## Scenario 5: Gen 37:5-8 (EXTEND expected)

**Input:** `/pericope-delimitation Genesis 37:5-8`

**Expected result WITHOUT skill:**

Agent may:
- Validate the passage as "the first dream scene"
- Not check Masoretic data for missing marker at 37:5
- Not recommend extending back to 37:2 (toledot formula)
- Not identify that starting mid-narrative breaks the unit structure

**Failure mode:** Memory-based validation ("37:5 is where the dreams start") overrides structural analysis.

---

## Scenario 10: Rom 1:16-17 (EXTEND/ADJUST expected)

**Input:** `/pericope-delimitation Romans 1:16-17`

**Expected result WITHOUT skill:**

Agent will almost certainly:
- Validate the passage as "the thesis statement / propositio of Romans"
- Say "Rom 1:16-17 is a natural preaching unit focusing on the gospel"
- Use memory of commentary tradition (Luther, Calvin, Stott all emphasize 1:16-17)
- Not check Levinsohn for boundary features at 1:16 or 1:18
- Confidently endorse what is actually an embedded mid-letter passage

**Failure mode:** This is the clearest failure mode. Agent memory strongly favors validating
1:16-17 due to theological prominence. But discourse analysis requires checking:
- Is there a boundary feature at 1:16? (start)
- Is there a boundary feature at 1:18? (end — if so, confirms 1:16-17 is transition)
- Levinsohn data will show 1:18 begins new section, not 1:16

---

## Summary of Baseline Failures

| Scenario | Common Wrong Answer | Root Cause |
|----------|--------------------|----|
| Phil 1:3-8 | "Works as a unit, extend if you want" | Memory-based validation |
| Phil 1:1-11 | Correct verdict, wrong method | No data check |
| Phil 1:1-2:11 | Vague "too long" | No structured methodology |
| Gen 37:5-8 | "First dream scene = valid unit" | Memory over Masoretic data |
| Rom 1:16-17 | "Thesis statement, valid pericope" | Famous passage = assumed valid |

**Core failure pattern:** Agent substitutes training knowledge of biblical studies for
data-grounded discourse analysis. The skill must enforce:
1. Check Levinsohn data (NT) or Masoretic markers (OT) FIRST
2. Assess start and end boundaries separately
3. Lead with structured verdict
4. Cite specific features, not general impressions
5. Always include Data Sources section

---

## RED Phase Conclusion

Without the skill, the agent:
- Gets verdicts right only by accident
- Uses memory, not data
- Produces prose assessments, not structured boundary analysis
- Fails the most important test (Rom 1:16-17) by validating a theologically prominent
  but discourse-invalid unit
- Never includes Data Sources section

The skill must prevent all these failure modes.
