# ADR 0003: Validate Claude Code execution modes and separate workflows from teams

**Date:** 2026-09-07
**Status:** Accepted
**Baseline:** Claude Code 2.1.263; Claude Agent SDK 0.3.263

## Context

Claude of Alexandria previously treated every Agent-tool call as the same kind of
delegation. That hid four materially different execution modes:

| Mode | Context owner | Completion semantics | COA use |
|---|---|---|---|
| Context wrapper | Calling model | Awaited child result | Existing context-aware skills and agents |
| Forked skill | Native foreground fork | Skill result returns to caller | Self-contained smoke utility |
| Workflow | JavaScript runtime | Scripted barriers and branches | Repeatable `deep-study` |
| Agent team | Lead plus peer sessions | Interactive messages and tasks | Optional `study-team` review |

Forked skills receive the skill task and selected agent instructions, but not the caller's
conversation history. Converting context-aware skills to forks would therefore lose user
pressure, conversational references, and other request context. Teams solve a different
problem: they support peer discussion, but their turn-by-turn behavior is not a deterministic
workflow runtime.

The plugin passed Claude Code's native strict validator before this change. The gap was not
basic syntax; it was missing policy validation, incomplete discovery assertions, and tests
whose injected instructions were stronger than what an installed consumer receives.

## Decision

### Baseline and validation boundary

Pin Claude Code 2.1.263 for native validation and Agent SDK 0.3.263 for evaluation. One
model-free command, `npm run validate:model-free`, is the contributor and CI gate.

The gate:

- parses YAML with duplicate-key rejection and checks component identities and field types;
- rejects plugin-agent fields Claude Code ignores (`hooks`, `mcpServers`, and
  `permissionMode`);
- distinguishes agent `tools` (availability) from skill `allowed-tools` (permission);
- validates MCP tool declarations and local agent/skill references;
- runs native strict plugin validation and independently checks the discovered inventory;
- requires canonical RED and GREEN configs for every shipped skill, agent, and workflow;
- executes deterministic workflow, spawn-mode, and validator tests.

This proves configuration consistency, not scholarly correctness. A JSON Schema proves that
a successful structured response has the expected shape; it does not prove a citation is real,
a tool call succeeded, or an interpretation is sound.

### Existing delegation

Existing context-aware wrappers remain synchronous and unnamed. They must await required child
completion before reporting success. The self-contained `smoke-test` skill uses `context: fork`
with its native plugin agent.

The spawn validator is mode-aware:

- context wrappers require `run_in_background: false` and forbid names;
- only `study-team` may document named, addressable team spawns;
- team spawns require `name`, forbid the ignored `team_name` input, and do not use the
  context-wrapper flag.

### Scripted deep study

`/claude-of-alexandria:deep-study` is an import-free plugin workflow generated from versioned
schemas. It validates explicit input, retrieves evidence, assesses boundaries, runs at most two
analyses concurrently, independently verifies them, permits one repair and re-verification, and
then synthesizes and validates references.

Every workflow call selects one of four plugin `agentType` definitions. This is the runtime
enforcement boundary because the workflow `agent()` API has no per-call tool allowlist:

| Agent type | Model | Available tools |
|---|---|---|
| Retrieval | Inherit session | The plugin's 27 read-only MCP tools |
| Analysis | Inherit session | None |
| Verification | Inherit session | The plugin's 27 read-only MCP tools |
| Synthesis | Inherit session | None |

No leaf type exposes `Agent`, `Workflow`, or team coordination tools, so a prompt cannot turn a
fixed workflow stage into an unbounded descendant tree. The leaf types inherit the session model;
maintainer evaluation providers pin their own RED and GREEN model baselines independently.

The script caps itself at eight `agent()` calls and one repair cycle. It preserves `null`, tool
failure, empty, skipped, and unavailable outcomes instead of collapsing them into an empty
result. Boundary expansion remains advisory: the requested passage is not silently changed.

Repeatability applies to orchestration, not prose. Model output can vary, and model-dependent
branches can therefore vary. Relaunching in the same session may replay eligible completed
calls; changing an earlier prompt or result reruns that call and the suffix. A freshness request
starts a new run. The host's output-token admission budget is not a final-dollar guarantee:
in-flight calls can finish after admission closes.

### Optional study team

`/claude-of-alexandria:study-team` is an attended review of an already completed deep-study
report. It requires agent teams to be enabled before launch and is certified only with
`--teammate-mode in-process`. The skill creates three bounded perspectives—textual evidence,
interpretation, and critique—then has the lead write the only final review after all three
deliverables arrive.

If capability or context is missing, the skill stops. It does not edit global settings, use
split panes, or substitute ordinary subagents. Team output does not inherit workflow schema
guarantees. On session resumption, the lead must reconstruct tasks and coordination explicitly.
At this baseline the team is implicit: `TeamCreate` and `TeamDelete` no longer exist, and the
Agent tool's deprecated `team_name` input is ignored.

## Claude Code terminology at this baseline

| Surface | Meaning |
|---|---|
| `claude agents` | Opens or queries the background-agent session manager; it does not create plugin agent definitions. |
| `claude --agent NAME` | Runs the current main session with one discovered agent definition. |
| `claude --agents JSON` | Supplies temporary custom agent definitions for that launch. |
| `/agents` | No longer opens the agent-creation wizard; it directs users to ask Claude or edit agent files. |
| Plugin `agents/` | Lowest-precedence discovered agent scope, namespaced by plugin name. |

Plugin agents intentionally cannot rely on agent-scoped `hooks`, `mcpServers`, or
`permissionMode`, because Claude Code ignores those fields for plugin-distributed agents.

## Evaluation boundary

Model-free CI validates structure, references, generated-artifact drift, and scripted failure
paths. Maintainer-run evaluations cover the actual named agents and an installed plugin from a
working directory outside the checkout, without injected behavioral repairs. The trace records
tool IDs, parents, results, errors, child lifecycle, structured output, effective models, and
usage when the SDK exposes them.

Paid GREEN acceptance and the attended in-process team lifecycle remain release gates, not PR
CI jobs. A retry is allowed only for a positively classified infrastructure failure, at most
once, with both attempts and their usage retained.

## Consequences

The plugin gains a repeatable evidence-first study path without changing existing scholarly
commands. Teams remain visibly optional, and contributors get one fast validation command.
The trade-off is explicit: orchestration and reference integrity are enforceable, while
scholarly truth, fresh retrieval, and interactive team behavior still require runtime
observation and maintainer judgment.

## References

- [Dynamic workflows](https://code.claude.com/docs/en/workflows)
- [Custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Agent teams](https://code.claude.com/docs/en/agent-teams)
- [Skills](https://code.claude.com/docs/en/skills)
- [Plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Agent SDK structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs)
