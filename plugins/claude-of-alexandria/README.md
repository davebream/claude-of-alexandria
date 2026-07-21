# Claude of Alexandria Plugin

**Rigorous analytical skills for biblical study and teaching preparation.**

## Architecture

The MCP server runs on Cloudflare Workers + D1 (edge SQLite). Skills call MCP tools automatically to retrieve linguistic data — morphology, discourse features, vocabulary frequencies, paragraph markers — with no local installation required.

Skills delegate specialized work to sub-agents:

```
study-evaluator (Sonnet)
    └── biblical-scholar (Sonnet)
            └── data-retriever (Haiku)
```

The `data-retriever` agent (Haiku) handles all MCP data gathering and compression. Higher-level agents and skills spawn it automatically, keeping token usage low and data handling centralized.

## MCP Server

The reference server exposes 24 tools. Skills call these automatically; you do not need to invoke them directly — though you may, if you are the sort of scholar who enjoys browsing the stacks.

**Core linguistic tools:**

| Tool | Queries | Coverage |
| ---- | ------- | -------- |
| `query_morphology` | Word-level morphological parsing | Both |
| `query_discourse_features` | Levinsohn NT discourse features | NT |
| `query_paragraph_breaks` | Masoretic petuchah/setumah markers | OT |
| `query_vocabulary` | Lemma frequencies, thematic keywords, clustering | Both |
| `query_ot_quotes` | OT quotations and allusions in the NT | NT |
| `query_themes_for_lemmas` | Resolve morphology lemmas to vocabulary theme names | Both |
| `query_lemmas` | Cross-book lemma distribution | Both |
| `query_theme` | Cross-book distribution of a thematic keyword group | Both |
| `query_syntax` | OpenText clause-level semantic role annotations | NT |
| `query_variants` | Textual variant edition comparison across 9 editions | NT |
| `query_lexicon` | Strong's-based word definitions (TBESH/TBESG) | Both |
| `list_books` | Available books, metadata, and thematic keyword groups | Both |

**Entity and context tools:**

| Tool | Queries | Coverage |
| ---- | ------- | -------- |
| `query_cross_references` | Editorial tradition cross-references between verses | Both |
| `query_places` | Geographic locations with coordinates | Both |
| `query_people` | Named individuals with cross-canonical appearances | Both |
| `query_events` | Timeline events with participants and locations | Both |
| `query_person_network` | Family relationships and co-appearances | Both |
| `query_speakers` | Speaker attribution with quotation type | Both |
| `check_versification` | Hebrew-English verse numbering differences | OT |

**Bible text and commentary tools:**

| Tool | Queries | Coverage |
| ---- | ------- | -------- |
| `bible_lookup` | Verse text in 6 translations | Both |
| `commentary_lookup` | Commentary entries from 6 commentaries | Both |
| `parallel_text` | Compare verse text across multiple translations | Both |
| `confessional_lookup` | Creeds and confessions (4 query modes) | — |
| `liturgical_lookup` | Church-year season → passages + themes, passage → season(s) lookup | — |

Tech stack: TypeScript, Cloudflare Workers, D1 (edge SQLite), MCP SDK (HTTP transport). No local runtime needed.

## Available Skills

### exegetical-notes

Produces structured, context-neutral exegetical analysis of a biblical passage. Data-grounded. Always English. Saves to file as a reusable reference document.

- **Runs pericope check first** - Verifies boundaries before analysis
- **Every claim sourced** - Bundled data or web-verified scholarly sources
- **Training knowledge supplements** - Never substitutes for data

**Usage:**
```
/claude-of-alexandria:exegetical-notes Romans 8:1-11
```

### consult-biblical-scholar

Answers questions about a biblical passage's meaning, validates analogies or ideas against the text, and provides cross-references with scholarly evidence. Works with or without an explicit passage anchor.

- **Confidence tiering** - Every answer declares its evidence basis
- **MCP data before answering** - No training-data-only verdicts
- **Formal verdict for analogy questions** - Structured evaluation, not vibes

**Usage:**
```
/claude-of-alexandria:consult-biblical-scholar Is "rest" in Hebrews 4 about salvation or sanctification?
```

### argument-flow

Maps the logical argument of a biblical passage using discourse markers and morphological data. Produces a connective-anchored proposition chain showing how clauses relate to each other.

- **Conjunction-first analysis** - MCP morphology data shapes the argument, not training memory
- **Genre-aware** - Different structural methods for epistles, narrative, poetry
- **Numbered proposition chain** - Every response includes one, no exceptions

**Usage:**
```
/claude-of-alexandria:argument-flow Phil 2:1-4
```

### pericope-delimitation

Validates whether a biblical passage constitutes a coherent discourse unit. Recommends boundary extensions or contractions based on linguistic evidence from bundled data.

- **Data-grounded boundaries** - Never from commentary tradition alone
- **Inline response** - Quick consultation before deeper study
- **Checks actual discourse features** - Levinsohn markers, not familiarity with "famous passages"

**Usage:**
```
/claude-of-alexandria:pericope-delimitation Romans 8:1-17
```

### biblical-segmentation

Divides biblical books into coherent teaching units with integrity safeguards.

- **Refuses impossible divisions** - Won't pretend Philemon can be 12 sessions
- **Presents multiple frameworks** - Because interpretation isn't a dictatorship
- **Validates against ancient markers** - Masoretic markers, Levinsohn discourse features
- **Handles contested books** - Isaiah's unity debate gets frameworks, not false consensus

**Coverage:** All 66 canonical books

**Usage:**
```
/claude-of-alexandria:biblical-segmentation Divide Romans into 12 sessions for a sermon series.
```

## Available Agents

Sub-agents are spawned by skills automatically. They are not invoked directly.

| Agent | Model | Role |
|-------|-------|------|
| `data-retriever` | Haiku | Fetches MCP data, compresses into structured summaries with testament-aware routing |
| `biblical-scholar` | Sonnet | Scholarly analysis (ANALYZE, VALIDATE, TRACE modes) with confidence tiers |
| `study-evaluator` | Sonnet | Evaluates study materials against exegetical standards with drift classification |
| `pericope-delimitation` | Sonnet | Boundary validation with structured verdicts |
| `argument-flow` | Sonnet | Logical structure mapping with proposition chains |
| `smoke-test` | Haiku | Pipeline verification |

## Development

This plugin is built using Test-Driven Development. 104 core-CI promptfoo tests (53 RED + 50 GREEN + 1 smoke) verify that skills prevent documented failures, run against `claude-agent-sdk` with live MCP data. Every skill also has documented failure cases and verification evidence in the `tests/` directory at the repository root.

See [CLAUDE.md](CLAUDE.md) for development guidelines and the Librarian's instructions.

## Hermeneutical Framework

All skills follow historical-grammatical method with theological guardrails:

- **Anti-moralism mandate** - No "try harder" applications without gospel
- **Christ-centeredness** - Traces redemptive-historical arc
- **Context primacy** - Respects discourse units, pericopes, books
- **Genre governance** - Right method for the text type
- **Covenantal awareness** - Attends to progressive revelation

## License

GNU General Public License v3.0 - See repository root for details.
