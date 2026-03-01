# Promptfoo Test Suite Audit — Design Document

**Date:** 2026-03-01
**Status:** Draft — awaiting approval

---

## Problem Statement

When working with promptfoo test suites (RED/GREEN/grader provider architecture), three categories of failure recur:

1. **Knowledge gaps**: Model selection between RED, GREEN, and grader providers is error-prone. Which model for which purpose? When to use thinking vs non-thinking? Temperature settings per role?

2. **Misattributed root causes**: When a test fails, the fix is applied to the wrong layer. A failing GREEN test might indicate a bug in the skill, the grader rubric, the assertion type, a downstream MCP tool, or a sub-agent — but the default behavior is to patch the skill-under-test to make the test pass, masking the real problem.

3. **Weak test design**: RED tests that don't actually prove failure modes. GREEN tests that pass for the wrong reasons. Answer leakage in prompts. Compensating for downstream dependency bugs by hardcoding edge cases in the upstream skill.

## Goals

- A **reusable skill** that provides the diagnostic methodology: decision trees, root cause analysis, provider architecture principles, RED/GREEN design guardrails
- A **subagent** that follows the skill's methodology to audit actual test files, diagnose failures, and recommend targeted fixes
- **Generic across projects** — principles and frameworks, not project-specific rules
- Complement (not duplicate) the existing `kombajn-dev:promptfoo` skill which covers basic promptfoo config/assertions/setup

## Non-Goals

- Not a replacement for `kombajn-dev:promptfoo` (that covers "how to use promptfoo")
- Not a test runner (doesn't execute tests — diagnoses them)
- Not project-specific (no hardcoded biblical-analysis terminology)

---

## Architecture Decision: Skill + Subagent

### Why Both

| Component | Purpose | Analogy |
|-----------|---------|---------|
| **Skill** (`promptfoo-test-audit`) | Methodology guide — loaded into context when auditing tests | A textbook |
| **Subagent** (`test-suite-auditor`) | Worker that reads test files, applies the methodology, reports findings | A reviewer following the textbook |

The skill provides the **knowledge framework**. The subagent provides the **execution pattern**. Either can be used independently:
- Invoke the skill alone when manually fixing a test and wanting the decision trees in context
- Invoke the subagent for automated audit of a test suite or single test file

### Methodology Access Pattern

The subagent **embeds the full audit methodology in its prompt**, following the project's established convention. The argument-flow agent (432 lines), data-retriever agent, and pericope-delimitation agent all embed their complete methodology — no agent in this project loads skills at runtime.

This means the methodology exists in two places:
- **Skill**: For human-in-the-loop reference (loaded into context when manually auditing/fixing tests)
- **Subagent prompt**: For automated audit runs (self-contained, no external dependencies)

Content duplication is accepted. The skill is the source of truth; the agent prompt is derived from it. When the skill is updated, the agent prompt must be updated to match.

### Where They Live

**In this project:**
- **Skill**: `.claude/skills/promptfoo-test-audit/SKILL.md` — an invocable skill containing the full audit methodology
- **Subagent**: `.claude/agents/test-suite-auditor.md` — the automated auditor with embedded methodology

Both are generic development tools, not biblical-analysis-specific. They live in `.claude/` (project-local configuration) rather than in `plugins/claude-of-alexandria/` (which is reserved for domain-specific exegetical skills per CLAUDE.md's repository structure).

**Cross-project reuse:**
- Both files can be copied directly to any project's `.claude/` directory
- For plugin-based distribution (planned): port both to a general-purpose Claude plugin (e.g., `kombajn-dev` or a new testing-focused plugin)

---

## Skill Design: `promptfoo-test-audit`

### Section 1: Provider Architecture Framework

Decision tree for provider configuration:

```
Which provider role?
├─ TEST PROVIDER (subject under test)
│   ├─ Use the SAME model you deploy in production
│   ├─ RED provider: bare model, no skills/tools/MCP, isolated filesystem (/tmp)
│   ├─ GREEN provider: full toolchain (skills + MCP + tools + project context)
│   └─ Both RED and GREEN MUST use the same base model (isolate skill as only variable)
│
├─ GRADER PROVIDER (evaluates outputs)
│   ├─ Use a model STRONGER than the test model (e.g., Opus grading Sonnet)
│   ├─ Temperature: 0 (deterministic grading)
│   ├─ Non-thinking mode (so promptfoo can parse JSON from grader response)
│   ├─ No skills, no MCP, no tools (pure evaluation function)
│   └─ NEVER the same model instance as test provider (shared biases)
│
└─ RED-TEAM ATTACKER (if using promptfoo's built-in red-teaming)
    ├─ Can use a different model family (cross-model adversarial)
    └─ Configured via redteam.provider, separate from test/grader
```

**Common mistakes:**
- Using the same model for testing and grading (shared blind spots)
- Thinking mode on grader (JSON parsing breaks)
- Different base models between RED and GREEN providers (now you're testing model differences, not skill differences)
- Forgetting `--no-cache` (cached results mask regressions). If the project uses npm scripts, Makefiles, or CI pipelines to run tests, verify `--no-cache` is included there too — not just in manual CLI invocations

### Section 2: Root Cause Analysis Framework

When a test fails, diagnose **which layer** is broken before fixing anything:

```
Test failure observed
│
├─ 1. IS THE ASSERTION WRONG?
│   ├─ Is the assertion type appropriate? (deterministic vs LLM-graded)
│   ├─ Is the rubric discriminating? (run grader calibration with known-good/known-bad)
│   ├─ Is the rubric ambiguous? (explicit PASS/FAIL criteria?)
│   ├─ Is `not-llm-rubric` needed instead of `llm-rubric` (or vice versa)?
│   └─ Does the assertion test what you think it tests?
│
├─ 2. IS THE GRADER WRONG?
│   ├─ Run grader calibration: feed synthetic known-good and known-bad outputs
│   ├─ If grader passes bad output → rubric is too loose
│   ├─ If grader fails good output → rubric is too strict or ambiguous
│   ├─ Check grader model/temperature/thinking-mode configuration
│   └─ Check if grader provider is correctly specified (not falling back to OpenAI)
│
├─ 3. IS THE TEST DESIGN WRONG?
│   ├─ RED test: does it actually document a genuine failure mode?
│   │   ├─ Does the prompt leak the expected answer?
│   │   ├─ Is the "failure" something the bare model can actually do sometimes?
│   │   └─ Is the assertion polarity correct? (RED PASS = failure observed)
│   ├─ GREEN test: does it prove skill effectiveness?
│   │   ├─ Would this test pass WITHOUT the skill? (then it's not testing the skill)
│   │   ├─ Is it testing format compliance or actual capability?
│   │   └─ Are the default assertions (tool usage, guardrails) still appropriate?
│   └─ Is this a unit test or integration test? (see Section 5)
│
├─ 4. IS THE SKILL/AGENT UNDER TEST BROKEN?
│   ├─ Does the skill address the specific failure mode?
│   ├─ Is the skill's methodology correct but its examples wrong?
│   ├─ Has the skill regressed since last passing test?
│   └─ ONLY fix the skill if layers 1-3 are confirmed correct
│
├─ 5. IS A DOWNSTREAM DEPENDENCY BROKEN?
│   ├─ MCP tool returning wrong/incomplete data?
│   ├─ Sub-agent not following its contract?
│   ├─ External API changed behavior?
│   ├─ Data source has gaps for specific test cases?
│   └─ RED FLAG: If you're tempted to hardcode edge cases in the skill
│       to make a test pass → the dependency is broken, not the skill
│
└─ 6. WOULD THE FIX BREAK UPSTREAM CONSUMERS?
    ├─ What other skills/agents depend on the component you're about to change?
    ├─ Does this fix change the output contract? (format, sections, data shape)
    ├─ Are there other test suites that exercise this dependency path?
    ├─ Would a sub-agent consumer still get what it expects after this fix?
    └─ RED FLAG: If the fix changes public behavior, you need an impact audit
        across all consumers before applying it
```

**The Compensation Anti-Pattern:**

> When a GREEN test fails because an MCP tool returns incomplete data for a specific passage (e.g., John 3:5-10), the temptation is to add special handling in the skill for that passage. This makes the test pass but masks the real problem (the MCP tool needs fixing).
>
> **Rule**: If the fix involves adding passage-specific logic to a skill that should work generically, the problem is downstream. Flag it. Don't compensate.

### Section 3: RED/GREEN Test Design Principles

**What Makes a Good RED Test:**

| Principle | Description |
|-----------|-------------|
| **Documents genuine incapability** | The bare model truly cannot do this without the skill — not just "sometimes fails" |
| **Specific, observable failure mode** | "Missing section X" not "output is bad" |
| **No answer leakage** | The prompt must not contain the expected answer or format |
| **Assertion polarity is correct** | RED PASS = failure was reproduced. Use `not-llm-rubric` or `not-icontains` |
| **Same prompt domain as GREEN** | Tests the same capability, just without the skill |
| **Falsifiable** | You can clearly determine pass/fail from the output |

**What Makes a Good GREEN Test:**

| Principle | Description |
|-----------|-------------|
| **Would fail without the skill** | If the bare model can pass this test, it's not testing the skill |
| **Layered assertions** | Deterministic first (icontains, javascript), then LLM-graded (llm-rubric) |
| **Tests capability, not memorization** | The skill should generalize, not just handle the test case |
| **Default assertions enforce invariants** | Tool usage, guardrails, format compliance in `defaultTest` |
| **Explicit PASS/FAIL rubric criteria** | Not vague "should be good" — concrete, gradable criteria |
| **No downstream dependency assumptions** | If the test requires specific MCP data, that data must exist and be correct |

**RED/GREEN Relationship:**

- Same grader provider for both (consistency in evaluation)
- Same base model for both test providers (isolate skill as only variable)
- RED documents the problem; GREEN proves the solution
- Every GREEN test scenario should have a corresponding RED scenario (or explicit justification for why not)
- RED and GREEN configs are separate files (not mixed in one config)

### Section 4: Assertion Selection Framework

```
Can you check this with exact string matching?
  YES → icontains / icontains-any / contains / regex
  NO  → Can you check with custom code logic?
    YES → javascript (return GradingResult with reason for diagnostics)
    NO  → Does it require semantic understanding?
      YES → llm-rubric (with explicit PASS/FAIL criteria)
      NO  → Re-examine: you probably CAN check it deterministically
```

**Layering principle**: Stack assertions from cheapest to most expensive:
1. `icontains` / `regex` — instant, free, never flakes
2. `javascript` — instant, free, custom logic, diagnostic reasons
3. `llm-rubric` — expensive, LLM call, can flake if rubric is vague

If a deterministic assertion fails, the expensive LLM assertions won't waste resources.

**Rubric design for discrimination:**
- Always include explicit PASS and FAIL criteria
- Test rubrics with known-good AND known-bad synthetic outputs (grader calibration)
- Avoid double-negatives ("not-llm-rubric with FAIL if missing" = confusing)
- Prefer positive framing: "PASS if X is present and correct. FAIL if X is absent, wrong, or ambiguous."

### Section 5: Unit vs Integration Test Distinction

Even for LLM prompts, the unit/integration distinction matters:

| Test Type | What It Tests | Dependencies | Speed | Flakiness |
|-----------|--------------|--------------|-------|-----------|
| **Unit** | Prompt/skill logic in isolation | None (bare model or mocked tools) | Fast | Low |
| **Integration** | Full pipeline (skill + tools + MCP + sub-agents) | All real dependencies | Slow | Higher |
| **Grader calibration** | Grader discrimination ability | Echo provider + synthetic data | Fast | Low |
| **Smoke** | Pipeline connectivity | Full stack, minimal assertions | Medium | Medium |

**When to use each:**
- **Unit (RED phase)**: Always. Documents what the bare model cannot do.
- **Integration (GREEN phase)**: Always. Proves the skill + toolchain works together.
- **Grader calibration**: Before trusting any new `llm-rubric` assertion. Feed known-good and known-bad outputs through the grader to verify discrimination.
- **Smoke**: After infrastructure changes (new MCP endpoints, provider config changes).

**Dependency mapping for integration tests:**

Before writing or fixing an integration test, map its **full dependency chain** — both downstream (what this test relies on) and upstream (what relies on the thing being tested):

```
UPSTREAM (what breaks if you change Skill X)
├─ Skill Z (calls Skill X as a sub-step)
├─ Agent W (spawns Skill X)
└─ Other test suites (test Skill Z or Agent W, indirectly depending on Skill X)

GREEN test for Skill X ← THE TEST UNDER ANALYSIS
├─ Skill X (the subject under test)
│   ├─ Sub-agent Y (spawned by skill)     ← DOWNSTREAM
│   │   ├─ MCP tool A (called by sub-agent)
│   │   └─ MCP tool B (called by sub-agent)
│   └─ Direct MCP tool C (called by skill)
├─ Grader provider (evaluates output)
│   └─ Rubric text (the criteria)
└─ Test prompt (the input)
```

Any node in this tree — upstream OR downstream — can be the root cause of a test failure, or can be affected by a fix.

**Upstream dependency awareness:**

Before fixing a skill or agent to make a test pass, check:
1. **What other skills/agents depend on this one?** Changing its behavior may break their tests.
2. **Is this skill a sub-agent target?** Other skills that spawn it expect a specific contract.
3. **Do other test suites exercise this dependency path?** A fix here may cause failures elsewhere.
4. **Is the "fix" actually a contract change?** If so, all consumers need updating.

**Rule**: If a fix to Skill X would change its output contract, audit all upstream consumers before applying the fix. A narrowly-passing test is better than a cascade of upstream failures.

### Section 6: Anti-Patterns Reference

| Anti-Pattern | Description | How to Detect | Fix | Real Example |
|---|---|---|---|---|
| **Answer leakage** | Prompt contains the expected answer | Read the prompt — does it describe the expected output format/content? | Rewrite prompt without format hints | `a632a56` — RED suite prompts leaked expected format, making RED tests trivially passable |
| **Compensation** | Skill hardcodes edge cases for test passages | Skill has passage-specific logic that doesn't generalize | Fix the downstream dependency instead | `cffcf6a`, `c3d708a` — segmentation fixes that added passage-specific pre-flight checks |
| **Grader trust** | Trusting llm-rubric without calibration | No grader-calibration tests exist | Add echo-provider calibration pairs | `4d61208` — systematic rubric quality fixes across all configs, discovered via calibration |
| **Model confusion** | Wrong model for provider role | Grader uses test model; RED/GREEN use different base models | Follow provider architecture framework | `d1ceec8` — GREEN tests used default OpenAI grading; fixed by adding dedicated Opus grader provider |
| **Polarity inversion** | Using `llm-rubric` in RED where `not-llm-rubric` is needed | RED test passes when it should fail (or vice versa) | Check assertion polarity against test phase | `a632a56` — RED assertions rewritten for correct discrimination polarity |
| **Flaky rubric** | Vague rubric criteria produce inconsistent grading | Test passes/fails randomly across runs | Add explicit PASS/FAIL criteria; calibrate | — |
| **Format-only testing** | GREEN test only checks section headers exist | All assertions are `icontains` for headers | Add semantic assertions for content quality | — |
| **Missing default assertions** | No shared invariants across test cases | Each test duplicates or omits common checks | Use `defaultTest.assert` for universal requirements | — |
| **Stale RED** | RED test no longer documents a real failure (model improved) | RED test fails (bare model now succeeds) | Update RED to test a harder failure mode, or retire the RED test and document the model's new capability | — |
| **Downstream blame-shift** | Fixing the skill when MCP data is wrong | Fix is passage-specific, not methodology-specific | Flag as dependency issue; fix the data source | — |
| **Upstream-blind fix** | Changing a skill's output contract without checking consumers | Skill has upstream dependents (other skills spawn it, agents call it) | Audit all upstream consumers before changing contracts | `f975f45` — skill template/rule contradictions caused 7 GREEN failures across multiple consumers |
| **Silent contract change** | Fix passes local tests but breaks upstream test suites | Other test suites start failing after your fix | Map full dependency graph; run upstream tests after fixing | — |

### Section 7: Test Execution Reference

> **Note:** The full test execution reference (all `--filter-*` flags, gotchas, common patterns) is maintained separately and should be added to the `kombajn-dev:promptfoo` skill, which owns "how to use promptfoo" operational knowledge. This section provides only the audit-relevant subset.

**When auditing, use selective execution to isolate failures:**

- `--filter-pattern <regex>` — filter by `test.description` (JavaScript RegExp, NOT glob)
- `--filter-providers <regex>` — filter by provider `id` or `label`
- `--filter-failing <path|evalId>` — rerun only failing tests from a previous eval
- `-c <path>` — run a specific config file

**Audit-critical gotchas:**
- `--filter-pattern` requires tests to have `description` fields. Tests without descriptions are **silently excluded**.
- All pattern flags use **JavaScript RegExp**, not glob. Use `"S1"` not `"S1*"`.
- Always use `--no-cache` when diagnosing failures (cached results mask regressions).
- `-c` accepts **multiple files**: `-c config1.yaml -c config2.yaml` (merged).

The full filter reference (application order, `--filter-metadata`, `--filter-sample`, `--filter-first-n`, `commandLineOptions` config-level defaults) belongs in the promptfoo operational skill.

### Section 8: Audit Checklist

When auditing a test suite or single test file, verify each item:

**Provider Configuration:**
- [ ] RED and GREEN use the same base model
- [ ] Grader uses a stronger model than test providers
- [ ] Grader temperature is 0
- [ ] Grader is non-thinking mode
- [ ] Grader is explicitly specified (not falling back to OpenAI default)
- [ ] RED provider has no access to skills, tools, or project filesystem
- [ ] GREEN provider has full toolchain (skills + MCP + tools)
- [ ] `--no-cache` is used in all test invocations (scripts, CI, direct CLI)

**RED Test Quality:**
- [ ] Each RED test documents a specific, named failure mode
- [ ] RED prompts do not leak expected answers or format
- [ ] RED assertion polarity is correct (PASS = failure observed)
- [ ] RED tests would actually fail if the skill were active (they test real incapability)
- [ ] Failure modes are specific and observable, not vague

**GREEN Test Quality:**
- [ ] Each GREEN test would fail without the skill (proves skill necessity)
- [ ] Layered assertions: deterministic first, LLM-graded for semantic checks
- [ ] All `llm-rubric` assertions have explicit PASS/FAIL criteria
- [ ] Default assertions enforce universal invariants (tool usage, guardrails)
- [ ] No passage-specific hardcoding that compensates for downstream bugs
- [ ] Test prompts are realistic (how a user would actually invoke the skill)

**Grader Calibration:**
- [ ] Grader calibration tests exist for each `llm-rubric` rubric category
- [ ] Calibration includes known-good outputs (should PASS)
- [ ] Calibration includes known-bad outputs (should FAIL via `not-llm-rubric`)
- [ ] Calibration uses echo provider (synthetic data, no LLM test calls)

**Dependency Awareness (Downstream):**
- [ ] Integration test dependencies are mapped (skill → sub-agents → MCP tools)
- [ ] Each test failure is diagnosed through the root cause framework before fixing
- [ ] No compensation patterns (passage-specific logic masking dependency bugs)
- [ ] Downstream dependency issues are flagged separately from skill issues

**Dependency Awareness (Upstream):**
- [ ] Upstream consumers of the skill/agent are identified before applying fixes
- [ ] If fix changes output contract, all upstream consumer tests are checked
- [ ] Sub-agent callers still receive expected output format after proposed changes
- [ ] No fix is applied that would cascade failures to other test suites

**Test Execution:**
- [ ] All test cases have `description` fields (required for `--filter-pattern`)
- [ ] Descriptions follow a consistent naming convention (e.g., `S1 GREEN: Scenario name`)
- [ ] `--no-cache` is used in all test invocations (npm scripts, Makefiles, CI commands, or direct CLI)
- [ ] Individual suite/config runs are possible (not only a single "run everything" command)
- [ ] `--filter-pattern` is used correctly (regex, not glob) when running selectively

**RED/GREEN Correspondence:**
- [ ] Every GREEN scenario has a corresponding RED scenario (or documented justification)
- [ ] RED and GREEN use the same grader provider
- [ ] RED/GREEN configs are separate files

---

## Testing Strategy

### Skill (`.claude/skills/promptfoo-test-audit/` — TDD exemption)

The CLAUDE.md TDD mandate applies to skills in `plugins/claude-of-alexandria/skills/`. The audit skill lives in `.claude/skills/` (project-local configuration), outside the plugin's TDD-mandated directory.

**Rationale for exemption:** The skill is a methodology reference loaded into context. It provides decision trees and checklists — it does not direct agent behavior through structured steps (like exegetical-notes or pericope-delimitation). Testing a reference document through RED/GREEN TDD is not meaningful — the "failure mode" is incompleteness or incorrectness, which is validated through use, not promptfoo assertions.

**Validation approach:**
- Manual validation: Use the skill during actual test fixing sessions. Document whether the root cause analysis framework correctly identifies the problem layer.
- Retrospective check: After each test-fixing session, verify whether the fix was applied at the correct layer.

### Subagent (`.claude/agents/test-suite-auditor.md`)

The subagent can be tested via promptfoo if warranted, but this is deferred to post-validation:

- RED: agent without methodology produces misattributed root causes, misses anti-patterns, recommends wrong-layer fixes
- GREEN: agent with embedded methodology correctly identifies root cause layers, detects anti-patterns, recommends targeted fixes
- Grader calibration: synthetic test configs with known issues (answer leakage, polarity inversion, model confusion) as inputs; verify the agent detects them

Testing is deferred until the methodology is validated through manual use. Premature testing of a methodology that hasn't been field-tested would produce tests for unproven requirements.

---

## Subagent Design: `test-suite-auditor`

### Purpose
Execute the audit methodology from the skill against actual test files. Read configs, diagnose issues, map dependencies, and produce a structured audit report.

### Inputs
- Path to a test config file or directory of configs
- Optional: specific test scenario to diagnose
- Optional: test failure output to analyze

### Process
1. Read the test config(s)
2. Identify provider configurations and verify against the Provider Architecture Framework
3. For each test case:
   - Classify as RED/GREEN/calibration/smoke
   - Map dependency chain (skill → sub-agents → MCP tools)
   - Check assertion selection (deterministic vs LLM-graded balance)
   - Check rubric quality (explicit PASS/FAIL criteria?)
   - Check for anti-patterns (answer leakage, compensation, polarity inversion)
4. If analyzing a failure: walk through Root Cause Analysis Framework layer by layer
5. Produce structured findings

### Output Contract

The audit report has **mandatory** and **conditional** sections. The report header and Provider Configuration are always present. Other sections depend on scope.

**State labels:**
- `PASS` — no issues found
- `WARN` — non-blocking concern, should investigate
- `FAIL` — blocking issue, must fix before trusting test results
- `N/A` — not applicable (e.g., no failure provided for Root Cause Analysis)
- `NONE_FOUND` — section was checked but no items detected (e.g., Anti-Patterns)

**Mandatory sections (always present):**

```markdown
## Test Suite Audit Report
**Scope:** [file path or directory audited]
**Date:** [YYYY-MM-DD]
**Overall:** [PASS / WARN / FAIL] — worst status from any mandatory check

### Provider Configuration
- [PASS/WARN/FAIL] RED/GREEN model parity: [detail]
- [PASS/WARN/FAIL] Grader model strength: [detail]
- [PASS/WARN/FAIL] Grader configuration (temp, thinking mode): [detail]
- [PASS/WARN/FAIL] Provider isolation: [detail]

### Test Quality
| Test | Phase | Det. Assertions | LLM Assertions | Issues |
|------|-------|-----------------|----------------|--------|
| S1   | RED   | 3               | 1              | [issue or "—"] |
| S1   | GREEN | 5               | 3              | [issue or "—"] |

### Anti-Patterns
[NONE_FOUND] or:
- **[ANTI-PATTERN NAME]** in [file:line]: [description]. Fix: [recommendation].
```

**Conditional sections (present only when relevant):**

```markdown
### Dependency Map
[Present when auditing a skill/agent with known dependencies]
[Mermaid diagram with UPSTREAM / SUBJECT / DOWNSTREAM subgraphs]

### Root Cause Analysis
[Present only when a specific test failure is provided for diagnosis]
- Layer 1 (Assertion): [OK/ISSUE — detail]
- Layer 2 (Grader): [OK/ISSUE — detail]
- Layer 3 (Test Design): [OK/ISSUE — detail]
- Layer 4 (Skill/Agent): [OK/ISSUE — detail]
- Layer 5 (Downstream Dependency): [OK/ISSUE — detail]
- Layer 6 (Upstream Impact): [OK/ISSUE — detail]
- **Root cause:** [layer N — summary]
- **Recommended action:** [fix X at layer Y]
- **Upstream impact:** [none / list of affected consumers]
```

**Minimum viable output** (if audit finds nothing wrong):

```markdown
## Test Suite Audit Report
**Scope:** tests/promptfoo/skills/example/promptfooconfig-green.yaml
**Date:** 2026-03-01
**Overall:** PASS

### Provider Configuration
- [PASS] RED/GREEN model parity: both use sonnet
- [PASS] Grader model strength: opus grading sonnet
- [PASS] Grader configuration: temperature 0, non-thinking
- [PASS] Provider isolation: RED at /tmp, GREEN at project root

### Test Quality
| Test | Phase | Det. Assertions | LLM Assertions | Issues |
|------|-------|-----------------|----------------|--------|
| S1   | GREEN | 4               | 2              | —      |

### Anti-Patterns
NONE_FOUND
```

### Iron Rules

1. **Never modify files.** The auditor produces a report. It reads test configs, provider configs, skill files, and agent files. It writes nothing.
2. **Walk the Root Cause Analysis Framework layer-by-layer.** When diagnosing a failure, check layers 1 (assertion) → 2 (grader) → 3 (test design) → 4 (skill/agent) → 5 (downstream) → 6 (upstream) in order. Do not skip layers.
3. **Never recommend a skill/agent fix without confirming layers 1-3 are correct.** If the assertion is wrong, or the grader is misconfigured, or the test is poorly designed, fixing the skill masks the real problem.
4. **Map upstream dependencies before recommending any contract-changing fix.** If a fix would change the output format, sections, or data shape of a skill or agent, list all upstream consumers that would be affected.
5. **Flag downstream dependency issues explicitly.** If the root cause is an MCP tool, sub-agent, or data source — say so. Do not recommend compensating for downstream bugs in the upstream skill.
6. **Use the anti-pattern vocabulary.** When an issue matches a named anti-pattern, use that name. This creates a shared language between audit reports and the methodology.

### Agent Configuration
```yaml
subagent_type: test-suite-auditor
model: sonnet
tools: [Read, Glob, Grep]
```

The agent has **read-only** access to test files, provider configs, skill files, and agent files. Bash is intentionally excluded to enforce read-only behavior (no existing agent in this project uses Bash).

---

## Relationship to Existing Skills

| Existing | New | Relationship |
|----------|-----|-------------|
| `kombajn-dev:promptfoo` | `promptfoo-test-audit` | `promptfoo` = how to use promptfoo. `test-audit` = how to diagnose and improve tests. |
| `kombajn-dev:tdd` | `promptfoo-test-audit` | `tdd` = general TDD methodology. `test-audit` = promptfoo-specific diagnostic methodology. |
| `kombajn-dev:debug` | `promptfoo-test-audit` | `debug` = general debugging. `test-audit` = test-specific root cause analysis. |
| `superpowers:verification-before-completion` | `promptfoo-test-audit` | `verification` = "did I finish?" `test-audit` = "is the test suite healthy?" |

### Topic Ownership Table

Defines which skill owns each topic to prevent overlap and duplication:

| Topic | `kombajn-dev:promptfoo` | `promptfoo-test-audit` |
|---|---|---|
| YAML config syntax | **owns** | — |
| Assertion types available | **owns** | — |
| Which assertion type to choose for a case | references | **owns** |
| Provider configuration how-to | **owns** | — |
| Provider configuration audit (is it correct?) | — | **owns** |
| `--filter-*` CLI flags reference | **owns** | references (audit subset) |
| Red-teaming setup | **owns** | — |
| Root cause analysis for failures | — | **owns** |
| Anti-pattern detection | — | **owns** |
| Grader calibration methodology | — | **owns** |
| RED/GREEN test design principles | — | **owns** |
| Dependency mapping (up/downstream) | — | **owns** |
| Audit checklist | — | **owns** |
| Unit vs integration test distinction | — | **owns** |

**Rule:** If both skills could reasonably cover a topic, the one that **owns** it provides the authoritative content. The other skill **references** it (e.g., "see the promptfoo-test-audit skill for assertion selection guidance").

---

## Example Usage

### Invoke skill for manual test fixing
```
User: "The exegetical-notes S2 GREEN test is failing. Help me fix it."
Agent: [loads promptfoo-test-audit skill]
Agent: [walks through root cause analysis framework]
Agent: "Layer 5 — the MCP query_morphology tool returns incomplete data for
        this passage. The skill is correct; the test failure is a downstream
        dependency issue. Recommend: flag MCP data gap, not skill fix."
```

### Invoke subagent for full suite audit
```
User: "Audit the pericope-delimitation test suite."
Agent: [spawns test-suite-auditor subagent]
Subagent: [reads all configs, maps dependencies, checks anti-patterns]
Subagent: [returns structured audit report]
```

### Invoke skill before writing new tests
```
User: "I need to write RED/GREEN tests for a new skill."
Agent: [loads promptfoo-test-audit skill]
Agent: [follows RED/GREEN design principles, assertion selection framework]
```
