# Consult Biblical Scholar Skill

## Purpose

Scholarly Q&A for biblical texts. Three auto-detected modes: MEANING (lexical explanation), VALIDATE (analogy checking), CROSS-REFERENCE (passage connections). Graduated confidence (HIGH/MEDIUM/LOW/CANNOT ANSWER) stated explicitly in every response. Hard epistemic boundaries — honest pushback when MCP data and scholarly sources are insufficient.

## Key Design Decisions

- **Single skill, internal routing** — one command handles all three question types, auto-detected from the question content
- **MCP before prose** — MCP tools are called before any answer is composed; training data is never the evidence basis
- **Graduated confidence (4 tiers)** — HIGH/MEDIUM/LOW/CANNOT ANSWER mapped to evidence tiers, stated prominently in every answer
- **VALIDATE verdicts** — SUPPORTED/COMPATIBLE/NOT SUPPORTED/INSUFFICIENT DATA; requires MEDIUM confidence minimum; text evidence before verdict
- **Topic mode with ceiling** — questions without a passage anchor accepted but immediately warned and capped at MEDIUM
- **Cross-reference classification** — Primary (shared lemma) / Secondary (shared concept) / Scholarly (commentary-sourced), each with evidence basis
- **No devotional drift** — answers explain what the text means; application is the user's job

## RED Phase Findings (What the Skill Fixes)

Five documented failure patterns from baseline testing (all 6 scenarios, unstructured agent):

1. **Zero MCP tool calls** — 6/6 scenarios answered from training data only
2. **No confidence tier stated** — 6/6 scenarios presented at uniform implicit high confidence
3. **No VALIDATE verdict system** — "partly works" prose instead of explicit verdicts
4. **No topic mode warning** — Q5 (Sabbath) treated identically to passage-anchored questions
5. **Unsourced consensus fabrication** — "most scholars agree/say" without attribution in 4/6 scenarios

## Infrastructure Dependencies

- MCP server: `claude-of-alexandria-mcp` with 4 query tools
- `query_morphology` — morphological parsing for key terms
- `query_discourse_features` — NT Levinsohn discourse analysis
- `query_paragraph_breaks` — OT Masoretic markers
- `query_vocabulary` — lemma frequencies and cross-book occurrences
- Web search access for Tier 3 scholarly sources
- Reference: `skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml`
- Reference: `skills/biblical-segmentation/reference/book-genres.yaml`

## TDD Status

- ✅ `tests/skills/consult-biblical-scholar/scenarios.md` — 6 test scenarios
- ✅ `tests/skills/consult-biblical-scholar/baseline.md` — RED phase evidence (5 failure patterns documented)
- ✅ `tests/skills/consult-biblical-scholar/verification.md` — GREEN phase proof

## Invocation

```
/consult-biblical-scholar Phil 1:6 What does "epiteleo" mean here?
/consult-biblical-scholar 2 Cor 12:7-10 Can I compare the thorn to chronic anxiety?
/consult-biblical-scholar Phil 2:5-11 Was the kenosis really a choice?
/consult-biblical-scholar Romans 3:25 What connects to "hilasterion"?
/consult-biblical-scholar John 3:16 "Only begotten" or "one and only"?
/consult-biblical-scholar What is the biblical theology of Sabbath rest?
```

## Output

Inline response (not saved to file). Every response: confidence tier → evidence summary → mode-appropriate answer → data sources.
