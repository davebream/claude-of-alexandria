# Exegetical Notes Skill

## Purpose

Produces structured, context-neutral exegetical analysis of a biblical passage.
Data-grounded. Always English. Saved to `~/.claude/exegetical-notes/`.

## Key Design Decisions

- **File output** — saves to `~/.claude/exegetical-notes/{book}/{date}-{range}.md`
- **10-section fixed structure** — predictable, citable artifact
- **Data-first lexical analysis** — morphology_parser.py required for Section 4
- **4-tier guardrails** — Linguistic / Discourse / Scholarly / Agent assessment
- **Built-in pericope check** — warns before generating notes for invalid pericope
- **verify_claims.py integration** — Section 10 reports verification results
- **Tier A/B source preference** — scholarly rigor for Tier 3 claims

## Infrastructure Dependencies

This skill requires Phase 1 infrastructure:
- `scripts/morphology_parser.py` ← morphological parsing data
- `scripts/verify_claims.py` ← output verification
- `reference/morphology/nt/` ← per-book NT morphology JSON
- `reference/morphology/ot/` ← per-book OT morphology JSON

Plus existing infrastructure:
- `scripts/vocabulary_parser.py`
- `scripts/levinsohn_parser.py`
- `scripts/sefaria_paragraphs.py`
- `reference/vocabulary/`
- `reference/levinsohn/`
- `reference/masoretic/`

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
