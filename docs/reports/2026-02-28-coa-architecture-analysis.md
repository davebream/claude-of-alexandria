# CoA Architecture Analysis — StudyWith Usage Report

**Date:** 2026-02-28
**Input:** `docs/reports/studywith-coa-usage-report.md` (Chloe Alexander Arthur)

---

## 1. What StudyWith Does

A mobile Bible study app with a pre-research pipeline. Two entry points into CoA:
- **`/series-research`** → calls `biblical-segmentation` to divide a book into sessions
- **`/package-research`** → calls `pericope-delimitation` to validate boundaries, then MCP tools for data

Each session becomes a "package" (7 curated files) that the AI study agent loads at runtime. The pipeline is linear, well-structured, and intentional about where CoA tools appear.

---

## 2. Gaps in Their Knowledge of CoA

| CoA Capability | Used? | Gap |
|---|---|---|
| `pericope-delimitation` | Yes — boundary validation in /package-research | None — well-placed |
| `biblical-segmentation` | Yes — book division in /series-research | **Slice mode unused** — SOAP needs 5-10 verse portions but they don't use it for within-pericope slicing |
| `argument-flow` | **Never called** | They write `argument-flow.md` files using raw `query_discourse_features` data — duplicating what the skill does, probably less rigorously |
| `exegetical-notes` | **Never called** | Their `study-notes.md` is authored from scratch without the skill's structured methodology |
| `consult-biblical-scholar` | VALIDATE only | Never used in EXPLAIN or COMPARE modes, which could enrich `context.md` and `study-notes.md` |

---

## 3. Architectural Gaps

**biblical-segmentation proposes but doesn't validate.** It proposes pericope boundaries (session divisions) WITHOUT checking them with pericope-delimitation. Validation only happens downstream in /package-research — one package at a time, with no feedback loop to the segmentation that proposed the boundary.

**argument-flow is completely orphaned.** The skill exists, is tested, works — but their pipeline reinvents it from raw MCP data inside /package-research's system prompt.

**Slice mode is invisible to them.** Their SOAP methodology explicitly needs 5-10 verse portions. When a pericope exceeds that, they have no mechanism to pre-determine slice boundaries with structural integrity.

---

## 4. What This Tells Us About the Three Skills

**pericope-delimitation → sub-agent candidate.** Its only real consumer is /package-research (a pipeline command). Nobody invokes `/pericope-delimitation` as a standalone human command. It's already functioning as an internal validation step.

**argument-flow → even stronger sub-agent candidate.** Zero direct usage in the only real consumer of this plugin. Its value is as an analytical engine called by higher-level workflows. Converting it to a sub-agent would also let biblical-segmentation compose it for slice-mode structural analysis.

**biblical-segmentation → stays as a user-facing skill.** /series-research is a direct user command that delegates to it. But it should internally compose the other two as sub-agents.

### Proposed Architecture

```
User-facing skills:
  biblical-segmentation    (book→sessions, pericope→slices)
  consult-biblical-scholar (scholarly validation)
  exegetical-notes         (structured analysis)

Internal sub-agents:
  data-retriever           (MCP data gathering — already exists)
  pericope-delimitation    (boundary validation engine)
  argument-flow            (structural analysis engine)
```

---

## 5. New Skill/Sub-Agent Opportunities

Three capabilities that clearly belong in CoA rather than StudyWith:

### `cross-reference-curator` sub-agent

They use `query_ot_quotes` then manually curate 10-20 references. The curation logic (ranking by theological relevance, classifying as quotation/allusion/echo/thematic parallel) is biblical scholarship, not app logic. Their planned `/package-theologian` (Dimension 4) needs this same capability for quality checking. Natural CoA sub-agent.

### `word-study-researcher` sub-agent

/package-research takes `query_morphology` output and selects 5-10 theologically significant lemmas. The selection criteria (theological weight, clustering significance, frequency patterns) is biblical analysis. This could return ranked key words with meaning ranges and clustering data, directly feeding their `key-words.md`.

### `outline-generator` sub-agent

Every package needs an `outline.md` showing how the passage divides into sub-units. That's structural discourse analysis — exactly what pericope-delimitation + argument-flow do together. A sub-agent that composes those two would produce outlines for any consumer, not just StudyWith.

### Reading slice surfacing (existing capability)

The reading slice capability isn't new — it's the existing slice mode in biblical-segmentation that they don't know about. Surfacing it would let /series-research pre-determine within-session reading portions for SOAP/Swedish methods.

---

## 6. Impact on Current Work

The remaining 3 test failures in biblical-segmentation (SL1, SL2, SL5) all involve slice mode needing structural analysis before slicing. Converting `pericope-delimitation` and `argument-flow` to sub-agents would let biblical-segmentation compose them in slice mode — solving these failures architecturally rather than by adding more rules to the skill.

This is a larger refactor than the current rewrite scope. Recommended as a follow-up plan.
