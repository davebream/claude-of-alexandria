# Pericope Delimitation Skill

## Purpose

Validates whether a user-provided biblical passage constitutes a coherent discourse unit.
Recommends extensions/contractions based on linguistic evidence from bundled data.

## Key Design Decisions

- **Inline output** (not saved to file) — this is a diagnostic step, not a deliverable
- **Standalone skill** — NOT connected to biblical-segmentation; serves exegesis broadly
- **Data-first** — always checks Levinsohn (NT) or Masoretic (OT) before forming verdict
- **Always English** — scholarly analysis tool
- **Structured format** — VALID/EXTEND/CONTRACT/ADJUST verdict, always specific

## Data Sources Used

- `skills/biblical-segmentation/reference/levinsohn/` — NT discourse features
- `skills/biblical-segmentation/reference/masoretic/` — OT paragraph markers
- `skills/biblical-segmentation/reference/book-genres.yaml` — genre methodology

## TDD Status

- ✅ `tests/skills/pericope-delimitation/scenarios.md` — 12 test scenarios
- ✅ `tests/skills/pericope-delimitation/baseline.md` — RED phase evidence
- ✅ `tests/skills/pericope-delimitation/verification.md` — GREEN phase proof

## Invocation

```
/pericope-delimitation Phil 1:3-8
/pericope-delimitation Genesis 37:2-11
```
