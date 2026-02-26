# Exegetical Notes Skill - Test Scenarios

## Overview

This skill produces structured, context-neutral exegetical analysis of a biblical passage.
Always in English. Data-grounded. Saved to file.

**Testing approach:**
1. **Completeness scenarios** - All 10 sections present and populated
2. **Data-grounding scenarios** - Lexical analysis uses morphology_parser, not memory
3. **Tier scenarios** - Interpretive guardrails correctly labeled
4. **Verification scenarios** - MCP cross-check passes on output
5. **Pericope check scenarios** - Built-in boundary check triggers correctly

---

## Scenario 1: Complete NT Analysis — Phil 1:1-11

**Input:**
```
/exegetical-notes Phil 1:1-11
```

**Core test:** Produces all 10 sections with data-grounded content.

### What to verify:

**Section 1: Passage in Literary Context**
- ✅ Places Phil 1:1-11 within the letter structure
- ✅ Identifies connection to 1:12 (new section begins there)
- ✅ Does NOT require segmentation context (works standalone)

**Section 2: Internal Structure**
- ✅ Uses discourse features (Levinsohn) for internal divisions
- ✅ Table format: verses | element | function
- ✅ Identifies: prescriptio (1:1-2), thanksgiving (1:3-6), grounds (1:7-8), prayer (1:9-11)

**Section 3: Propositional Summary**
- ✅ 1-2 sentences max
- ✅ Captures the passage's main claim
- ✅ Does not pre-interpret Tier 4 issues as settled

**Section 4: Lexical Analysis**
- ✅ Key lemmas listed with verse reference
- ✅ Morphological data comes from query_morphology MCP tool (not memory)
- ✅ Includes: χαρά, χαίρω, ἐπιτελέω, ἀγάπη, δικαιοσύνη at minimum
- ✅ φρονέω family noted (Philippians hallmark)
- ✅ Cites actual parsing data: "ἐναρξάμενος (1:6) = aorist middle participle [query_morphology]"
- ✅ Strong's numbers used for semantic group connections where applicable

**Section 5: Exegetical Conclusions**
- ✅ Numbered list
- ✅ Each conclusion grounded in sections 2-4 data
- ✅ At minimum 3 defensible claims

**Section 6: Interpretive Guardrails**
- ✅ All 4 tiers present and labeled
- ✅ Tier 1: Linguistic evidence (morphology contradiction)
- ✅ Tier 2: Discourse evidence (structure contradiction)
- ✅ Tier 3: Scholarly consensus (web-searched with citation)
- ✅ Tier 4: Agent assessment (clearly labeled as such)

**Section 7: Open Questions**
- ✅ At least 1 genuine unresolved question
- ✅ Questions data cannot settle are noted as such

**Section 8: Intertextual Links**
- ✅ At least 2 cross-references with citations
- ✅ Uses OT_quotes.json for any OT quotations/allusions

**Section 9: Data Sources**
- ✅ Lists: MorphGNT/SBLGNT, Levinsohn GNT Discourse Features
- ✅ Notes vocabulary parser usage
- ✅ Names specific Tier 3 sources used

**Section 10: Verification**
- ✅ Reports MCP cross-check results
- ✅ Shows: claims checked, confirmed, corrected, not cross-checkable

**Output saved to:**
`~/.claude/exegetical-notes/philippians/YYYY-MM-DD-1-1-11.md`

---

## Scenario 2: Lexical Data-Grounding Test

**Input:**
```
/exegetical-notes Phil 1:1-11
```

**Specific check:** Lexical analysis must use query_morphology MCP tool data.

**Must NOT say:**
- "ἐναρξάμενος is aorist active participle" (wrong voice — memory error)
- "χαρά appears many times in Philippians" (vague — data available)
- "Philippians is known for its joy vocabulary" (training knowledge, not data)

**Must say:**
- "ἐναρξάμενος (1:6): lemma ἐνάρχομαι, aorist middle participle, nominative singular masculine [query_morphology]"
- "χαρά: 5 occurrences in Philippians (1:4, 1:25, 2:2, 2:29, 4:1) [query_vocabulary]"
- "χαίρω: 9 occurrences in Philippians [query_vocabulary]"

---

## Scenario 3: Tier Labeling Test

**Input:**
```
/exegetical-notes Phil 1:1-11
```

**Specific check for Section 6 (Interpretive Guardrails):**

**Tier 1 example (Linguistic):**
A common misreading of Phil 1:6 is that "ἐπιτελέσει" refers to completion at death.
Tier 1 evidence: Future active indicative (ἐπιτελέσει) is referenced to "the day of
Christ Jesus" (ἄχρι ἡμέρας Χριστοῦ Ἰησοῦ) — this is eschatological, not biographical.

**Tier 3 must include web search:**
- ✅ Searches for scholarly commentary on Phil 1:6
- ✅ Cites at minimum one Tier A source (NICNT, NIGTC, ICC, etc.)
- ✅ Citation is real (verifiable)
- ✅ No Tier D sources (blog posts, AI-generated content)

**Tier 4 labeling:**
- ✅ Any agent assessment explicitly labeled "Agent assessment:"
- ✅ Never presented as established fact

---

## Scenario 4: Pericope Check Trigger

**Input (problematic passage):**
```
/exegetical-notes Phil 1:3-8
```

**Expected behavior:**
- Skill runs lightweight boundary check
- Detects: end boundary at 1:8 is weak (prayer severed from thanksgiving)
- Issues warning BEFORE generating full notes:
  ```
  ⚠️ Boundary check: Phil 1:3-8 may be a partial unit.
  The prayer request (1:9-11) completes the thanksgiving unit.
  Recommended passage: Phil 1:3-11.

  Continue with Phil 1:3-8? (notes will flag this issue in Section 1)
  ```
- If user confirms: generates full notes with flag in Section 1

---

## Scenario 5: OT Analysis — Gen 37:2-11

**Input:**
```
/exegetical-notes Genesis 37:2-11 --context "segmentation: Joseph narrative, 8 sessions"
```

**Core checks:**

**Section 4 (Lexical Analysis) — OT specific:**
- ✅ Uses query_morphology MCP tool with testament: ot
- ✅ Hebrew morphology cited (stem/conjugation for verbs)
- ✅ Strong's numbers provided for key lemmas
- ✅ Example: "חָלַם (H2492, 37:5,9): Qal perfect 3ms — dreamed [query_morphology]"

**Section 6 (Guardrails) — OT context:**
- ✅ Tier 3 cites OT commentaries (not NT commentaries)
- ✅ Mentions: Wenham (WBC), Hamilton (NICOT), or similar

**Context handling:**
- ✅ Section 1 references the segmentation context provided
- ✅ Note about how this passage fits in "8 sessions" structure

**Output saved to:**
`~/.claude/exegetical-notes/genesis/YYYY-MM-DD-37-2-11.md`

---

## Scenario 6: Verification Integration Test

**Input:**
```
/exegetical-notes Phil 1:1-11
```

**Specific check for Section 10 (Verification):**

After generating the full notes, the skill cross-checks data claims against MCP tool output.

**Expected output in Section 10:**
```markdown
## 10. Verification

**MCP cross-check results:**
- Data claims checked: [N]
- Claims confirmed (PASS): [N]
- Claims corrected: [0 expected]
- Claims not cross-checkable: [N] (Tier 3 web citations)

[If any corrections: list the original claim, MCP query result, and correction]
```

**Pass criteria:**
- ✅ MCP cross-check runs on the generated output
- ✅ Zero corrections needed for data claims (lemma frequencies, morphological forms)
- ✅ Data Sources section present

---

## Scenario 7: Source Quality Framework Test (Tier 3)

**Input:**
```
/exegetical-notes Romans 3:21-26
```

**Specific check:** Tier 3 web search source quality

**Must:**
- ✅ Prefer Tier A sources: NICNT (Moo), ICC, NIGTC, Cranfield, Dunn
- ✅ Reject Tier D sources (devotional websites, uncredited blogs)
- ✅ Cite source with: author, title, publisher, page/section if possible
- ✅ If only Tier B/C sources found, note the tier explicitly

**Example passing citation:**
"Moo, Douglas. _The Letter to the Romans_. NICNT. Grand Rapids: Eerdmans, 1996, 226-228."

**Example failing citation:**
"According to various commentators, Romans 3:21-26 teaches justification by faith."

---

## Success Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 1 (Phil 1:1-11 complete) | All 10 sections present and populated |
| 2 (Lexical data-grounding) | query_morphology MCP tool data cited; correct parsings |
| 3 (Tier labeling) | All 4 tiers present; Tier 3 has web citation; Tier 4 labeled |
| 4 (Pericope check) | Warning issued for Phil 1:3-8 before generating notes |
| 5 (OT: Gen 37:2-11) | OT morphology cited; Strong's numbers; OT commentaries |
| 6 (Verification) | MCP cross-check runs; zero corrections for data claims |
| 7 (Tier 3 quality) | Tier A sources preferred; citations complete |

---

## Rationalization Patterns to Watch For

| Excuse | Why It's Wrong |
|--------|----------------|
| "I know χαρά appears frequently in Philippians" | Use query_vocabulary MCP tool counts, not memory |
| "The aorist here is..." (no MCP tool cited) | Must cite source for morphological claims |
| "Scholars agree that..." (no citation) | Tier 3 requires web search and real citation |
| "This is clear from the context" | "Context" must be discourse data, not interpretation |
| "I'll note the uncertainty" | Noting uncertainty ≠ correct tier labeling |
| Skipping Section 10 verification | MCP cross-check is required |
| Generating notes for invalid pericope without warning | Pericope check must run first |
