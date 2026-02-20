# Consult Biblical Scholar — Design Document

**Date**: 2026-02-20
**Status**: Approved
**Skill name**: `consult-biblical-scholar`
**Command**: `/consult-biblical-scholar`
**Namespace**: `claude-of-alexandria:consult-biblical-scholar`

---

## Purpose

A scholarly Q&A skill for the claude-of-alexandria plugin. Users ask questions about biblical texts and receive data-driven answers with explicit confidence levels, honest epistemic boundaries, and refusal when evidence is insufficient.

Three use cases:

1. **Meaning** — "What does X mean?" Lexical/linguistic explanation of words and sentences, translated into modern understanding.
2. **Validation** — "Does my analogy hold up?" Checking user-generated analogies, illustrations, and applications against the actual text and scholarly data.
3. **Cross-referencing** — "What connects to this?" Finding and explaining related passages with demonstrated textual or scholarly connections.

---

## Invocation & Input

**Format**:
```
/consult-biblical-scholar [passage] [question]
```

**Examples**:
- `/consult-biblical-scholar Romans 3:25 What does hilasterion mean and how would I explain it to a modern person?`
- `/consult-biblical-scholar Phil 2:5-11 Can I compare Christ's kenosis to a leader voluntarily giving up power?`
- `/consult-biblical-scholar Gen 22:1-19 How does the Aqedah connect to the gospel?`
- `/consult-biblical-scholar What is the biblical theology of rest?` (topic mode)

**Passage detection**: If the first argument matches a book name + chapter:verse pattern, the question is passage-anchored. Otherwise, the skill enters **topic mode** with an explicit warning that confidence is capped at MEDIUM.

**Pericope validation**: Before answering, run the passage through pericope-delimitation logic (start/end boundary check). If boundaries are weak, note it but don't block — this is Q&A, not formal exegesis.

---

## Question Routing

The skill classifies the question into one of three modes. No user flag needed — detection is automatic.

**Mode 1: MEANING** — "What does X mean?"
- Triggered by: questions about word meaning, sentence meaning, grammatical function, how to explain something to a modern audience.
- Workflow: MCP morphology → MCP discourse features → MCP vocabulary → web search for scholarly views → synthesize into a plain-language explanation.

**Mode 2: VALIDATE** — "Does my analogy/idea hold up?"
- Triggered by: user presents their own analogy, illustration, comparison, application, or personal story and asks if it's faithful to the text.
- Workflow: Parse the user's claim → MCP data on the passage → identify what the text actually says → compare → render verdict.

**Mode 3: CROSS-REFERENCE** — "What else connects to this?"
- Triggered by: questions about connections between passages, thematic links, how a passage fits the broader biblical narrative.
- Workflow: MCP vocabulary for shared lemmas → web search for scholarly cross-references → classify and rank connections.

**Ambiguous questions**: Default to MEANING mode (safest, most data-driven). If the question genuinely spans modes (e.g., "What does X mean and can I compare it to Y?"), handle both sequentially — MEANING first, then VALIDATE.

---

## Confidence System

Four tiers, mapped to the existing evidence tier system:

| Confidence | Evidence Required | Behavior |
|---|---|---|
| **HIGH** | Tier 1 (linguistic) or Tier 2 (discourse) evidence from MCP tools | Full answer with data citations. No hedging. |
| **MEDIUM** | Tier 3 (scholarly consensus) via web search — no MCP data directly supports but scholars agree | Answer with scholarly citations + caveat: "This is based on scholarly consensus, not data I can verify directly." |
| **LOW** | Tier 4 only (interpretive inference) — MCP data inconclusive, scholars disagree or no clear consensus | State what IS known, then: "Beyond this, I am speculating." Point to specific scholars/works. |
| **CANNOT ANSWER** | No MCP data, no scholarly consensus found, or question falls outside biblical scholarship | Refuse. State exactly what's missing. Suggest where to look. |

### Hard Rules

1. **Never present Tier 4 as Tier 1.** If morphology doesn't settle a question, don't write as though it does.
2. **Topic mode (no passage) caps at MEDIUM.** No MCP tools were queried, so HIGH is impossible regardless of how confident the model feels.
3. **VALIDATE mode verdicts require at least MEDIUM confidence.** Below MEDIUM → verdict is INSUFFICIENT DATA, not a judgment call.
4. **Every answer states its confidence tier explicitly.** Displayed prominently at the top, not buried in text.
5. **Web search failure ≠ "no scholarly views exist."** Say "I could not find scholarly sources" — not "scholars have not addressed this."

---

## Data Pipeline

Strict data-first workflow. No answer is composed until all available data has been gathered.

### Step 1: Passage Validation (if passage provided)
- Parse book + chapter:verse.
- Quick boundary check (pericope-delimitation logic — lightweight, not full output).
- If boundaries are weak, note it in the answer but proceed.

### Step 2: MCP Tool Calls (if passage provided)

| Tool | MEANING | VALIDATE | CROSS-REF |
|---|---|---|---|
| `query_morphology` | Always | If relevant | Rarely |
| `query_discourse_features` | Always (NT) | If relevant | If relevant |
| `query_paragraph_breaks` | Always (OT) | Rarely | Rarely |
| `query_vocabulary` | If word-focused | Rarely | Always |

### Step 3: Web Search
- Search for scholarly commentary on the passage + question topic.
- Source tiers:
  - **Tier A** (prefer): NICNT, NIGTC, ICC, WBC, Pillar, BECNT
  - **Tier B** (accept): TDNT, study Bibles, established scholars (Fee, Moo, Wright, Beale, Carson)
  - **Tier C** (caution): popular commentaries, blog posts — cite only if nothing better, label the tier
- For CROSS-REFERENCE mode: search specifically for scholarly cross-references and intertextual connections.

### Step 4: Synthesis
- Combine MCP data + web search results.
- Assign confidence tier based on evidence actually found.
- Compose answer in the appropriate mode format.

### Topic Mode (no passage)
- Skip Steps 1-2.
- Identify 2-3 key passages for the topic via web search.
- Run MCP on those passages.
- Confidence ceiling: MEDIUM.

### MCP Unavailability
- State explicitly: "MCP data unavailable for this passage. Answering from scholarly sources only."
- Confidence ceiling drops to MEDIUM.

---

## Output Format

No rigid template — output scales to complexity. Every answer MUST include:

### Required Elements (all modes)
1. **Confidence tier** — displayed at the top, prominently.
2. **Evidence summary** — what data was found and from where.
3. **The answer** — scaled to complexity.
4. **Data sources** — MCP tools queried, scholarly works cited.

### Mode-Specific Elements

**MEANING mode** adds:
- Original language data (lemma, parsing, glosses).
- Discourse context (function in the passage's structure).
- Modern explanation — clearly labeled "for a contemporary audience," separated from technical data.
- Scholarly positions if there's genuine debate.

**VALIDATE mode** adds:
- **Verdict**: SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA.
- What the text actually says (data-driven, before evaluating the analogy).
- Point-by-point comparison of user's analogy against textual evidence.
- Usage guidance: how to present the analogy responsibly (if SUPPORTED or COMPATIBLE).

**CROSS-REFERENCE mode** adds:
- Ranked list of cross-references:
  - **Primary** — shared lemma (MCP vocabulary evidence).
  - **Secondary** — shared concept, different vocabulary (discourse/thematic evidence).
  - **Scholarly** — commentary-sourced connection (web search, with citation).
- Each cross-reference includes WHY it's connected.

### Output Excludes
- Devotional application (scholarly consultation, not a quiet time guide).
- Moralistic imperatives ("therefore you should...").
- Unsourced claims presented as fact.

---

## VALIDATE Mode Verdicts

Three-tier verdict system for analogy/idea validation:

| Verdict | Meaning | Usage Guidance |
|---|---|---|
| **SUPPORTED** | Text evidence directly backs the analogy | Safe to present as reflecting what the text communicates |
| **COMPATIBLE** | No contradiction, but no positive evidence either | May use pastorally, but present as APPLICATION, not as what the text MEANS |
| **NOT SUPPORTED** | Text or context actively opposes this reading | Do not use this analogy as representing the passage |

A fourth pseudo-verdict exists: **INSUFFICIENT DATA** — when confidence is below MEDIUM, no verdict is rendered.

---

## Red Flags & Rationalization Prevention

| Red Flag | Agent Tendency | Skill Forces |
|---|---|---|
| **Confidence inflation** | Present training-data knowledge as Tier 1 evidence | Only MCP data counts as Tier 1-2 |
| **Verdict without evidence** | Render verdicts based on vibes | VALIDATE verdicts require MEDIUM minimum; below → INSUFFICIENT DATA |
| **Harmonizing silence** | Fill data gaps with plausible synthesis | If MCP and web search find nothing, say so |
| **Devotional drift** | Slide from analysis into "this means for us today..." | Scholarly consultation only; application is the user's job |
| **False cross-references** | Suggest connections based on English translation similarity | Every cross-reference needs a stated basis: shared lemma, discourse connection, or scholarly citation |
| **Consensus fabrication** | "Most scholars agree..." without naming anyone | Every scholarly claim cites a specific scholar or work |
| **Topic mode overconfidence** | HIGH confidence on topic questions from training data | Topic mode capped at MEDIUM, no exceptions |
| **Skipping MCP** | Jump to answering from training data | MCP tools called BEFORE composing any answer |
| **Misrepresenting search failure** | "Scholars have not addressed this" | "I could not find scholarly sources on this" |
| **Moralism** | "This passage teaches us to be more humble" | Ground in indicative (what text says), not imperative (what you should do) |

**Foundational principle**: "Violating the letter of the rules is violating the spirit of the rules."

---

## Theological Guardrails (Q&A-specific)

| Guardrail | Q&A Enforcement |
|---|---|
| **Anti-moralism** | Answers explain what the text means, not what the user should do. No moralistic application generation. |
| **Christ-centeredness** | CROSS-REFERENCE mode surfaces redemptive-historical connections. MEANING mode notes biblical-storyline placement when relevant — doesn't force it where not germane. |
| **Context primacy** | Every answer anchored to the discourse unit. Pericope check in Step 1. Word meanings always include clause/paragraph function. |
| **Genre governance** | Methodology adjusts by genre (detected from `book-genres.yaml`). Proverbs get wisdom treatment, not epistolary analysis. |
| **Covenantal awareness** | Cross-testament references note covenant administration differences. No flat proof-texting across testaments. |

---

## Allowed Tools

The skill pre-authorizes these tools to avoid permission prompts:

- `Read` — reference data files
- `Glob` — file discovery
- `WebSearch` — scholarly source lookup
- `Bash` — verify_claims.py execution (if applicable)
- `mcp__claude-of-alexandria-mcp__query_morphology`
- `mcp__claude-of-alexandria-mcp__query_discourse_features`
- `mcp__claude-of-alexandria-mcp__query_paragraph_breaks`
- `mcp__claude-of-alexandria-mcp__query_vocabulary`

---

## Summary

| Aspect | Decision |
|---|---|
| Approach | Single skill, internal routing (Approach A) |
| Command | `/consult-biblical-scholar` |
| Modes | MEANING / VALIDATE / CROSS-REFERENCE (auto-detected) |
| Confidence | HIGH / MEDIUM / LOW / CANNOT ANSWER (graduated, explicit) |
| Verdicts | SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA |
| Cross-refs | Primary (lemma) / Secondary (concept) / Scholarly (commentary) |
| Pipeline | Pericope check → MCP tools → web search → synthesis |
| Topic mode | Accepted with MEDIUM confidence ceiling |
| Guardrails | Existing 5, with Q&A-specific enforcement |
| Red flags | 10 documented failure patterns |
