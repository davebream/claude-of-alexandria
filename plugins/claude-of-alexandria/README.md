# Claude of Alexandria Plugin

**Rigorous analytical skills for biblical study and teaching preparation.**

## Available Skills

### biblical-segmentation

Divides biblical books into coherent teaching units with integrity safeguards:

- **Refuses impossible divisions** - Won't pretend Philemon can be 12 sessions
- **Presents multiple frameworks** - Because interpretation isn't a dictatorship
- **Validates against ancient markers** - Masoretic פ/ס divisions, Levinsohn discourse features
- **Handles contested books** - Isaiah's unity debate gets frameworks, not false consensus

**Coverage:** All 66 canonical books

**Usage:**
```
Use biblical-segmentation to divide Romans into 12 sessions for a sermon series.
```

### pericope-delimitation

Validates whether a biblical passage constitutes a coherent discourse unit. Recommends boundary extensions or contractions based on linguistic evidence from bundled data.

- **Data-grounded boundaries** - Never from commentary tradition alone
- **Inline response** - Quick consultation before deeper study
- **Checks actual discourse features** - Levinsohn markers, not familiarity with "famous passages"

**Usage:**
```
Use pericope-delimitation to check if Romans 8:1-17 is a natural unit.
```

### exegetical-notes

Produces structured, context-neutral exegetical analysis of a biblical passage. Data-grounded. Always English. Saves to file as a reusable reference document.

- **Runs pericope check first** - Verifies boundaries before analysis
- **Every claim sourced** - Bundled data or web-verified scholarly sources
- **Training knowledge supplements** - Never substitutes for data

**Usage:**
```
Use exegetical-notes to analyze Romans 8:1-11.
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

MIT License - See repository root for details
