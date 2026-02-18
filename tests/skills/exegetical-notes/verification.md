# Exegetical Notes Skill - Verification (GREEN Phase)

## Test Conditions

**Agent:** Claude with exegetical-notes SKILL.md loaded
**Date:** 2026-02-18
**Purpose:** Document that skill produces correct, data-grounded, structured output

---

## Scenario 1: Phil 1:1-11 — Full Output Verification

**Input:** `/exegetical-notes Phil 1:1-11`

**Section-by-section pass criteria:**

### Header
- ✅ All 4 header fields present (Generated, Passage, Genre, Pericope Status)
- ✅ Genre identified as "epistle"
- ✅ Pericope Status: "Valid unit"

### Section 1: Literary Context
- ✅ Places Phil 1:1-11 in epistolary structure (after salutation address, before body)
- ✅ References 1:12 as start of next section
- ✅ Does not require external context to place the passage

### Section 2: Internal Structure
- ✅ Table with verses | element | function present
- ✅ Four elements identified: 1:1-2 (prescriptio), 1:3-6 (thanksgiving), 1:7-8 (grounds), 1:9-11 (prayer)
- ✅ Levinsohn PoD at 1:3 cited
- ✅ γινώσκειν at 1:12 noted as next-section marker

### Section 4: Lexical Analysis
- ✅ ἐναρξάμενος (1:6): aorist MIDDLE participle (not active) [morphology_parser.py]
- ✅ ἐπιτελέσει (1:6): future active indicative [morphology_parser.py]
- ✅ χαρά: 5x in Philippians cited with verse list [vocabulary_parser.py]
- ✅ χαίρω: 9x in Philippians cited [vocabulary_parser.py]
- ✅ At minimum 5 lemmas analyzed with parsing data

### Section 6: Interpretive Guardrails
- ✅ All four tiers labeled (Tier 1, Tier 2, Tier 3, Tier 4)
- ✅ Tier 1: Cites morphological parsing data
- ✅ Tier 2: Cites discourse structure / Levinsohn feature
- ✅ Tier 3: Web-searched citation with author + title (verifiable)
- ✅ Tier 4: Labeled as "Agent assessment"

### Section 10: Verification
- ✅ verify_claims.py results reported
- ✅ Claims checked ≥ 5
- ✅ Claims failed = 0 (for data claims)
- ✅ Overall: PASS

### Output File
- ✅ Saved to `~/.claude/exegetical-notes/philippians/YYYY-MM-DD-1-1-11.md`
- ✅ Path reported to user

---

## Scenario 2: Lexical Data-Grounding Verification

**Specific test:** Section 4 uses morphology_parser.py

**Must find in output:**

```
ἐναρξάμενος (1:6): lemma ἐνάρχομαι, aorist middle participle
```

(Note: "middle" not "active" — this is the critical data verification)

**Must NOT find:**
- "ἐναρξάμενος is an aorist active participle"
- "χαρά appears many times" (without count)
- "Philippians is known for joy vocabulary" (without data citation)

---

## Scenario 3: Tier Labeling Verification

**Pass criteria for Section 6:**

At minimum one guardrail with all 4 tiers:

```markdown
### [Misreading]

**Tier 1: Linguistic Evidence**
[morphology citation with parsing]

**Tier 2: Discourse Evidence**
[Levinsohn feature or structure citation]

**Tier 3: Scholarly Consensus** (web-verified)
[Author, Title, Publisher, Year, page]

**Tier 4: Interpretive Notes** (Agent assessment)
[Labeled as agent assessment]
```

If Tier 3 source is only Tier C, it's labeled: "[Tier C source, use with caution]"

---

## Scenario 4: Pericope Check Verification

**Input:** `/exegetical-notes Phil 1:3-8`

**Expected output before generating notes:**

```
⚠️ Boundary check: Phil 1:3-8 may be a partial unit.
[Specific discourse evidence for weak end boundary]
Recommended passage: Phil 1:3-11.
```

**Pass criteria:**
- ✅ Warning issued BEFORE generating full notes
- ✅ Warning cites specific discourse evidence (not just "may be incomplete")
- ✅ Specific recommendation given (not just "extend it")
- ✅ User must confirm before notes are generated

---

## Scenario 5: OT Morphology Verification

**Input:** `/exegetical-notes Genesis 37:2-11`

**Section 4 must include:**
- ✅ Hebrew verb with morphology_parser.py data (stem + conjugation)
- ✅ Strong's number provided
- ✅ Example: ח-ל-מ (dream root) with correct Qal perfect parsing
- ✅ OT-specific commentary cited in Tier 3 (not NT commentary)

---

## Scenario 6: Verification Integration

**Checks for Section 10 accuracy:**

Run verify_claims.py manually on generated output:
```
python3 scripts/verify_claims.py ~/.claude/exegetical-notes/philippians/[date]-1-1-11.md
```

Expected result:
- claims_failed: 0 (for lemma frequencies and morphological forms)
- overall: PASS
- data_sources_present: PASS

If verify_claims.py finds failures in the generated notes: the skill did NOT enforce Rule 5.

---

## Format Regression Check

All outputs must include exactly these 10 sections:
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

Any output missing a section is a FAIL.

---

## Overall GREEN Phase Pass Criteria

The skill passes if:
1. Phil 1:1-11 analysis contains all 10 sections ✓
2. ἐναρξάμενος voice = middle (not active) in Section 4 ✓
3. χαρά cited as 5x with verse list ✓
4. All 4 tiers present and labeled in Section 6 ✓
5. Tier 3 includes web-searched citation ✓
6. Phil 1:3-8 triggers pericope warning before generating notes ✓
7. verify_claims.py passes on generated output (claims_failed = 0) ✓
8. File saved to correct path ✓

**Minimum acceptable:** Criteria 1, 2, 4, and 7 must pass.
- Item 2 verifies data-grounding (morphology_parser.py working)
- Item 4 verifies tier labeling (structure followed)
- Item 7 verifies self-checking loop (verify_claims.py integrated)
