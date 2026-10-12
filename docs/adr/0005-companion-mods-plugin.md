# ADR 0005: Ship runtime guards and study views as an opt-in companion mod

**Date:** 2026-10-12
**Status:** Accepted; amended by [ADR 0006](0006-model-guard-ships-in-coa.md), which moves the model guard into `coa`
**Baseline:** Claude Code 2.1.296

## Context

Claude Code 2.1.287 added mods: plugins whose JavaScript or TypeScript runs
inside Claude Code and can observe or change tool calls, skill text, agent
spawns and turns, and draw panes. Two problems in this project are visible only
at runtime, so a mod can address them where skill text cannot.

**Skills answer without data when told not to fetch it.** The skills' first rule
is to gather MCP data before answering. We ran the default model (`sonnet`) on
prompts that said the lookup was unnecessary, and the skills complied with the
user instead of their rule:

| Skill | Runs | Skill fired | Runs with any coa lookup |
|---|---|---|---|
| `coa:consult-biblical-scholar` | 5 | 5 | 0 |
| `coa:exegetical-notes` | 2 | 2 | 0 |

The answers did say that they came from training knowledge. The user still has
nothing outside the answer itself to tell grounded from ungrounded.

**Haiku can reach plugin agents.** The project does not support Haiku (ADR 0002,
2026-09-30 amendment), and every shipped agent declares Sonnet. We tested three
ways a session can override that. A probe mod recorded the model of each subagent
request and stopped any Haiku request before it was sent:

| Override | Result |
|---|---|
| `CLAUDE_CODE_SUBAGENT_MODEL=haiku` | No bypass. The agent's `model: sonnet` wins. |
| Agent tool called with `model: "haiku"` | Bypass. The subagent's requests went to Haiku. |
| `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL=haiku` (new in 2.1.296) with `/coa:deep-study` | Bypass. Workflow agents' requests went to Haiku, although the workflow passes `model: "sonnet"` explicitly. |

Mods have limits that rule them out for anything correctness depends on:

- Anthropic can switch mods off remotely.
- Mods draw nothing in VS Code, `claude -p` or the Agent SDK.
- They run unsandboxed with the user's permissions.

## Decision

Add a second plugin to the marketplace, `coa-desk` (display name "Claude of
Alexandria Study Desk"). It is opt-in, depends on `coa`, and has its own version
starting at 0.1.0. The `coa` plugin stays Markdown plus a remote MCP server and
runs no code on the user's machine. Nothing in `coa` depends on `coa-desk`.

`coa-desk` does five things:

1. **Grounding line.** After each main-conversation turn, a line names the coa
   lookups that ran, including subagents' lookups, and the datasets they
   returned. It observes tool results and never changes them.
2. **Ungrounded-answer warning.** When a skill whose contract requires MCP
   evidence fired and no lookup succeeded, the line warns that the answer is
   unverified. The warning is shown to the user only. It does not prompt Claude
   again, so agent behaviour is unchanged and no promptfoo TDD cycle is needed.
   `smoke-test` and `study-team` are exempt, and a test fails when a new skill
   is in neither list.
3. **`/evidence` and `/passage`.** Two commands that run without a model call.
   `/passage` reads parallel text from `coa.davebream.com` over JSON-RPC with
   `$.http.fetch`. Re-declaring the MCP server in `coa-desk` would give Claude a
   second copy of every tool.
4. **Book-name autocomplete**, from a table generated from the server's own book
   aliases, with a drift test.
5. **Model guard.**
   - A `coa:` agent spawned with a Haiku model is moved to Sonnet.
   - A `coa:` workflow agent is refused while `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`
     names Haiku, because a hook cannot change a workflow agent's model.
   - The guard fails open, so a bug in it never stops an agent.

   Run live with the guard loaded, the Agent-tool case ran on Sonnet and the
   workflow case stopped with a message naming the variable. No Haiku request
   was sent in either case.

Testing:

- Hook wiring is tested with `claude plugin test` (`plugins/coa-desk/tests/`).
- Helper logic is tested with Node (`tests/desk/`).
- Both run in `npm run validate:model-free`. When Claude Code reports mods turned
  off for the environment, the mod tests warn instead of failing
  (`COA_REQUIRE_MOD_TESTS=1` makes that fatal).
- CLAUDE.md's three-config rule now says it governs promptfoo evals, not these
  model-free code tests.

### Spikes

| Idea | Outcome | Reason |
|---|---|---|
| Study preferences injected into skill text (`skill.prompt` + `userConfig`) | No-go | It conflicts with skill contracts such as "Always English output", changes behaviour that GREEN cannot test while mods can be switched off, and changes skill text that the prompt cache depends on. |
| Second-opinion check of answers against the theological guardrails (`$.model.complete`) | No-go for now | It costs a model call per answer and needs calibration against `tests/promptfoo/assertions/grader-calibration.yaml` before its verdicts mean anything. Worth a separate proposal. |
| Deep-study phase pane | No-go | `/workflows` already shows workflow progress. |
| `claude plugin eval` trigger tier | Recommended, decided separately | See below. |

### `claude plugin eval` trigger spike

GREEN force-loads skills by name, so nothing measured whether a skill fires on
natural phrasing. A trigger-only run of `claude plugin eval` cost $3.54. It ran
three natural requests for exegetical notes, three runs each, with a turn cap of
3 and the live server:

| Request | Skill fired |
|---|---|
| "careful exegetical notes on Philippians 4:4-7" | 3/3 |
| "a detailed study of Mark 4:35-41 I can teach from" | 2/3 |
| "walk me through the grammar and structure of Galatians 2:20" | 0/3 |
| an unrelated question (must not fire) | 0/3 |

The "grammar and structure" gap is real and invisible to GREEN. Adopting a small,
maintainer-run trigger tier is recommended. It would amend ADR 0002 and the
three-config rule, and needs its own decision. Its with-versus-without Δ would
stay informational. The judge model must be pinned to Sonnet, because the
default judge is the background (Haiku) model.

## Alternatives Considered

1. **Put the mod inside `coa`.** Rejected. Every install would run code, and the
   remote switch and surface limits would apply to the core plugin.
2. **Fix the Haiku bypass in skill text.** Not possible. The model choice happens
   after the skill text is read, in the Agent tool call or the session
   environment.
3. **Re-prompt Claude when an answer is ungrounded.** Deferred. It changes agent
   behaviour, so it needs a promptfoo RED and GREEN cycle, and GREEN cannot load
   mods reliably while they can be switched off remotely.
4. **Use `$.mcp.call` for `/passage`.** Rejected. It reaches only servers that
   `coa-desk` itself declares, which duplicates every tool for Claude.

## Consequences

**Positive**

- Users can see whether an answer was grounded, and a "no need to look it up"
  answer is flagged.
- The Haiku policy holds for coa agents and workflows wherever mods run.
- Passages can be read beside the conversation without spending model calls.

**Negative**

- A second plugin to version and release. Its version is independent of the
  server's.
- Guards that depend on mods disappear wherever mods are off or do not run.
  These guards are a safety net, not the policy itself.
- Hook tests can be skipped in CI when mods are off there.
