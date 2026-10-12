# Plugin Rename Migration (v6)

Version 6.0.0 renames the plugin and its marketplace from `claude-of-alexandria`
to `coa`. Since Claude Code 2.1.296, strict validation rejects plugin names that
start with `claude-`. The display name stays "Claude of Alexandria". The skills,
agents, data and the hosted MCP endpoint (`https://coa.davebream.com/mcp`) are
unchanged. [ADR 0004](adr/0004-rename-off-reserved-claude-prefix.md) explains the
decision.

These steps were tested with Claude Code 2.1.296.

**Which section do I need?**

- Never installed the plugin: [New installs](#new-installs).
- Installed 5.x: [Upgrading an existing install](#upgrading-an-existing-install),
  then [Things Claude Code does not rewrite](#things-claude-code-does-not-rewrite).

A 5.x install keeps working until you refresh the marketplace. After a refresh
the old plugin stops loading, so finish all the upgrade steps in one go.

## What changed

| | 5.x | 6.0.0 |
|---|---|---|
| Install id (new installs) | `claude-of-alexandria@claude-of-alexandria` | `coa@coa` |
| Skills and agents | `claude-of-alexandria:exegetical-notes` | `coa:exegetical-notes` |
| Workflow command | `/claude-of-alexandria:deep-study` | `/coa:deep-study` |
| MCP tools | `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__bible_lookup` | `mcp__plugin_coa_coa__bible_lookup` |

## New installs

```bash
claude plugin install coa --marketplace davebream/claude-of-alexandria
```

`davebream/claude-of-alexandria` is the GitHub repository, which keeps its name.
The command adds the marketplace it contains, now called `coa`, and installs the
plugin as `coa@coa`.

## Upgrading an existing install

Your marketplace keeps the name you added it under, so on an existing machine
the plugin becomes `coa@claude-of-alexandria`.

1. Refresh the marketplace:

   ```bash
   claude plugin marketplace update claude-of-alexandria
   ```

   On the next load, Claude Code moves your enabled-plugin setting from
   `claude-of-alexandria@claude-of-alexandria` to `coa@claude-of-alexandria`.
   It drops the old install record but does not install the new name for you.

2. Install the plugin under its new name:

   ```bash
   claude plugin install coa@claude-of-alexandria
   ```

3. Run `/reload-plugins` in any open session, or start a new one.

To end up with the same ids as a fresh install, remove the old marketplace and
install again:

```bash
claude plugin marketplace remove claude-of-alexandria
claude plugin install coa --marketplace davebream/claude-of-alexandria
```

## Things Claude Code does not rewrite

Update these by hand if you have them:

- **Permission rules** that name MCP tools, such as
  `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__*` in
  `permissions.allow`. Change the prefix to `mcp__plugin_coa_coa__`.
- **Hooks or scripts** that match the old tool names or agent names.
- **Notes, prompts and saved commands** that call `/claude-of-alexandria:<name>`.
  Use `/coa:<name>`.
- **Claude Desktop MCP configuration**, if you named the server
  `claude-of-alexandria-mcp`. That name is your own label for the same endpoint
  and still works. Rename it only for consistency.

## Check the result

Run `claude plugin list` in your shell, or open the **Installed** tab in
`/plugin`. You should see `coa@claude-of-alexandria` after an upgrade, or
`coa@coa` after a fresh install, and no `claude-of-alexandria@…` entry.
`/skills` lists the skills under `coa:`.
