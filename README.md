<h1 align="center">Claude of Alexandria</h1>

<p align="center">
  <img src="assets/banner.png" alt="Claude of Alexandria" width="280">
</p>

<p align="center">
  <em>Est. 2026 AD — A considerably younger library than the original, but no less particular about methodology.</em>
</p>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/install-marketplace-brightgreen" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--v3-blue" alt="License"></a>
  <a href="#current-collection"><img src="https://img.shields.io/badge/skills-4-orange" alt="Skills"></a>
  <a href="#hermeneutical-framework"><img src="https://img.shields.io/badge/theology-peer--reviewed-purple" alt="Theology"></a>
</p>

---

**AI agent skills for rigorous biblical study and preparation**, built on faithful exegetical and homiletical principles.

Or as we say in the stacks: _structured frameworks that prevent your AI from committing exegetical malpractice_.

## Greetings, Scholar

You have entered the library.

The original Library of Alexandria housed — depending on which ancient source you trust — somewhere between 40,000 and 700,000 scrolls, organised by Callimachus' *Pinakes*: the world's first systematic library catalogue. Centuries later, the same city produced Clement of Alexandria, Origen, and the Catechetical School — scholars who brought that same cataloguing rigour to the systematic study of Scripture.

We carry both traditions. Our collection is smaller — three skills, at present — but each has been rigorously tested against the systematic failures of frontier language models. Zenodotus would approve of the methodology, if not the medium.

**Claude of Alexandria** is a [Claude](https://claude.ai/code) plugin providing analytical skills for biblical study and teaching preparation. The system prioritizes:

- **Rigorous biblical scholarship** — Linguistic analysis, historical context, and theological integration. We do not guess.
- **Theological integrity** — Anti-moralism mandate, Christ-centeredness, and gospel focus. We do not moralize.
- **Zero recurring costs** — Runs on what frontier models already know. We do not charge subscription fees. The ancient library was publicly funded and we respect the tradition.
- **Skill-based architecture** — Modular, composable, stateless skills. We do not build monoliths. The original library learned that lesson the hard way — repeatedly, across several centuries.

## "But Surely Modern AI Handles Scripture Well Enough?"

No. It does not. We have the test results.

Even sophisticated frontier models make predictable errors under pressure — prioritizing felt needs over textual diagnosis, psychologizing passages, and defaulting to therapeutic frameworks. They will, if left unsupervised, turn the Epistle to the Romans into a self-help pamphlet.

When planning teaching series, AI agents commit the following offenses against scholarship:

- **Inventing arbitrary divisions** to satisfy session counts ("8 weeks on Philemon" — a book shorter than most README files)
- **Presenting single frameworks** for contested books as if scholarly consensus exists where it does not
- **Auto-selecting options** instead of presenting alternatives, which is the exegetical equivalent of hiding the bibliography
- **Ignoring ancient manuscript markers** — Masoretic פ/ס divisions, Levinsohn discourse features — because apparently 2,500 years of scribal tradition is insufficient for consideration

Every skill in this library is built using **Test-Driven Development**. We first document precisely how the model fails. Then we build the minimum framework to prevent those failures. Then we close every loophole an agent might use to rationalize its way around the constraints.

The ancient librarians catalogued. We do the same — we catalogue failures, then eliminate them.

### The Evidence

We do not ask you to trust our methodology. We ask you to read the test results. Every skill includes:

| File                                      | Purpose                                                      |
| ----------------------------------------- | ------------------------------------------------------------ |
| `tests/skills/skill-name/scenarios.md`    | Pressure test cases designed to trigger failures             |
| `tests/skills/skill-name/baseline.md`     | Documented failures without the skill (the RED phase)        |
| `tests/skills/skill-name/verification.md` | Proof that the skill corrects the failures (the GREEN phase) |

If a skill cannot demonstrate that it prevents a documented failure, it does not belong in this library. We have standards.

## Current Collection

The library presently contains **four skills**, all production. Rome was not catalogued in a day, but we are making progress.

### [biblical-segmentation](plugins/claude-of-alexandria/skills/biblical-segmentation/) — Production

Divides biblical books into coherent teaching units — sermon series, small groups, devotional reading — with integrity safeguards that would make a Masoretic scribe nod approvingly:

- **Refuses impossible divisions.** You cannot divide Philemon into 12 sessions. We will not pretend otherwise.
- **Presents multiple scholarly-grounded options.** Because interpretation is not a dictatorship.
- **Validates against ancient manuscript markers.** Masoretic פ/ס divisions, Levinsohn discourse features. The scribes marked these boundaries for a reason.
- **Handles contested books with multiple frameworks.** Isaiah's unity debate gets frameworks, not a false consensus.

Coverage: all 66 canonical books. 33 test scenarios. Full RED/GREEN verification.

### [pericope-delimitation](plugins/claude-of-alexandria/skills/pericope-delimitation/) — Production

Tells you whether your proposed passage actually holds together as a discourse unit, or whether you've accidentally cut mid-argument:

- Checks boundaries against Levinsohn discourse features (NT) and Masoretic paragraph markers (OT). Not your intuition. Data.
- Returns a verdict: VALID, EXTEND, CONTRACT, or ADJUST, with the evidence behind it.
- If the passage is too short to preach, recommends the smallest coherent unit that works.

5 test scenarios. Full RED/GREEN verification. Resists memory-based validation of famous passages.

### [exegetical-notes](plugins/claude-of-alexandria/skills/exegetical-notes/) — Production

Produces exegetical notes for sermon or teaching preparation, with the kind of data verification that training memory alone cannot provide:

- 10-section schema from literary context through verification. No making it up as you go.
- Parser-verified lexical data. When the skill says χαίρω appears 9 times in Philippians, that number came from a parser, not a guess.
- 4-tier interpretive labels: linguistic, discourse, scholarly, agent assessment. You always know which kind of evidence you're looking at.

Full RED/GREEN verification. Runs pericope check before generating notes — if you hand it a severed passage, it tells you before wasting your time on the analysis.

### [consult-biblical-scholar](plugins/claude-of-alexandria/skills/consult-biblical-scholar/) — Production

Scholarly Q&A for biblical texts. Three auto-detected modes:

- **MEANING** — lexical and linguistic explanation, grounded in morphology and vocabulary data
- **VALIDATE** — checks an analogy, sermon illustration, or theological claim against the text; returns a formal verdict (SUPPORTED / COMPATIBLE / NOT SUPPORTED / INSUFFICIENT DATA)
- **CROSS-REFERENCE** — finds related passages with scholarly evidence, not memory associations

Graduated confidence (HIGH / MEDIUM / LOW / CANNOT ANSWER) declared before every answer. Hard epistemic limits: the skill pushes back when MCP data and scholarly sources are insufficient, rather than speculating.

Full RED/GREEN verification. 6 test scenarios.

## Installation

Three paths into the library, depending on your reading room of choice.

### Claude Code (Marketplace)

In any Claude Code session:

```
/plugin marketplace add davebream/claude-of-alexandria
/plugin install claude-of-alexandria@claude-of-alexandria
```

The scrolls are now on your shelf. The MCP server is included and auto-configured — no additional setup required.

### Claude Code (Manual)

If you prefer manual installation or want to contribute:

```bash
# Clone the repository
git clone https://github.com/davebream/claude-of-alexandria.git
cd claude-of-alexandria

# Symlink the plugin
ln -s $(pwd)/plugins/claude-of-alexandria ~/.claude/plugins/claude-of-alexandria
```

The MCP server runs remotely on Cloudflare Workers — no local build step required.

### Claude Desktop

Claude Desktop requires two things: the skill frameworks (as project knowledge) and the MCP configuration (so Claude Desktop knows where to find the server).

**Step 1: Download the Skills**

Download the skill ZIPs from the latest release:

| Skill | Download |
| ----- | -------- |
| biblical-segmentation | [biblical-segmentation.zip](https://github.com/davebream/claude-of-alexandria/releases/latest/download/biblical-segmentation.zip) |
| pericope-delimitation | [pericope-delimitation.zip](https://github.com/davebream/claude-of-alexandria/releases/latest/download/pericope-delimitation.zip) |
| exegetical-notes | [exegetical-notes.zip](https://github.com/davebream/claude-of-alexandria/releases/latest/download/exegetical-notes.zip) |
| consult-biblical-scholar | [consult-biblical-scholar.zip](https://github.com/davebream/claude-of-alexandria/releases/latest/download/consult-biblical-scholar.zip) |

Each ZIP contains the skill framework (`SKILL.md` and supporting files). The linguistic reference datasets are provided by the remote MCP server.

Extract each ZIP. Add the contents of `SKILL.md` as project knowledge in Claude Desktop.

**Step 2: Configure Claude Desktop**

Add the server to your Claude Desktop MCP configuration:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://coa.davebream.com/mcp"
      ]
    }
  }
}
```

Requires Node.js. `mcp-remote` bridges the remote server to Claude Desktop's stdio transport. No local database or compiled server required.

Restart Claude Desktop after saving.

### Verifying Your Library Card

- **Claude Code:** Run `/skills` and look for all three skills — `biblical-segmentation`, `pericope-delimitation`, and `exegetical-notes`.
- **Claude Desktop:** Ask Claude to use `query_vocabulary` for any biblical book. If data returns, the server is working. If it does not, check the MCP configuration paths and restart.

### Usage

In any Claude session:

```
Use biblical-segmentation to divide Romans into 12 sessions for a sermon series.
```

Consult the [plugin README](plugins/claude-of-alexandria/README.md) for detailed skill documentation.

## The Reference Server

Version 1.5.0 moved the MCP server to Cloudflare Workers + D1 (edge SQLite), eliminating all local installation requirements. The data is the same — Levinsohn discourse features, Masoretic paragraph markers, morphological parsings, vocabulary frequencies — delivered over HTTP from a globally distributed edge network.

| Tool | What It Queries | Coverage |
| ---- | --------------- | -------- |
| `query_discourse_features` | Levinsohn NT discourse features | NT |
| `query_paragraph_breaks` | Masoretic petuchah/setumah markers | OT |
| `query_vocabulary` | Lemma frequencies, thematic keywords, clustering | Both testaments |
| `query_morphology` | Word-level morphological parsing | Both testaments |
| `query_ot_quotes` | OT quotations and allusions in the NT | NT |
| `query_themes_for_lemmas` | Resolve morphology lemmas to vocabulary theme names | Both testaments |
| `query_lemmas` | Cross-book lemma distribution | Both testaments |

Skills call these tools automatically. You do not need to invoke them directly — though you may, if you are the sort of scholar who enjoys browsing the stacks.

Tech stack: TypeScript, Cloudflare Workers, D1 (edge SQLite), MCP SDK (HTTP transport). No local runtime required.

## Hermeneutical Framework

Skills are built on **historical-grammatical method** with explicit theological guardrails:

| Guardrail             | What It Prevents                                            |
| --------------------- | ----------------------------------------------------------- |
| Anti-moralism mandate | "Try harder" applications without gospel grounding          |
| Christ-centeredness   | Missing the redemptive-historical arc                       |
| Context primacy       | Ripping verses from their literary and canonical home       |
| Genre governance      | Applying narrative methods to epistles (and vice versa)     |
| Covenantal awareness  | Flattening Old and New Testament into a proof-text database |

These are not suggestions. They are load-bearing walls.

## Acknowledgments

**Linguistic foundations:** Stephen H. Levinsohn (Greek NT discourse analysis) and the Sefaria Project (Masoretic Text paragraph data).

**Hermeneutical framework:** Historical-grammatical method. The Alexandrian school gave us systematic textual criticism — Origen's *Hexapla* set the standard — while the Antiochene school insisted that interpretation stay anchored to the historical sense. The Reformers inherited both traditions. So do we.

**Namesake:** Clement of Alexandria (c. 150–215 AD), who demonstrated that rigorous scholarship and faithful theology are not in tension. The Catechetical School he led produced Origen, Athanasius, and a tradition of biblical scholarship that endures two millennia later.

**Architectural inspiration:** The Library of Alexandria — which declined gradually across centuries, not in a single dramatic fire — and the `superpowers` writing-skills methodology for test-driven documentation.

## Contributing

The library welcomes contributions from those who respect the methodology. See [CLAUDE.md](CLAUDE.md) for development guidelines, but be warned: the head librarian is strict about TDD.

## License

[GNU General Public License v3.0](LICENSE) — You are free to use, study, and redistribute this work. Any derivative must remain open under the same terms. The methodology stays free. The Ptolemies funded their library to attract scholars from across the Mediterranean; we share the instinct, if not the budget.

---

<p align="center">
  <strong>Disclaimer</strong><br>
  <em>This project is an independent, open-source initiative and is not affiliated with, endorsed by, or sponsored by Anthropic PBC. "Claude" refers to Anthropic's AI assistant, for which this plugin is designed. Neither the Library of Alexandria nor the Catechetical School has provided sponsorship, both institutions having been unavailable for comment for some centuries now.</em>
</p>

<p align="center">
  <sub>Contains 4 skills (all production) supporting all 66 biblical books.<br>The cataloguing continues.</sub>
</p>
