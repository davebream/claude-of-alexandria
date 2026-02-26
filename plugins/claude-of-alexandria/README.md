# Claude of Alexandria Plugin

**Rigorous analytical skills for biblical study and teaching preparation.**

## Architecture

Version 1.5.0 moved the MCP server to Cloudflare Workers + D1 (edge SQLite). Skills call MCP tools automatically to retrieve linguistic data — morphology, discourse features, vocabulary frequencies, paragraph markers — with no local installation required.

The result: the same data, delivered from a globally distributed edge network over HTTP.

## MCP Server

The reference server exposes seven tools. Skills call these automatically; you do not need to invoke them directly — though you may, if you are the sort of scholar who enjoys browsing the stacks.

| Tool | Queries | Coverage |
| ---- | ------- | -------- |
| `query_discourse_features` | Levinsohn NT discourse features | NT |
| `query_paragraph_breaks` | Masoretic petuchah/setumah markers | OT |
| `query_vocabulary` | Lemma frequencies, thematic keywords, clustering | Both |
| `query_morphology` | Word-level morphological parsing | Both |
| `query_ot_quotes` | OT quotations and allusions in the NT | NT |
| `query_themes_for_lemmas` | Resolve morphology lemmas to vocabulary theme names | Both |
| `list_books` | Available books and their metadata | Both |

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

## Development

This plugin is built using Test-Driven Development. Every skill has documented failure cases and verification evidence in the `tests/` directory at the repository root.

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
