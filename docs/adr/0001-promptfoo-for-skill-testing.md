# ADR 0001: Adopt Promptfoo with Claude Agent SDK for Skill Testing

**Date:** 2026-02-27
**Status:** Accepted

## Context

The current TDD approach for skill development uses three hand-written Markdown files per skill:

- `tests/skills/{name}/scenarios.md` — pressure-test cases (prose)
- `tests/skills/{name}/baseline.md` — RED phase failure evidence (~240 lines per skill)
- `tests/skills/{name}/verification.md` — GREEN phase pass evidence (~245 lines per skill)

This approach has the right discipline (TDD, documented failures, documented fixes) but the wrong tooling:

- Every test run requires manual subagent execution and copy-pasting output
- Baselines go stale when the model updates — no way to re-run automatically
- No regression detection — a model update that breaks a skill goes unnoticed
- No CI/CD integration
- ~700 lines of hand-written test documentation per skill (5 skills = 3,500 lines)

## Decision

Adopt **promptfoo** with the `anthropic:claude-agent-sdk` provider for automated skill evaluation.

The Claude Agent SDK provider runs a **full agent loop** — skill loading, MCP tool calls, multi-turn reasoning — exactly as a real user session works. This is not single-turn completion; the agent has full tool access including MCP.

## Assertion Strategy

**Hybrid: deterministic + LLM-rubric**

- `javascript` assertions using `raw.num_turns > 1` to verify tool usage
- `contains`/`icontains` for required structural elements
- `llm-rubric` for qualitative/theological quality
- Shared rubric files for the 5 theological guardrails (anti-moralism, christ-centeredness, context-primacy, genre-governance, covenantal-awareness)

## TDD Discipline Preserved

| Phase | Current | Promptfoo |
|-------|---------|-----------|
| RED | Run without skill, document failures in prose | `promptfoo eval` without skill — automated failure scores |
| GREEN | Write minimum skill, document fixes in prose | `promptfoo eval` with skill — automated pass scores |
| REFACTOR | Hunt rationalizations, tighten skill manually | Add adversarial test cases, re-run automatically |

## Alternatives Considered

1. **Keep markdown TDD** — No automation, high maintenance, baselines go stale
2. **DeepEval / LangSmith / Braintrust** — Trace-analysis only; cannot run a full agent loop with MCP
3. **LangWatch Scenario** — No Claude SDK or MCP integration at time of evaluation
4. **Custom framework** — High effort, reinventing what promptfoo already provides

## Consequences

**Positive:**
- Tests run automatically via `./eval.sh`
- CI gate on every version tag (GitHub Actions)
- Regression detection when models update
- Published test reports (not committed markdown)
- ~$3-10 per full run (65 scenarios, heavy cache hits)

**Negative:**
- API costs per test run (mitigated by Claude Max subscription via OAuth)
- LLM-rubric assertions introduce ~15-20% variability for qualitative checks
- Promptfoo validation gate requires `ANTHROPIC_API_KEY` or workaround env var

**What goes away:**
- `tests/skills/{name}/baseline.md` — replaced by automated RED-phase score reports
- `tests/skills/{name}/verification.md` — replaced by automated GREEN-phase score reports
- Manual subagent test execution

**What stays:**
- `tests/skills/{name}/scenarios.md` — migrated into promptfoo test cases
- TDD discipline (RED before GREEN, REFACTOR after GREEN)
- Theological guardrails (encoded as shared rubric files)
- Skill files unchanged — no structured output modifications required

## Implementation

See: `docs/plans/2026-02-27-promptfoo-skill-testing.md`
Spike findings: `docs/plans/2026-02-27-spike-findings.md`
