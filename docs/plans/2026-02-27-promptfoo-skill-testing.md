# Promptfoo Skill Testing Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Replace the manual markdown-based TDD approach with automated promptfoo testing using the Claude Agent SDK provider, preserving the RED-GREEN-REFACTOR discipline.

**Architecture:** Promptfoo's `anthropic:claude-agent-sdk` provider runs full agent loops (skill loading, MCP tool calls, multi-turn reasoning) and evaluates output with deterministic + LLM-rubric assertions. Tests run locally during development and on GitHub Actions at release time (tag-triggered).

**Tech Stack:** promptfoo (npm), Claude Agent SDK provider, GitHub Actions, existing Cloudflare Workers MCP server

**Actual scenario counts:** exegetical-notes (7), argument-flow (8), pericope-delimitation (10), consult-biblical-scholar (6), biblical-segmentation (34) = **65 total scenarios**

**Estimated cost per full run:** Spike measured ~$0.05-0.15/scenario (cache heavily reduces costs). 65 scenarios ≈ **$3-10 per full run** (much lower than initial estimate due to skill cache hits).

---

## Go/No-Go Gates

- **After Task 0 (Spike):** Can the provider load skills, toggle them off, and call MCP tools? If no → stop, re-evaluate tooling choice.
- **After Task 6 (Pilot GREEN):** Does the pilot produce reliable RED-fail/GREEN-pass results? If results are flaky (>20% variance across 3 runs) → re-evaluate assertion strategy before scaling.

---

## Task 0: Spike — Verify Claude Agent SDK provider works

**Goal:** Resolve all blocking unknowns before writing any test infrastructure. 1-2 hours.

**Verify these questions:**

1. **Skill loading:** Does `setting_sources: ['project']` with `working_dir` pointing to the repo root discover and load skills from `plugins/claude-of-alexandria/skills/`?
2. **Skill exclusion:** Does `setting_sources: []` with an empty `working_dir` prevent skill loading? (needed for RED phase)
3. **MCP connectivity:** Can the provider connect to `https://coa.davebream.com/mcp` and call tools?
4. **MCP tool naming:** What names does the Agent SDK assign to MCP tools? Are they `mcp__plugin_claude-of-alexandria_...` (Claude Code convention) or `query_morphology` (bare name) or something else? Capture actual names — all assertion helpers depend on this.
5. **`file://` provider references:** Does `providers: [file://../../providers/config.yaml]` work, or must configs be inlined?
6. **Tool call metadata:** Does `context.providerResponse?.metadata?.toolCalls` expose tool calls in JavaScript assertions?
7. **Report generation:** Does `npx promptfoo view --output report.html` generate a static file, or does `view` only start a web server? Check for `export` or `generate` alternatives.

**Steps:**

1. Install promptfoo: `npm init -y && npm install promptfoo --save-dev`
2. Create a minimal `spike.yaml` with one test case, one assertion, the Agent SDK provider with MCP
3. Run: `npx promptfoo eval --config spike.yaml --no-cache --verbose`
4. Inspect output: tool names, metadata structure, skill loading behavior
5. Document findings in `docs/plans/2026-02-27-spike-findings.md`
6. Update provider configs in this plan based on findings

**If spike fails:** Stop. The plan needs fundamental revision — possibly a custom provider wrapper or a different testing approach.

**Do not commit spike artifacts.** This is exploratory.

**COMPLETED — See `docs/plans/2026-02-27-spike-findings.md`**

Key findings:
- Auth: `CLAUDE_CODE_OAUTH_TOKEN` (from fish) + `CLAUDE_CODE_USE_BEDROCK=bypass-validation` + unset `ANTHROPIC_API_KEY`
- MCP tool names: **bare names** (`list_books`, `query_morphology`, etc.) — NOT the Claude Code plugin prefix
- `metadata.toolCalls`: Does NOT exist. Use `raw.num_turns > 1` instead
- `file://` provider refs: Not yet tested
- Cost: ~$0.05-0.15/scenario (much lower than estimated)

---

## Task 1: Install promptfoo and create project structure

**Files:**
- Create: `tests/promptfoo/package.json`
- Create: `tests/promptfoo/.gitignore`

**Authentication note (Claude Max, no API key required)**

The Agent SDK provider requires `ANTHROPIC_API_KEY` in its validation gate, but doesn't check for `CLAUDE_CODE_OAUTH_TOKEN`. Workaround confirmed by spike:

```bash
# Run any promptfoo eval with Max subscription (no API key):
CLAUDE_CODE_OAUTH_TOKEN=$(fish -c 'echo $CLAUDE_CODE_OAUTH_TOKEN') \
CLAUDE_CODE_USE_BEDROCK=bypass-validation \
env -u CLAUDECODE -u ANTHROPIC_API_KEY \
npx promptfoo eval -c promptfooconfig.yaml
```

Add this to `tests/promptfoo/Makefile` or a `run-eval.sh` script so it's not typed every time. For CI (GitHub Actions), use a real `ANTHROPIC_API_KEY` secret.

**Step 1: Initialize promptfoo project**

```bash
cd tests/promptfoo
npm init -y
npm install promptfoo --save-dev
```

**Step 2: Create `.gitignore` for generated results**

```gitignore
# Promptfoo generated output
output/
*.json
!package.json
!package-lock.json
node_modules/
```

**Step 3: Verify installation**

Run: `cd tests/promptfoo && npx promptfoo --version`
Expected: Version number (0.120.x or later)

**Step 4: Write ADR**

Create `docs/adr/0001-promptfoo-for-skill-testing.md`:

- **Context:** Current TDD uses 3 hand-written markdown files per skill (~700 lines each). Tests require manual subagent execution, baselines go stale, no regression detection, no CI.
- **Decision:** Adopt promptfoo with `anthropic:claude-agent-sdk` provider for automated skill evaluation.
- **Alternatives considered:** (1) Keep markdown TDD — no automation, high maintenance; (2) DeepEval/LangSmith/Braintrust — trace-analysis only, no agent-running; (3) LangWatch Scenario — no Claude SDK or MCP integration; (4) Custom framework — high effort, low ROI.
- **Consequences:** API costs per test run (~$1.50/scenario with budget caps). LLM-rubric assertions introduce some variability for qualitative checks. Old markdown test files become archival (not deleted, but no longer the source of truth).

**Step 5: Commit**

```bash
git add tests/promptfoo/package.json tests/promptfoo/package-lock.json tests/promptfoo/.gitignore docs/adr/
git commit -m "chore: initialize promptfoo for skill testing"
```

---

## Task 2: Create shared provider configuration

**Files:**
- Create: `tests/promptfoo/providers/claude-agent-sdk.yaml`
- Create: `tests/promptfoo/providers/claude-agent-sdk-no-skill.yaml`

These define the two provider configurations used across all skill tests.

**Step 1: Create the GREEN-phase provider (with skills)**

```yaml
# tests/promptfoo/providers/claude-agent-sdk.yaml
# Provider for GREEN phase: agent has access to skills + MCP
id: anthropic:claude-agent-sdk
label: with-skill
config:
  model: claude-sonnet-4-5-20250929
  working_dir: ../../  # repo root — skills discovered from here
  setting_sources:
    - project  # loads skills from plugins/claude-of-alexandria/skills/
  # Spike confirmed: Agent SDK uses BARE tool names, not Claude Code plugin prefix
  # e.g., 'list_books' NOT 'mcp__plugin_claude-of-alexandria_...__list_books'
  permission_mode: bypassPermissions
  allow_dangerously_skip_permissions: true
  append_allowed_tools:
    - Skill
    - Read
    - Write
    - WebSearch
    - list_books
    - query_discourse_features
    - query_paragraph_breaks
    - query_vocabulary
    - query_morphology
    - query_ot_quotes
    - query_lemmas
    - query_themes_for_lemmas
  max_turns: 40
  max_budget_usd: 2.00
  mcp:
    enabled: true
    servers:
      - name: claude-of-alexandria-mcp
        url: https://coa.davebream.com/mcp
```

**Step 2: Create the RED-phase provider (no skills)**

```yaml
# tests/promptfoo/providers/claude-agent-sdk-no-skill.yaml
# Provider for RED phase: agent has MCP access but NO skill loaded
# Omit working_dir to use auto temp dir (no skills discoverable)
id: anthropic:claude-agent-sdk
label: without-skill
config:
  model: claude-sonnet-4-5-20250929
  # No working_dir → SDK creates a temp dir automatically (no skills discoverable)
  # No setting_sources → no skills loaded
  permission_mode: bypassPermissions
  allow_dangerously_skip_permissions: true
  append_allowed_tools:
    - Read
    - WebSearch
    - list_books
    - query_discourse_features
    - query_paragraph_breaks
    - query_vocabulary
    - query_morphology
    - query_ot_quotes
    - query_lemmas
    - query_themes_for_lemmas
  max_turns: 40
  max_budget_usd: 2.00
  mcp:
    enabled: true
    servers:
      - name: claude-of-alexandria-mcp
        url: https://coa.davebream.com/mcp
```

> **No temp dir setup needed.** Omitting `working_dir` causes the SDK to create and clean up its own temp dir automatically.

> **Note:** The RED-phase provider still has MCP access — we're testing whether the agent knows HOW to use data correctly, not whether it CAN. The skill teaches methodology; MCP provides data. Without the skill, the agent has data but produces inferior methodology.

**Step 3: Verify providers load**

Run: `cd tests/promptfoo && npx promptfoo eval --dry-run --config skills/exegetical-notes/promptfooconfig.yaml`
Expected: Config loads without errors (actual eval happens in Task 3)

**Step 4: Commit**

```bash
git add tests/promptfoo/providers/
git commit -m "feat(tests): add claude-agent-sdk provider configs for RED and GREEN phases"
```

---

## Task 3: Create shared assertion helpers

**Files:**
- Create: `tests/promptfoo/assertions/tool-calls.js`
- Create: `tests/promptfoo/assertions/theological-guardrails.yaml`

**Step 1: Create reusable tool-call assertion helpers**

```javascript
// tests/promptfoo/assertions/tool-calls.js
//
// SPIKE FINDING: metadata.toolCalls does NOT exist in the Agent SDK provider.
// metadata is undefined. Tool call detection uses num_turns from raw JSON instead.
//
// raw.num_turns > 1 means the agent made at least one tool call (1 turn = response only).
// This is an indirect proxy, not a per-tool check.

/**
 * Did the agent make any tool calls? (num_turns > 1)
 * Usage in promptfoo:
 *   - type: javascript
 *     value: |
 *       const { hadToolCalls } = require('./assertions/tool-calls');
 *       return hadToolCalls(context);
 */
function hadToolCalls(context) {
  const raw = JSON.parse(context.providerResponse?.raw || '{}');
  return (raw.num_turns || 0) > 1;
}

/**
 * Did the agent take at least N turns? (proxy for N-1 tool call rounds)
 */
function hadAtLeastNTurns(n, context) {
  const raw = JSON.parse(context.providerResponse?.raw || '{}');
  return (raw.num_turns || 0) >= n;
}

/**
 * Get the number of turns taken.
 */
function getNumTurns(context) {
  const raw = JSON.parse(context.providerResponse?.raw || '{}');
  return raw.num_turns || 0;
}

/**
 * Get total cost in USD.
 */
function getCostUSD(context) {
  const raw = JSON.parse(context.providerResponse?.raw || '{}');
  return raw.total_cost_usd || 0;
}

module.exports = { hadToolCalls, hadAtLeastNTurns, getNumTurns, getCostUSD };
```

**Step 2: Create shared theological guardrail rubrics**

```yaml
# tests/promptfoo/assertions/theological-guardrails.yaml
# Reusable LLM rubric assertions for theological quality

anti-moralism: |
  Evaluate the output for moralism. FAIL if:
  - Applications say "try harder" or "do better" without grounding in gospel indicatives
  - Imperative statements appear without prior indicative grounding
  - The passage is reduced to moral lessons without redemptive-historical context
  PASS if applications flow from what God has done (indicative) before what we should do (imperative).

christ-centeredness: |
  Evaluate whether the output traces the passage's place in the biblical storyline. FAIL if:
  - The redemptive-historical arc is completely absent
  - The passage is treated as isolated moral instruction
  - Christ's work is never mentioned or implied in the interpretive framework
  PASS if the passage is connected to the broader biblical narrative and redemptive history.

context-primacy: |
  Evaluate whether the output respects literary context. FAIL if:
  - Individual verses are interpreted without reference to the surrounding discourse unit
  - The pericope boundaries are ignored
  - Book-level context is absent
  PASS if interpretation flows from discourse unit → pericope → book context.

genre-governance: |
  Evaluate whether the output handles genre correctly. FAIL if:
  - Narrative is treated as propositional theology
  - Poetry is treated as historical narrative
  - Epistolary argument is reduced to proof-texts
  - No genre identification appears in the analysis
  PASS if genre is identified and methodology matches the text type.

covenantal-awareness: |
  Evaluate whether the output respects covenantal distinctions. FAIL if:
  - OT and NT texts are treated as interchangeable without covenantal context
  - No attention to progressive revelation between testaments
  - Covenant administration differences are flattened (flat biblicism)
  PASS if the analysis attends to covenant context and progressive revelation.
```

**Step 3: Commit**

```bash
git add tests/promptfoo/assertions/
git commit -m "feat(tests): add shared assertion helpers and theological rubrics"
```

---

## Task 4: Migrate exegetical-notes scenarios to promptfoo

This is the pilot migration. Exegetical-notes is the most complex skill (7 scenarios, heavy MCP usage) — if this works, the others will be straightforward.

**Files:**
- Create: `tests/promptfoo/skills/exegetical-notes/promptfooconfig.yaml`

**Step 1: Create the promptfoo config migrating all 7 scenarios**

```yaml
# tests/promptfoo/skills/exegetical-notes/promptfooconfig.yaml
description: "Exegetical Notes skill evaluation"

providers:
  - file://../../providers/claude-agent-sdk.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/claude-agent-sdk.yaml

tests:
  # === Scenario 1: Complete NT Analysis — Phil 1:1-11 ===
  - description: "S1: All 10 sections present and populated (Phil 1:1-11)"
    vars:
      prompt: "Generate exegetical notes for Philippians 1:1-11"
    assert:
      # Structural checks — all 10 sections present
      - type: contains
        value: "Passage in Literary Context"
      - type: contains
        value: "Internal Structure"
      - type: contains
        value: "Propositional Summary"
      - type: contains
        value: "Lexical Analysis"
      - type: contains
        value: "Exegetical Conclusions"
      - type: contains
        value: "Interpretive Guardrails"
      - type: contains
        value: "Open Questions"
      - type: contains
        value: "Intertextual Links"
      - type: contains
        value: "Data Sources"
      - type: contains
        value: "Verification"
      # Tool usage — must use MCP
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_morphology', context);
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_vocabulary', context);
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_discourse_features', context);
      # Quality
      - type: llm-rubric
        value: |
          Section 2 (Internal Structure) must identify discourse-based divisions:
          prescriptio (1:1-2), thanksgiving (1:3-6), grounds (1:7-8), prayer (1:9-11).
          Must use table format with: verses | element | function.

  # === Scenario 2: Lexical Data-Grounding Test ===
  - description: "S2: Morphological claims from MCP tools, not memory"
    vars:
      prompt: "Generate exegetical notes for Philippians 1:1-11"
    assert:
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_morphology', context);
      - type: llm-rubric
        value: |
          CRITICAL DATA-GROUNDING CHECK. Evaluate the Lexical Analysis section.

          PASS if ALL of these are true:
          - ἐναρξάμενος (1:6) is parsed as aorist MIDDLE participle (not active)
          - χαρά frequency includes exact count and verse references (not "appears frequently")
          - Every morphological claim has a [query_morphology] or [query_vocabulary] citation
          - No vague statements like "Philippians is known for its joy vocabulary"

          FAIL if ANY morphological claim lacks a tool citation or uses approximate language.
      - type: not-contains
        value: "appears frequently"
      - type: not-contains
        value: "is known for"

  # === Scenario 3: Tier Labeling Test ===
  - description: "S3: All 4 interpretive tiers present and correctly labeled"
    vars:
      prompt: "Generate exegetical notes for Philippians 1:1-11"
    assert:
      - type: contains-any
        value:
          - "Tier 1"
          - "Tier A"
      - type: contains-any
        value:
          - "Tier 4"
          - "Agent assessment"
      - type: llm-rubric
        value: |
          Section 6 (Interpretive Guardrails) must contain all 4 tiers:
          - Tier 1: Linguistic evidence (morphology-based)
          - Tier 2: Discourse evidence (structure-based)
          - Tier 3: Scholarly consensus (must include web-searched citation with author, title)
          - Tier 4: Agent assessment (clearly labeled as agent's own interpretation)

          FAIL if Tier 3 has no real scholarly citation.
          FAIL if Tier 4 claims are presented as established fact.
          FAIL if any tier is missing.

  # === Scenario 4: Pericope Check Trigger ===
  - description: "S4: Warning issued for problematic pericope (Phil 1:3-8)"
    vars:
      prompt: "Generate exegetical notes for Philippians 1:3-8"
    assert:
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_discourse_features', context)
            || wasToolCalled('query_paragraph_breaks', context);
      - type: llm-rubric
        value: |
          The agent MUST issue a boundary warning before generating full notes.
          Phil 1:3-8 is a partial unit — the prayer (1:9-11) completes the thanksgiving.

          PASS if the output includes a warning about weak boundaries and recommends 1:3-11.
          FAIL if the agent generates full notes for 1:3-8 without any boundary warning.

  # === Scenario 5: OT Analysis — Gen 37:2-11 ===
  - description: "S5: OT morphology and Hebrew-specific handling"
    vars:
      prompt: "Generate exegetical notes for Genesis 37:2-11"
    assert:
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_morphology', context);
      - type: llm-rubric
        value: |
          OT-specific checks for Genesis 37:2-11:
          - Hebrew morphology must be cited (stem/conjugation for verbs, not just glosses)
          - Tier 3 sources must be OT commentaries (not NT commentaries)
          - Acceptable Tier A: Wenham (WBC), Hamilton (NICOT), Sarna, Waltke
          FAIL if NT commentaries are cited for an OT passage.
          FAIL if Hebrew verb forms lack stem identification (Qal, Piel, etc.).

  # === Scenario 6: Verification Integration Test ===
  - description: "S6: MCP cross-check runs on generated output"
    vars:
      prompt: "Generate exegetical notes for Philippians 1:1-11"
    assert:
      - type: contains
        value: "Verification"
      - type: llm-rubric
        value: |
          Section 10 (Verification) must show MCP cross-check results:
          - Number of data claims checked
          - Number confirmed (PASS)
          - Number corrected (if any)
          - Number not cross-checkable (Tier 3 web citations)

          FAIL if Section 10 is missing or does not report cross-check results.
          FAIL if verification is skipped or deferred.

  # === Scenario 7: Source Quality Framework Test ===
  - description: "S7: Tier A sources preferred, citations complete (Rom 3:21-26)"
    vars:
      prompt: "Generate exegetical notes for Romans 3:21-26"
    assert:
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_morphology', context);
      - type: llm-rubric
        value: |
          Evaluate Tier 3 scholarly citations for Romans 3:21-26:
          - MUST prefer Tier A sources: Moo (NICNT), Cranfield (ICC), Schreiner, Dunn, Jewett
          - Citations MUST include: author, title, publisher (not just "scholars agree")
          - FAIL if only Tier D sources appear (devotional websites, uncredited blogs)
          - FAIL if citation format is "According to various commentators..."
          PASS example: "Moo, Douglas. The Letter to the Romans. NICNT. Eerdmans, 1996."
```

**Step 2: Run a single scenario to verify the setup works**

Run: `cd tests/promptfoo && npx promptfoo eval --config skills/exegetical-notes/promptfooconfig.yaml --filter-description "S1:" --no-cache`
Expected: Scenario runs, scores appear, tool calls are visible in output

**Step 3: Run all 7 scenarios**

Run: `cd tests/promptfoo && npx promptfoo eval --config skills/exegetical-notes/promptfooconfig.yaml --no-cache`
Expected: All scenarios execute with pass/fail scores

**Step 4: Commit**

```bash
git add tests/promptfoo/skills/exegetical-notes/
git commit -m "feat(tests): migrate exegetical-notes scenarios to promptfoo"
```

---

## Task 5: Run RED phase for exegetical-notes (validate skill is needed)

This recreates the baseline — proving the agent fails without the skill.

**Step 1: Run all scenarios with the no-skill provider**

Run:
```bash
cd tests/promptfoo && npx promptfoo eval \
  --config skills/exegetical-notes/promptfooconfig.yaml \
  --providers providers/claude-agent-sdk-no-skill.yaml \
  --no-cache
```

Expected: Multiple failures. The agent without the skill should:
- Miss sections (no 10-section structure)
- Use approximate language for morphology ("appears frequently")
- Skip tier labeling
- Not run pericope boundary check
- Skip verification section

**Step 2: Save RED phase results**

Run: `cd tests/promptfoo && npx promptfoo eval --config skills/exegetical-notes/promptfooconfig.yaml --providers providers/claude-agent-sdk-no-skill.yaml --output output/exegetical-notes-red.json --no-cache`

**Step 3: View results**

Run: `cd tests/promptfoo && npx promptfoo view`
Expected: Web UI shows failure scores — this is the automated equivalent of `baseline.md`

**Step 4: Document RED phase outcome in commit message**

```bash
git commit --allow-empty -m "test(exegetical-notes): RED phase — baseline failures confirmed via promptfoo

Scenarios tested without skill loaded.
Expected failures in: data-grounding, tier labeling, pericope check, verification.
Results saved to output/exegetical-notes-red.json (gitignored)."
```

---

## Task 6: Run GREEN phase for exegetical-notes (validate skill fixes failures)

**Step 1: Run all scenarios with the skill provider**

Run:
```bash
cd tests/promptfoo && npx promptfoo eval \
  --config skills/exegetical-notes/promptfooconfig.yaml \
  --no-cache
```

Expected: All or most scenarios pass. The skill should fix every failure observed in Task 5.

**Step 2: Compare RED vs GREEN**

Run: `cd tests/promptfoo && npx promptfoo view`
Expected: Side-by-side comparison showing improvement from RED to GREEN.

**Step 3: If any scenarios fail — this is the REFACTOR phase**

For each failure:
1. Read the failing assertion and actual output
2. Determine if it's a skill problem or an assertion problem
3. If skill problem: note it (skill improvement is separate work)
4. If assertion problem: adjust the assertion to be more precise

**Step 4: Commit final passing config**

```bash
git add tests/promptfoo/skills/exegetical-notes/
git commit -m "test(exegetical-notes): GREEN phase — all scenarios passing with skill"
```

---

## Task 7: REFACTOR phase for exegetical-notes (adversarial testing)

The TDD cycle has three phases. Tasks 5-6 cover RED and GREEN. This task covers REFACTOR — testing whether the skill holds up under adversarial conditions.

**Step 1: Add adversarial test cases to the existing config**

Add scenarios that test rationalization patterns documented in `tests/skills/exegetical-notes/scenarios.md` "Rationalization Patterns to Watch For":

```yaml
  # === REFACTOR: Adversarial scenarios ===
  - description: "R1: Agent must not use memory for morphology even when confident"
    vars:
      prompt: "Generate exegetical notes for Philippians 2:5-11. Note: ἁρπαγμός in 2:6 is a well-known crux. I expect thorough morphological analysis."
    assert:
      - type: javascript
        value: |
          const { wasToolCalled } = require('../../assertions/tool-calls');
          return wasToolCalled('query_morphology', context);
      - type: llm-rubric
        value: |
          The agent MUST call query_morphology for ἁρπαγμός rather than relying on
          training knowledge, even though this is a famous interpretive crux.
          FAIL if morphological claims lack [query_morphology] citations.
          FAIL if the agent says "scholars agree" without a specific Tier 3 citation.

  - description: "R2: Agent must not skip verification under time pressure"
    vars:
      prompt: "I need quick exegetical notes for Philippians 4:4-7. Just the essentials, skip anything optional."
    assert:
      - type: contains
        value: "Verification"
      - type: llm-rubric
        value: |
          Even when asked for "quick" or "essential" notes, the agent MUST include
          Section 10 (Verification) with MCP cross-check results.
          FAIL if verification is skipped or abbreviated.
```

**Step 2: Run REFACTOR scenarios**

Run: `cd tests/promptfoo && npx promptfoo eval --config skills/exegetical-notes/promptfooconfig.yaml --filter-description "R" --no-cache`

**Step 3: If any rationalization succeeds — tighten the skill**

For each failure: the skill needs a counter-measure. Note the finding but do NOT modify the skill in this plan — skill improvement is separate work.

**Step 4: Commit**

```bash
git add tests/promptfoo/skills/exegetical-notes/
git commit -m "test(exegetical-notes): REFACTOR phase — adversarial scenarios added"
```

---

## Task 8: Migrate pericope-delimitation (10 scenarios)

**Files:**
- Create: `tests/promptfoo/skills/pericope-delimitation/promptfooconfig.yaml`

1. Read `tests/skills/pericope-delimitation/scenarios.md` (10 scenarios)
2. Read `plugins/claude-of-alexandria/skills/pericope-delimitation/SKILL.md` for MCP tool dependencies
3. Translate each scenario with: `contains` / `javascript` / `llm-rubric` assertions
4. Run RED phase → verify failures without skill
5. Run GREEN phase → verify passes with skill
6. Commit

```bash
git commit -m "feat(tests): migrate pericope-delimitation scenarios to promptfoo"
```

---

## Task 9: Migrate argument-flow (8 scenarios)

**Files:**
- Create: `tests/promptfoo/skills/argument-flow/promptfooconfig.yaml`

Same pattern as Task 8. 8 scenarios from `tests/skills/argument-flow/scenarios.md`.

```bash
git commit -m "feat(tests): migrate argument-flow scenarios to promptfoo"
```

---

## Task 10: Migrate consult-biblical-scholar (6 scenarios)

**Files:**
- Create: `tests/promptfoo/skills/consult-biblical-scholar/promptfooconfig.yaml`

Same pattern. 6 scenarios from `tests/skills/consult-biblical-scholar/scenarios.md`.

```bash
git commit -m "feat(tests): migrate consult-biblical-scholar scenarios to promptfoo"
```

---

## Task 11: Migrate biblical-segmentation (34 scenarios)

**Files:**
- Create: `tests/promptfoo/skills/biblical-segmentation/promptfooconfig.yaml`

This is the largest skill — 34 scenarios. Consider splitting into logical groups within the config (structural, genre, vocabulary, adversarial).

Same pattern. Read `tests/skills/biblical-segmentation/scenarios.md` for all 34 scenarios.

```bash
git commit -m "feat(tests): migrate biblical-segmentation scenarios to promptfoo"
```

---

## Task 12: Create GitHub Actions workflow for release testing

**Files:**
- Create: `.github/workflows/skill-tests.yml`

**Step 1: Create the workflow**

```yaml
# .github/workflows/skill-tests.yml
name: Skill Tests

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      skill:
        description: 'Specific skill to test (blank = all)'
        required: false
        type: string

jobs:
  test-skills:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: tests/promptfoo

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: tests/promptfoo/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Create empty working directory for RED phase
        run: mkdir -p /tmp/promptfoo-no-skill

      - name: Verify MCP server is reachable
        run: |
          response=$(curl -sf https://coa.davebream.com/health || echo "FAILED")
          if echo "$response" | grep -q '"status":"ok"'; then
            echo "MCP server healthy"
          else
            echo "::error::MCP server is not reachable or unhealthy"
            exit 1
          fi

      - name: Run skill tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          if [ -n "${{ inputs.skill }}" ]; then
            npx promptfoo eval --config "skills/${{ inputs.skill }}/promptfooconfig.yaml" --no-cache
          else
            for config in skills/*/promptfooconfig.yaml; do
              echo "=== Testing: $config ==="
              npx promptfoo eval --config "$config" --no-cache
            done
          fi

      - name: Generate HTML report
        if: always()
        # NOTE: Verify correct command in spike (Task 0). `view` may start a server
        # instead of generating a file. Alternatives: `export` or `generate`.
        run: npx promptfoo export --output report.html || npx promptfoo view --yes --output report.html || true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: skill-test-results
          path: |
            tests/promptfoo/output/
            tests/promptfoo/report.html
          retention-days: 90
```

**Step 2: Verify workflow syntax**

Run: `cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria && gh workflow lint .github/workflows/skill-tests.yml 2>&1 || echo "No lint command — review manually"`

**Step 3: Commit**

```bash
git add .github/workflows/skill-tests.yml
git commit -m "ci: add tag-triggered skill test workflow with promptfoo"
```

---

## Task 13: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plugins/claude-of-alexandria/CLAUDE.md`

**Step 1: Update the testing section in CLAUDE.md**

Replace the "Three Test Files" and "RED-GREEN-REFACTOR Cycle" sections to reflect the new approach. Key changes:

- Three markdown files → one `promptfooconfig.yaml` per skill
- Manual subagent execution → `npx promptfoo eval`
- `baseline.md` / `verification.md` → auto-generated score reports
- `scenarios.md` → migrated into YAML test cases
- RED phase = run with no-skill provider, GREEN phase = run with skill provider
- CI runs on version tags, not every push

**Keep unchanged:**
- TDD philosophy (RED-GREEN-REFACTOR discipline)
- Theological guardrails (encoded as LLM-rubric assertions now)
- "If you cannot demonstrate a failure, the skill is not needed"
- Conventional Commits
- Repository structure (update the `tests/` section)

**Step 2: Update the "Before You Submit Work" checklist**

Replace:
```
- [ ] tests/skills/skill-name/scenarios.md exists
- [ ] tests/skills/skill-name/baseline.md exists
- [ ] tests/skills/skill-name/verification.md exists
```

With:
```
- [ ] tests/promptfoo/skills/skill-name/promptfooconfig.yaml exists with test cases
- [ ] RED phase run confirms failures without skill (npx promptfoo eval --providers no-skill)
- [ ] GREEN phase run confirms passes with skill (npx promptfoo eval)
```

**Step 3: Update repository structure diagram**

Replace the `tests/` section:
```
tests/
├── promptfoo/                    # Automated skill testing
│   ├── providers/                # Agent SDK configs (with/without skill)
│   ├── assertions/               # Shared helpers and rubrics
│   ├── skills/                   # Per-skill test configs
│   │   └── skill-name/
│   │       └── promptfooconfig.yaml
│   ├── package.json
│   └── .gitignore
└── skills/                       # ARCHIVED — legacy markdown tests
    └── skill-name/
        ├── scenarios.md
        ├── baseline.md
        └── verification.md
```

**Step 4: Commit**

```bash
git add CLAUDE.md plugins/claude-of-alexandria/CLAUDE.md
git commit -m "docs: update CLAUDE.md for promptfoo-based skill testing"
```

---

## Task 14: Archive legacy test files

Do NOT delete the old markdown tests. They contain valuable historical evidence and domain knowledge that informed the promptfoo assertions.

**Step 1: Add a note to each legacy directory**

Create `tests/skills/README.md`:

```markdown
# Legacy Test Files (Archived)

These markdown-based test files are the original TDD evidence for each skill.
They have been superseded by automated promptfoo tests in `tests/promptfoo/`.

These files are retained as historical reference — they document the original
failure modes, rationalization patterns, and verification evidence that informed
the automated test assertions.

**Active tests live in:** `tests/promptfoo/skills/`
```

**Step 2: Commit**

```bash
git add tests/skills/README.md
git commit -m "docs: archive legacy markdown test files with explanation"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Spike findings documented (Task 0)
- [ ] `npx promptfoo eval` runs successfully for all 5 skills
- [ ] RED phase (no-skill) shows failures for each skill
- [ ] GREEN phase (with-skill) shows passes for each skill
- [ ] REFACTOR phase adversarial tests pass for pilot skill
- [ ] Tool call assertions verify MCP usage (not just output quality)
- [ ] All 5 theological guardrail rubrics shared across skills
- [ ] GitHub Actions workflow triggers on tags and manual dispatch
- [ ] CI health check verifies MCP server before running tests
- [ ] CLAUDE.md reflects the new testing approach
- [ ] Legacy test files are archived, not deleted
- [ ] No secrets committed (API keys are in GitHub secrets only)
- [ ] `ANTHROPIC_API_KEY` set in GitHub repo secrets

---

## Resolved by Spike (Task 0)

These questions MUST be answered before proceeding past Task 0:

1. **Provider config format:** Do `file://` references work for providers? Fallback: inline configs.
2. **MCP tool naming:** What names does the Agent SDK assign? Update all `append_allowed_tools` and assertion helpers.
3. **Tool call metadata:** Does `context.providerResponse?.metadata?.toolCalls` work in JS assertions?
4. **Report generation:** What command generates a static HTML report?

## Resolve Before CI (Task 12)

5. **`ANTHROPIC_API_KEY` secret:** Must be set in the GitHub repo settings before the workflow can run.
6. **MCP server accessibility:** Verified by health check step, but confirm no IP restrictions from GitHub Actions IPs.

## Design Decisions

7. **LLM-rubric judge model:** Using the same model as both subject and judge creates self-evaluation bias. Consider specifying a cheaper judge via `defaultTest.options.provider` (e.g., `claude-haiku-4-5`). Resolve during pilot (Task 4-6) by comparing judge consistency across 3 runs.
8. **Non-determinism handling:** Agent output varies between runs. Decide whether to use `--repeat 3` with majority-pass threshold, or write assertions tolerant of output variance. Resolve during pilot.
