# Sub-Agent Architecture Design

**Date:** 2026-02-27
**Status:** Approved
**Scope:** Full vision design, incremental build

---

## Problem Statement

The claude-of-alexandria plugin currently has 5 skills and 8 MCP tools, but no sub-agents. Three problems:

1. **Duplicated logic** — every skill independently orchestrates MCP tools with similar patterns (detect testament, call morphology, call discourse features, etc.)
2. **No composition** — skills can't delegate to each other. `argument-flow` says "route to `consult-biblical-scholar`" but can't actually call it.
3. **Missing capability** — no way to evaluate bible study materials (outlines, transcripts, methodology files) against exegetical standards.

## Approach

Add a sub-agent layer alongside existing skills. Agents live in `plugins/claude-of-alexandria/agents/` as Markdown files with YAML frontmatter — auto-discovered by Claude Code, no manifest changes needed.

Three agents, built incrementally:

| # | Agent | Model | Purpose | Build Order |
|---|-------|-------|---------|-------------|
| 1 | `data-retriever` | haiku | Fetch MCP data, compress into structured summaries | First |
| 2 | `biblical-scholar` | sonnet | Scholarly analysis grounded in MCP data + sources | Second |
| 3 | `study-evaluator` | sonnet | Evaluate study materials against exegetical standards | Third |

### Why Sonnet 4.6 (not Opus) for agents 2 and 3

Sonnet 4.6 scores within 1.2% of Opus 4.6 on SWE-bench and outperforms it on agentic knowledge work (GDPval-AA: 1633 vs 1606 Elo). It costs 5x less. The agents don't need Opus's advantages (128K output ceiling, 1M long-context retrieval) because they work with bounded, structured MCP data — not massive codebases. The `model` field is per-agent, so upgrading is trivial if testing reveals a need.

---

## Agent 1: `data-retriever` (haiku)

### Purpose

Fetch-and-compress layer. Calls MCP tools with correct parameters, returns compact structured summaries instead of raw JSON. Saves context tokens for calling agents.

### Tool Access

MCP tools only:
- `query_morphology`
- `query_discourse_features`
- `query_paragraph_breaks`
- `query_vocabulary`
- `query_ot_quotes`
- `query_lemmas`
- `query_themes_for_lemmas`
- `list_books`

### Input

A passage reference + what kind of data is needed (morphology, discourse, vocabulary, OT quotes, cross-book lemma distribution, or "all relevant data").

### Output Contract

```
TESTAMENT: NT
PASSAGE: Phil 2:1-4
DATA REQUESTED: morphology, discourse, vocabulary

## Morphology Summary
- Conjunctions: εἰ (v.1 ×4, conditional), οὖν (v.1, inferential)
- Imperatives: πληρώσατέ (v.2, aorist active), φρονοῦντες (v.2, present active participle)
- Key verbs: ἡγέομαι (v.3, present middle participle, "consider")
- Notable forms: κενοδοξίαν (v.3, hapax in Paul)

## Discourse Features
- No historical present (expected — epistolary genre)
- Left-dislocation: none detected
- Tail-head linkage: none in range

## Vocabulary Concentration
- Top lemmas in Phil: χαρά (16×), φρονέω (10×), Χριστός (37×)
- φρονέω cluster: chapters 1-4 (concentrated ch.2)

## Raw Data Available
[Lists which MCP calls succeeded and token counts]
```

### Iron Rules

1. **Detect testament before calling tools** — NT vs OT determines which tools apply (discourse_features = NT only, paragraph_breaks = OT only)
2. **Never fabricate data** — if an MCP call fails or returns empty, say so explicitly
3. **Compress but don't interpret** — morphological summaries state facts, not theological conclusions
4. **Report scope** — the calling agent must know what was called and what wasn't

---

## Agent 2: `biblical-scholar` (sonnet)

### Purpose

Always-available scholarly specialist. Delegates data gathering to `data-retriever`, adds scholarly interpretation with source attribution. A building block — not a user-facing skill with fixed output format.

### Tool Access

All MCP tools + `Read`, `WebSearch`, `Grep`, `Glob`

### Modes (auto-detected)

- **ANALYZE**: Full exegetical analysis of a passage
- **VALIDATE**: Verdict on a specific interpretive claim — SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA
- **TRACE**: Cross-reference distribution of a lemma or theme

### Output Contract

```
MODE: VALIDATE
CONFIDENCE: HIGH
VERDICT: NOT SUPPORTED

## Evidence
### MCP Data (via data-retriever)
[Compressed morphological/discourse evidence]

### Discourse Context
[Structural observations about the passage unit]

### Scholarly Sources
- [Tier A] Fee, NICNT Philippians: ...
- [Tier B] Wright, Climax of the Covenant: ...

## Confidence Justification
[Why this tier — what data supports it]

## Limitations
[What was not checked]
```

### Iron Rules

1. **Data before prose** — delegates to `data-retriever` before composing any analysis
2. **Confidence tier always stated first** — HIGH / MEDIUM / LOW / CANNOT ANSWER
3. **Attribute every claim** — Tier A (NICNT/NIGTC/ICC), B (established scholars), C (popular, with caveat), D (never cite)
4. **VALIDATE mode requires explicit verdict** — no hedging
5. **No devotional language** — this is analysis, not application
6. **Theological guardrails apply** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness
7. **Output scales to the question** — simple lexical query gets 5 lines, complex theological question gets full treatment

### Difference from `consult-biblical-scholar` Skill

The skill is user-facing with a fixed output format, invoked via `/consult-biblical-scholar`. The agent produces whatever the calling context needs — a single verdict line for the study-evaluator, or full analysis for the main conversation.

---

## Agent 3: `study-evaluator` (sonnet)

### Purpose

Evaluates bible study materials against exegetical standards. Answers: "Is this study faithful to the text, or does it drift?"

### Tool Access

`Read`, `Glob`, `Grep`, `WebSearch` — delegates all biblical data work to `biblical-scholar` / `data-retriever`

### Input Types

| Input | Format | What the agent does |
|-------|--------|---------------------|
| Study outline | Markdown with points/questions | Evaluates each point against passage's exegetical content |
| Discussion transcript | Chat log or meeting notes | Traces flow — where faithful, where drift |
| Methodology reference | Prompts, reference data, AI guide structures | Audits framework for exegetical soundness |
| Combined | Any mix | Full audit: methodology + outline + transcript |

### Output Contract

```
EVALUATION: Phil 2:1-11 Study Session
INPUT TYPE: outline + transcript
OVERALL: SOUND (with 2 drift points)

## Passage Reference Analysis
[Delegated to biblical-scholar]

## Outline Evaluation
### Point 1: "Unity in Christ" (vv.1-4) — FAITHFUL
[Brief evidence why]

### Point 2: "The Humility of Jesus" (vv.5-8) — DRIFT DETECTED
- Drift type: FLATTENING
- Issue: [What's wrong]
- Correction: [What it should say]
- Severity: MODERATE

## Transcript Trace
[Timestamped or section-by-section trace with FAITHFUL / DRIFT marks]

## Methodology Audit
[If methodology files provided]

## Drift Summary
| # | Location | Type | Severity | Corrected? |
|---|----------|------|----------|------------|
| 1 | ... | ... | ... | ... |

## Recommendations
[Constructive corrections for each drift point]
```

### Drift Classification

| Drift Type | Description | Severity Guide |
|------------|-------------|----------------|
| MORALISM | Imperative without indicative grounding | MODERATE-HIGH |
| FLATTENING | Covenantal/Christological nuance lost | MODERATE-HIGH |
| DECONTEXTUALIZATION | Verse isolated from discourse unit | MODERATE |
| GENRE VIOLATION | Wrong hermeneutical method for text type | HIGH |
| EISEGESIS | Reading meaning into text not supported by data | MODERATE-HIGH |
| THERAPEUTIC | Psychologizing the text | LOW-MODERATE |
| TRIVIALIZING | Reducing profound theology to platitude | LOW-MODERATE |

### Iron Rules

1. **Reference analysis first** — delegate to `biblical-scholar` before evaluating anything
2. **Classify every drift** — type + severity for each drift point
3. **FAITHFUL is the default** — not a fault-finding exercise. Sound points get explicit marks.
4. **Corrections are constructive** — every drift includes what it *should* say
5. **Theological guardrails are the rubric** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness
6. **Methodology audits evaluate frameworks, not intentions** — good prompt intentions don't count if the structure enables drift

---

## Agent Interaction Model

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User /     │     │  biblical-scholar │     │  data-retriever  │
│   Skill /    │────▶│    (sonnet)       │────▶│    (haiku)       │
│   Agent      │     │                  │     │                  │
└─────────────┘     │  Interprets data  │     │  Calls MCP tools │
                    │  Applies sources  │     │  Compresses JSON  │
                    │  Renders verdicts │     │  Returns summary  │
                    └──────────────────┘     └─────────────────┘
                           ▲
                           │
                    ┌──────────────────┐
                    │  study-evaluator  │
                    │    (sonnet)       │
                    │                  │
                    │  Evaluates study  │
                    │  materials against│
                    │  scholar output   │
                    └──────────────────┘
```

**Call patterns:**
- `data-retriever` is always a leaf — calls MCP tools and returns
- `biblical-scholar` calls `data-retriever`, enriches with web search + scholarly sources
- `study-evaluator` calls `biblical-scholar` for reference analysis, evaluates materials against it
- Existing skills can optionally delegate to agents (future refactor, not part of initial build)

---

## Build Order

| Phase | Deliverable | Validates |
|-------|-------------|-----------|
| **Phase 1** | `data-retriever` agent | Haiku + MCP reliability, compression accuracy, token savings |
| **Phase 2** | `biblical-scholar` agent | Delegation chain, scholarly output quality vs `consult-biblical-scholar` |
| **Phase 3** | `study-evaluator` agent | Full chain, real study material evaluation |
| **Phase 4** (future) | Refactor existing skills to use agents | Whether skills benefit from delegation or are better self-contained |

Phase 1 is the riskiest — tests whether haiku handles MCP orchestration reliably and whether compression saves tokens without losing critical data. If Phase 1 fails, we adjust before building the rest.

---

## File Structure

```
plugins/claude-of-alexandria/
├── agents/                          # NEW
│   ├── data-retriever.md
│   ├── biblical-scholar.md
│   └── study-evaluator.md
├── skills/                          # UNCHANGED
│   ├── argument-flow/
│   ├── biblical-segmentation/
│   ├── consult-biblical-scholar/
│   ├── exegetical-notes/
│   └── pericope-delimitation/
└── ...

tests/
├── agents/                          # NEW — same TDD structure as skills
│   ├── data-retriever/
│   │   ├── scenarios.md
│   │   ├── baseline.md
│   │   └── verification.md
│   ├── biblical-scholar/
│   │   └── ...
│   └── study-evaluator/
│       └── ...
└── skills/                          # UNCHANGED
    └── ...
```

---

## Open Questions

1. **Test structure for agents** — CLAUDE.md mandates `tests/skills/` with the three-file structure. Agents need the same rigor. Proposed: `tests/agents/` with identical structure. Requires CLAUDE.md update.
2. **Skill-to-agent migration** — should `consult-biblical-scholar` skill eventually become a thin wrapper around the `biblical-scholar` agent? Deferred to Phase 4.
3. **data-retriever failure modes** — what happens when haiku miscalls an MCP tool (wrong testament, wrong parameters)? Need explicit error handling in the agent prompt.
