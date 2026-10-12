# ADR 0006: Ship the model guard in coa, not in coa-desk

**Date:** 2026-10-12
**Status:** Accepted
**Amends:** [ADR 0005](0005-companion-mods-plugin.md)

## Context

ADR 0005 put every mod feature in the opt-in `coa-desk` plugin, so that `coa`
would stay Markdown plus a remote MCP server and run no code on the user's
machine. One of those features is not a convenience. The model guard enforces
project policy: Haiku is not supported for coa work (ADR 0002, 2026-09-30
amendment).

With the guard in an optional plugin, the policy held only for people who
installed it, and most people install only `coa`. Both bypasses ADR 0005
documented stayed open for everyone else:

- an Agent-tool call with `model: "haiku"`;
- `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL=haiku` with `/coa:deep-study`.

## Decision

Move the model guard into `coa` as its only hook module,
`plugins/claude-of-alexandria/hooks/guard.ts`. The behaviour is unchanged from
ADR 0005:

- a `coa:` agent spawned with a Haiku model runs on Sonnet;
- a `coa:` workflow agent is refused while `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`
  names Haiku;
- any fault in the guard lets the spawn through.

`coa-desk` keeps the user-facing extras: the grounding line and warning,
`/evidence`, `/passage` and book autocomplete.

To keep installing `coa` a low-trust decision, the guard is deliberately small.
`claude plugin validate` reports one hook (`agent.spawn`), one environment read
and one log call. A test in `tests/validation/core-hooks.test.mjs` fails if:

- `coa` gains another hook module;
- `coa` gains a file next to the guard;
- the guard starts using files, the network, processes, models, MCP, storage or
  prompts.

Anything more belongs in `coa-desk`.

## Verification

Run live with only `coa` loaded on Claude Code 2.1.296. A test mod recorded each
subagent request's model and would have stopped any Haiku request:

- the Agent-tool vector ran `coa:smoke-test` on Sonnet;
- the workflow vector stopped `/coa:deep-study` before any agent ran, with the
  message naming the variable.

No Haiku request was sent.

## Consequences

**Positive**

- The no-Haiku policy holds for every `coa` install, wherever mods run,
  including VS Code, `claude -p` and the Agent SDK.

**Negative**

- `coa` now runs code. It is limited to the guard, and the test above enforces
  that limit.
- Where Anthropic switches mods off, or an organisation allows only its own
  mods, the guard does not load and the policy rests on the agents' `model:`
  frontmatter alone, as before this change.
