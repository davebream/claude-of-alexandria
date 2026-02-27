<h1 align="center">Claude of Alexandria</h1>

<p align="center">
  <em>AI agent skills for rigorous biblical study, built on tested exegetical principles.</em>
</p>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/install-marketplace-brightgreen" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--v3-blue" alt="License"></a>
  <a href="#current-collection"><img src="https://img.shields.io/badge/skills-5-orange" alt="Skills"></a>
</p>

---

Structured frameworks that prevent AI agents from committing exegetical malpractice. Every skill is built with Test-Driven Development: document the failure, build the fix, verify it works.

## The Problem

Frontier models make predictable errors when handling Scripture:

- **Inventing arbitrary divisions** to satisfy session counts ("8 weeks on Philemon")
- **Presenting single frameworks** for contested books as if consensus exists
- **Auto-selecting options** instead of presenting scholarly alternatives
- **Ignoring ancient manuscript markers** like Masoretic paragraph divisions
- **Psychologizing passages** and defaulting to therapeutic frameworks

## The Evidence

Every skill includes three test files:

| File | Purpose |
|------|---------|
| `tests/skills/*/scenarios.md` | Pressure test cases designed to trigger failures |
| `tests/skills/*/baseline.md` | Documented failures without the skill (RED phase) |
| `tests/skills/*/verification.md` | Proof that the skill corrects failures (GREEN phase) |

If a skill cannot demonstrate that it prevents a documented failure, it does not ship.

## Current Collection

**5 skills, all production.**

### [biblical-segmentation](plugins/claude-of-alexandria/skills/biblical-segmentation/)

Divides biblical books into coherent teaching units with integrity safeguards:

- Refuses impossible divisions (you cannot divide Philemon into 12 sessions)
- Presents multiple scholarly-grounded options
- Validates against Masoretic paragraph markers and Levinsohn discourse features
- Handles contested books with multiple frameworks

Coverage: all 66 canonical books. 33 test scenarios.

### [pericope-delimitation](plugins/claude-of-alexandria/skills/pericope-delimitation/)

Validates whether a proposed passage holds together as a discourse unit:

- Checks boundaries against Levinsohn discourse features (NT) and Masoretic markers (OT)
- Returns verdict: VALID, EXTEND, CONTRACT, or ADJUST
- Recommends the smallest coherent unit if passage is too short

5 test scenarios. Resists memory-based validation of famous passages.

### [exegetical-notes](plugins/claude-of-alexandria/skills/exegetical-notes/)

Produces exegetical notes for sermon or teaching preparation:

- 10-section schema from literary context through verification
- Parser-verified lexical data (not training memory guesses)
- 4-tier interpretive labels: linguistic, discourse, scholarly, agent assessment

Runs pericope check before generating notes.

### [consult-biblical-scholar](plugins/claude-of-alexandria/skills/consult-biblical-scholar/)

Scholarly Q&A for biblical texts. Three auto-detected modes:

- **MEANING** — lexical and linguistic explanation
- **VALIDATE** — checks analogies, illustrations, or claims against text; returns formal verdict
- **CROSS-REFERENCE** — finds related passages with scholarly evidence

Graduated confidence declared before every answer. Pushes back when data is insufficient.

### [argument-flow](plugins/claude-of-alexandria/skills/argument-flow/)

Maps the logical argument of a biblical passage using discourse markers:

- Produces connective-anchored proposition chains
- Calls MCP tools for conjunction and discourse data before composing analysis
- Grounds every interpretive claim in retrieved data

For epistles and discourse-heavy passages.

## Installation

### Claude Code (Marketplace)

```
/plugin marketplace add davebream/claude-of-alexandria
/plugin install claude-of-alexandria@claude-of-alexandria
```

The MCP server is included and auto-configured.

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

- **Claude Code:** Run `/skills` and look for all five skills
- **Claude Desktop:** Ask Claude to use `query_vocabulary` for any biblical book

## Reference Server

The MCP server provides linguistic data via Cloudflare Workers + D1 (edge SQLite). No local installation required.

| Tool | What It Queries | Coverage |
|------|-----------------|----------|
| `list_books` | Available biblical books and thematic keyword groups | Both testaments |
| `query_discourse_features` | Levinsohn NT discourse features | NT |
| `query_paragraph_breaks` | Masoretic petuchah/setumah markers | OT |
| `query_vocabulary` | Lemma frequencies, thematic keywords, clustering | Both testaments |
| `query_morphology` | Word-level morphological parsing | Both testaments |
| `query_ot_quotes` | OT quotations and allusions in the NT | NT |
| `query_themes_for_lemmas` | Resolve morphology lemmas to vocabulary theme names | Both testaments |
| `query_lemmas` | Cross-book lemma distribution | Both testaments |

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

**Linguistic foundations:** Stephen H. Levinsohn (Greek NT discourse analysis) and the Sefaria Project (Masoretic Text paragraph data).

**Hermeneutical framework:** Historical-grammatical method. The Alexandrian school gave us systematic textual criticism. The Antiochene school insisted interpretation stay anchored to the historical sense. The Reformers inherited both. So do we.

**Namesake:** Clement of Alexandria (c. 150-215 AD), who demonstrated that rigorous scholarship and faithful theology are not in tension.

## Contributing

See [CLAUDE.md](CLAUDE.md) for development guidelines. The head librarian is strict about TDD.

## License

[GNU General Public License v3.0](LICENSE)

---

<p align="center">
  <sub>5 skills (all production) supporting all 66 biblical books.</sub>
</p>
