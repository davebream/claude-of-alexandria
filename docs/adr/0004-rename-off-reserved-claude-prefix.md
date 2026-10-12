# ADR 0004: Rename the plugin and marketplace off the reserved `claude-` prefix

**Date:** 2026-10-12
**Status:** Accepted
**Baseline:** Claude Code 2.1.296

## Context

Claude Code 2.1.296 reserves plugin names that could pass as Anthropic's own. A
third-party plugin name can no longer start with `claude-`, `anthropic-`,
`anthropics-` or `cc-plugin-`. `claude plugin validate --strict` now fails on both
our plugin name and our marketplace name, `claude-of-alexandria`:

```text
name: Plugin name "claude-of-alexandria" is reserved: it passes as one of
Anthropic's own. A third party's plugin name cannot start with "claude-", ...
```

The rule is not in the Claude Code changelog. We found it by running the
validator. Installs still worked on 2.1.296 when we tested them, but as of
2026-10-12 the rule already blocked us:

- `npm run validate:model-free` runs native strict validation, and the CI check
  "Plugin Validation" is required on `main`.
- CI pinned Claude Code 2.1.285, which predates the rule. Renovate pull request
  #226, which bumped the pin to 2.1.296, failed "Plugin Validation" with exactly
  this error.
- Anthropic's publishing guide asks authors to run
  `claude plugin validate --strict` before submitting to the plugin directory
  (code.claude.com/docs/en/plugins/publish).

Everything a user types or configures is derived from the plugin name:

| Identifier | Before |
|---|---|
| Install id | `claude-of-alexandria@claude-of-alexandria` |
| Skill and agent namespace | `claude-of-alexandria:exegetical-notes` |
| MCP tool names | `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__bible_lookup` |

## Decision

Change the machine identifiers and keep the brand.

| Identifier | After |
|---|---|
| Plugin `name` | `coa` |
| Marketplace `name` | `coa` |
| `displayName` (plugin and marketplace entry) | `Claude of Alexandria` |
| MCP server key in the plugin's `.mcp.json` | `coa` |
| Install id | `coa@coa` |
| Skill and agent namespace | `coa:exegetical-notes` |
| MCP tool names | `mcp__plugin_coa_coa__bible_lookup` |

`coa` is the acronym the project already uses for its server
(`coa.davebream.com`). A `displayName` is shown to people and is not checked
against the reserved prefixes. We confirmed this with strict validation of
scratch plugins on 2.1.296: `name: "coa"` with `displayName: "Claude of
Alexandria"` passes for both the plugin and the marketplace.

The MCP server key also changes. The plugin name is part of every MCP tool name,
so every tool name (27 as of 6.0.0) changes whatever the key is. Renaming the key at the same time
costs nothing extra and removes the last `claude-` identifier.

These stay unchanged:

- the source directory `plugins/claude-of-alexandria/`. Many files reference that
  path: a comment in the shipped (and therefore immutable) migration
  `server/migrations/0023_repair_paragraph_markers_data.sql`,
  `docs/incidents/masoretic-marker-corruption.md`,
  `docs/data-provenance/paragraph-markers.md`, the data decision record
  `decisions/0009-query-lemmas-nt-reads-morphology-not-thresholded-vocabulary.md`,
  and the Masoretic corpus jobs in `.github/workflows/ci.yml` and
  `.github/workflows/verify-masoretic-corpus.yml`. Claude Code does not read
  directory names.
- the GitHub repository, its URL, the Worker name, the MCP server's own
  `serverInfo` name, and dataset attribution.

The marketplace manifest carries `"renames": {"claude-of-alexandria": "coa"}`, so
Claude Code rewrites a user's enabled-plugin setting to the new name. The release
is 6.0.0 because every namespaced identifier changes.

### What existing users see

We tested the upgrade path in a clean configuration directory with a local
marketplace:

1. After `claude plugin marketplace update`, the next plugin load rewrites
   `claude-of-alexandria@claude-of-alexandria` to `coa@claude-of-alexandria` in
   `enabledPlugins`. The marketplace keeps the local name the user gave it.
2. The install record for the old name is dropped and the new name is not
   installed automatically, so the user installs it once:
   `claude plugin install coa@claude-of-alexandria`.
3. Permission rules, hooks and personal notes that use the old tool names or
   `/claude-of-alexandria:` commands are not rewritten.

`docs/v6-rename-migration.md` gives users these steps.

### Guarding against leftovers

The validator used to skip any namespaced reference whose namespace was not the
plugin's own, so a missed `claude-of-alexandria:` reference would have passed
silently. The validator now:

- reads the plugin name from `plugin.json`;
- rejects references to any other namespace;
- derives the MCP prefix from `plugin.json` and `.mcp.json`;
- runs native strict validation on the marketplace manifest and every plugin it
  lists;
- fails on the old identifiers anywhere outside historical records.

## Alternatives Considered

1. **Wait for enforcement.** Rejected. The required CI check fails as soon as the
   pinned CLI moves past 2.1.285, and every later CLI bump is blocked until then.
2. **A new brand everywhere**, a different first name in "<name> of Alexandria"
   that avoids the "Claude" spelling. Rejected while the display name is allowed. The project, server domain and
   documentation are known as Claude of Alexandria and CoA.
3. **Names of real Alexandrians** (Clement, Claudius Ptolemy, Claudian). Rejected:
   the brand is a fictional scholar, not a historical person.
4. **Rename the source directory too.** Deferred. It touches more than a hundred
   paths, including an immutable shipped migration, for no user-visible gain.
5. **Keep the old MCP server key.** Rejected. Tool names change anyway, and the
   key would keep a `claude-` identifier in every tool name.

## Consequences

**Positive**

- Strict validation passes on current Claude Code, which unblocks CLI bumps and
  makes a directory listing possible.
- Shorter identifiers: `/coa:deep-study`, `coa:data-retriever`.
- The validator now catches cross-namespace references and stale identifiers.

**Negative**

- Breaking for existing users: one reinstall, plus manual updates to any
  permission rules or notes that name old tools or commands.
- Two names coexist in the repository: the `coa` identifiers and the
  `plugins/claude-of-alexandria/` path.

**What stays**

- The brand, the server, the data, and the skills' behaviour.
