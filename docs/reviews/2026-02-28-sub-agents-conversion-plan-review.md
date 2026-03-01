# Plan Review: Convert pericope-delimitation & argument-flow to Sub-Agents

**File:** `docs/plans/2026-02-28-sub-agents-conversion.md`
**Design Doc:** `docs/plans/2026-02-27-sub-agents-design.md`
**Verdict:** Needs Revision

## Design Alignment

The plan implements Phase 4 of the design doc ("Refactor existing skills to use agents"), which was explicitly deferred as future work. The plan adds two agents (pericope-delimitation, argument-flow) beyond the design's three (data-retriever, biblical-scholar, study-evaluator). This is a **beneficial extension** — the SL1/SL2/SL5 test failures provide concrete motivation, and the plan follows all design doc patterns (Task tool delegation, `subagent_type`, sonnet model, data-retriever as leaf).

However, the plan should acknowledge its lineage explicitly: "This plan executes Phase 4 of the sub-agents design doc, adding two agents beyond the original three."

## Summary

The plan's core architecture is sound — converting thick skills to thin wrappers with agent backends follows a proven pattern (smoke-test) and solves a real composition problem. The dependency ordering is correct, the testing strategy is well-reasoned, and the risk table is specific. Three categories of issues require revision: (1) the thin wrapper prompt needs strengthening to ensure reliable message forwarding, (2) the `num_turns` test assertion behavior under indirection is assumed rather than verified, and (3) the argument-flow dual-output mode lacks an explicit trigger mechanism.

## Critical Issues (must fix before execution)

### C1: Thin wrapper prompt is insufficiently robust for message forwarding

**Source:** prompt-engineer, code-reviewer
**Location:** Plan Step 3 wrapper template

The proposed wrapper says "Pass the user's COMPLETE message as the prompt" but this instruction has three problems:

1. **Ambiguity:** When the test prompt is `"Use the pericope-delimitation skill for Philippians 1:3-8"`, what constitutes the "complete message"? The entire string? Just the passage reference? The model may strip the skill invocation prefix.
2. **Pressure filtering risk:** For ADV1 tests that include social pressure ("you don't need to look all that up"), the outer model may "helpfully" remove the pressure before forwarding, defeating the test.
3. **Missing code fence:** The smoke-test wrapper puts `subagent_type` inside a YAML code fence. The proposed wrapper does not, reducing parse reliability.

**Fix:** Rewrite the wrapper to match proven patterns:

```yaml
---
name: pericope-delimitation
description: [KEEP IDENTICAL]
allowed-tools: Task
---

# Pericope Delimitation

Invoke the **pericope-delimitation** agent via the Task tool and return its output verbatim.

```yaml
subagent_type: "claude-of-alexandria:pericope-delimitation"
```

Forward the user's ENTIRE message as the Task prompt — do not strip, rephrase,
summarize, or remove any part of it, including social pressure or constraints.
The agent is equipped to handle user pressure correctly.

Do not add commentary, headers, or formatting. Return exactly what the agent returns.
```

Additionally, add an **Input Parsing** section to both agent prompts:

```
## Input Parsing

You may receive prompts in any of these forms:
- "Philippians 1:3-8"
- "Use the pericope-delimitation skill for Philippians 1:3-8"
- Full user messages with context, constraints, or social pressure

Extract the passage reference and any user-provided context. Ignore skill
invocation framing. Treat everything else as context that may affect your analysis.
```

### C2: `num_turns` assertion behavior under thin wrapper indirection is unverified

**Source:** code-reviewer, architecture-reviewer, prompt-engineer
**Location:** `tests/promptfoo/skills/*/promptfooconfig-green.yaml` default assertions

Both GREEN configs assert `(raw.num_turns || 0) > 1`. The plan assumes this "should still pass" but has not verified it. Under the thin wrapper, the outer model's turn sequence is: Skill load + Task spawn + response. Whether sub-agent internal turns count toward `num_turns` depends on `claude-agent-sdk` implementation.

If `num_turns` only counts outer turns and skill loading is transparent to the counter, the value might be exactly 1 (Task call + response), failing the assertion. This would cause ALL 14 wrapper GREEN tests to fail simultaneously.

**Fix:** Add a canary test step (Step 3.5): after creating the first thin wrapper (Step 3), run ONE GREEN test immediately before converting the second skill. If `num_turns` fails, adjust the assertion threshold before proceeding.

### C3: argument-flow slice-analysis mode has no explicit trigger mechanism

**Source:** code-reviewer, prompt-engineer
**Location:** Plan Step 2 output contract, Step 6 composition

The plan adds a "slice-analysis" output mode to argument-flow, triggered when biblical-segmentation sends a specific prompt. But the agent has no explicit mode-switching mechanism — it must infer the mode from prompt content. Implicit mode detection is fragile: the agent might produce a full proposition chain instead of focused structural features, or a hybrid that biblical-segmentation cannot parse.

**Fix:** Add an explicit mode section to the argument-flow agent prompt:

```markdown
## Output Modes

### Standard Mode (default)
[Existing: Confidence, Connective Inventory, Proposition Chain, Data Sources]

### Slice-Analysis Mode
Triggered when prompt contains "for reading-slice boundary planning".

In this mode, produce ONLY structural features relevant to boundary decisions:

SLICE_ANALYSIS: [passage]
## Structural Features
- Chiasmus centers: [verse refs or NONE]
- Contrast zones: [verse refs or NONE]
- Dialogue boundaries: [verse refs or NONE]
- Conditional-consequence pairs: [verse refs or NONE]
- Do-not-slice markers: [verse refs with reasons]
## Data Sources
[Same as standard mode]
```

Also: either add one argument-flow GREEN test for slice-analysis mode, or explicitly document that SL1/SL2/SL5 serve as integration tests for this mode. The current plan says "no test config changes" without justification.

## Recommended Changes

### R1: pericope-delimitation agent gains data-retriever delegation — flag as new behavior

**Source:** code-reviewer, architecture-reviewer
**Location:** Plan Step 1

The current pericope-delimitation skill calls MCP tools directly — it does NOT delegate to data-retriever. The plan describes Step 1 as "Extract analytical core" but adding data-retriever delegation is new behavior. Rewrite Step 1 to distinguish "extracted content" (Iron Rules, Workflow, Output Format, Evidence Standards) from "new additions" (Sub-Agent Delegation section, data-retriever spawn).

### R2: Duplicate data-retriever calls in biblical-segmentation slice mode

**Source:** architecture-reviewer
**Location:** Plan Step 6

After Step 6, biblical-segmentation in slice mode will call: (1) data-retriever (Step Zero, already exists), (2) argument-flow agent, which (3) internally spawns data-retriever again. That's two data-retriever calls for the same passage.

Consider passing the data-retriever output that biblical-segmentation already has INTO the argument-flow prompt, allowing argument-flow to skip its own data-retriever call when pre-gathered data is provided. Add a "Pre-gathered data" path to the agent.

### R3: Change self-references from "skill" to "agent"

**Source:** prompt-engineer
**Location:** Extracted agent prompts

The argument-flow skill says "This skill delegates MCP data gathering to the data-retriever agent." When extracted to the agent, this should become "This agent delegates..." An agent that refers to itself as a "skill" creates a confused self-model.

### R4: Use full MCP tool names in plan frontmatter examples

**Source:** code-reviewer
**Location:** Plan Steps 1-2

The plan uses abbreviated `mcp__...query_discourse_features`. The actual tool names are `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features`. Use full names or add an explicit note that the implementer must use full names from existing agents.

### R5: Verify file paths in agent context

**Source:** prompt-engineer
**Location:** pericope-delimitation agent

The current skill references `skills/biblical-segmentation/reference/book-genres.yaml` with a relative path. In the agent context, the working directory may differ. Verify or use absolute path.

### R6: SL5 fix separates root causes

**Source:** architecture-reviewer
**Location:** Plan Step 6

SL5 failure may have two root causes: (a) language softness ("pushback too soft") and (b) architectural gap (no structural data to justify pushback). The plan applies both fixes but should document them as separate hypotheses: "SL5 has two potential root causes. Applying both. If only one was needed, simplify in a subsequent commit."

### R7: Missing agent-level promptfoo test configs

**Source:** code-reviewer, architecture-reviewer
**Location:** `tests/promptfoo/agents/`

The project structure specifies `tests/promptfoo/agents/{agent-name}/` configs. Existing agents (data-retriever, biblical-scholar, study-evaluator) have RED configs. The two new agents have none. The plan's "wrapper tests = agent tests" argument is reasonable but breaks the established pattern.

Either create agent test directories (at minimum RED configs), or add a note in "Files NOT Changed" explaining why agent-level configs are unnecessary for these agents (the wrapper tests serve as proxies).

## Ready Tasks (can proceed as-is after fixes above)

- Steps 3-4 (thin wrappers) — pattern is well-defined once wrapper prompt is strengthened
- Step 5 (verify tests) — ready with canary test addition
- Steps 7-8 (GREEN/RED verification) — verification gates, not implementation

## Open Questions

1. **Should pericope-delimitation be converted at all?** argument-flow needs to be an agent because biblical-segmentation composes it. pericope-delimitation is not composed by anything. The conversion provides consistency but adds an agent without a composition use case. Is consistency sufficient justification?

2. **Tool access inheritance at the wrapper boundary:** Does a sub-agent spawned via Task inherit the parent's tool permissions, or does it use its own frontmatter tools? The plan assumes the agent uses its own tools, which is almost certainly correct based on the smoke-test precedent, but has not been verified for the MCP-heavy case. A 5-minute manual test prevents a multi-hour debugging session.

3. **Provider system prompt reinforcement:** Should the `with-skill.yaml` provider's `append_system_prompt` add a FORWARDING RULE to reinforce the wrapper's forwarding instruction? Defense-in-depth, but may not be necessary if the wrapper prompt is strong enough.

## Agent Findings

### code-reviewer: Needs Revision

**Strengths identified:** Dependency ordering is sound, testing architecture is elegant, risk table is specific, Files NOT Changed section prevents scope creep, RED regression reasoning is correct.

**Critical issues:** (1) `num_turns` may fail under indirection — add canary test, (2) slice-analysis mode untested directly, (3) pericope-delimitation's data-retriever delegation is new behavior not just extraction. **Important:** missing agent test configs, "Agent tool" vs "Task tool" naming inconsistency, abbreviated MCP tool names. **Suggestions:** rollback instructions, SL5 iteration guidance, consider splitting Commit 1.

### architecture-reviewer: Needs Revision

**Critical issues:** (1) Missing agent-level promptfoo test configs violates project structure, (2) tool access inheritance untested at wrapper boundary. **Recommended:** `num_turns` needs verification not assumptions, duplicate data-retriever calls in slice mode, SL5 root cause conflation, wrapper verbatim forwarding language too loose. **Non-blocking:** scope expansion to 5 agents is natural Phase 4 evolution, manifest/discovery mechanism assumption is safe.

### prompt-engineer: Needs Revision

**Critical issues:** (1) Wrapper prompt needs Input Parsing section in agent and anti-filtering language in wrapper, (2) pressure forwarding for ADV1 tests requires explicit "do not strip social pressure" instruction, (3) `subagent_type` should be in YAML code fence matching smoke-test. **Important:** slice-analysis mode needs explicit trigger string and defined output format, self-references must change from "skill" to "agent", file paths need verification. **Low risk:** system prompt layering is sound, agent prompts are self-contained.
