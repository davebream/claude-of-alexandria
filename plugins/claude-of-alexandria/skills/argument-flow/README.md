# argument-flow — Development Notes

## Status

GREEN phase complete (2026-02-24). Ready for REFACTOR testing.

## What This Skill Does

Maps the logical argument of a biblical passage by:
1. Calling `query_morphology` with `pos_filter: "conjunction"` to extract logical connectives
2. Calling `query_discourse_features` (NT) or `query_paragraph_breaks` (OT) for structural context
3. Producing a numbered proposition chain where each node is labeled with its connective type

## Why It Was Needed

Baseline testing (see `tests/skills/argument-flow/baseline.md`) documented six critical failure modes:

1. No MCP calls — agents answered entirely from training data
2. No confidence tier declared
3. Scholarly claims without attribution
4. Mode conflation (argument-flow became VALIDATE)
5. Devotional drift in analytical language
6. No proposition chain format — prose summaries only

## Design Decisions

### MCP-before-prose (Rule 1)
The most critical rule. Without it, agents produce fluent analysis that cannot be distinguished from verified data. The rule is identical in spirit to `consult-biblical-scholar` Rule 2.

### Confidence Tier (Rule 2)
Same four-tier system as `consult-biblical-scholar`. Consistency matters — users should encounter the same epistemic standards across all analysis skills.

### Proposition Chain (Rule 3)
The core output format. Each proposition: label, Greek connective, verse reference, English clause, logical relationship. Asyndeton (no connective) is also noted — its absence carries meaning in Greek.

### Genre Detection (Rule 4)
Epistolary conjunctions (γάρ, οὖν, ἵνα) do not appear in OT Hebrew narrative. The genre table prevents applying NT epistle logic to Psalms or Genesis. OT analysis uses Masoretic paragraph markers and Hebrew clause-level morphology.

### Scope Warning (Rule 5, 30-verse limit)
Tested in Scenario 7 (Romans 1:1–8:39). Without this rule, agents produce high-level summaries masquerading as argument-flow maps. 30 verses is a practical ceiling for proposition-chain granularity.

### No Devotional Language (Rule 6)
Tested in Scenario 3. Drift is subtle — it often appears in phrasing choices rather than explicit application. The red flag table includes specific examples.

### Mode Boundary (Rule 7)
Tested in Scenario 5. The skill deliberately does not issue theological verdicts. That work belongs to `consult-biblical-scholar` with its VALIDATE mode and formal verdict system.

## Data Sources

- MorphGNT / SBLGNT (CC BY-SA 3.0) — NT morphological parsing via `query_morphology`
- Open Scriptures Hebrew Bible morphhb (CC BY 4.0) — OT morphology
- Levinsohn GNT Discourse Features (dataset 2016) — discourse structure via `query_discourse_features`
- Sefaria / OpenScriptures paragraph markers — OT structure via `query_paragraph_breaks`

## Related Skills

- `consult-biblical-scholar` — for theological questions, analogy validation, cross-references
- `exegetical-notes` — for full passage analysis saved to file (includes argument-flow as one component)
- `pericope-delimitation` — for passage boundary checking before argument-flow analysis
