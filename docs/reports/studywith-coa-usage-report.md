# Claude of Alexandria Usage in StudyWith — Report for Chloe Alexander Arthur

**Date:** 2026-02-28

---

## 1. What the App Does

**StudyWith** is a mobile Bible study companion. Instead of a reference library, it works like a daily guided session: a user opens the app, picks a passage, picks a study methodology (Inductive, SOAP, Swedish, or Verse Mapping), and an AI agent walks them through the study one step at a time — asking questions, guiding observations, and helping them arrive at personal application.

The AI agent doesn't browse the internet or query a live database during a conversation. Everything it knows about a passage is pre-researched and pre-packaged by humans (and tools) before the app ever ships.

---

## 2. What a "Package" Is

A **study package** is a self-contained folder of research for one passage of Scripture. Think of it as a binder a seminary student would prepare before leading a Bible study — every piece of background work done in advance, so the session itself can focus on guided discovery rather than real-time research.

For example, the package for John 1:1–18 lives at:

```
content/packages/john-1-1-18/
├── manifest.json          — metadata (book, verses, genre, etc.)
├── en/
│   ├── passage.md         — the Scripture text (2–3 translations)
│   ├── context.md         — historical and cultural background
│   ├── key-words.md       — pre-researched word studies (Greek/Hebrew)
│   ├── cross-references.md — curated cross-references (not 500,000 — about 10–20)
│   ├── outline.md         — passage structure
│   ├── study-notes.md     — theological notes and application angles
│   └── guardrails.md      — theological guardrails (what NOT to say, misreadings to prevent)
└── pl/                    — same 7 files in Polish
```

The AI study agent loads all of these files into its instructions when a user starts a session. This is intentional: it keeps the agent grounded in curated, passage-specific scholarship rather than general training data.

Current packages: `john-1-1-18`, `psalm-23-1-6`, `romans-8-28-39`.

---

## 3. What a "Series" Is

A **series** is a multi-day study plan for a whole biblical book or thematic collection, broken into individual study sessions. Each session corresponds to one package.

For example, a "Gospel of John" series might have 21 sessions. Each session covers a natural literary unit (a pericope). The series metadata says: Day 1 = `john-1-1-18`, Day 2 = `john-1-19-34`, etc.

Series live at `content/series/` as JSON files. They are the entry point users browse in the app's Explore tab — they pick a series, then work through it day by day.

---

## 4. The Content Production Pipeline

Creating a new package involves a sequenced set of AI-assisted commands. Each command is a slash-command (e.g., `/package-research`) that invokes Claude Code with a carefully written system prompt telling it exactly how to use its tools. The pipeline runs in phases:

```
Series planning:       → /series-research          ← IMPLEMENTED
Phase B: Scaffold      → /package-scaffold          ← IMPLEMENTED
Phase C1: Research     → /package-research          ← IMPLEMENTED
Phase C2: Author       → /package-author            ← IMPLEMENTED
Phase C3: Guardrails   → /guardrails-auditor        ← IMPLEMENTED (auto-delegated from package-author)
Phase C4: Gates        → /completion-gates-designer ← IMPLEMENTED (auto-delegated from package-author)
Phase D1: Eval cases   → /eval-case-author          ← PLANNED (not yet built)
Phase D2: Theology QA  → /package-theologian        ← PLANNED (not yet built)
Phase D3: Localization → /package-localize          ← PLANNED (not yet built)
Phase E:  Orchestrator → /package-review            ← PLANNED (not yet built)
Series scaffold        → /series-scaffold           ← PLANNED (not yet built)
```

---

## 5. How Claude of Alexandria Is Used — What Is Built Today

### MCP Tools (implemented)

| CoA MCP Tool                               | Called From                                  | What It Returns                                                                                                                             | Why It's Needed                                                                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_books`                               | `/series-research` — before any analysis     | The catalogue of all books in the CoA database, with canonical names                                                                        | Validates that the book name the user typed actually exists in CoA before proceeding. "John" is fine; "Johann" would be rejected early rather than silently failing later.                                                                                        |
| `list_books` (with `include_themes: true`) | `/package-research` — Round 2 (vocabulary)   | Available thematic keyword groups for the testament                                                                                         | The vocabulary database organises lemmas into named themes (e.g., "covenant", "light/darkness"). `list_books` with themes tells the researcher which themes exist for NT or OT before requesting vocabulary data for them.                                        |
| `query_morphology`                         | `/package-research` — every passage          | Word-level morphological parsing: lemma, part of speech, case, tense, Strong's number                                                       | This is the foundation of the key-words.md file. Every meaningful noun and verb in the passage gets identified here, with its Greek or Hebrew root. The researcher then selects 5–10 theologically significant lemmas from this output for deep study.            |
| `query_morphology`                         | `/guardrails-auditor` — Step 1               | Same morphological data                                                                                                                     | Used adversarially: the auditor looks at which words carry the most theological weight, then asks "what would a user get wrong about this word?" Those become the guardrail candidates.                                                                           |
| `query_vocabulary`                         | `/package-research` — Round 1 (all passages) | Lemma frequencies across the whole book, plus vocabulary clustering detection                                                               | Tells the researcher whether key words in this passage are concentrated here (a cluster) or spread throughout the book. A cluster is exegetically significant — it means the author is doing something deliberate at this point.                                  |
| `query_vocabulary` (with `theme`)          | `/package-research` — Round 2 (NT and OT)    | All lemmas in the passage that belong to a named semantic theme                                                                             | Enables theme-based word studies. For John 1:1–18, you might query the "light/darkness" theme and discover every lemma in the passage that belongs to that semantic field — not just the ones you thought of.                                                     |
| `query_discourse_features`                 | `/package-research` — NT passages only       | Levinsohn's NT discourse features by chapter: sentence connectives, paragraph markers, point-of-departure constructions, tail-head linkages | NT prose is structured with Greek linguistic devices that English translations flatten. This data reveals the argument structure — why Paul says "therefore" in Romans 8:31 and what it is pointing back to. Used for `argument-flow.md` (NT discourse packages). |
| `query_paragraph_breaks`                   | `/package-research` — OT passages only       | Masoretic paragraph markers (setumah/petuhah divisions) for OT chapters                                                                     | OT Hebrew manuscripts use paragraph markers to indicate major and minor divisions. These are the closest ancient equivalent to structural analysis. Used for `outline.md` in OT packages.                                                                         |
| `query_ot_quotes`                          | `/package-research` — NT passages only       | OT quotations, allusions, and echoes detected in the NT passage, with the source reference                                                  | John 1:1 alludes to Genesis 1:1. Romans 8 echoes Psalm 44. The cross-references.md file in a package is built from what the NT author was actually drawing on — grounded in scholarship rather than pattern-matching from training data.                          |

### CoA Skills — Specialist AI Agents (implemented)

| CoA Skill                                  | Called From                                                   | What It Does                                                                                                                                                                                                   | Why It's Needed                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pericope-delimitation`                    | `/package-research` — Step 2, before any MCP queries          | Checks that the passage boundaries in the manifest are exegetically valid. A pericope is the natural literary unit — beginning and end should align with the author's structure, not arbitrary chapter breaks. | Passage boundaries directly affect every downstream tool call (all MCP queries use an OSIS range built from manifest fields). If the boundaries are wrong, the entire research dossier is built on a misread passage. This check happens before any other work.                                                                                    |
| `biblical-segmentation`                    | `/series-research` — Step 4, the core of the command          | Takes a biblical book and session constraints and proposes multiple segmentation options: different ways to divide the book into study units, with structural rationale for each.                              | `/series-research` is method-aware (it knows Inductive, SOAP, and Swedish) but not segmentation-aware. It delegates the literary division logic entirely to this skill, which knows canonical structures, pericope conventions, and genre-appropriate division. `series-research` then rates the options returned against a method × genre matrix. |
| `consult-biblical-scholar` (VALIDATE mode) | `/guardrails-auditor` — Step 5, once per candidate misreading | Scholarly validation of a proposed interpretation or misreading. Returns: verdict (VALID / CONTESTED / OUTSIDE MAINSTREAM), confidence level, scholarly sources, and acceptable interpretive range.            | Every guardrail claim must be backed by this call. The auditor doesn't decide on its own whether "this passage teaches X" is a valid or dangerous reading — it asks the scholar agent, which returns documented scholarship. No guardrail entry is emitted without a VALIDATE response.                                                            |

### Command-to-Command Delegations (implemented)

| Caller             | Delegates To                 | When                                  | Why                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/package-author`  | `/guardrails-auditor`        | After all 7 content files are written | Guardrail generation is adversarial — it requires a separate mindset from content authoring. The author command hands off to the auditor rather than trying to self-audit. The auditor has different permissions (CoA VALIDATE access) that the author command intentionally does not hold. |
| `/package-author`  | `/completion-gates-designer` | After guardrails-auditor finishes     | Completion gates are pedagogical checkpoints in the study conversation — moments where the AI waits for the user to demonstrate understanding before advancing. These depend on both the content files and the guardrails being complete.                                                   |
| `/series-research` | `/package-research`          | Step 5, once per proposed series day  | After segmentation produces a series outline, each proposed day needs a full research dossier. `series-research` delegates to `package-research` for each session rather than duplicating the research pipeline.                                                                            |

---

## 6. Planned Extensions — To Be Implemented Soon

Three new commands are fully designed and approved, with detailed implementation plans written. None of these exist yet as runnable commands. They constitute Phase D of the content authoring pipeline.

### New MCP Tools that Phase D will introduce

| CoA MCP Tool               | Will Be Called From                                                          | What It Returns                                                   | Why It's Needed                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query_morphology`         | `/package-theologian` (D2) — Dimension 3 (Key-Words Accuracy)                | Morphological parsing for the passage, including Strong's numbers | Cross-checks every Strong's number in `key-words.md` against actual CoA data. A wrong Strong's number means the word study is pointing to the wrong Greek or Hebrew word entirely — a Must-Fix theological error.                                 |
| `query_vocabulary`         | `/package-theologian` (D2) — Dimension 3                                     | Lemma meaning ranges                                              | Verifies that the meaning range described for each key word is neither too narrow (missing important senses the author uses here) nor too broad (importing irrelevant senses into the passage).                                                   |
| `query_ot_quotes`          | `/package-theologian` (D2) — Dimension 4 (Cross-Reference Quality)           | OT quotations and allusions in the NT passage                     | Checks whether `cross-references.md` is missing any direct OT quotations that belong there. A missing direct quotation is a Must-Fix finding — it means the cross-reference file omits the most important intertextual connection in the passage. |
| `query_discourse_features` | `/package-theologian` (D2) — Dimension 5 (Internal Consistency), NT passages | Discourse structure of the passage                                | Used to verify that `outline.md` and `argument-flow.md` are internally consistent with the actual Greek structure of the text.                                                                                                                    |
| `query_paragraph_breaks`   | `/package-theologian` (D2) — Dimension 5, OT passages                        | Masoretic paragraph markers                                       | Same purpose as above but for OT packages — the theological reviewer checks that the outline matches the ancient paragraph structure.                                                                                                             |
| `list_books`               | `/package-theologian` (D2) — Setup                                           | Book catalogue                                                    | Used in the same setup step as `guardrails-auditor` — to load and verify CoA tools before beginning.                                                                                                                                              |
| `query_lemmas`             | `/package-theologian` (D2) — Dimension 1 (Guardrails Completeness)           | Lemma-level data for specific verses                              | Supports the adversarial dimension of the theological review: the reviewer queries specific lemmas to check whether theologically loaded terms in the passage are covered in `guardrails.md`.                                                     |
| `query_themes_for_lemmas`  | `/package-theologian` (D2) — Dimension 1                                     | Which theological themes a set of lemmas belong to                | Used alongside `query_lemmas` to detect whether any important semantic themes in the passage are absent from `guardrails.md`. If a passage's key words cluster into a theological theme that has no guardrail coverage, that's a gap.             |

### New CoA Skill Usage that Phase D will introduce

| CoA Skill                                  | Will Be Called From                                                | What It Does                                                                               | Why It's Needed                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consult-biblical-scholar` (VALIDATE mode) | `/package-theologian` (D2) — Dimension 1 (Guardrails Completeness) | Spot-checks 3–5 common misreadings NOT already in `guardrails.md` to see if they should be | The theological reviewer probes the package adversarially, generating misreadings that plausible readers might arrive at. Each candidate misreading gets a VALIDATE call to determine whether it is a genuine theological risk or within the defensible range. This is the same VALIDATE pattern used by `/guardrails-auditor`, extended here as an independent review pass to catch what the auditor may have missed. |

### The Three Planned Commands in Full

---

**`/eval-case-author` (Phase D1) — To Be Implemented**

This command authors the passage-specific evaluation test cases that cannot be templated across packages. When `/package-scaffold` sets up a new package, it pre-fills roughly 60% of the test cases in the evaluation datasets with reusable tests (opening tone, question stacking, emoji rules, stage markers). The remaining 40% must be written per-passage because they depend on the specific theology of that passage:

- **Crisis response test** (`*-05`): A simulated conversation where a user studying the passage discloses something personally distressing (e.g., grief while reading Psalm 23's "valley of the shadow of death"). Written in Polish. The test verifies the AI responds with empathy and creates space, rather than immediately pivoting back to the study. Judged by Claude Sonnet rather than Haiku, because pastoral sensitivity requires stronger evaluation.
- **Gate enforcement test** (`*-07`): A simulated scenario where a user gives a surface-level observation ("This psalm is beautiful and calming") that avoids engaging with the core theological truth the passage requires them to grasp. The test verifies the AI affirms warmly but steers toward depth — asking one good question rather than accepting the deflection.
- **Guardrail enforcement test** (`*-08`): A simulated scenario where a user asserts a specific NOT SUPPORTED reading found in `guardrails.md` (e.g., a prosperity gospel reading of Psalm 23, or a universalist reading of John 1:9). The test verifies the AI redirects using the actual text of the passage — not theological jargon, not by quoting the guardrail document, but by pointing to specific verses.
- **Surface response test** (`*-11`): A generic positive response ("This is really beautiful") that lacks engagement with any specific element of the passage. The test verifies the AI asks about a named, concrete element — a specific verse, image, or word — rather than a generic follow-up.

This command uses **no CoA MCP tools** — it reads the already-authored content files (`guardrails.md`, `completion-gates.md`, `study-notes.md`) and writes test cases in the evaluation YAML format.

---

**`/package-theologian` (Phase D2) — To Be Implemented**

This is the most CoA-intensive planned command. It performs a systematic theological review across six dimensions and produces a severity-graded report (`theological-review.md`) that tells the content author what must be fixed, what should be improved, and what is a minor note.

The six dimensions are:

1. **Guardrails completeness** — Uses `query_morphology`, `query_lemmas`, `query_themes_for_lemmas`, and `consult-biblical-scholar` VALIDATE to find common misreadings NOT already covered in `guardrails.md`. Also checks that every `sensitivity_flag` in the manifest has at least one Experience Validation Pattern in the guardrails file.
2. **Completion gates adequacy** — Reviews whether each gate truth is genuinely essential to the passage, checks that steering hints reference specific verses from this passage (not generic ones that could apply anywhere), and verifies the three-level escalation structure (Early → Mid → Late).
3. **Key-words accuracy** — Uses `query_morphology` to cross-check every Strong's number in `key-words.md` against actual CoA data. A wrong Strong's number is a Must-Fix. Uses `query_vocabulary` to verify meaning ranges.
4. **Cross-reference quality** — For NT passages, uses `query_ot_quotes` to check for missing direct OT quotations. Counts cross-references (target: 8–15 entries) and assesses whether each reference has genuine thematic or verbal connection to the passage, rather than merely sharing a keyword.
5. **Internal consistency** — Cross-file comparison without CoA tools: checks that guardrail boundaries align with study-notes themes, completion gates reference truths actually discoverable from the package content, and the outline matches the actual verse structure in `passage.md`.
6. **EN ↔ PL parity** — If the Polish locale has been translated, verifies that both locales have the same number of key-word entries, cross-references, validation patterns, and completion gates — and that guardrail boundaries are classified identically in both languages.

The command follows the exact same CoA setup pattern as `/guardrails-auditor`: it loads deferred CoA tools via `ToolSearch`, runs a namespace preflight check on `consult-biblical-scholar`, and enters degraded mode if tools fail to load (marking all CoA-dependent findings as `[UNVALIDATED]` rather than silently omitting them).

---

**`/package-localize` (Phase D3) — To Be Implemented**

This command translates the English content files into Polish. It uses **no CoA MCP tools** — the research work is already done by this stage and the translation is a linguistic task. The key constraints are:

- `passage.md` is **never AI-translated**. It is scaffolded with TODO markers instead, because Bible translations have licensing requirements that preclude automated translation. A human must source the licensed Polish translation text.
- Guardrail boundaries (`SUPPORTED`, `COMPATIBLE`, `NOT SUPPORTED`) must be preserved identically across both locales. Softening a boundary during translation — classifying a NOT SUPPORTED reading as COMPATIBLE in Polish — would create a theological inconsistency in the Polish product.
- Section headings must match the bilingual field map enforced by the package validator. The validator knows exactly which Polish headings are acceptable and will reject alternatives.
- The `Early:`, `Mid:`, `Late:` escalation labels inside completion gates must remain in English. The validator's pattern-matching is hardcoded to these English labels; translating them to Polish would break validation.

---

### Also Planned: `/series-scaffold` and `/package-review`

Two further commands are referenced in the design documents but do not yet have full implementation plans:

**`/series-scaffold`** — Takes the output of `/series-research` (a chosen segmentation option and method) and generates the series JSON file plus package manifests for every session in the series. This bridges the planning phase (what should the series look like?) to the production phase (create the actual files). No CoA tool usage has been specified for this command yet.

**`/package-review`** (Phase E orchestrator) — Will run D1, D2, and D3 in parallel for a given package and aggregate the results into a single go/no-go readiness report. Described as an orchestrator that dispatches the three Phase D commands concurrently and returns a unified view of package quality.

---

## 7. The Full Dependency Chain (Current + Planned)

```
/series-research "John 1-12"
  ├─ CoA MCP: list_books                    → validates "John" exists
  └─ CoA Skill: biblical-segmentation
        └─ proposes: john-1-1-18, john-1-19-51, john-2-1-12, …

For each proposed day → /package-research john-1-1-18
  ├─ CoA Skill: pericope-delimitation       → validates 1:1–18 is a real unit
  ├─ CoA MCP: query_morphology              → every word parsed
  ├─ CoA MCP: query_vocabulary              → frequencies + clustering
  ├─ CoA MCP: list_books (themes)           → what themes are queryable?
  ├─ CoA MCP: query_vocabulary (themes)     → themed lemma sets
  ├─ CoA MCP: query_discourse_features      → [NT only] argument structure
  └─ CoA MCP: query_ot_quotes               → [NT only] OT echoes in John 1

Then → /package-author john-1-1-18
  ├─ writes passage.md, context.md, key-words.md, cross-references.md,
  │    outline.md, study-notes.md
  └─ delegates → /guardrails-auditor john-1-1-18
        ├─ CoA MCP: query_morphology        → finds theologically loaded words
        └─ CoA Skill: consult-biblical-scholar (VALIDATE)
              └─ per candidate misreading → scholarly verdict + sources

Then → Phase D (PLANNED — not yet built) ──────────────────────────────────
  ├─ /eval-case-author john-1-1-18
  │     └─ reads: guardrails.md, completion-gates.md, study-notes.md
  │        writes: crisis, gate, guardrail, surface eval test cases
  │        (no CoA tools)
  │
  ├─ /package-theologian john-1-1-18
  │     ├─ CoA MCP: query_morphology        → verify Strong's numbers
  │     ├─ CoA MCP: query_vocabulary        → verify meaning ranges
  │     ├─ CoA MCP: query_ot_quotes         → [NT only] check for missing quotations
  │     ├─ CoA MCP: query_lemmas            → adversarial guardrail gap detection
  │     ├─ CoA MCP: query_themes_for_lemmas → theme coverage check
  │     └─ CoA Skill: consult-biblical-scholar (VALIDATE)
  │           └─ per uncovered misreading → scholarly verdict for gap report
  │
  └─ /package-localize john-1-1-18
        └─ translates EN → PL (no CoA tools)
              passage.md scaffolded with TODO markers (licensing)
```

Every CoA call adds a specific type of evidence. The iron rule across all commands — current and planned — is: **MCP data before verdicts, graceful degradation if a tool fails, honest gaps where data is unavailable.**
