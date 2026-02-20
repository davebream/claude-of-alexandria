# Consult Biblical Scholar — Baseline (RED Phase)

## Test Conditions

**Agent:** Claude (Sonnet 4.6) without skill loaded
**Date:** 2026-02-20
**Purpose:** Document failure modes when answering scholarly biblical questions without structured constraints
**Method:** Subagent execution with MCP tool access available, web search available, no skill context loaded
**Note:** Agent had access to MCP tools but chose not to use them — this is the key finding.

---

## Executive Summary

**Key Finding:** Without skill constraints, the agent produces fluent, superficially plausible biblical scholarship answers with zero data verification, no confidence tiering, and consistent structural failures across all 6 scenarios.

**Predictions vs Reality:**

| Prediction | Actual Result | Accuracy |
|-----------|---------------|----------|
| No confidence tier stated | Zero confidence tiers across all 6 answers | ✅ Confirmed |
| MCP tools not consistently called | Zero MCP tool calls across all 6 answers | ✅ Confirmed — worse than predicted |
| Confidence inflation on contested questions | Yes — most answers presented with uniform high confidence regardless of evidence basis | ✅ Confirmed |
| No VALIDATE verdict system | Correct — "partly works" instead of SUPPORTED/COMPATIBLE/NOT SUPPORTED | ✅ Confirmed |
| Fabricated scholarly consensus | "Most scholars now say..." without naming anyone | ✅ Confirmed |
| Devotional drift | Q2 drifted substantially into pastoral application | ✅ Confirmed |
| No topic mode distinction | Q5 treated identically to passage-anchored questions | ✅ Confirmed |

---

## Scenario 1: MEANING — epiteleo in Phil 1:6

**Agent response summary:**

Answered from training data with no MCP tool calls. Provided a reasonable gloss ("to complete," "to bring to completion") and a craftsman illustration.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls — morphology data cited from memory, not from `query_morphology`
- ❌ No `[query_morphology]` attribution on any claim
- ❌ No frequency count from `query_vocabulary` — would have stated "appears 1x in Philippians"
- ❌ No discourse context from `query_discourse_features` — word's function in clause/paragraph not discussed
- ❌ Modern explanation not clearly separated from technical data — craftsman illustration mixed into same prose

**Verbatim example of failure (confidence inflation):**
> "The word also appears in contexts like completing a temple ritual or finishing a sacrifice — it has a sense of bringing something to its proper, appointed conclusion."

No source cited. Presented as established fact. No `[query_morphology]` or lexical citation.

**Verbatim example of failure (devotional drift):**
> "Paul is saying God is that kind of craftsman with your salvation."

Application content mixed into what should be a technical lexical answer.

---

## Scenario 2: VALIDATE — thorn in the flesh / chronic anxiety

**Agent response summary:**

Gave a nuanced "partly works" answer with genuine pastoral sensitivity — but with no formal verdict structure, no MCP data, and significant drift into pastoral application territory.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls — σκόλοψ discussed without `query_morphology` data
- ❌ No formal verdict: COMPATIBLE / NOT SUPPORTED / SUPPORTED / INSUFFICIENT DATA — gave "partly, but with caveats" instead
- ❌ Text evidence not presented BEFORE evaluating the analogy
- ❌ Devotional drift — substantial pastoral application content

**Verbatim example of failure (verdict absent):**
> "The analogy is pastorally useful as a point of contact but breaks down if pressed too hard exegetically."

This is a nuanced non-verdict. No explicit SUPPORTED/COMPATIBLE/NOT SUPPORTED.

**Verbatim example of failure (devotional drift):**
> "that can cause real harm... You'd need to be careful about suggesting someone's anxiety is for a specific divine purpose"

The agent became a pastoral counselor. This is application territory, not scholarly analysis.

**Verbatim example of failure (overreach):**
> "The 'my grace is sufficient' dynamic (2 Cor 12:9) speaks powerfully to anyone living with a condition that doesn't resolve on command."

Unsourced pastoral application presented as textual analysis.

---

## Scenario 3: VALIDATE — was the kenosis a choice?

**Agent response summary:**

Got the conclusion right (NOT SUPPORTED) but without MCP data and with vague, unattributed scholarly claims. Self-assessed as having used "classical theology across many traditions would reject" without attribution.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls — ἑαυτὸν ἐκένωσεν morphology cited from memory
- ❌ No formal SUPPORTED/COMPATIBLE/NOT SUPPORTED verdict rendered
- ❌ Unsourced scholarly claim: "classical theology (across many traditions) would reject"

**Verbatim example of failure (unattributed claim):**
> "Divine love is not a compulsion that overrides agency... which classical theology (across many traditions) would reject."

Which traditions? Which scholars? No citation.

**What worked (despite no skill):**
- ✅ Identified the reflexive pronoun and active verb correctly
- ✅ Noted the rhetorical context (Paul using it as moral example)
- This shows the conclusion can emerge without the skill — but without evidentiary structure or attribution

---

## Scenario 4: CROSS-REFERENCE — hilasterion connections

**Agent response summary:**

Identified the key connections correctly (Lev 16, Heb 9:5, LXX usage) but did not use MCP vocabulary tools and ended with an unattributed consensus claim.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls — `query_vocabulary` would have provided LXX occurrence data
- ❌ Cross-references not classified as Primary/Secondary/Scholarly
- ❌ No stated reason for WHY each passage connects (just listed them)
- ❌ Consensus fabrication: "most scholars now say the word probably encompasses both dimensions"

**Verbatim example of failure (unattributed consensus):**
> "most scholars now say that the word probably encompasses both dimensions — the removal of sin and the satisfaction of God's holy character."

Named C.H. Dodd and Leon Morris (good), then attributed a third position to unnamed "most scholars."

**Verbatim example of failure (no classification):**
> "4 Maccabees 17:22 — a non-canonical but historically proximate text where hilastērion refers to the deaths of martyrs as atoning."

Connected but no classification as Primary/Secondary/Scholarly. No explanation of WHY it connects beyond description.

---

## Scenario 5: Topic mode — Sabbath rest development

**Agent response summary:**

Treated the topic question identically to passage-anchored questions. No warning about reduced confidence. No confidence cap. No explanation that MCP tools could not be run without a specific passage.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls
- ❌ No topic mode warning ("no passage provided, confidence capped at MEDIUM")
- ❌ Confidence NOT capped — answer presented at implicit HIGH throughout
- ❌ "Would require a book" is not a confidence acknowledgment — just a scope caveat

**Verbatim example of failure (no mode warning):**
> "The Sabbath concept has a rich trajectory across Scripture, though tracing it comprehensively would require a book. Here's the broad development:"

Then provided a confident synthesis of Genesis through Hebrews with no epistemic marking. No indication this is training-data synthesis with no MCP verification.

**Verbatim example of failure (unsourced synthesis):**
> "The development goes: creation ordinance → covenant sign → prophetic criterion for faithfulness → christological fulfillment → eschatological rest still awaited."

Clean synthesis. But who says this? Beale? Dempster? No attribution. Presented as settled.

---

## Scenario 6: Pressure — monogenes in John 3:16

**Agent response summary:**

The best performance of the six — named both scholars (Dodd, Morris implicitly through the BDAG reference), presented both positions, and did not definitively resolve the debate. But still no confidence tier, no MCP call, and ended with an unattributed "most contemporary scholarship" claim.

**Confirmed failures:**

- ❌ No confidence tier stated
- ❌ No MCP tool calls — `query_morphology` would have confirmed the parsed form
- ❌ Consensus claim: "Most contemporary scholarship leans toward the genos derivation" — BDAG cited but no broader attribution

**What worked (partially):**
- ✅ Named C.H. Dodd and Leon Morris positions (though indirectly — Dodd by name on propitiation question, not on monogenes)
- ✅ Gave the Isaac example from Hebrews 11:17 — correct and evidenced
- ✅ Did not pick a definitive winner
- ⚠️ Better than other scenarios but still no structure

**Verbatim example of partial success:**
> "Most contemporary scholarship leans toward the genos derivation, but 'only begotten' isn't wrong — it's a defensible translation that was natural to Greek speakers of the patristic era."

This is honest. But "most contemporary scholarship" still unattributed.

---

## Pattern Analysis

### Strengths (What the Agent Does Naturally)

1. **Content accuracy** — the actual exegetical content is largely correct. The agent knows the morphology, knows the scholars, knows the passages.
2. **Nuance on contested questions** — Q6 especially shows the agent can present a debate without false resolution when the pressure is clear.
3. **Correct identification of OT connections** — hilasterion connections to Lev 16 and LXX were correct without prompting.
4. **Reflexive verb recognition** — correctly identified ἑαυτόν + ἐκένωσεν as volitional without a skill.

### Critical Gaps (What the Skill Must Fix)

1. **Zero MCP tool usage** — the agent has the tools available and never uses them. All morphological claims are from training data, unverified.
2. **No confidence tiering** — all answers presented at the same implicit confidence level regardless of evidence basis.
3. **No verdict system** — VALIDATE questions get nuanced prose instead of a verdict.
4. **Devotional drift** — Q2 substantially became pastoral counseling rather than scholarly analysis.
5. **Unsourced consensus** — "most scholars agree/say" claims appear 4 times across 6 answers, never with adequate attribution.
6. **Topic mode blindness** — Q5 treated identically to passage questions with no warning.

---

## Summary of Baseline Failures

| Failure | Severity | Confirmed? | Frequency |
|---------|----------|-----------|-----------|
| No confidence tier stated | High | ✅ Yes | 6/6 scenarios |
| No MCP tool calls | High | ✅ Yes | 6/6 scenarios |
| No VALIDATE verdict system | High | ✅ Yes | 2/2 VALIDATE scenarios |
| No topic mode warning or cap | High | ✅ Yes | 1/1 topic scenario |
| Unsourced consensus claims | Medium | ✅ Yes | 4/6 scenarios |
| Devotional drift | Medium | ✅ Yes | 1/6 (Q2 substantially) |
| No cross-reference classification | Medium | ✅ Yes | 1/1 CROSS-REF scenario |
| Evidence not before analogy | Medium | ✅ Yes | 2/2 VALIDATE scenarios |

---

## RED Phase Conclusion

The agent is knowledgeable but structurally uncontrolled. It produces content that sounds scholarly but:
- Never states confidence
- Never calls MCP tools
- Has no verdict system for analogy validation
- Drifts into pastoral application
- Attributes positions to unnamed "most scholars"

The skill must enforce: (1) confidence tiering as mandatory output structure, (2) MCP-before-answer as an iron rule, (3) a formal verdict system for VALIDATE mode, (4) explicit topic mode detection and warning, and (5) attribution requirements for all scholarly claims. The content knowledge is there — the discipline is not.
