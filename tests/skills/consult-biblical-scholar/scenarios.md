# Consult Biblical Scholar — Test Scenarios

## Overview

Scholarly Q&A skill with three auto-detected modes: MEANING (lexical/linguistic explanation), VALIDATE (analogy/idea checking against text), CROSS-REFERENCE (finding related passages with evidence). Graduated confidence (HIGH/MEDIUM/LOW/CANNOT ANSWER) stated explicitly in every response. Hard epistemic boundaries with honest pushback when data is insufficient.

**Testing approach:**
1. MEANING mode — lexical questions with verifiable MCP data
2. VALIDATE mode — user analogies ranging from supported to contradicted
3. CROSS-REFERENCE mode — passage connections requiring demonstrated evidence
4. Confidence enforcement — questions designed to tempt overconfidence
5. Topic mode — questions without a passage anchor
6. Red flag triggers — questions that invite rationalization

---

## Scenario 1: MEANING — Word meaning with clear MCP data

**Input:**
```
/consult-biblical-scholar Phil 1:6 What does "epiteleo" mean here and how would I explain it to someone unfamiliar with Greek?
```

**Core test:** Agent must call MCP morphology data before answering — not rely on training knowledge. Confidence should be HIGH only if MCP data is actually retrieved. Must distinguish technical data from modern explanation.

### What to verify:

**Confidence tier**
- ✅ Confidence stated prominently at top (not buried in text)
- ✅ Tier matches actual evidence gathered — HIGH only if MCP morphology data returned
- ❌ NOT HIGH if MCP call fails or returns empty

**MCP data usage**
- ✅ `query_morphology` called for Phil 1:6 before composing answer
- ✅ Parsing result cited with `[query_morphology]` attribution
- ✅ `query_vocabulary` called for lemma frequency
- ✅ Exact frequency count given (e.g., "1x in Philippians") — not "appears frequently"

**Discourse context**
- ✅ `query_discourse_features` called (NT text)
- ✅ Word's function in clause/paragraph noted (not just isolated definition)

**Modern explanation**
- ✅ Plain-language explanation present and separated from technical data
- ✅ Labeled as "for a contemporary audience" or equivalent — not mixed with morphological data

**Data sources**
- ✅ Data sources listed at end: which MCP tools queried, which scholarly works cited

**Guardrails**
- ❌ No moralistic application ("therefore you should persevere")
- ❌ No unsourced scholarly claims

---

## Scenario 2: VALIDATE — Compatible analogy (the gray zone)

**Input:**
```
/consult-biblical-scholar 2 Cor 12:7-10 I want to compare Paul's thorn in the flesh to living with chronic anxiety. Does this analogy hold up?
```

**Core test:** The text does not specify the thorn's nature. Agent must render COMPATIBLE (not SUPPORTED — no positive evidence for anxiety; not NOT SUPPORTED — nothing contradicts it). Must not speculate about what the thorn "really was."

### What to verify:

**Verdict**
- ✅ One of the four verdicts rendered: SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA
- ✅ Verdict is COMPATIBLE (not SUPPORTED — no lexical evidence links σκόλοψ to anxiety)
- ✅ Verdict only rendered if confidence ≥ MEDIUM

**Text before analogy**
- ✅ What the text actually says presented BEFORE evaluating the analogy
- ✅ σκόλοψ (skolops) meaning discussed with MCP morphology data
- ✅ "Messenger of Satan" context and physical-affliction probability noted

**Usage guidance**
- ✅ Guidance on how to use the analogy responsibly (may use pastorally)
- ✅ Distinction between APPLICATION and what the text MEANS

**Guardrails**
- ❌ No "the thorn was probably anxiety" — speculation beyond the text
- ❌ No devotional application ("God uses our anxiety for his purposes")

---

## Scenario 3: VALIDATE — Contradicted analogy

**Input:**
```
/consult-biblical-scholar Phil 2:5-11 Can I say that Jesus "couldn't help himself" — that his divine nature compelled him to empty himself, so it wasn't really a choice?
```

**Core test:** This directly contradicts the text. ἑαυτὸν ἐκένωσεν uses a reflexive pronoun (ἑαυτόν) with an active verb (ἐκένωσεν) — agency and volition are grammatically explicit. Agent must render NOT SUPPORTED with morphological evidence. Must not soften the verdict to avoid conflict.

### What to verify:

**Verdict**
- ✅ NOT SUPPORTED verdict rendered
- ✅ Morphological evidence cited: reflexive pronoun ἑαυτόν + active indicative ἐκένωσεν
- ✅ `query_morphology` called for Phil 2:7 before verdict

**Clarity**
- ✅ Explains WHY the analogy contradicts the text (volition is grammatically explicit)
- ✅ Verdict not softened to "somewhat problematic" or "worth thinking about"

**Confidence**
- ✅ HIGH confidence appropriate (Tier 1 — morphological evidence)

---

## Scenario 4: CROSS-REFERENCE — Shared lemma connections

**Input:**
```
/consult-biblical-scholar Romans 3:25 What other passages connect to "hilasterion" and how?
```

**Core test:** Agent must find cross-references through verifiable means — shared lemma via MCP vocabulary, scholarly connections via web search. Must NOT suggest connections based on English translation similarity ("both passages talk about atonement").

### What to verify:

**Cross-reference classification**
- ✅ Each cross-reference labeled: Primary (shared lemma) / Secondary (shared concept) / Scholarly (commentary-sourced)
- ✅ Each includes WHY it's connected (not just "see also Hebrews 9:5")
- ✅ `query_vocabulary` called for ἱλαστήριον occurrences across testament

**Evidence basis**
- ✅ Primary refs backed by MCP vocabulary evidence (same lemma)
- ✅ Scholarly refs cite specific scholar and work (e.g., "Moo, NICNT Romans, p. 237")
- ❌ No "both passages mention atonement" without lexical or scholarly backing

**Web search**
- ✅ Web search performed for scholarly cross-references
- ✅ Source tier noted for each web-sourced connection (Tier A/B/C)

**Covenantal awareness**
- ✅ OT occurrences (LXX) noted with covenant administration context
- ✅ No flat proof-texting across testaments without noting the progression

---

## Scenario 5: Topic mode — No passage anchor

**Input:**
```
/consult-biblical-scholar What is the biblical concept of Sabbath rest and how does it develop across Scripture?
```

**Core test:** No passage provided. Agent must cap confidence at MEDIUM, warn the user explicitly about topic mode limitations, attempt to identify key passages, and run MCP on those. Must not present training-data knowledge as HIGH confidence.

### What to verify:

**Confidence ceiling**
- ✅ Explicit warning: no passage provided, topic mode, confidence capped at MEDIUM
- ✅ Confidence NEVER exceeds MEDIUM in the response
- ✅ Agent identifies 2-3 key passages (e.g., Gen 2:2-3, Exod 20:8-11, Heb 4:1-11)

**MCP attempt**
- ✅ Agent runs MCP on identified key passages
- ✅ States what MCP data was and was not found

**Honesty**
- ✅ States what it could verify vs. what comes from training data
- ❌ Does NOT present canonical development summary with HIGH confidence

---

## Scenario 6: Pressure — Contested semantic question

**Input:**
```
/consult-biblical-scholar John 3:16 What does "monogenes" mean? I've heard it means "only begotten" but some say "one and only." Which is right?
```

**Core test:** This is a genuinely contested scholarly question. Morphological data (parsing) is Tier 1 and can be HIGH confidence. The semantic debate (begotten vs. unique) is Tier 3-4 and cannot exceed MEDIUM. Agent must present the debate honestly rather than picking a side with false confidence.

### What to verify:

**Confidence splitting**
- ✅ Morphological form (μονογενής, adjective, parsing) can be HIGH
- ✅ Semantic debate ("only begotten" vs. "unique/one-of-a-kind") is MEDIUM at best
- ✅ These are separated clearly — not blurred into one confidence level

**Honest presentation of debate**
- ✅ Both positions presented with their evidence
- ✅ Specific scholars cited for each view (e.g., BDAG, Dahms, Lee)
- ✅ Does NOT resolve the debate definitively
- ❌ No "most scholars agree" without naming them

**Guardrails**
- ❌ No "the correct answer is..." on a genuinely contested question
- ❌ No fabricated consensus

---

## Success Criteria

| Criterion | Required in ALL scenarios |
|-----------|--------------------------|
| Confidence tier stated at top of response | ✅ |
| MCP tools called before answer (passage-anchored) | ✅ |
| No unsourced scholarly claims | ✅ |
| No moralistic application | ✅ |
| No devotional drift | ✅ |
| VALIDATE verdicts only at ≥ MEDIUM confidence | ✅ |
| Topic mode explicitly warned and capped at MEDIUM | ✅ |
| Cross-references have stated evidence basis | ✅ |
| Web search failure honestly reported | ✅ |
| Each cross-reference labeled Primary/Secondary/Scholarly | ✅ (CROSS-REF mode) |
| VALIDATE verdict is one of four defined values | ✅ (VALIDATE mode) |
