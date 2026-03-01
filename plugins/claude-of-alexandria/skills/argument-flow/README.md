# argument-flow — Development Notes

## Architecture

**Thin wrapper** — this skill delegates all work to the `argument-flow` agent via the Task tool. The skill exists for auto-discovery (description triggers skill loading); the agent contains all analytical logic.

See: `agents/argument-flow.md`

## Status

Converted to thin wrapper (2026-02-28). Agent extracted from GREEN phase skill.

## What This Agent Does

Maps the logical argument of a biblical passage by:
1. Spawning data-retriever (Haiku) for MCP data gathering
2. Extracting logical connectives from morphological data
3. Producing a numbered proposition chain with labeled connective types

Supports two output modes:
- **Standard Mode** — full Confidence + Connective Inventory + Proposition Chain + Data Sources
- **Slice-Analysis Mode** — triggered by "for reading-slice boundary planning"; structural features only

## Why It Was Needed

Baseline testing (see `tests/promptfoo/skills/argument-flow/promptfooconfig-red.yaml`) documented six critical failure modes:

1. No MCP calls — agents answered entirely from training data
2. No confidence tier declared
3. Scholarly claims without attribution
4. Mode conflation (argument-flow became VALIDATE)
5. Devotional drift in analytical language
6. No proposition chain format — prose summaries only

## Design Decisions

### Sub-Agent Architecture
- **Skill** = thin wrapper (auto-discovery + Task delegation)
- **Agent** = all analytical logic (sonnet model, MCP tools)
- **data-retriever** = MCP data gathering (haiku model)

### MCP-before-prose (Rule 1)
The most critical rule. Without it, agents produce fluent analysis that cannot be distinguished from verified data.

### Proposition Chain (Rule 3)
The core output format. Each proposition: label, Greek connective, verse reference, English clause, logical relationship.

### Slice-Analysis Mode
Triggered by biblical-segmentation when composing argument-flow for reading-slice boundary planning. Returns structural features (chiasmus, contrast zones, dialogue boundaries) rather than full proposition chain.

## Data Sources

- MorphGNT / SBLGNT (CC BY-SA 3.0) — NT morphological parsing via `query_morphology`
- Open Scriptures Hebrew Bible morphhb (CC BY 4.0) — OT morphology
- Levinsohn GNT Discourse Features (dataset 2016) — discourse structure via `query_discourse_features`
- Sefaria / OpenScriptures paragraph markers — OT structure via `query_paragraph_breaks`

## Related Skills

- `consult-biblical-scholar` — for theological questions, analogy validation, cross-references
- `exegetical-notes` — for full passage analysis saved to file (includes argument-flow as one component)
- `pericope-delimitation` — for passage boundary checking before argument-flow analysis
