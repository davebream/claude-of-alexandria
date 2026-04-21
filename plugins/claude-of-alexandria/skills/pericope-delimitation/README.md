# Pericope Delimitation Skill

## Architecture

**Thin wrapper** — this skill delegates all work to the `pericope-delimitation` agent via the Agent tool. The skill exists for auto-discovery (description triggers skill loading); the agent contains all analytical logic.

See: `agents/pericope-delimitation.md`

## Purpose

Validates whether a user-provided biblical passage constitutes a coherent discourse unit.
Recommends extensions/contractions based on linguistic evidence from MCP data.

## Key Design Decisions

- **Thin wrapper pattern** — skill loads, spawns agent, returns output verbatim
- **Agent calls MCP directly** — no data-retriever intermediary; preserves tool name citations
- **Inline output** (not saved to file) — this is a diagnostic step, not a deliverable
- **Standalone** — NOT connected to biblical-segmentation; serves exegesis broadly
- **Data-first** — always checks Levinsohn (NT) or Masoretic (OT) before forming verdict
- **Structured format** — VALID/EXTEND/CONTRACT/ADJUST verdict, always specific

## Data Sources Used (via agent's MCP calls)

- `query_discourse_features` — NT Levinsohn discourse features
- `query_paragraph_breaks` — OT Masoretic paragraph markers
- `query_morphology` — morphological data
- `skills/biblical-segmentation/reference/book-genres.yaml` — genre methodology

## TDD Status

- Tests live at `tests/promptfoo/skills/pericope-delimitation/`
- Wrapper skill tests serve as agent unit tests (wrapper is a pure relay)

## Invocation

```
/pericope-delimitation Phil 1:3-8
/pericope-delimitation Genesis 37:2-11
```
