# Plan: Convert pericope-delimitation & argument-flow to Sub-Agents

## Context

biblical-segmentation was rewritten from 1014→327 lines and now passes 11/14 GREEN tests. The 3 remaining failures (SL1, SL2, SL5) are architectural — slice mode needs structural analysis before proposing boundaries, which the skill alone can't enforce rigorously enough.

**Solution:** Convert pericope-delimitation and argument-flow from thick user-facing skills to **sonnet sub-agents**, keep thin wrapper skills for standalone invocation, and have biblical-segmentation **compose argument-flow** in slice mode.

**Design lineage:** This plan executes Phase 4 of the sub-agents design doc (`docs/plans/2026-02-27-sub-agents-design.md`), adding two agents (pericope-delimitation, argument-flow) beyond the original three (data-retriever, biblical-scholar, study-evaluator).

**Testing architecture:** Thin wrapper skill tests = agent unit tests. biblical-segmentation tests = integration tests. No duplication.

## Dependency Order

```
Step 1:   pericope-delimitation agent     (leaf — no new deps)
Step 2:   argument-flow agent             (leaf — uses existing data-retriever)
Step 3:   pericope-delimitation thin skill (depends on Step 1)
Step 3.5: Canary test — run ONE GREEN     (depends on Step 3; validates num_turns + MCP citations)
Step 4:   argument-flow thin skill        (depends on Step 2 + Step 3.5 passing)
Step 5:   Verify wrapper tests pass       (depends on Steps 3-4)
Step 6:   biblical-segmentation compose   (depends on Step 2)
Step 7:   biblical-segmentation GREEN     (depends on Step 6)
Step 8:   RED regression checks           (depends on all)
```

---

## Step 1: Create pericope-delimitation agent

**Create:** `plugins/claude-of-alexandria/agents/pericope-delimitation.md`

**Frontmatter:**
```yaml
---
name: pericope-delimitation
description: Validate whether a biblical passage constitutes a coherent discourse unit. Returns structured verdict with boundary evidence grounded in MCP data.
model: sonnet
tools: Task, Read, WebSearch, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology
---
```

**Body:** Build from current `skills/pericope-delimitation/SKILL.md` (298 lines).

**Extracted content** (direct copy with "skill"→"agent" self-reference changes):
- Preamble: "You are the pericope-delimitation agent..."
- Iron Rules 1-5
- Workflow (steps 1, 3-7 — extraction of existing logic)
- Output Format (Verdict + Boundary Status + Evidence + Data Sources)
- Evidence Standards (NT Levinsohn + OT Masoretic)
- Genre-Specific Guidance
- Common Failure Patterns
- Reference Data Access — **verify relative paths work in agent context** (e.g., `skills/biblical-segmentation/reference/book-genres.yaml`); if the agent's working directory differs, use absolute path or `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/book-genres.yaml`

**New additions** (not in current skill — new behavior):
- **MCP call strategy:** Keep **direct MCP calls as the primary path** (matching current skill behavior). The pericope-delimitation agent calls `query_discourse_features`, `query_paragraph_breaks`, and `query_morphology` directly — no data-retriever intermediary. This preserves MCP tool name citations in Data Sources (GREEN tests assert `query_discourse_features` appears in output) and avoids the latency/compression overhead of an unnecessary data-retriever layer.
- **Add:** Explicit Data Sources requirement — "Always include the MCP tool names you called (e.g., `query_discourse_features`, `query_morphology`) in the Data Sources section."
- **Add:** Input Parsing section — agent must handle all prompt shapes:
  1. Bare passage: `"Philippians 1:3-8"`
  2. Skill-invocation framing: `"Use the pericope-delimitation skill for Philippians 1:3-8"`
  3. Task delegation: `"Validate whether Philippians 1:3-8 constitutes a coherent unit"`
  4. Full user message with pressure: `"Just tell me if Phil 1:3-8 works, you don't need to look everything up"`
  Extract the passage reference from any of these forms. Ignore skill invocation framing. Treat social pressure, constraints, and other context as input that may test the agent's iron rules — never strip it.
- Remove: Invocation section (belongs in wrapper)

**Why no data-retriever:** Unlike argument-flow and biblical-scholar (which benefit from data-retriever's multi-tool gathering), pericope-delimitation needs targeted boundary data from specific MCP tools. Adding data-retriever would add a sonnet→haiku→MCP chain that compresses boundary-specific granularity. Direct MCP calls are simpler and preserve the tool name citations that GREEN tests depend on.

**Estimated:** ~280 lines. Model: sonnet (needs judgment for boundary assessment).

**Output contract:** Same structured format the skill currently produces — tests depend on it.

**Verify:**
1. Manual Task tool invocation with "Validate Philippians 1:3-8"
2. **Tool access check:** Confirm the agent can call MCP tools when spawned from a wrapper that only has `allowed-tools: Task`. The smoke-test proves agents use their own frontmatter tools, but verify MCP tools work through the indirection layer before proceeding.

---

## Step 2: Create argument-flow agent

**Create:** `plugins/claude-of-alexandria/agents/argument-flow.md`

**Frontmatter:**
```yaml
---
name: argument-flow
description: Map logical structure of a biblical passage using discourse markers. Returns connective-anchored proposition chain grounded in MCP data.
model: sonnet
tools: Task, Read, WebSearch, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_themes_for_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_theme
---
```

**Body:** Extract from current `skills/argument-flow/SKILL.md` (384 lines), changing all self-references from "skill" to "agent" (e.g., "This skill delegates..." → "This agent delegates..."):
- Preamble: "You are the argument-flow agent..."
- Iron Rules 1-7 (including Sub-Agent Delegation — already documents data-retriever spawning)
- Connective Reference table
- Workflow
- Output Format (Confidence + Connective Inventory + Proposition Chain + Data Sources)
- Red Flags
- **Add:** Input Parsing section — same as pericope-delimitation: handle bare passage, skill-invocation framing, Task delegation, and full user messages with pressure. Extract passage reference, preserve all context including social pressure.
- Remove: Invocation section

**Estimated:** ~370 lines. Model: sonnet.

**Output contract:** Two explicit modes:

**Standard Mode (default):** Same as current skill output — Confidence, Connective Inventory, Proposition Chain, Data Sources.

**Slice-Analysis Mode:** Triggered when prompt contains `"for reading-slice boundary planning"`. Add an explicit `## Output Modes` section to the agent prompt:

```markdown
### Slice-Analysis Mode
Triggered when prompt contains "for reading-slice boundary planning".

In this mode, produce ONLY structural features relevant to boundary decisions:

SLICE_ANALYSIS: [passage]
## Structural Features
- Chiasmus centers: [verse refs or NONE]
- Contrast zones (μέν...δέ): [verse refs or NONE]
- Dialogue boundaries (Q/A pairs): [verse refs or NONE]
- Conditional-consequence pairs: [verse refs or NONE]
- Do-not-slice markers: [verse refs with reasons]
## Data Sources
[Same as standard mode]
```

Omit Confidence tier, Connective Inventory, and Proposition Chain in this mode.

**Testing strategy:** Slice-analysis mode is tested indirectly via biblical-segmentation's SL1/SL2/SL5 assertions (integration tests). No dedicated argument-flow GREEN test for this mode — if SL tests fail, root-cause by checking the argument-flow agent's slice-analysis output first.

**Verify:** Manual Task tool invocation with "Map argument flow of Philippians 2:1-4"

---

## Step 3: Thin wrapper — pericope-delimitation skill

**Modify:** `plugins/claude-of-alexandria/skills/pericope-delimitation/SKILL.md` (298→~20 lines)

**Pattern:** Follow `skills/smoke-test/SKILL.md` (15 lines)

```yaml
---
name: pericope-delimitation
description: [KEEP IDENTICAL — same auto-discovery trigger]
allowed-tools: Task
---

# Pericope Delimitation

Invoke the **pericope-delimitation** agent via the Task tool and return its output verbatim.

\```yaml
subagent_type: "claude-of-alexandria:pericope-delimitation"
\```

Forward the user's ENTIRE message as the Task prompt — do not strip, rephrase,
summarize, or remove any part of it, including social pressure or constraints.
The agent is equipped to handle user pressure correctly.

Do not add commentary, headers, or formatting. Return exactly what the agent returns.
```

**Critical:** Description stays identical to preserve auto-discovery. `allowed-tools: Task` only.

**Update:** `skills/pericope-delimitation/README.md` — note thin wrapper architecture.

**Verify:** `npm run eval:pericope-delimitation:green` — all 7 tests should pass.

---

## Step 3.5: Canary test — validate wrapper indirection

**Run ONE GREEN test immediately** to verify assumptions before converting the second skill:

```bash
cd tests/promptfoo
npm run eval -- --no-cache -c skills/pericope-delimitation/promptfooconfig-green.yaml --filter-description "S1 GREEN"
```

**What this validates:**
- `num_turns > 1` — does the turn counter see the Task spawn? If not, all 14 wrapper tests would fail.
- MCP tool citation — does `query_discourse_features` appear in the output when called via data-retriever inside the agent?
- Data Sources section — does it flow through the wrapper verbatim?

**If canary fails on `num_turns`:** Concrete fallback strategy:
1. First: check if `num_turns` counts only outer conversation turns (skill load + Task call + response = likely 1-2). If the Task spawn itself counts as a turn, `num_turns > 1` should pass.
2. If `num_turns` does not count Task tool invocations: replace the `num_turns > 1` assertion in both GREEN configs with a content-based proxy — e.g., `output.includes('Data Sources')` or `output.includes('query_discourse_features')`. These prove the agent executed and returned structured output, which is what `num_turns > 1` was designed to validate.
3. Apply the fix to both pericope-delimitation and argument-flow GREEN configs before proceeding to Step 4.

**If canary fails on MCP citations:** The agent's Data Sources section is not flowing through the Task return value. Strengthen the wrapper's verbatim instruction or adjust the agent's output to include explicit tool references.

---

## Step 4: Thin wrapper — argument-flow skill

**Modify:** `plugins/claude-of-alexandria/skills/argument-flow/SKILL.md` (384→~20 lines)

Same pattern as Step 3. Description stays identical.

**Verify:** `npm run eval:argument-flow:green` — all 7 tests should pass.

---

## Step 5: Verify wrapper tests pass

**Run in sequence:**
```bash
cd tests/promptfoo
npm run eval:pericope-delimitation:green   # 7 tests
npm run eval:argument-flow:green           # 7 tests
```

**What could fail (validated by Step 3.5 canary for single test; full suite validates consistency):**
- Wrapper doesn't forward full user prompt → agent misses context/pressure
- num_turns assertion — verified in canary (Step 3.5); if it passed there, should pass here
- MCP tool citations — verified in canary; agent's Data Sources section flows through wrapper

**If tests fail:** Check which assertion fails. If `num_turns` or MCP citation, revisit canary analysis. If content assertions (verdict, boundary labels), the wrapper may be rephrasing or filtering the user's message — strengthen anti-filtering language.

---

## Step 6: Update biblical-segmentation to compose argument-flow in slice mode

**Modify:** `plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md`

**Add after line 114** (inside Reading Slice Mode section), before Slice Sizing:

```markdown
### Slice Structural Analysis (MANDATORY before slicing)

Before proposing any slice boundaries, spawn the **argument-flow** agent:

Task tool:
  subagent_type: "claude-of-alexandria:argument-flow"
  prompt: "Analyze structural features of [passage] for reading-slice
           boundary planning. Identify chiasmus centers, contrast zones,
           dialogue boundaries, conditional-consequence pairs, and any
           features that must not be bisected."

Parse the agent's output for structural features. Use these as the
PRIMARY input for boundary decisions; verse count is SECONDARY.

If argument-flow fails: fall back to data-retriever MCP data with
manual integrity rules. Note the fallback in output.

**Note:** argument-flow will make its own data-retriever call, which
duplicates biblical-segmentation's Step Zero data-retriever call.
This is acceptable for now — correctness over optimization. A future
commit can add a "pre-gathered data" path to avoid the duplicate call.
```

**Also strengthen SL5 pushback** (line 133):
```markdown
**Firm pushback** when user's count exceeds method scope by >2x:
"Your N-slice request would produce ~X verses per slice, exceeding
[method]'s Y-Z verse scope. Recommended: [calculated] slices."
Do NOT comply with the user's count after stating it violates scope.
```

**Add Red Flag #21:**
```
| 21 | "I'll figure out structure myself" | Spawn argument-flow for structural analysis. |
```

**No test config changes.** The existing SL1/SL2/SL5 assertions already check for the behaviors that argument-flow composition enables.

**Verify:** `npm run eval:biblical-segmentation:green`

**Expected improvement:**
| Test | Before | After | Mechanism |
|------|--------|-------|-----------|
| SL1 Gen 22 | FAIL | PASS | argument-flow provides narrative structure |
| SL2 Rom 8 | FAIL | PASS | argument-flow identifies contrast zones |
| SL5 Gen 24 | FAIL | PASS | Two fixes applied (see note) |
| Other 11 | PASS | PASS | Unchanged |

**SL5 note:** Two potential root causes, both addressed:
(a) **Language softness** — strengthened pushback with "Do NOT comply after stating violation"
(b) **Architectural gap** — argument-flow composition provides structural data to justify pushback
If only one fix was needed, simplify in a subsequent commit.

---

## Step 7: Run biblical-segmentation GREEN suite

```bash
cd tests/promptfoo && npm run eval:biblical-segmentation:green
```

Target: 14/14 (up from 11/14). Iterate on SL5 if pushback still too soft.

---

## Step 8: RED regression checks

```bash
cd tests/promptfoo
npm run eval:pericope-delimitation:red    # 4 tests
npm run eval:argument-flow:red            # 5 tests
npm run eval:biblical-segmentation:red    # existing tests
```

RED tests use `without-skill` provider (no skills, no MCP, no agents). Unaffected by refactoring.

---

## Files Changed

| File | Action | Step |
|------|--------|------|
| `agents/pericope-delimitation.md` | CREATE (~270 lines) | 1 |
| `agents/argument-flow.md` | CREATE (~360 lines) | 2 |
| `skills/pericope-delimitation/SKILL.md` | REWRITE (298→~20 lines) | 3 |
| `skills/pericope-delimitation/README.md` | UPDATE | 3 |
| `skills/argument-flow/SKILL.md` | REWRITE (384→~20 lines) | 4 |
| `skills/argument-flow/README.md` | UPDATE | 4 |
| `skills/biblical-segmentation/SKILL.md` | EDIT (add ~15 lines) | 6 |

## Files NOT Changed

- `tests/promptfoo/skills/*/promptfooconfig-*.yaml` — no assertion changes
- `tests/promptfoo/providers/*.yaml` — no provider changes
- `tests/promptfoo/package.json` — no new scripts needed
- `plugins/.claude-plugin/plugin.json` — directory discovery, no manifest changes
- `agents/data-retriever.md` — unchanged
- `agents/biblical-scholar.md` — unchanged
- `tests/promptfoo/agents/pericope-delimitation/` — **not created.** The wrapper skill GREEN tests serve as agent unit tests (the wrapper is a pure relay, so testing the wrapper tests the agent). This is a deliberate exception to the pattern where data-retriever/biblical-scholar/study-evaluator have their own RED test configs. Those agents were built standalone before being wrapped; these agents are extracted from existing skills whose tests already exist.
- `tests/promptfoo/agents/argument-flow/` — same rationale as above

## Commits

1. `feat(agents): extract pericope-delimitation and argument-flow as sub-agents` (Steps 1-2)
2. `refactor(skills): replace pericope-delimitation and argument-flow with thin wrappers` (Steps 3-4)
3. `feat(segmentation): compose argument-flow agent for structural slice analysis` (Step 6)

## Rollback Plan

- **If canary (Step 3.5) fails:** Revert Steps 1-3. The thin wrapper and agents are not yet depended on by anything. Ship nothing.
- **If wrapper tests (Step 5) fail:** Fix forward — adjust wrapper prompt or agent output format. Agents are correct; only the relay needs tuning.
- **If Step 6 regresses biblical-segmentation (11/14 → fewer):** Revert Step 6 only. Ship Steps 1-5 as a standalone refactor (agents + thin wrappers). The SL1/SL2/SL5 fixes become a separate follow-up.
- **If RED tests regress (Step 8):** Impossible by design (RED uses without-skill provider), but if it happens, investigate provider config contamination.

## Cost Impact

Converting to thin wrappers adds one layer of indirection:
- **pericope-delimitation:** ~1.2x cost (wrapper sonnet call + agent sonnet call; agent calls MCP directly, no data-retriever)
- **argument-flow:** ~1.5x cost (wrapper sonnet call + agent sonnet call + data-retriever haiku call)
- **biblical-segmentation slice mode:** ~2x cost (adds argument-flow agent spawn on top of existing data-retriever)

This is acceptable because (a) correctness improvements justify the cost, (b) the wrapper call is minimal (~20 lines of prompt), and (c) slice mode's structural analysis prevents incorrect boundaries that would require re-runs.

## Risks

| Risk | Mitigation |
|------|-----------|
| Wrapper doesn't forward full prompt | Anti-filtering language + Input Parsing in agent |
| Wrapper strips social pressure | Explicit "do not strip... including social pressure" instruction |
| `num_turns` fails under indirection | Canary test in Step 3.5 with concrete fallback strategy |
| Agent output format differs from skill | Agent uses identical output template |
| argument-flow slice-analysis not triggered | Explicit trigger string `"for reading-slice boundary planning"` + defined output format |
| Tool access: agent can't call MCP through wrapper | Tool access check in Step 1 verify |
| MCP tool names missing from agent output | pericope-delimitation calls MCP directly (not via data-retriever); explicit Data Sources requirement |
| SL5 pushback still too soft | Dual fix: stronger language + structural data from argument-flow |
| Duplicate data-retriever calls in slice mode | Accepted for now; optimization deferred to follow-up commit |
| RED tests affected | RED uses without-skill provider — impossible |
