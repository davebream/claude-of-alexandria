<h1 align="center">Claude of Alexandria</h1>

<p align="center">
  <em>AI agent skills for rigorous biblical study, built on tested exegetical principles.</em>
</p>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/install-marketplace-brightgreen" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--v3-blue" alt="License"></a>
  <a href="#current-collection"><img src="https://img.shields.io/badge/skills-6%20%2B%206%20agents-orange" alt="Skills"></a>
  <a href="#the-evidence"><img src="https://img.shields.io/badge/tests-96%20automated-yellow" alt="Tests"></a>
</p>

---

Structured frameworks that prevent AI agents from committing exegetical malpractice. Every skill is built with Test-Driven Development: document the failure, build the fix, verify it works.

## The Problem

Frontier models make predictable errors when handling Scripture. These are documented by 53 RED-phase tests that run the same prompts *without* skills and record what goes wrong:

- **Fabricating linguistic data from training memory** — inventing morphological parsings, frequency counts, and hapax claims without querying actual data
- **Inventing arbitrary divisions** to satisfy session counts ("8 weeks on Philemon") without checking manuscript markers
- **Presenting single frameworks** for contested books as if scholarly consensus exists
- **No confidence tiering** — treating training-data guesses and parser-verified data with equal certainty
- **Moralistic drift** — "try harder" applications and therapeutic framing without gospel grounding
- **Yielding to user pressure** — skipping data verification when asked to "just be brief" or "skip the Greek"
- **Accepting truncated pericopes** — validating famous verses (John 3:16) as standalone units based on familiarity, not discourse evidence
- **Genre-blind analysis** — applying epistolary methods to wisdom literature, forcing narrative arcs on proverbial collections
- **Ignoring ancient manuscript markers** like Masoretic paragraph divisions and Levinsohn discourse features
- **Auto-selecting options** instead of presenting scholarly alternatives with evidence

## The Evidence

**136 automated tests** verify that skills prevent documented failures. Tests run against `claude-agent-sdk` with live MCP data — not mocked responses.

| Phase | Tests | What it does |
|-------|-------|-------------|
| RED | 53 | Runs prompts against a bare model (no skills, no MCP). Documents what goes wrong. |
| GREEN | 50 | Core failure-mode corrections. One targeted assertion per documented failure. CI-friendly. |
| EXTENDED | 32 | Quality, adversarial, and stress scenarios — run on-demand during skill development. |
| Smoke | 1 | Verifies the skill-to-agent pipeline works end-to-end. |

GREEN assertions use an Opus grader for LLM-rubric evaluation plus structural checks (`icontains`, section presence). Each GREEN scenario targets one documented RED failure mode. If a skill cannot demonstrate that it prevents a documented failure, it does not ship.

## Current Collection

**6 skills + 6 sub-agents, all production.** Coverage: all 66 canonical books.

### Skills

#### [biblical-segmentation](plugins/claude-of-alexandria/skills/biblical-segmentation/)

Divides biblical books into coherent teaching units with integrity safeguards:

- Refuses impossible divisions (you cannot divide Philemon into 12 sessions)
- Presents multiple scholarly-grounded options
- Validates against Masoretic paragraph markers and Levinsohn discourse features
- Handles contested books with multiple frameworks

24 maintainer-run eval scenarios (12 RED + 12 GREEN) + 6 extended scenarios.

#### [pericope-delimitation](plugins/claude-of-alexandria/skills/pericope-delimitation/)

Validates whether a proposed passage holds together as a discourse unit:

- Checks boundaries against Levinsohn discourse features (NT) and Masoretic markers (OT)
- Returns verdict: VALID, EXTEND, CONTRACT, or ADJUST
- Recommends the smallest coherent unit if passage is too short

12 maintainer-run eval scenarios (6 RED + 6 GREEN) + 8 extended scenarios. Resists memory-based validation of famous passages.

#### [exegetical-notes](plugins/claude-of-alexandria/skills/exegetical-notes/)

Produces exegetical notes for sermon or teaching preparation:

- 10-section schema from literary context through verification
- Parser-verified lexical data (not training memory guesses)
- 4-tier interpretive labels: linguistic, discourse, scholarly, agent assessment
- Genre-graduated redemptive-historical connections (epistles vs. wisdom literature vs. short letters)

37 maintainer-run eval scenarios (20 RED + 17 GREEN) + 12 extended scenarios (adversarial + stress tests for Philemon, Proverbs, 3 John).

#### [consult-biblical-scholar](plugins/claude-of-alexandria/skills/consult-biblical-scholar/)

Scholarly Q&A for biblical texts. Three auto-detected modes:

- **MEANING** — lexical and linguistic explanation
- **VALIDATE** — checks analogies, illustrations, or claims against text; returns formal verdict
- **CROSS-REFERENCE** — finds related passages with scholarly evidence

14 maintainer-run eval scenarios (7 RED + 7 GREEN) + 3 extended scenarios. Graduated confidence declared before every answer.

#### [argument-flow](plugins/claude-of-alexandria/skills/argument-flow/)

Maps the logical argument of a biblical passage using discourse markers:

- Produces connective-anchored proposition chains
- Calls MCP tools for conjunction and discourse data before composing analysis
- Grounds every interpretive claim in retrieved data

16 maintainer-run eval scenarios (8 RED + 8 GREEN) + 3 extended scenarios. For epistles and discourse-heavy passages.

#### [passage-glossary](plugins/claude-of-alexandria/skills/passage-glossary/)

Assembles a passage reader with a deduplicated lemma glossary:

- Pulls the lemmas of a passage via morphology, deduplicates them, and renders each distinct headword once
- Grounds every gloss in MCP lexicon data; supports multi-passage spans
- Always English output

Composes existing morphology and lexicon tools into a graded-reader study artifact.

### Sub-Agents

Skills delegate specialized work to sub-agents. You do not invoke these directly — skills spawn them automatically.

```
study-evaluator (Sonnet)
    └── biblical-scholar (Sonnet)
            └── data-retriever (Haiku)
```

| Agent | Model | Role |
|-------|-------|------|
| `data-retriever` | Haiku | Fetches MCP data and compresses into structured summaries with testament-aware routing |
| `biblical-scholar` | Sonnet | Scholarly analysis with three modes (ANALYZE, VALIDATE, TRACE), confidence tiers, source attribution |
| `study-evaluator` | Sonnet | Evaluates bible study outlines and transcripts against exegetical standards with drift classification |
| `pericope-delimitation` | Sonnet | Boundary validation with structured verdicts grounded in discourse markers |
| `argument-flow` | Sonnet | Logical structure mapping with connective-anchored proposition chains |
| `smoke-test` | Haiku | Pipeline verification (returns a known marker string) |

Agent correctness is tested indirectly through skill GREEN suites, plus 11 dedicated RED-phase tests that document bare-model failure modes.

## Development Setup

### Pre-commit hook

```bash
ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
```

This runs secret scanning, TypeScript typecheck, and server tests before every commit.

## Installation

### Claude Code (Marketplace)

```
/plugin marketplace add davebream/claude-of-alexandria
/plugin install claude-of-alexandria@claude-of-alexandria
```

The MCP server is included and auto-configured.

[Claude Code 2.1.217](https://github.com/anthropics/claude-code/releases/tag/v2.1.217)
and later require an explicit opt-in for nested sub-agent delegation. Set the
maximum spawn depth to `3`, which supports the deepest current chain
(`main → study-evaluator → biblical-scholar → data-retriever`).

POSIX shells (bash, zsh):

```bash
export CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3
```

Fish:

```fish
set -x CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH 3
```

If the variable is unset, scholar agents keep working through their direct-MCP
fallback, but they skip the data-retriever compression step and may report
reduced confidence.

### Claude Code (Manual)

```bash
git clone https://github.com/davebream/claude-of-alexandria.git
cd claude-of-alexandria
ln -s $(pwd)/plugins/claude-of-alexandria ~/.claude/plugins/claude-of-alexandria
```

The MCP server runs remotely on Cloudflare Workers.

### Claude Desktop

**Step 1:** Download skill ZIPs from the [latest release](https://github.com/davebream/claude-of-alexandria/releases/latest) and add `SKILL.md` contents as project knowledge.

**Step 2:** Add to your Claude Desktop MCP configuration:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "https://coa.davebream.com/mcp"]
    }
  }
}
```

Requires Node.js. Restart Claude Desktop after saving.

### Verify Installation

- **Claude Code:** Run `/skills` and look for all five skills and `/agents` for sub-agents
- **Claude Desktop:** Ask Claude to use `query_vocabulary` for any biblical book

## Reference Server

The MCP server provides linguistic data via Cloudflare Workers + D1 (edge SQLite). No local installation required.

The v4 contract requires native JSON arrays and explicit modes for variant tools. Pageable tools return `page.next_cursor`; repeat the same filters until it is absent. See the [MCP v4 migration guide](docs/mcp-v4-migration.md).

| Tool | What It Queries | Coverage |
|------|-----------------|----------|
| `list_books` | Available biblical books and thematic keyword groups | Both testaments |
| `query_discourse_features` | Levinsohn NT discourse features | NT |
| `query_paragraph_breaks` | Masoretic petuchah/setumah markers | OT |
| `query_ot_structure` | Verse-edge syntax, participant, and speech boundary context from Macula Hebrew lowfat XML | OT |
| `query_vocabulary` | Lemma frequencies, thematic keywords, clustering | Both testaments |
| `query_morphology` | Word-level morphological parsing | Both testaments |
| `query_ot_quotes` | OT quotations and allusions in the NT | NT |
| `query_themes_for_lemmas` | Resolve morphology lemmas to vocabulary theme names | Both testaments |
| `query_lemmas` | Cross-book lemma distribution | Both testaments |
| `query_theme_distribution` | Cross-book distribution of a thematic keyword group | Both testaments |
| `query_lexicon` | Strong's, lemma, or definition search across bundled lexica | Both testaments |
| `check_versification` | Hebrew-English verse-numbering differences | OT |
| `query_cross_references` | Pageable verse adjacency in the cross-reference graph | Both testaments |
| `trace_cross_reference_path` | Bounded path traversal through cross-references | Both testaments |
| `query_people` | People named in a passage | Both testaments |
| `query_places` | Places named in a passage | Both testaments |
| `query_events` | Events associated with a book or chapter range | Both testaments |
| `query_person_network` | Relationships and co-appearances for a person | Both testaments |
| `query_speakers` | Speaker-attributed quotation spans | Both testaments |
| `query_syntax` | Clause-level syntax annotations | NT |
| `query_variants` | Textual variant edition comparisons | NT |
| `bible_lookup` | Verse text in a selected translation | Both testaments |
| `commentary_lookup` | Public-domain commentary entries | Both testaments |
| `parallel_text` | Verse-aligned translation comparison | Both testaments |
| `confessional_lookup` | Confessional and catechetical documents from Reformed, Baptist, Lutheran, and ancient traditions — lookup by slug, scripture citation, keyword, or list | Non-biblical |
| `liturgical_lookup` | Church-year season → recommended passages + themes, and reverse passage → season(s) lookup (curated, Protestant-oriented) | Non-biblical |
| `query_controversies` | Look up academically contested topics (historicity/dating/authorship) by topic or passage → rating + balanced both-sides positions with sources. Also surfaces a `chapter_contested` discovery flag via `query_events` when a queried chapter overlaps known controversial passages. | Non-biblical |

Skills call these automatically. You can invoke them directly if needed.

## Hermeneutical Framework

Skills use historical-grammatical method with explicit theological guardrails:

| Guardrail | What It Prevents |
|-----------|------------------|
| Anti-moralism mandate | "Try harder" applications without gospel grounding |
| Christ-centeredness | Missing the redemptive-historical arc |
| Context primacy | Ripping verses from literary and canonical context |
| Genre governance | Applying wrong methods to text types |
| Covenantal awareness | Flattening testaments into a proof-text database |

## Acknowledgments

**Linguistic foundations:** Stephen H. Levinsohn (Greek NT discourse analysis) and the OpenScriptures Hebrew Bible / OSHB (Masoretic Text paragraph data, Westminster Leningrad Codex).

**Hermeneutical framework:** Historical-grammatical method. The Alexandrian school gave us systematic textual criticism. The Antiochene school insisted interpretation stay anchored to the historical sense. The Reformers inherited both. So do we.

**Namesake:** Clement of Alexandria (c. 150-215 AD), who demonstrated that rigorous scholarship and faithful theology are not in tension.

## Contributing

See [CLAUDE.md](CLAUDE.md) for development guidelines. The head librarian is strict about TDD.

## License

[GNU General Public License v3.0](LICENSE)

---

<p align="center">
  <sub>6 skills, 6 sub-agents, 136 maintainer-run eval scenarios total — 104 core-CI (53 RED + 50 GREEN + 1 smoke) plus 32 on-demand extended. All 66 biblical books. 358 server unit tests (these run in CI).</sub>
</p>
