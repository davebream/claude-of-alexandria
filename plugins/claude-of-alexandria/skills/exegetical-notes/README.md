# Exegetical Notes Skill

## Purpose

Produces structured, context-neutral exegetical analysis of a biblical passage.
Data-grounded. Always English. Saved to `~/.claude/exegetical-notes/`.

## Key Design Decisions

- **File output** — saves to `~/.claude/exegetical-notes/{book}/{date}-{range}.md`
- **10-section fixed structure** — predictable, citable artifact
- **Data-first lexical analysis** — query_morphology MCP tool required for Section 4
- **4-tier guardrails** — Linguistic / Discourse / Scholarly / Agent assessment
- **Built-in pericope check** — warns before generating notes for invalid pericope
- **MCP cross-check verification** — Section 10 reports data claim verification results
- **Tier A/B source preference** — scholarly rigor for Tier 3 claims

## Infrastructure Dependencies

This skill uses the claude-of-alexandria MCP server for all data access:
- `query_morphology` — morphological parsing data (NT and OT)
- `query_vocabulary` — lemma frequencies per book
- `query_discourse_features` — Levinsohn GNT discourse features (NT)
- `query_paragraph_breaks` — Masoretic paragraph markers (OT)
- `query_ot_quotes` — OT quotation detection in NT passages

## TDD Status

- ✅ `tests/skills/exegetical-notes/scenarios.md` — 7 test scenarios
- ✅ `tests/skills/exegetical-notes/baseline.md` — RED phase evidence
- ✅ `tests/skills/exegetical-notes/verification.md` — GREEN phase criteria

## Invocation

```
/exegetical-notes Phil 1:1-11
/exegetical-notes Genesis 37:2-11 --context "segmentation: Joseph narrative, 8 sessions"
/exegetical-notes Romans 3:21-26
```

## Output Location

`~/.claude/exegetical-notes/{book_name}/{YYYY-MM-DD}-{range}.md`

Example: `~/.claude/exegetical-notes/philippians/2026-02-18-1-1-11.md`
