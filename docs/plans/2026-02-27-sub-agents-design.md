# Sub-Agent Architecture Design

**Date:** 2026-02-27
**Status:** Approved (revised after design review)
**Scope:** Full vision design, incremental build

---

## Problem Statement

The claude-of-alexandria plugin currently has 5 skills and 8 MCP tools, but no sub-agents. Three problems:

1. **Duplicated logic** — every skill independently orchestrates MCP tools with similar patterns (detect testament, call morphology, call discourse features, etc.)
2. **No composition** — skills can't delegate to each other. `argument-flow` says "route to `consult-biblical-scholar`" but can't actually call it.
3. **Missing capability** — no way to evaluate bible study materials (outlines, transcripts, methodology files) against exegetical standards.

## Approach

Add a sub-agent layer alongside existing skills. Agents live in `plugins/claude-of-alexandria/agents/` as Markdown files with YAML frontmatter — auto-discovered by Claude Code (verified: this is the standard pattern used by kombajn-dev, superpowers, rspec, and other installed plugins).

Three agents, built incrementally:

| # | Agent | Model | Purpose | Build Order |
|---|-------|-------|---------|-------------|
| 1 | `data-retriever` | haiku | Fetch MCP data, compress into structured summaries | First |
| 2 | `biblical-scholar` | sonnet | Scholarly analysis grounded in MCP data + sources | Second |
| 3 | `study-evaluator` | sonnet | Evaluate study materials against exegetical standards | Third |

### Why Sonnet 4.6 (not Opus) for agents 2 and 3

Sonnet 4.6 scores within 1.2% of Opus 4.6 on SWE-bench and outperforms it on agentic knowledge work (GDPval-AA: 1633 vs 1606 Elo). It costs 5x less. The agents don't need Opus's advantages (128K output ceiling, 1M long-context retrieval) because they work with bounded, structured MCP data — not massive codebases. The `model` field is per-agent, so upgrading is trivial if testing reveals a need.

### Inter-Agent Invocation Mechanism

Agents delegate to other agents via Claude Code's `Task` tool. The parent agent spawns a child agent as a sub-task:

- `biblical-scholar` spawns `data-retriever` via `Task` tool with `subagent_type`
- `study-evaluator` spawns `biblical-scholar` via `Task` tool with `subagent_type`
- `data-retriever` is a leaf — it has restricted tools (MCP only) and cannot spawn other agents

For an agent to delegate, it must have `Task` in its tool access list. Agents with no `tools` field get all tools (including `Task`) by default. Agents with explicit `tools` lists must include `Task` if they need to delegate.

### Latency Profile

The three-layer chain (`study-evaluator → biblical-scholar → data-retriever → MCP tools`) is sequential. A full study evaluation requires three agent spawns plus MCP tool calls. This is acceptable: study evaluation is a batch analysis task, not a real-time interaction. Users submit materials and wait for a thorough report. The latency is measured in minutes, not seconds, and the quality justifies the wait.

---

## Agent 1: `data-retriever` (haiku)

### Purpose

Fetch-and-compress layer. Calls MCP tools with correct parameters, returns compact structured summaries instead of raw JSON. Saves context tokens for calling agents.

### Tool Access

MCP tools only (restricted — cannot spawn other agents):
- `query_morphology`
- `query_discourse_features`
- `query_paragraph_breaks`
- `query_vocabulary`
- `query_ot_quotes`
- `query_lemmas`
- `query_themes_for_lemmas`
- `list_books`

### Input

A passage reference + what kind of data is needed (morphology, discourse, vocabulary, OT quotes, cross-book lemma distribution, themes, or "all relevant data").

### Testament Detection Algorithm

The agent prompt must embed this lookup rule (do not rely on haiku's reasoning):

```
OT books (39): Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth,
1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah,
Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Songs, Isaiah, Jeremiah,
Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum,
Habakkuk, Zephaniah, Haggai, Zechariah, Malachi

NT books (27): Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians,
Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians,
1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John,
2 John, 3 John, Jude, Revelation

Rules:
- OT → pass testament: "ot" to query_morphology; call query_paragraph_breaks, SKIP query_discourse_features, SKIP query_ot_quotes
- NT → omit testament param from query_morphology; call query_discourse_features, SKIP query_paragraph_breaks; query_ot_quotes allowed
- If book not recognized → ERROR, do not proceed
```

### Output Contract

Every response MUST contain all sections. Missing data uses explicit states, never omission.

```
PASSAGE: [book] [range]
TESTAMENT: [OT|NT]

TOOL_RESULTS:
  query_morphology: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_discourse_features: [CALLED|SKIPPED_OT|FAILED] [token_count if called]
  query_paragraph_breaks: [CALLED|SKIPPED_NT|FAILED] [token_count if called]
  query_vocabulary: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_ot_quotes: [CALLED|SKIPPED_OT|SKIPPED|FAILED] [token_count if called]
  query_lemmas: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_themes_for_lemmas: [CALLED|SKIPPED|FAILED] [token_count if called]

TRUNCATION: [NONE | tool_name: truncated at N characters]

MORPHOLOGY_SUMMARY:
  [compressed data | EMPTY_RETURNED | SKIPPED | FAILED: error message]

DISCOURSE_SUMMARY:
  [compressed data | SKIPPED_OT | EMPTY_RETURNED | FAILED: error message]

PARAGRAPH_MARKERS:
  [compressed data | SKIPPED_NT | EMPTY_RETURNED | FAILED: error message]

VOCABULARY_SUMMARY:
  [compressed data | EMPTY_RETURNED | SKIPPED | FAILED: error message]

OT_QUOTES_SUMMARY:
  [compressed data | SKIPPED_OT | SKIPPED | EMPTY_RETURNED | FAILED: error message]

LEMMA_DISTRIBUTION:
  [compressed data | SKIPPED | EMPTY_RETURNED | FAILED: error message]

THEME_MATCHES:
  [compressed data | SKIPPED | EMPTY_RETURNED | FAILED: error message]
```

**Section states:**
- `CALLED` — tool was called and returned data
- `SKIPPED_OT` — tool is NT-only, passage is OT
- `SKIPPED_NT` — tool is OT-only, passage is NT
- `SKIPPED` — tool not requested by caller
- `EMPTY_RETURNED` — tool was called but returned no data for this passage
- `FAILED` — tool call errored (include error message)

### Iron Rules

1. **Use the testament lookup table** — do not reason about which books are OT/NT. Consult the embedded list.
2. **Never fabricate data** — if an MCP call fails or returns empty, use the explicit state label
3. **Compress but don't interpret** — morphological summaries state facts, not theological conclusions
4. **All sections always present** — never omit a section. Use state labels for missing data.
5. **Report truncation** — if any MCP response contains a truncation message, record it in TRUNCATION
6. **Report scope** — the calling agent must know what was called and what wasn't via TOOL_RESULTS

---

## Agent 2: `biblical-scholar` (sonnet)

### Purpose

Always-available scholarly specialist. Delegates data gathering to `data-retriever` via `Task` tool, adds scholarly interpretation with source attribution. A building block — not a user-facing skill with fixed output format.

### Tool Access

`Task`, all MCP tools, `Read`, `WebSearch`, `Grep`, `Glob`

Note: `Task` is required for spawning `data-retriever`. All MCP tools are included as a fallback — if `data-retriever` returns FAILED or EMPTY for a critical tool, `biblical-scholar` can re-query directly. This is the recovery path, not the primary path.

### Modes (auto-detected)

- **ANALYZE**: Full exegetical analysis of a passage
- **VALIDATE**: Verdict on a specific interpretive claim — SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA
- **TRACE**: Cross-reference distribution of a lemma or theme across the canon

### Output Contract

#### ANALYZE mode

```
MODE: ANALYZE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]

## Passage Analysis
[Exegetical analysis grounded in data-retriever output]

## Scholarly Sources
- [Tier A/B/C] Author, Work: ...

## Confidence Justification
[Why this tier]

## Limitations
[What was not checked]
```

#### VALIDATE mode

```
MODE: VALIDATE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]
VERDICT: [SUPPORTED|COMPATIBLE|NOT SUPPORTED|INSUFFICIENT DATA]

## Evidence
### MCP Data (via data-retriever)
[Compressed morphological/discourse evidence]

### Discourse Context
[Structural observations about the passage unit]

### Scholarly Sources
- [Tier A] Author, Work: ...
- [Tier B] Author, Work: ...

## Confidence Justification
[Why this tier — what data supports it]

## Limitations
[What was not checked]
```

#### TRACE mode

```
MODE: TRACE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]
LEMMA: [lemma] ([gloss])

## Distribution
| Book | Occurrences | Chapters |
|------|-------------|----------|
| ... | ... | ... |

## Concentration Analysis
[Where the lemma clusters and why that matters]

## Related Lemmas
[Semantic field from query_themes_for_lemmas]

## Scholarly Context
- [Tier A/B/C] Author, Work: ...
```

### Confidence Mapping from data-retriever States

| data-retriever state | Confidence ceiling |
|---------------------|-------------------|
| All requested tools CALLED | HIGH eligible |
| Some tools EMPTY_RETURNED | HIGH eligible (absence of evidence is evidence) |
| Any tool FAILED | Cap at MEDIUM (note which tool failed) |
| Critical tool FAILED (morphology for lexical questions) | Cap at LOW |
| data-retriever spawn failed entirely | CANNOT ANSWER — fall back to direct MCP calls |

### Iron Rules

1. **Data before prose** — spawn `data-retriever` via `Task` tool before composing any analysis
2. **Confidence tier always stated first** — HIGH / MEDIUM / LOW / CANNOT ANSWER
3. **Attribute every claim** — Tier A (NICNT/NIGTC/ICC), B (established scholars), C (popular, with caveat), D (never cite)
4. **VALIDATE mode requires explicit verdict** — no hedging
5. **No devotional language** — this is analysis, not application
6. **Theological guardrails apply** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness
7. **Output scales to the question** — simple lexical query gets 5 lines, complex theological question gets full treatment
8. **Recovery path** — if data-retriever returns FAILED for a critical tool, call that MCP tool directly. Log the fallback in Limitations.

### Difference from `consult-biblical-scholar` Skill

The skill is user-facing with a fixed output format, invoked via `/consult-biblical-scholar`. The agent produces whatever the calling context needs — a single verdict line for the study-evaluator, or full analysis for the main conversation.

---

## Agent 3: `study-evaluator` (sonnet)

### Purpose

Evaluates bible study materials against exegetical standards. Answers: "Is this study faithful to the text, or does it drift?"

### Tool Access

`Task`, `Read`, `Write`, `Glob`, `Grep`, `WebSearch`

Note: `Task` is required for spawning `biblical-scholar`. `Write` is included because evaluation reports are saved to file (see Output Location below).

### Input Types and Detection

The agent auto-detects input type based on these signals:

| Input Type | Detection Signals | Output Section |
|------------|-------------------|----------------|
| Study outline | Markdown headers with passage refs, numbered/bulleted points, questions for discussion | Outline Evaluation |
| Discussion transcript | Speaker labels ("Leader:", "Participant:"), timestamps, dialogue format, Q&A exchanges | Transcript Trace |
| Methodology reference | System prompts, agent instructions, structural templates, "guide" or "methodology" language | Methodology Audit |

**Mixed input handling:** When a document contains signals for multiple types, process all applicable sections. Label each section's type in the output. If ambiguous, default to study outline.

**Passage detection:** The agent must identify which biblical passage the study materials address. If the passage is not explicitly stated, infer from verse references in the content. If no passage can be identified, ask the user before proceeding.

### Output Location

Save to: `~/.claude/study-evaluations/{book}/{YYYY-MM-DD}-{description}.md`

Examples:
- `~/.claude/study-evaluations/philippians/2026-02-27-phil-2-1-11-study-session.md`
- `~/.claude/study-evaluations/genesis/2026-02-27-gen-1-methodology-audit.md`

### Output Contract

```
EVALUATION: [book] [passage] [description]
INPUT TYPE: [outline|transcript|methodology|combined]
OVERALL: [SOUND|SOUND_WITH_DRIFT|SIGNIFICANT_DRIFT|UNSOUND]

## Passage Reference Analysis
[Delegated to biblical-scholar — compact summary of what the text actually says]
REFERENCE_CONFIDENCE: [HIGH|MEDIUM|LOW]

## Outline Evaluation
[Present if outline detected]
### Point N: "[title]" (vv.X-Y) — [FAITHFUL|DRIFT DETECTED]
[Brief evidence. For DRIFT: type, issue, correction, severity]

## Transcript Trace
[Present if transcript detected]
[Timestamped or section-by-section trace with FAITHFUL / DRIFT marks]

## Methodology Audit
[Present if methodology files detected]
[Framework evaluation: does the structure prevent or enable drift?]

## Drift Summary
| # | Location | Type | Severity | Confidence | Corrected? |
|---|----------|------|----------|------------|------------|
| 1 | ... | ... | ... | [from biblical-scholar] | ... |

## Recommendations
[Constructive corrections for each drift point]
```

**Overall verdicts:**
- `SOUND` — no drift points detected
- `SOUND_WITH_DRIFT` — 1-2 drift points, all LOW-MODERATE severity
- `SIGNIFICANT_DRIFT` — 3+ drift points or any HIGH severity
- `UNSOUND` — systematic drift throughout, fundamental methodology issue

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

1. **Reference analysis first** — spawn `biblical-scholar` via `Task` tool before evaluating anything
2. **Classify every drift** — type + severity + confidence for each drift point
3. **FAITHFUL is the default** — not a fault-finding exercise. Sound points get explicit marks.
4. **Corrections are constructive** — every drift includes what it *should* say
5. **Theological guardrails are the rubric** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness
6. **Methodology audits evaluate frameworks, not intentions** — good prompt intentions don't count if the structure enables drift
7. **Surface upstream confidence** — drift verdicts must include the confidence level from biblical-scholar. If reference analysis was LOW confidence, mark drift findings as PROVISIONAL.

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
                           ▲                 Invocation: Task tool
                           │                 (haiku cannot spawn others)
                    ┌──────────────────┐
                    │  study-evaluator  │
                    │    (sonnet)       │
                    │                  │
                    │  Evaluates study  │
                    │  materials against│
                    │  scholar output   │
                    └──────────────────┘
                    Invocation: Task tool
                    Output: saved to file
```

**Invocation mechanism:** All inter-agent delegation uses Claude Code's `Task` tool with the `subagent_type` parameter. The parent agent spawns the child as a sub-task and receives the result.

**Call patterns:**
- `data-retriever` is always a leaf — restricted to MCP tools, cannot spawn other agents
- `biblical-scholar` spawns `data-retriever` via Task, enriches with web search + scholarly sources. Falls back to direct MCP calls if retriever fails.
- `study-evaluator` spawns `biblical-scholar` via Task, evaluates materials against its output
- Existing skills can optionally delegate to agents (future refactor, not part of initial build)

**Recovery path:** If `biblical-scholar` spawns `data-retriever` and gets a response with FAILED states for critical tools, it calls those MCP tools directly as a fallback. This adds latency but prevents data gaps from cascading.

---

## Build Order

| Phase | Deliverable | Validates |
|-------|-------------|-----------|
| **Phase 1** | `data-retriever` agent | Haiku + MCP reliability, compression accuracy, token savings, output format stability |
| **Phase 2** | `biblical-scholar` agent | Task-based delegation chain, recovery path, scholarly output quality vs `consult-biblical-scholar` |
| **Phase 3** | `study-evaluator` agent | Full chain, input type detection, real study material evaluation, file output |
| **Phase 4** (future) | Refactor existing skills to use agents | Whether skills benefit from delegation or are better self-contained |

Phase 1 is the riskiest — tests whether haiku handles MCP orchestration reliably and whether compression saves tokens without losing critical data. If Phase 1 fails (haiku too lossy, output format unstable), we either upgrade data-retriever to sonnet or rethink the compression approach before building the rest.

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

### Test Structure Decision

Agents follow the same TDD methodology as skills: three test files per agent in `tests/agents/{agent-name}/`. The CLAUDE.md repository structure section must be updated to include `agents/` and `tests/agents/` before the first agent is built. This is a prerequisite for Phase 1.

---

## Resolved Questions

1. **Test structure** — `tests/agents/` with identical three-file structure. CLAUDE.md update is a Phase 1 prerequisite.
2. **Inter-agent invocation** — `Task` tool with `subagent_type`. Verified from Claude Code agent architecture.
3. **data-retriever failure modes** — strict output format with explicit states (CALLED/SKIPPED/FAILED/EMPTY). biblical-scholar maps states to confidence ceilings and has a direct MCP fallback path.
4. **study-evaluator output** — file-saved to `~/.claude/study-evaluations/`, consistent with `exegetical-notes` and `biblical-segmentation` patterns.
5. **MCP truncation** — data-retriever reports truncation in TRUNCATION field. biblical-scholar treats truncated results as potentially incomplete.

## Open Questions

1. **Skill-to-agent migration** — should `consult-biblical-scholar` skill eventually become a thin wrapper around the `biblical-scholar` agent? Deferred to Phase 4.
2. **Auto-discovery verification** — while the pattern is standard across plugins, a minimal test agent should be created and verified during Phase 1 setup before writing the full data-retriever.
