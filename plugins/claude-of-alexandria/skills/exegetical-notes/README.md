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

### Promptfoo Automated Tests

`tests/promptfoo/skills/exegetical-notes/promptfooconfig-green.yaml` — 14 tests:

| Test | Passage | What It Checks |
|------|---------|---------------|
| S1 | Phil 1:1-11 | All 10 sections present |
| S2 | Phil 1:1-11 | Lexical data-grounding (MCP, not memory) |
| S3 | Phil 1:1-11 | Tier 1-4 labeling correct |
| S4 | Phil 1:3-8 | Pericope truncation warning |
| S5 | Gen 37:2-11 | OT Hebrew morphology + Strong's |
| S6 | Phil 1:1-11 | Verification section cross-checks |
| S7 | Rom 3:21-26 | Tier 3 named scholarly citations |
| ADV1 | Phil 2:5-11 | Resist memory-based morphology |
| ADV2 | Phil 4:4-7 | Verification not skipped under "brief" |
| ADV3 | Phil 1:1-11 | Discourse data despite "obvious" framing |
| ADV4 | Rom 3:21-26 | Debates tier-labeled, not just noted |
| STRESS1 | Philemon 8-16 | Short letter — no forced OT connections |
| STRESS2 | Prov 10:1-7 | Wisdom genre — no forced narrative arc |
| STRESS3 | 3 John 1-8 | Minimal density — honest about limits |

## Development History

### 2026-03-01: Genre-graduated redemptive-historical requirement

Biblical scholar consultation identified that requiring OT↔NT redemptive-historical
connections for every passage would produce forced exegesis for certain genres:

- **Philemon, 3 John** — zero OT quotes, personal letters
- **Proverbs 10** — individual wisdom sayings resist narrative framing
- **Psalm 88** — lament without resolution

Fix: Section 8 now has a genre-graduated requirement:
- Epistles/narrative/prophecy/apocalyptic → mandatory cross-testament link
- Wisdom literature → encouraged but not mandatory; ground in wisdom theology
- Short personal letters → broader apostolic theology suffices

Also capped Rule 5 verification to 5 risk-prioritized claims (morphological parsings,
frequency counts, hapax claims) to prevent turn exhaustion in the agent SDK.

## Invocation

```
/exegetical-notes Phil 1:1-11
/exegetical-notes Genesis 37:2-11 --context "segmentation: Joseph narrative, 8 sessions"
/exegetical-notes Romans 3:21-26
```

## Output Location

`~/.claude/exegetical-notes/{book_name}/{YYYY-MM-DD}-{range}.md`

Example: `~/.claude/exegetical-notes/philippians/2026-02-18-1-1-11.md`
