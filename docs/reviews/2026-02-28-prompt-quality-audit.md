# Prompt Quality Audit — Skills & Agents

**Date:** 2026-02-28
**Scope:** All skills and agents in `plugins/claude-of-alexandria/`
**Method:** Token estimation (bytes ÷ 4), line count, structural analysis

---

## Inventory Table

### Skills

| File | Lines | Est. Tokens | Quality Score |
|------|-------|-------------|---------------|
| `skills/argument-flow/SKILL.md` | 384 | ~3,624 | **8.5 / 10** |
| `skills/biblical-segmentation/SKILL.md` | 325 | ~4,071 | **7.0 / 10** |
| `skills/consult-biblical-scholar/SKILL.md` | 415 | ~4,865 | **7.5 / 10** |
| `skills/exegetical-notes/SKILL.md` | 439 | ~4,658 | **7.5 / 10** |
| `skills/pericope-delimitation/SKILL.md` | 298 | ~2,846 | **8.0 / 10** |
| `skills/smoke-test/SKILL.md` | 15 | ~97 | **9.5 / 10** |

### Agents

| File | Lines | Est. Tokens | Quality Score |
|------|-------|-------------|---------------|
| `agents/biblical-scholar.md` | 158 | ~1,923 | **8.5 / 10** |
| `agents/data-retriever.md` | 117 | ~1,791 | **9.5 / 10** |
| `agents/study-evaluator.md` | 138 | ~1,908 | **8.0 / 10** |
| `agents/smoke-test.md` | 10 | ~62 | **9.5 / 10** |
| `agents/_test-discovery.md` | 8 | ~56 | **N/A (delete)** |

> Token estimates via `bytes ÷ 4`. Actual LLM tokenizer counts will vary ±10–15%.

---

## Recommendations Table

### Skills

| File | Compactable? | Est. Savings | Key Issues | Specific Actions |
|------|-------------|--------------|------------|-----------------|
| `argument-flow` | Yes (~8%) | ~290 tokens | Sub-agent delegation section partially duplicates the workflow. Rule 1 wrong/correct examples are long but all load-bearing. | Merge sub-agent delegation "Fallback method" into the workflow step 3 comment block; trim OT/NT code blocks in delegation section since they repeat the workflow exactly. |
| `biblical-segmentation` | Yes (~20%) | ~814 tokens | Red Flags table has 20 entries, several conceptually overlapping. "Genre-Methodology Quick Reference" could be a tighter table. The Slice Mode section is comprehensive but verbose. | Consolidate Red Flags 1–20 into thematic groups (~12 items). Convert Genre-Methodology Quick Reference to a 2-column table (Genre → Marker type only). Merge Short Pericope Handling into Slice Sizing table. |
| `consult-biblical-scholar` | Yes (~15–20%) | ~730–970 tokens | Three redundancies: (1) "Reference Data Access" section (lines 355–371) restates what the workflow already covers inline. (2) "Theological Guardrails" section (lines 392–401) repeats concepts embedded in Iron Rules. (3) "Question Routing" section partially restates the mode descriptions in the Workflow. | Delete "Reference Data Access" section entirely — covered by workflow. Merge Theological Guardrails into a one-line note in Iron Rule 5. Compress Question Routing to a 3-row trigger table only. |
| `exegetical-notes` | Yes (~15%) | ~700 tokens | "Reference Data Access" section (lines 352–383) fully restates workflow steps 2 and 6. "Semantic Groups Reference" table (lines 388–397) is inline reference data that belongs in the YAML file it points to. "Example Output Fragment" is long but high-value — keep but trim to one lemma. | Delete "Reference Data Access" section. Remove inline Semantic Groups table (it's just echoing semantic_groups.yaml; a one-line pointer suffices). Trim example fragment to 2 lemmas. |
| `pericope-delimitation` | Yes (~15%) | ~427 tokens | "Reference Data Access" section (lines 213–242) duplicates Iron Rule 1 and workflow steps 1–2 — same MCP tool calls, same usage notes. "Genre-Specific Guidance" (lines 152–194) is valuable but the common-mistakes bullets overlap with the Common Failure Patterns table below. | Delete "Reference Data Access" section. Consolidate genre-specific "Common mistakes" bullets into the existing Common Failure Patterns table. |
| `smoke-test` | No | — | Minimal by design; no changes needed. | Keep as-is. |

### Agents

| File | Compactable? | Est. Savings | Key Issues | Specific Actions |
|------|-------------|--------------|------------|-----------------|
| `biblical-scholar.md` | Yes (~8%) | ~154 tokens | Iron Rules at the bottom (lines 149–158) restate principles already embedded inline: "Data before prose" is the entire "Data Gathering" section; "Recovery path" repeats the Criticality Table note. | Merge Iron Rules 1, 4, 8 into one-line callouts at their inline locations. Keep rules 2, 3, 5, 6, 7 as the summary list. |
| `data-retriever.md` | Yes (~3%) | ~54 tokens | "Book-only requests" note is embedded mid-section as a paragraph — easy to miss. The `pos_filter` example repeats the compression guidelines example. | Pull book-only handling into a dedicated row in a "Request type → behavior" table at the top of "What to Call." |
| `study-evaluator.md` | Yes (~10%) | ~191 tokens | Iron Rule #8 "No passage = ask" is the longest single rule with multiple negatives restating the same constraint. "Format Compliance" wrong/right examples have three full pairs when one would establish the pattern. | Condense Rule #8 to one sentence + exception. Trim Format Compliance to one wrong/right pair + a principle statement. |
| `smoke-test.md` | No | — | Minimal by design; no changes needed. | Keep as-is. |
| `_test-discovery.md` | **Delete** | ~56 tokens | Description says "DELETE after verification." File is live in the agent registry and will be auto-discovered. | Delete the file. |

---

## Cross-Cutting Patterns

### 1. "Reference Data Access" anti-pattern

Four major skills (`pericope-delimitation`, `exegetical-notes`, `argument-flow`, `consult-biblical-scholar`) all have a trailing section that restates MCP call syntax already present in their workflow steps. This pattern costs ~1,500 tokens across the suite with zero additive value.

### 2. Wrong/Correct examples are load-bearing — do not compact them

These are the highest-value content in every skill. They are specifically what prevents the failure modes these skills were designed to address. Compaction efforts should target structural redundancy, not the examples.

### 3. The `data-retriever` agent is the tightest file in the project

Its output contract, state labels, and compression guidelines are a model for how structured agent prompts should be written. Worth referencing when compacting other files.

### 4. Total compaction opportunity

If all recommendations above are implemented: **~3,400–4,000 tokens saved** across the suite (~18% reduction) while preserving all functional constraints.

---

## Quality Scoring Criteria

Scores were assessed across three dimensions:

- **Writing quality** — Are instructions clear, precise, and unambiguous? Are failure modes explicitly named?
- **Compactability** — Are there redundant sections, repeated concepts, or structural duplication?
- **Structural integrity** — Is the document well-organized? Does the section order reflect execution order?

| Score | Meaning |
|-------|---------|
| 9–10 | Optimal — no meaningful improvements available |
| 8–9 | Excellent — minor structural redundancy |
| 7–8 | Good — notable compaction opportunity without functional loss |
| 6–7 | Moderate — significant redundancy or structural issues |
| <6 | Needs rewrite |
