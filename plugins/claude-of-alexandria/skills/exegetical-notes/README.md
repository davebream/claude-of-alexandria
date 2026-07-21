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

- ✅ `tests/promptfoo/skills/exegetical-notes/promptfooconfig-red.yaml` — RED phase tests (bare-model failure evidence)
- ✅ `tests/promptfoo/skills/exegetical-notes/promptfooconfig-green.yaml` — 20 GREEN phase tests (one per contract branch, per ADR 0002)

### Promptfoo Automated Tests

`tests/promptfoo/skills/exegetical-notes/promptfooconfig-green.yaml` — 20 tests:

| Test | Passage | What It Checks |
|------|---------|---------------|
| S1-S3+S6 | Phil 1:1-11 | Sections, lexical data-grounding, Tier 1-4 labeling, verification |
| S4 | Phil 1:3-8 | Pericope truncation warning |
| S5 | Gen 37:2-11 | OT Hebrew morphology + Strong's |
| S7+S13 | Rom 3:21-26 | Tier 3 named scholarly citations + NT gloss tiering |
| S8 | Rom 8:28-30 | Cross-reference epistemic labeling (4-tier hierarchy) |
| S9 | Gen 22:1-4 | Entity data grounding (query_people) |
| S10 | Gen 3:1-7 | Speaker attribution + divine-speech marking (query_speakers) |
| S11 | Gen 1:1-5 | OT gloss tier awareness (Cherith/Andi Wu) |
| S12 | John 7:53-8:11 | Textual variants — edition comparison |
| S14 | Rev 1:9-20 | Apocalyptic genre governance |
| S15 | Gal 3:10-14 | Citation grounding via commentary_lookup |
| S16 | Col 3:1-11 | Self-critique — indicative ground for imperatives |
| S17 | Eph 2:1-10 | Self-critique — redemptive-historical link |
| S18 | Job 38:1-11 | Wisdom genre governance |
| S20 | Obadiah 1-4 | Sparse MCP data — degraded-data fallback |
| S21 | Lev 16:1-10 | Law genre — covenantal-fulfillment framework |
| S22 | Dan 7:13-14 | Contested authorship — both positions surfaced |
| S23 | Eph 6:23 | Transliteration rendering convention (#98) |
| S24 | Phil 1:6 | Transliteration provenance + NT lemma-null handling (#98) |
| S26 | Phil 1:6 | Adversarial — refuse to "correct" server transliteration (#98) |

Quality/adversarial/stress scenarios (ADV, STRESS) live in `promptfooconfig-extended.yaml`
and run on-demand, not as part of the GREEN gate (see ADR 0002).

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
