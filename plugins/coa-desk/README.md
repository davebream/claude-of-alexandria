# Claude of Alexandria Study Desk (`coa-desk`)

Optional extras for the [`coa`](../claude-of-alexandria/README.md) plugin. The
skills work the same with or without it.

## What it adds

- **A grounding line under each answer.** When a `coa` skill or agent looks
  data up, the answer ends with a line such as
  `Grounded in 3 lookups: query_morphology, bible_lookup ×2 · data: opengnt, bible_bsb`.
  When a `coa` skill answers without any lookup (for example after "no need to
  look anything up"), the line warns that the answer is unverified instead.
- **`/evidence`** opens a pane listing every `coa` lookup made in the session:
  the tool, the passage and the datasets it returned.
- **`/passage <book> <chapter:verse> [translations]`** shows a passage in
  parallel translations beside the conversation, with no model call. Example:
  `/passage Rom 8:1-4 BSB,KJV`. Translations: BSB, WEB, KJV, ASV, YLT, DBY.
- **Book-name autocomplete** in the prompt (`1co` suggests 1 Corinthians).

The guard that keeps `coa` agents off Haiku is part of `coa` itself, so every
install has it ([ADR 0006](../../docs/adr/0006-model-guard-ships-in-coa.md)).

## Install

```bash
claude plugin install coa-desk --marketplace davebream/claude-of-alexandria
```

Installing `coa-desk` also installs `coa`.

## Where it works

`coa-desk` is a Claude Code mod: code that runs inside Claude Code. It needs
Claude Code 2.1.296 or later.

| Where | Grounding line, panes, autocomplete |
|---|---|
| `claude` in a terminal | yes |
| Claude Desktop, Code tab | yes |
| VS Code extension, `claude -p`, Agent SDK | no; `/evidence` and `/passage` print their text instead |

Anthropic can switch mods off for an account or organisation. When that
happens, `coa-desk` does nothing and `coa` keeps working.

## What it can reach

Mods run with your permissions and are not sandboxed. `coa-desk`:

- sends `/passage` requests to `https://coa.davebream.com/mcp`, the same public
  server the `coa` plugin uses, and nowhere else;
- reads no files or environment variables and starts no processes;
- watches `coa` tool calls and `coa` skill text, and changes neither.

To check this yourself, run `claude plugin validate plugins/coa-desk` and read
its `hooks:` and `calls:` lines.

## Development

- Hook wiring tests: `claude plugin test plugins/coa-desk` (needs a signed-in
  Claude Code with mods available).
- Helper tests run without Claude Code: `node --test tests/desk/*.test.mjs`.
- `hooks/books.ts` is generated from the server's book table by
  `node scripts/generate-desk-books.mjs`. A test fails when the two drift.
- Design and evidence: [ADR 0005](../../docs/adr/0005-companion-mods-plugin.md).
