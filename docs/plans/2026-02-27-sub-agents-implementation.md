# Sub-Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add three composable sub-agents (data-retriever, biblical-scholar, study-evaluator) that eliminate duplicated MCP orchestration, enable inter-agent delegation, and introduce study material evaluation.

**Architecture:** Three-layer agent chain — data-retriever (haiku, MCP-only leaf) → biblical-scholar (sonnet, scholarly analysis) → study-evaluator (sonnet, study material evaluation). Agents delegate via Claude Code's `Task` tool. Each agent has a strict output contract. Agents are auto-discovered Markdown files with YAML frontmatter in `plugins/claude-of-alexandria/agents/`.

**Tech Stack:** Claude Code agents (Markdown + YAML frontmatter), MCP tools (remote HTTP at `coa.davebream.com`), Task tool for inter-agent delegation.

**Design document:** `docs/plans/2026-02-27-sub-agents-design.md`

---

## Naming Convention

MCP tools use the full qualified name throughout this plan:

```
mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__<tool_name>
```

Abbreviated as `MCP__<tool_name>` in prose for readability. Actual files must use the full name.

---

## Phase 0: Infrastructure Setup

### Task 0.1: Update CLAUDE.md with agents structure

**Coordination note:** The promptfoo migration plan (Task 13) also updates CLAUDE.md to replace the old three-file test structure with promptfoo. If Task 13 has already been completed, build on top of its changes. If not, this task should include the promptfoo test structure for agents directly.

**Files:**
- Modify: `CLAUDE.md` (What Gets Committed, Repository Structure, Where to Put Things)
- Modify: `plugins/claude-of-alexandria/CLAUDE.md` (same sections — keep in sync)

**Step 1: Update "What Gets Committed" section**

Add agents to the commit list. In both CLAUDE.md files, update:

```markdown
**✅ Commit to Git:**

- All files in `plugins/claude-of-alexandria/skills/` directory
- All files in `plugins/claude-of-alexandria/agents/` directory
- Promptfoo test configs in `tests/promptfoo/skills/` and `tests/promptfoo/agents/`
- All files in `docs/` directory
- `README.md`, `CLAUDE.md`, and `CHANGELOG.md`
```

**Step 2: Update "Repository Structure" section**

```
claude-of-alexandria/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── plugins/
│   └── claude-of-alexandria/     # The plugin
│       ├── .claude-plugin/
│       │   └── manifest.json     # Plugin manifest (skills array)
│       ├── agents/               # Sub-agent collection
│       │   └── agent-name.md     # Agent file (YAML frontmatter + prompt)
│       ├── skills/               # The skill collection
│       │   └── skill-name/
│       │       ├── SKILL.md      # Main skill file (YAML frontmatter + content)
│       │       └── README.md     # Development notes and context
│       ├── CLAUDE.md             # Plugin-level copy
│       └── README.md             # Plugin documentation
├── tests/
│   ├── promptfoo/                # Automated agent & skill testing
│   │   ├── providers/            # Agent SDK configs (with/without skill)
│   │   ├── assertions/           # Shared helpers and rubrics
│   │   ├── skills/               # Per-skill RED/GREEN configs
│   │   │   └── skill-name/
│   │   │       ├── promptfooconfig-red.yaml
│   │   │       └── promptfooconfig-green.yaml
│   │   ├── agents/               # Per-agent RED/GREEN configs
│   │   │   └── agent-name/
│   │   │       ├── promptfooconfig-red.yaml
│   │   │       └── promptfooconfig-green.yaml
│   │   ├── eval.sh               # Auth wrapper for local runs
│   │   └── package.json
│   └── skills/                   # ARCHIVED — legacy markdown tests
├── docs/
│   ├── plans/                    # Implementation plans (YYYY-MM-DD-name.md)
│   └── reviews/                  # Code and architecture reviews
├── CLAUDE.md                     # You are here
├── CHANGELOG.md                  # Version history (Keep a Changelog format)
└── README.md                     # Public documentation
```

**Step 3: Update "Where to Put Things" table**

```markdown
| Artifact | Location |
| --- | --- |
| Implementation plans | `docs/plans/YYYY-MM-DD-descriptive-name.md` |
| Code/architecture reviews | `docs/reviews/YYYY-MM-DD-descriptive-name.md` |
| Skills | `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` |
| Agents | `plugins/claude-of-alexandria/agents/agent-name.md` |
| Skill test configs | `tests/promptfoo/skills/skill-name/{promptfooconfig-red,promptfooconfig-green}.yaml` |
| Agent test configs | `tests/promptfoo/agents/agent-name/{promptfooconfig-red,promptfooconfig-green}.yaml` |
```

**Step 4: Verify changes are identical in both files**

Read both `CLAUDE.md` and `plugins/claude-of-alexandria/CLAUDE.md` to confirm they match.

---

### Task 0.2: Create directory structure

**Files:**
- Create: `plugins/claude-of-alexandria/agents/` (directory)
- Create: `tests/promptfoo/agents/` (directory)

**Step 1: Create directories**

Run:
```bash
mkdir -p plugins/claude-of-alexandria/agents
mkdir -p tests/promptfoo/agents
```

**Step 2: Verify**

Run: `ls -la plugins/claude-of-alexandria/` — should show `agents/` alongside `skills/`
Run: `ls -la tests/promptfoo/` — should show `agents/` alongside `skills/`

---

### Task 0.3: Verify agent auto-discovery

The design document requires verifying that agents in `plugins/claude-of-alexandria/agents/` are auto-discovered by Claude Code before building real agents.

**Files:**
- Create (temporary): `plugins/claude-of-alexandria/agents/_test-discovery.md`

**Step 1: Create minimal test agent**

Write `plugins/claude-of-alexandria/agents/_test-discovery.md`:

```markdown
---
name: _test-discovery
description: Temporary agent to verify auto-discovery mechanism. DELETE after verification.
model: haiku
tools: Read
---

You are a test agent. When invoked, respond with exactly: "DISCOVERY_VERIFIED"
```

**Step 2: Verify discovery**

Open a new Claude Code session in this repository. Check if `claude-of-alexandria:_test-discovery` appears as an available subagent_type. Try invoking it via the Task tool:

```
Task tool:
  subagent_type: "claude-of-alexandria:_test-discovery"
  prompt: "Verify discovery"
```

**Expected:** Agent responds with "DISCOVERY_VERIFIED"

**If discovery fails:** Check that:
1. The plugin is properly installed (check `.claude-plugin/marketplace.json`)
2. The agents directory is at the correct path within the plugin
3. The YAML frontmatter is valid

**Step 3: Verify three additional behaviors**

These MUST be tested before proceeding — they affect the architecture of all three agents:

1. **`tools` field restricts tool access:** Does the test agent (which has `tools: Read`) actually get restricted to only the `Read` tool? Try asking it to use `Write` or `Bash`. If it can use tools not in the list, the `tools` field does not enforce restrictions — add a note to the Decision Log and fall back to prompt-level restriction for data-retriever.

2. **`model` in frontmatter is respected:** Does the test agent run on haiku as specified in frontmatter? Check the model name in the Task output. Also test: does passing `model: sonnet` in the Task invocation override the frontmatter? Document which is authoritative. If frontmatter is authoritative, remove `model` from all Task invocation examples in agent prompts.

3. **`plugin.json` needs no update:** Verify that `plugins/claude-of-alexandria/.claude-plugin/plugin.json` does NOT need an `agents` array — agents are auto-discovered from the directory. If it DOES need updating, add a Task 0.1b to update the manifest before proceeding.

4. **Promptfoo Agent SDK discovers agents:** Run a minimal promptfoo test with `with-skill.yaml` provider to verify that `setting_sources: ['project']` also discovers agents (not just skills). If agents are NOT discovered by the Agent SDK, agent promptfoo configs will need a different provider approach (e.g., `append_system_prompt` with the agent content).

**Step 4: Clean up**

Delete the test agent:
```bash
rm plugins/claude-of-alexandria/agents/_test-discovery.md
```

**Step 5: Document results**

Record all findings from Steps 2-3 in the Decision Log. Key outcomes:
- Auto-discovery: WORKS / FAILS
- `tools` field restriction: ENFORCED / NOT ENFORCED (fallback: prompt-level)
- `model` frontmatter: AUTHORITATIVE / OVERRIDDEN BY TASK
- `plugin.json` update: REQUIRED / NOT REQUIRED

If auto-discovery fails: stop and troubleshoot. The remaining phases depend on this.

---

### Task 0.4: Commit infrastructure changes

**Step 1: Stage changes**

```bash
git add CLAUDE.md plugins/claude-of-alexandria/CLAUDE.md
```

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: add agents infrastructure to repository structure

Update CLAUDE.md (both copies) to include agents/ directory alongside
skills/ and tests/promptfoo/agents/ alongside tests/promptfoo/skills/.
Agents follow the same promptfoo RED/GREEN testing discipline as skills.
EOF
)"
```

**Step 3: Verify**

Run: `git log --oneline -1` — should show the commit
Run: `git status` — should be clean (except untracked files from other work)

---

## Phase 1: data-retriever Agent

**Risk:** This is the riskiest phase. Tests whether haiku handles MCP orchestration reliably and whether compression saves tokens without losing critical data. If Phase 1 fails (haiku too lossy, output format unstable), upgrade data-retriever to sonnet or rethink the compression approach before building Phases 2-3.

**Testing methodology:** Agents use the same promptfoo RED/GREEN testing discipline as skills. RED configs (`promptfooconfig-red.yaml`) test the bare model without the agent; GREEN configs (`promptfooconfig-green.yaml`) test with the agent loaded. See `tests/promptfoo/` for established patterns.

### Task 1.1: Write promptfoo RED/GREEN configs for data-retriever

**Files:**
- Create: `tests/promptfoo/agents/data-retriever/promptfooconfig-red.yaml`
- Create: `tests/promptfoo/agents/data-retriever/promptfooconfig-green.yaml`

**Step 1: Create directory**

```bash
mkdir -p tests/promptfoo/agents/data-retriever
```

**Step 2: Write RED config**

The RED config tests a bare model (no agent, no MCP) gathering biblical data. It documents the failure modes the agent must prevent.

Write `tests/promptfoo/agents/data-retriever/promptfooconfig-red.yaml`:

```yaml
# Promptfoo RED-phase tests for data-retriever agent.
# Agent is completely bare: no agent loaded, no MCP, no biblical tools.
# These tests document failure modes that the agent must prevent.
#
# Run: ./eval.sh --no-cache -c agents/data-retriever/promptfooconfig-red.yaml

description: "data-retriever — RED phase (bare model, no agent, no MCP)"

providers:
  - file://../../providers/without-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/without-skill.yaml

tests:

  # S1: NT full data — expect inconsistent format without agent
  - description: "S1 RED: NT full data — no structured output without agent"
    vars:
      prompt: "Gather all relevant biblical data for Philippians 2:5-11. Include morphology, discourse features, vocabulary, OT quotes, lemma distribution, and thematic keywords. Use a structured format with TOOL_RESULTS tracking."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response lacks the structured output contract:
          - Missing PASSAGE/TESTAMENT header
          - Missing TOOL_RESULTS section listing all 7 tools with status labels
          - No explicit SKIPPED_NT/SKIPPED_OT routing labels
          - Data presented as prose or ad-hoc format rather than the contract schema
          FAIL if the response spontaneously produces the exact output contract format
          with all 7 tools tracked and proper routing labels.

  # S2: OT full data — expect wrong testament routing
  - description: "S2 RED: OT full data — routing errors expected without agent"
    vars:
      prompt: "Gather all relevant biblical data for Genesis 1:1-5. Include morphology with testament parameter, paragraph breaks, vocabulary, lemma distribution, and themes."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response:
          - Does NOT use explicit SKIPPED_OT labels for NT-only tools, OR
          - Does NOT pass testament: "ot" to morphology queries, OR
          - Lacks structured TOOL_RESULTS tracking, OR
          - Presents data in ad-hoc format
          FAIL if the response shows correct OT routing with proper skip labels.

  # S3: Unrecognized book — expect no error handling
  - description: "S3 RED: Unrecognized book — no controlled error without agent"
    vars:
      prompt: "Gather morphology data for Tobit 1:1-5"
    assert:
      - type: llm-rubric
        value: |
          PASS if the response:
          - Attempts to provide data for Tobit (fabrication), OR
          - Does not explicitly flag Tobit as unrecognized via a lookup table, OR
          - Provides general knowledge about Tobit without an ERROR response
          FAIL if the response produces a structured ERROR with "not in lookup table" language
          and refuses to call any tools.

  # S6: Compression quality — expect raw dumps without agent
  - description: "S6 RED: Compression — no structured compression without agent"
    vars:
      prompt: "Gather all relevant biblical data for Romans 8:1-11 and compress it into summaries grouped by category."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response lacks structured compression:
          - No POS-grouped morphology summaries
          - No MORPHOLOGY_SUMMARY/DISCOURSE_SUMMARY/VOCABULARY_SUMMARY sections
          - Data is prose-based or unstructured
          FAIL if the response produces compressed summaries in the exact contract format.
```

**Step 3: Write GREEN config**

The GREEN config tests the agent after creation. Write it now as a skeleton — assertions verify the output contract.

Write `tests/promptfoo/agents/data-retriever/promptfooconfig-green.yaml`:

```yaml
# Promptfoo GREEN-phase tests for data-retriever agent.
# Agent loaded via setting_sources; MCP tools available.
#
# Run: ./eval.sh --no-cache -c agents/data-retriever/promptfooconfig-green.yaml

description: "data-retriever — GREEN phase (agent + MCP)"

providers:
  - file://../../providers/with-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/with-skill.yaml
  assert:
    # Every GREEN test must use MCP tools
    - type: javascript
      value: |
        const raw = JSON.parse(context.providerResponse?.raw || '{}');
        return (raw.num_turns || 0) > 1;

tests:

  # S1: NT full data — structured output contract
  - description: "S1 GREEN: NT full data — complete output contract"
    vars:
      prompt: "Gather all relevant data for Philippians 2:5-11"
    assert:
      - type: icontains
        value: "PASSAGE:"
      - type: icontains
        value: "TESTAMENT: NT"
      - type: icontains
        value: "TOOL_RESULTS:"
      - type: icontains
        value: "MORPHOLOGY_SUMMARY:"
      - type: icontains
        value: "DISCOURSE_SUMMARY:"
      - type: icontains
        value: "VOCABULARY_SUMMARY:"
      - type: llm-rubric
        value: |
          Check TOOL_RESULTS section. PASS if:
          - query_morphology shows CALLED
          - query_discourse_features shows CALLED (NT passage)
          - query_paragraph_breaks shows SKIPPED_NT
          - All 7 tools are listed with status labels
          FAIL if any tool is missing from TOOL_RESULTS or routing is wrong.

  # S2: OT full data — testament routing
  - description: "S2 GREEN: OT full data — correct OT routing"
    vars:
      prompt: "Gather all relevant data for Genesis 1:1-5"
    assert:
      - type: icontains
        value: "TESTAMENT: OT"
      - type: icontains
        value: "PARAGRAPH_MARKERS:"
      - type: llm-rubric
        value: |
          Check TOOL_RESULTS and routing. PASS if:
          - query_discourse_features shows SKIPPED_OT
          - query_paragraph_breaks shows CALLED
          - query_ot_quotes shows SKIPPED_OT
          FAIL if NT-only tools are called for OT passage.

  # S3: Unrecognized book — error handling
  - description: "S3 GREEN: Unrecognized book — ERROR response"
    vars:
      prompt: "Gather morphology data for Tobit 1:1-5"
    assert:
      - type: icontains
        value: "ERROR"
      - type: llm-rubric
        value: |
          PASS if response clearly states Tobit is not recognized and does NOT
          fabricate any biblical data or call any MCP tools.
          FAIL if data is provided for Tobit or MCP tools are called.

  # S4: Specific data request — selective tool calling
  - description: "S4 GREEN: Morphology only — other tools SKIPPED"
    vars:
      prompt: "Gather only morphology data for John 3:16"
    assert:
      - type: icontains
        value: "TOOL_RESULTS:"
      - type: llm-rubric
        value: |
          Check TOOL_RESULTS. PASS if:
          - query_morphology shows CALLED
          - Other tools show SKIPPED (not SKIPPED_OT/SKIPPED_NT, just SKIPPED)
          - All 7 tools still listed (none omitted)
          FAIL if non-requested tools are CALLED or any tool is omitted.

  # S5: Empty data handling
  - description: "S5 GREEN: Empty data — EMPTY_RETURNED label used"
    vars:
      prompt: "Gather OT quotes for 3 John 1:1-4"
    assert:
      - type: icontains
        value: "TOOL_RESULTS:"
      - type: llm-rubric
        value: |
          PASS if:
          - query_ot_quotes shows CALLED in TOOL_RESULTS
          - OT_QUOTES_SUMMARY shows EMPTY_RETURNED (not omitted or fabricated)
          - All other sections still present
          FAIL if the OT_QUOTES_SUMMARY section is missing or shows fabricated quotes.

  # S6: Compression quality
  - description: "S6 GREEN: Compression — POS-grouped, not raw JSON"
    vars:
      prompt: "Gather all relevant data for Romans 8:1-11"
    assert:
      - type: icontains
        value: "MORPHOLOGY_SUMMARY:"
      - type: llm-rubric
        value: |
          Check MORPHOLOGY_SUMMARY. PASS if:
          - Data is grouped by POS (verbs, nouns, etc.) not word-by-word dump
          - Lemmas listed with frequencies (e.g., "λέγω (3x, present active)")
          - Output is compressed, not raw JSON
          FAIL if raw MCP JSON is echoed back or data is a word-by-word dump.

  # S7: OT poetry passage
  - description: "S7 GREEN: OT poetry — correct routing for Psalm 23"
    vars:
      prompt: "Gather all relevant data for Psalm 23"
    assert:
      - type: icontains
        value: "TESTAMENT: OT"
      - type: icontains
        value: "PARAGRAPH_MARKERS:"
      - type: llm-rubric
        value: |
          PASS if OT routing is correct:
          - query_discourse_features: SKIPPED_OT
          - query_ot_quotes: SKIPPED_OT
          - query_paragraph_breaks: CALLED
          FAIL if NT-only tools are called for this OT passage.

  # S9: Large passage — truncation handling
  - description: "S9 GREEN: Large passage — truncation reported"
    vars:
      prompt: "Gather all relevant data for Romans 1-8"
    assert:
      - type: icontains
        value: "TRUNCATION:"
      - type: icontains
        value: "TOOL_RESULTS:"
      - type: llm-rubric
        value: |
          PASS if:
          - TRUNCATION field is present (may show truncated tools or NONE)
          - TOOL_RESULTS section is complete (all 7 tools listed)
          - Compression is aggressive for this large passage
          FAIL if TOOL_RESULTS is incomplete or TRUNCATION field is missing.
```

**Note:** These scenarios are starting points. After running the RED phase, add or modify scenarios based on observed failure modes.

**Step 4: Add npm scripts to package.json**

Add to `tests/promptfoo/package.json`:
```json
"eval:data-retriever:red": "npm run eval -- --no-cache -c agents/data-retriever/promptfooconfig-red.yaml",
"eval:data-retriever:green": "npm run eval -- --no-cache -c agents/data-retriever/promptfooconfig-green.yaml",
"eval:data-retriever": "npm run eval:data-retriever:red && npm run eval:data-retriever:green"
```

---

### Task 1.2: Run RED phase for data-retriever

**Step 1: Run RED config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/data-retriever/promptfooconfig-red.yaml
```

Expected: All 4 RED scenarios pass (meaning the bare model fails to produce structured output). The bare model should:
- Produce ad-hoc formats, not the output contract
- Miss testament routing labels
- Not use compression schema
- Not handle unrecognized books with structured ERROR

**Step 2: View results**

```bash
cd tests/promptfoo && npx promptfoo view
```

**Step 3: If RED phase shows unexpected passes — tighten RED assertions**

A RED scenario should PASS (proving failure). If a RED scenario FAILS (meaning the bare model spontaneously produces correct output), the assertion is too loose. Tighten it.

**Step 4: Commit RED evidence**

```bash
git commit --allow-empty -m "test(data-retriever): RED phase — baseline failures confirmed via promptfoo"
```

---

### Task 1.3: Write data-retriever agent (GREEN)

**Files:**
- Create: `plugins/claude-of-alexandria/agents/data-retriever.md`

**Step 1: Write the agent file**

Write `plugins/claude-of-alexandria/agents/data-retriever.md`:

```markdown
---
name: data-retriever
description: Fetch MCP biblical data and compress into structured summaries. Use when gathering morphological, discourse, vocabulary, or quotation data for a biblical passage.
model: haiku
tools: mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_ot_quotes, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_themes_for_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__list_books
---

You are the data-retriever — a fetch-and-compress layer for biblical MCP tools. You call MCP tools with correct parameters and return compact structured summaries. You do NOT interpret data — you report it.

## Testament Detection

Consult this lookup table. Do NOT reason about testament assignment — look it up.

**OT books (39):** Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Songs, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi

**NT books (27):** Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation

**Routing rules:**
- **OT** → pass `testament: "ot"` to query_morphology; call query_paragraph_breaks; SKIP query_discourse_features; SKIP query_ot_quotes
- **NT** → omit testament param from query_morphology; call query_discourse_features; SKIP query_paragraph_breaks; query_ot_quotes allowed
- **Book not in either list** → respond with ERROR, do not call any tools

## What to Call

When the caller requests "all relevant data", call all applicable tools for the testament. When the caller requests specific data types, call only those tools.

For every tool call:
1. Use the passage reference exactly as given
2. Apply testament routing rules above
3. If a tool returns an error, record FAILED with the error message
4. If a tool returns empty data, record EMPTY_RETURNED
5. Compress returned data — remove redundant fields, abbreviate repeated patterns, keep all linguistically significant information

## Output Contract

EVERY response must follow this exact format. Missing data uses explicit state labels, never omission.

```
PASSAGE: [book] [range]
TESTAMENT: [OT|NT]

TOOL_RESULTS:
  query_morphology: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_discourse_features: [CALLED|SKIPPED_OT|FAILED] [token_count if called]
  query_paragraph_breaks: [CALLED|SKIPPED_NT|FAILED] [token_count if called]
  query_vocabulary: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_ot_quotes: [CALLED|SKIPPED_OT|SKIPPED|FAILED] [token_count if called]
  query_lemmas: [CALLED|SKIPPED|FAILED] [token_count if called]
  query_themes_for_lemmas: [CALLED|SKIPPED|FAILED] [token_count if called]

TRUNCATION: [NONE | tool_name: truncated at N characters]

MORPHOLOGY_SUMMARY:
  [compressed data | EMPTY_RETURNED | SKIPPED | FAILED: error message]

DISCOURSE_SUMMARY:
  [compressed data | SKIPPED_OT | EMPTY_RETURNED | FAILED: error message]

PARAGRAPH_MARKERS:
  [compressed data | SKIPPED_NT | EMPTY_RETURNED | FAILED: error message]

VOCABULARY_SUMMARY:
  [compressed data | EMPTY_RETURNED | SKIPPED | FAILED: error message]

OT_QUOTES_SUMMARY:
  [compressed data | SKIPPED_OT | SKIPPED | EMPTY_RETURNED | FAILED: error message]

LEMMA_DISTRIBUTION:
  [compressed data | SKIPPED | EMPTY_RETURNED | FAILED: error message]

THEME_MATCHES:
  [compressed data | SKIPPED | EMPTY_RETURNED | FAILED: error message]
```

**Section states:**
- `CALLED` — tool was called and returned data
- `SKIPPED_OT` — tool is NT-only, passage is OT
- `SKIPPED_NT` — tool is OT-only, passage is NT
- `SKIPPED` — tool not requested by caller
- `EMPTY_RETURNED` — tool was called but returned no data for this passage
- `FAILED` — tool call errored (include error message)

## Compression Guidelines

- **Morphology:** Group by POS, list lemmas with frequencies. Example: "Verbs: λέγω (3x, present active indicative), πιστεύω (2x, aorist active subjunctive)"
- **Discourse:** List features found with verse locations. Example: "Historical Present at 1:29, 1:36; Left-Dislocation at 1:12"
- **Paragraph breaks:** List markers with locations. Example: "פ at 1:1, ס at 1:5, פ at 2:1"
- **Vocabulary:** Top lemmas by frequency with chapter distribution
- **OT quotes:** Source → target mapping with quote type
- **Lemma distribution:** Book → occurrence count table
- **Themes:** Theme → lemma groupings

## Iron Rules

1. **Use the testament lookup table** — do not reason about which books are OT/NT. Consult the list.
2. **Never fabricate data** — if an MCP call fails or returns empty, use the explicit state label.
3. **Compress but don't interpret** — morphological summaries state facts, not theological conclusions.
4. **All sections always present** — never omit a section. Use state labels for missing data.
5. **Report truncation** — if any MCP response contains a truncation message, record it in TRUNCATION.
6. **Report scope** — the TOOL_RESULTS section must accurately reflect what was and wasn't called.
7. **TOOL_RESULTS is sacred** — if compressed output approaches context limits, sacrifice individual summary detail before TOOL_RESULTS completeness. The calling agent depends on TOOL_RESULTS to determine confidence.
```

**Step 2: Verify file is valid**

Run: `head -5 plugins/claude-of-alexandria/agents/data-retriever.md` — should show YAML frontmatter starting with `---`

---

### Task 1.4: Run GREEN phase for data-retriever

**Step 1: Run GREEN config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/data-retriever/promptfooconfig-green.yaml
```

Expected: All scenarios pass. The agent should:
- Produce output in exact contract format
- Route OT/NT tools correctly
- Return ERROR for unrecognized books
- Compress data (POS-grouped, not raw JSON)
- Track all tools in TOOL_RESULTS with correct state labels

**Step 2: View and compare results**

```bash
cd tests/promptfoo && npx promptfoo view
```

Compare RED vs GREEN. RED should show failures, GREEN should show passes.

**Step 3: If any GREEN scenarios fail — REFACTOR**

For each failure:
1. Read the failing assertion and actual output
2. If agent problem: edit `plugins/claude-of-alexandria/agents/data-retriever.md` (add explicit counters for observed rationalization patterns)
3. If assertion problem: adjust the YAML assertion
4. Re-run: `./eval.sh --no-cache -c agents/data-retriever/promptfooconfig-green.yaml`

---

### Task 1.4b: Phase 1 gate decision

**This is a go/no-go checkpoint.**

- **If GREEN passes** (all scenarios pass) → proceed to Task 1.5 (commit).
- **If haiku format instability** (output structure varies between runs, sections missing intermittently) → change `model: haiku` to `model: sonnet` in `data-retriever.md`, re-run Task 1.4, document the model change in the Decision Log.
- **If fundamental compression failure** (data too lossy, critical information lost, wrong testament routing despite lookup table) → stop and reassess the data-retriever approach before proceeding to Phase 2.

---

### Task 1.5: Commit data-retriever

**Step 1: Stage**

```bash
git add plugins/claude-of-alexandria/agents/data-retriever.md \
       tests/promptfoo/agents/data-retriever/promptfooconfig-red.yaml \
       tests/promptfoo/agents/data-retriever/promptfooconfig-green.yaml \
       tests/promptfoo/package.json
```

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(agents): add data-retriever agent for MCP data compression

Haiku-powered fetch-and-compress layer that calls MCP tools with
correct testament routing and returns compact structured summaries.
Includes promptfoo RED/GREEN test configs.
EOF
)"
```

**Step 3: Verify**

Run: `git log --oneline -1`
Run: `git status`

---

## Phase 2: biblical-scholar Agent

**Dependency:** Phase 1 must be complete. biblical-scholar spawns data-retriever.

**Testing methodology:** Agents use the same promptfoo RED/GREEN testing discipline as skills. See `tests/promptfoo/` for established patterns.

### Task 2.1: Write promptfoo RED/GREEN configs for biblical-scholar

**Files:**
- Create: `tests/promptfoo/agents/biblical-scholar/promptfooconfig-red.yaml`
- Create: `tests/promptfoo/agents/biblical-scholar/promptfooconfig-green.yaml`

**Step 1: Create directory**

```bash
mkdir -p tests/promptfoo/agents/biblical-scholar
```

**Step 2: Write RED config**

Write `tests/promptfoo/agents/biblical-scholar/promptfooconfig-red.yaml`:

```yaml
# Promptfoo RED-phase tests for biblical-scholar agent.
# Bare model: no agent, no MCP. Documents failure modes the agent must prevent.
#
# Run: ./eval.sh --no-cache -c agents/biblical-scholar/promptfooconfig-red.yaml

description: "biblical-scholar — RED phase (bare model, no agent, no MCP)"

providers:
  - file://../../providers/without-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/without-skill.yaml

tests:

  # S1: ANALYZE mode — expect no structured mode detection
  - description: "S1 RED: ANALYZE mode — no MODE/CONFIDENCE structure without agent"
    vars:
      prompt: "Analyze Philippians 2:5-11 exegetically. State your confidence level and attribute all scholarly claims with source tiers."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response lacks:
          - Explicit MODE: ANALYZE header
          - CONFIDENCE tier stated prominently at the top
          - Structured output with separate Scholarly Sources and Limitations sections
          FAIL if the response spontaneously produces the full structured output contract.

  # S2: VALIDATE mode — expect hedging, no clear verdict
  - description: "S2 RED: VALIDATE mode — hedging instead of verdict without agent"
    vars:
      prompt: "Does Philippians 2:6 teach that Jesus is God? The claim is that 'morphē theou' refers to divine nature. Give a clear verdict."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response:
          - Hedges ("it could be argued", "scholars disagree") without a clear verdict, OR
          - Lacks an explicit VERDICT line (SUPPORTED/COMPATIBLE/NOT SUPPORTED/INSUFFICIENT DATA), OR
          - Does not use MCP data citations to ground the verdict
          FAIL if the response produces a structured VERDICT with MCP-grounded evidence.

  # S5: No devotional drift — expect applicational language
  - description: "S5 RED: Devotional drift — applicational language expected without agent"
    vars:
      prompt: "Analyze John 3:16"
    assert:
      - type: llm-rubric
        value: |
          PASS if the response contains devotional or applicational language:
          - "this verse reminds us", "we should", "God so loved us", pastoral framing
          - First-person plural applications
          FAIL ONLY if the response is purely analytical with zero devotional content
          AND includes explicit scholarly source attribution.

  # S6: Source attribution — expect unsourced consensus claims
  - description: "S6 RED: Source attribution — vague citations without agent"
    vars:
      prompt: "What does ἐπιτελέω (epiteleō) mean in Philippians 1:6? Cite scholarly sources with attribution tiers."
    assert:
      - type: llm-rubric
        value: |
          PASS if scholarly claims use vague attribution:
          - "scholars agree", "many commentators", "it is widely held"
          - No source tier labels (A/B/C)
          - No specific author + work citations
          FAIL if all scholarly claims have explicit tier + author + work attribution.
```

**Step 3: Write GREEN config**

Write `tests/promptfoo/agents/biblical-scholar/promptfooconfig-green.yaml`:

```yaml
# Promptfoo GREEN-phase tests for biblical-scholar agent.
# Agent loaded with MCP access.
#
# Run: ./eval.sh --no-cache -c agents/biblical-scholar/promptfooconfig-green.yaml

description: "biblical-scholar — GREEN phase (agent + MCP)"

providers:
  - file://../../providers/with-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/with-skill.yaml
  assert:
    # Every GREEN test must use MCP tools
    - type: javascript
      value: |
        const raw = JSON.parse(context.providerResponse?.raw || '{}');
        return (raw.num_turns || 0) > 1;
    # No devotional language in analytical output
    - type: llm-rubric
      value: |
        FAIL if the response contains devotional or applicatory language:
        - "This passage reminds us...", "we should...", "let us..."
        - Pastoral framing or inspirational tone
        - First-person plural applications
        PASS if the output is purely analytical without devotional content.

tests:

  # S1: ANALYZE mode — structured output contract
  - description: "S1 GREEN: ANALYZE mode — full structured output"
    vars:
      prompt: "Analyze Philippians 2:5-11"
    assert:
      - type: icontains
        value: "MODE: ANALYZE"
      - type: icontains-any
        value:
          - "CONFIDENCE: HIGH"
          - "CONFIDENCE: MEDIUM"
          - "CONFIDENCE: LOW"
      - type: icontains
        value: "Scholarly Sources"
      - type: icontains
        value: "Limitations"
      - type: llm-rubric
        value: |
          PASS if:
          - Scholarly sources are attributed with tiers (A/B/C)
          - At least one named commentary or scholar is cited
          - MCP data is referenced (morphology, discourse features)
          FAIL if sources say "scholars agree" without naming anyone.

  # S2: VALIDATE mode — clear verdict
  - description: "S2 GREEN: VALIDATE mode — explicit verdict, no hedging"
    vars:
      prompt: "Does Philippians 2:6 teach that Jesus is God? The claim is that 'morphē theou' refers to divine nature."
    assert:
      - type: icontains
        value: "MODE: VALIDATE"
      - type: icontains-any
        value:
          - "VERDICT: SUPPORTED"
          - "VERDICT: COMPATIBLE"
          - "VERDICT: NOT SUPPORTED"
          - "VERDICT: INSUFFICIENT DATA"
      - type: icontains-any
        value:
          - "CONFIDENCE: HIGH"
          - "CONFIDENCE: MEDIUM"
          - "CONFIDENCE: LOW"
      - type: llm-rubric
        value: |
          PASS if:
          - VERDICT is clear and unhedged (one of the four options)
          - Evidence section cites MCP morphology data for μορφή
          - At least one scholarly source on the morphē theou debate
          FAIL if verdict hedges with "it could be argued" or "scholars disagree"
          without choosing a position.

  # S3: TRACE mode — lemma distribution table
  - description: "S3 GREEN: TRACE mode — distribution table with concentration analysis"
    vars:
      prompt: "Trace the distribution of δικαιοσύνη (dikaiosynē) across Paul's letters"
    assert:
      - type: icontains
        value: "MODE: TRACE"
      - type: icontains
        value: "Distribution"
      - type: llm-rubric
        value: |
          PASS if:
          - Distribution table shows book, occurrences, chapters
          - Concentration analysis identifies where the lemma clusters
          - Related lemmas from themes are included
          FAIL if no distribution table or just prose without structured data.

  # S4: Confidence ceiling — degraded data
  - description: "S4 GREEN: Confidence ceiling — capped on tool failure"
    vars:
      prompt: "Analyze Romans 3:21-26. NOTE: data-retriever returned: TOOL_RESULTS: query_morphology: FAILED connection timeout, query_discourse_features: CALLED, query_vocabulary: CALLED. Use this pre-fetched data and determine your confidence ceiling."
    assert:
      - type: icontains-any
        value:
          - "CONFIDENCE: LOW"
          - "CONFIDENCE: MEDIUM"
      - type: icontains
        value: "Limitations"
      - type: llm-rubric
        value: |
          PASS if:
          - Confidence is capped at LOW or MEDIUM (not HIGH) due to morphology failure
          - Limitations section explains which tool failed
          - Recovery path mentioned (direct MCP fallback or noting the gap)
          FAIL if confidence is HIGH despite a critical tool failure.

  # S5: No devotional drift — analytical tone
  - description: "S5 GREEN: Analytical output — no devotional language"
    vars:
      prompt: "Analyze John 3:16"
    assert:
      - type: icontains
        value: "MODE: ANALYZE"
      - type: icontains-any
        value:
          - "CONFIDENCE: HIGH"
          - "CONFIDENCE: MEDIUM"
          - "CONFIDENCE: LOW"

  # S6: Source attribution quality
  - description: "S6 GREEN: Source attribution — tiered citations"
    vars:
      prompt: "What does ἐπιτελέω (epiteleō) mean in Philippians 1:6?"
    assert:
      - type: llm-rubric
        value: |
          PASS if:
          - Every scholarly claim has explicit tier attribution (Tier A/B/C or [A]/[B]/[C])
          - At least one named author + work is cited
          - MCP morphology data cited for ἐπιτελέω
          - Output scales appropriately (brief, not full-length analysis)
          FAIL if "scholars agree" appears without a specific named source.
```

**Step 4: Add npm scripts to package.json**

Add to `tests/promptfoo/package.json`:
```json
"eval:biblical-scholar:red": "npm run eval -- --no-cache -c agents/biblical-scholar/promptfooconfig-red.yaml",
"eval:biblical-scholar:green": "npm run eval -- --no-cache -c agents/biblical-scholar/promptfooconfig-green.yaml",
"eval:biblical-scholar": "npm run eval:biblical-scholar:red && npm run eval:biblical-scholar:green"
```

**Note:** These scenarios are starting points. After running the RED phase, add or modify scenarios based on observed failure modes.

---

### Task 2.2: Run RED phase for biblical-scholar

**Step 1: Run RED config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/biblical-scholar/promptfooconfig-red.yaml
```

Expected: All RED scenarios pass (proving the bare model fails to produce structured analytical output).

**Step 2: View results**

```bash
cd tests/promptfoo && npx promptfoo view
```

**Step 3: Commit RED evidence**

```bash
git commit --allow-empty -m "test(biblical-scholar): RED phase — baseline failures confirmed via promptfoo"
```

---

### Task 2.3: Write biblical-scholar agent (GREEN)

**Files:**
- Create: `plugins/claude-of-alexandria/agents/biblical-scholar.md`

**Step 1: Write the agent file**

Write `plugins/claude-of-alexandria/agents/biblical-scholar.md`:

```markdown
---
name: biblical-scholar
description: Scholarly analysis of biblical passages grounded in MCP data and academic sources. Spawns data-retriever for data gathering. Three modes — ANALYZE, VALIDATE, TRACE.
model: sonnet
tools: Task, Read, WebSearch, Grep, Glob, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_discourse_features, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_paragraph_breaks, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_vocabulary, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_ot_quotes, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_themes_for_lemmas, mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__list_books
---

You are the biblical-scholar — a scholarly specialist for biblical text analysis. You delegate data gathering to data-retriever and add scholarly interpretation with source attribution. You are a building block used by other agents and skills, not a user-facing skill with a fixed output format.

## When Invoked

1. Auto-detect mode from the request: ANALYZE, VALIDATE, or TRACE
2. Spawn data-retriever via Task tool to gather MCP data
3. If data-retriever returns FAILED for critical tools, call those MCP tools directly as fallback
4. Map data-retriever states to confidence tiers
5. Compose analysis grounded in MCP data + scholarly sources
6. Return structured output matching the mode's contract

## Data Gathering

**Always delegate first.** Spawn data-retriever via Task tool:

```
Task tool:
  subagent_type: "claude-of-alexandria:data-retriever"
  prompt: "Gather all relevant data for [passage reference]"
```

**Parsing data-retriever output:** Look for the `TOOL_RESULTS:` section header and read subsequent indented lines until the next unindented section header. Use TOOL_RESULTS to determine your confidence ceiling. If TOOL_RESULTS cannot be parsed from the response, treat as data-retriever failure (CANNOT ANSWER).

**Recovery path:** If data-retriever returns FAILED for a critical tool (see Criticality Table below), call that MCP tool directly. Log the fallback in Limitations.

**If data-retriever spawn fails entirely:** Set confidence to CANNOT ANSWER. Fall back to direct MCP tool calls for all needed data. Log everything in Limitations.

## Mode Detection

- **ANALYZE** (default): Full exegetical analysis. Triggered when given a passage without a specific claim or trace request.
- **VALIDATE**: Evaluate a specific interpretive claim. Look for: "Is it true that...", "Does [passage] support...", "Validate whether...", any statement followed by a request to check it.
- **TRACE**: Cross-reference distribution of a lemma or theme. Look for: "Where does [word] appear...", "Trace [concept] through...", "Distribution of...", lemma in Greek/Hebrew.

## Confidence Mapping

Map data-retriever TOOL_RESULTS to your confidence ceiling:

| data-retriever state | Confidence ceiling |
|---------------------|-------------------|
| All requested tools CALLED | HIGH eligible |
| Some tools EMPTY_RETURNED | HIGH eligible (absence of evidence is evidence) |
| Any tool FAILED | Cap at MEDIUM (note which tool failed) |
| Critical tool FAILED (see Criticality Table) | Cap at LOW |
| All requested tools FAILED | CANNOT ANSWER (infrastructure failure — treat as total outage) |
| data-retriever spawn failed entirely | CANNOT ANSWER — fall back to direct MCP calls |

### Criticality Table

Which tools are "critical" depends on the mode. Critical tools trigger the direct MCP fallback (Iron Rule 8). Important tools cap confidence. Optional tools are noted in Limitations but don't trigger fallback.

| Mode | Critical (trigger fallback) | Important (cap at MEDIUM) | Optional |
|------|---------------------------|---------------------------|----------|
| ANALYZE | query_morphology | query_discourse_features, query_vocabulary | query_ot_quotes, query_themes_for_lemmas, query_lemmas |
| VALIDATE | query_morphology, query_discourse_features | query_vocabulary | query_ot_quotes, query_themes_for_lemmas |
| TRACE | query_lemmas, query_themes_for_lemmas | query_vocabulary | query_morphology, query_discourse_features |

## Source Attribution Tiers

Every scholarly claim MUST be attributed. No exceptions.

- **Tier A**: Major critical commentary series — NICNT, NIGTC, ICC, WBC, BECNT, Pillar, Anchor Bible
- **Tier B**: Established scholars with academic credentials — cite author, work, and page/section
- **Tier C**: Popular-level resources — note "popular-level" caveat
- **Tier D**: Never cite — devotionals, unattributed blog posts, AI-generated content

## Output Contracts

### ANALYZE mode

```
MODE: ANALYZE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]

## Passage Analysis
[Exegetical analysis grounded in data-retriever output.
Reference MCP data explicitly: "query_morphology shows...", "discourse features indicate..."]

## Scholarly Sources
- [Tier A/B/C] Author, Work: relevant finding
- [Tier A/B/C] Author, Work: relevant finding

## Confidence Justification
[Why this confidence tier — which data supports it, what tools were called]

## Limitations
[What was not checked, which tools failed, any recovery paths used]
```

### VALIDATE mode

```
MODE: VALIDATE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]
VERDICT: [SUPPORTED|COMPATIBLE|NOT SUPPORTED|INSUFFICIENT DATA]

## Evidence
### MCP Data (via data-retriever)
[Compressed morphological/discourse evidence relevant to the claim]

### Discourse Context
[Structural observations about the passage unit]

### Scholarly Sources
- [Tier A/B/C] Author, Work: position on this claim
- [Tier A/B/C] Author, Work: position on this claim

## Confidence Justification
[Why this tier — what data supports it]

## Limitations
[What was not checked]
```

**VALIDATE verdicts:**
- **SUPPORTED** — Text evidence directly backs the claim
- **COMPATIBLE** — No contradiction, but no positive evidence either
- **NOT SUPPORTED** — Text actively opposes this reading
- **INSUFFICIENT DATA** — Cannot render verdict (confidence < MEDIUM)

### TRACE mode

```
MODE: TRACE
CONFIDENCE: [HIGH|MEDIUM|LOW|CANNOT ANSWER]
LEMMA: [lemma] ([gloss])

## Distribution
| Book | Occurrences | Chapters |
|------|-------------|----------|
| ... | ... | ... |

## Concentration Analysis
[Where the lemma clusters and why that matters structurally]

## Related Lemmas
[Semantic field from query_themes_for_lemmas]

## Scholarly Context
- [Tier A/B/C] Author, Work: relevant finding about this word/theme
```

## Iron Rules

1. **Data before prose** — spawn data-retriever via Task tool before composing any analysis. No exceptions.
2. **Confidence tier always stated first** — HIGH / MEDIUM / LOW / CANNOT ANSWER, prominently at the top.
3. **Attribute every scholarly claim** — tier + author + work. No "scholars generally agree" without a name.
4. **VALIDATE mode requires explicit verdict** — one of the four options. No hedging, no "it depends."
5. **No devotional language** — this is analysis, not application. No "we should", "this reminds us", "let us."
6. **Theological guardrails apply** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness.
7. **Output scales to the question** — simple lexical query gets 5-10 lines. Complex theological question gets full treatment. Do not pad.
8. **Recovery path** — if data-retriever returns FAILED for a critical tool (see Criticality Table), call that MCP tool directly. Log the fallback in Limitations.
```

---

### Task 2.4: Run GREEN phase for biblical-scholar

**Step 1: Run GREEN config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/biblical-scholar/promptfooconfig-green.yaml
```

Expected: All scenarios pass. The agent should produce structured output with MODE, CONFIDENCE, verdict (VALIDATE), tiered source attribution, and no devotional language.

**Step 2: Compare RED vs GREEN**

```bash
cd tests/promptfoo && npx promptfoo view
```

**Step 3: REFACTOR if needed**

For each failure:
1. If agent problem: edit `plugins/claude-of-alexandria/agents/biblical-scholar.md`
2. If assertion problem: adjust the YAML assertion
3. Re-run: `./eval.sh --no-cache -c agents/biblical-scholar/promptfooconfig-green.yaml`

---

### Task 2.5: Commit biblical-scholar

**Step 1: Stage**

```bash
git add plugins/claude-of-alexandria/agents/biblical-scholar.md \
       tests/promptfoo/agents/biblical-scholar/promptfooconfig-red.yaml \
       tests/promptfoo/agents/biblical-scholar/promptfooconfig-green.yaml \
       tests/promptfoo/package.json
```

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(agents): add biblical-scholar agent for scholarly analysis

Sonnet-powered scholarly specialist with three auto-detected modes:
ANALYZE, VALIDATE, TRACE. Delegates data gathering to data-retriever
via Task tool. Includes promptfoo RED/GREEN test configs.
EOF
)"
```

---

## Phase 3: study-evaluator Agent

**Dependency:** Phase 2 must be complete. study-evaluator spawns biblical-scholar.

**Testing methodology:** Agents use the same promptfoo RED/GREEN testing discipline as skills. See `tests/promptfoo/` for established patterns.

### Task 3.1: Write promptfoo RED/GREEN configs for study-evaluator

**Files:**
- Create: `tests/promptfoo/agents/study-evaluator/promptfooconfig-red.yaml`
- Create: `tests/promptfoo/agents/study-evaluator/promptfooconfig-green.yaml`

**Step 1: Create directory**

```bash
mkdir -p tests/promptfoo/agents/study-evaluator
```

**Step 2: Write RED config**

Write `tests/promptfoo/agents/study-evaluator/promptfooconfig-red.yaml`:

```yaml
# Promptfoo RED-phase tests for study-evaluator agent.
# Bare model: no agent, no MCP. Documents failure modes the agent must prevent.
#
# Run: ./eval.sh --no-cache -c agents/study-evaluator/promptfooconfig-red.yaml

description: "study-evaluator — RED phase (bare model, no agent, no MCP)"

providers:
  - file://../../providers/without-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/without-skill.yaml

tests:

  # S1: Sound study — expect false drift detection or vague feedback
  - description: "S1 RED: Sound study — no structured verdict without agent"
    vars:
      prompt: |
        Evaluate this Bible study outline for exegetical faithfulness. Use structured drift classification (MORALISM, DECONTEXTUALIZATION, etc.) with severity levels.

        # Philippians 2:1-11 Bible Study
        ## 1. The Call to Unity (vv. 1-2)
        - Paul grounds his appeal in Christ's encouragement (εἴ τις παράκλησις ἐν Χριστῷ)
        - Four "if" clauses establish the indicative before the imperative
        - Unity flows FROM what Christ has done, not from our effort
        ## 2. The Mind of Christ (vv. 3-5)
        - φρονέω (mindset) connects to 1:27 — the same verb
        - v.5 is transitional: "Have this mind... which is yours in Christ Jesus"
        ## 3. The Christ Hymn (vv. 6-11)
        - Pre-existence: μορφῇ θεοῦ — essential nature, not mere appearance
        - Kenosis: ἑαυτὸν ἐκένωσεν — self-emptying, not loss of divinity
        - Climax: κύριος, the LXX rendering of YHWH
    assert:
      - type: llm-rubric
        value: |
          PASS if the response lacks:
          - Structured INPUT TYPE classification
          - OVERALL verdict (SOUND/SOUND_WITH_DRIFT/SIGNIFICANT_DRIFT/UNSOUND)
          - Per-point FAITHFUL/DRIFT classification with drift types
          - Reference analysis grounded in MCP data
          FAIL if the response spontaneously produces the full structured evaluation contract.

  # S2: Moralistic drift — expect drift missed or vaguely noted
  - description: "S2 RED: Moralistic drift — classification missed without agent"
    vars:
      prompt: |
        Evaluate this Bible study outline for exegetical faithfulness:

        # Philippians 2:1-11 — Living Like Jesus
        ## 1. Be Humble (vv. 1-4)
        - We need to stop being selfish and start thinking of others
        - Challenge: This week, do one selfless act every day
        ## 2. Follow Jesus' Example (vv. 5-8)
        - Jesus gave up everything for us, so we should give up our comfort too
        - If Jesus could be humble, so can you
        ## 3. The Reward of Obedience (vv. 9-11)
        - God will reward us when we are obedient like Jesus
        - Humble yourself and God will lift you up
    assert:
      - type: llm-rubric
        value: |
          PASS if the response:
          - Does NOT classify drift by specific type (MORALISM, DECONTEXTUALIZATION, etc.), OR
          - Does NOT assign per-point drift severity, OR
          - Provides vague feedback ("could be improved") without specific drift types, OR
          - Misses at least one drift category (e.g., prosperity gospel framing in point 3)
          FAIL if the response catches all three drift types with precise classification
          AND provides constructive corrections grounded in exegetical data.

  # S5: Methodology audit — expect no structural analysis
  - description: "S5 RED: Methodology audit — no structural vulnerability analysis without agent"
    vars:
      prompt: |
        Audit this Bible study methodology for exegetical vulnerabilities:

        You are a Bible study preparation assistant. When given a passage:
        1. Read the passage and identify the main theme
        2. Create 3 discussion questions
        3. Write a brief devotional application
        4. Suggest a prayer based on the passage

        Focus on making the content accessible and personally relevant.
    assert:
      - type: llm-rubric
        value: |
          PASS if the response:
          - Does NOT identify specific structural gaps (missing genre detection, missing context check), OR
          - Does NOT classify which drift types the methodology enables, OR
          - Provides general suggestions rather than mapping methodology steps to vulnerability types
          FAIL if the response maps each methodology step to a specific drift vulnerability
          (e.g., "no genre detection → enables GENRE VIOLATION").
```

**Step 3: Write GREEN config**

Write `tests/promptfoo/agents/study-evaluator/promptfooconfig-green.yaml`:

```yaml
# Promptfoo GREEN-phase tests for study-evaluator agent.
# Agent loaded with MCP access.
#
# Run: ./eval.sh --no-cache -c agents/study-evaluator/promptfooconfig-green.yaml

description: "study-evaluator — GREEN phase (agent + MCP)"

providers:
  - file://../../providers/with-skill.yaml

prompts:
  - "{{prompt}}"

defaultTest:
  options:
    provider: file://../../providers/with-skill.yaml
  assert:
    # Every GREEN test must use MCP tools (via biblical-scholar delegation)
    - type: javascript
      value: |
        const raw = JSON.parse(context.providerResponse?.raw || '{}');
        return (raw.num_turns || 0) > 1;

tests:

  # S1: Sound study — no false drift detection
  - description: "S1 GREEN: Sound study — FAITHFUL verdicts, no false drift"
    vars:
      prompt: |
        Evaluate this Bible study outline:

        # Philippians 2:1-11 Bible Study
        ## 1. The Call to Unity (vv. 1-2)
        - Paul grounds his appeal in Christ's encouragement (εἴ τις παράκλησις ἐν Χριστῷ)
        - Four "if" clauses establish the indicative before the imperative
        - Unity flows FROM what Christ has done, not from our effort
        ## 2. The Mind of Christ (vv. 3-5)
        - φρονέω (mindset) connects to 1:27 — the same verb
        ## 3. The Christ Hymn (vv. 6-11)
        - Pre-existence: μορφῇ θεοῦ — essential nature
        - Kenosis: ἑαυτὸν ἐκένωσεν — self-emptying, not loss of divinity
        - Climax: κύριος, the LXX rendering of YHWH
    assert:
      - type: icontains
        value: "OVERALL:"
      - type: llm-rubric
        value: |
          PASS if:
          - OVERALL verdict is SOUND (not DRIFT or UNSOUND)
          - Each study point is marked FAITHFUL (not falsely flagged as drift)
          - INPUT TYPE is identified (outline)
          FAIL if any sound point is falsely classified as drift.

  # S2: Moralistic drift — specific classification
  - description: "S2 GREEN: Moralistic drift — classified by type and severity"
    vars:
      prompt: |
        Evaluate this Bible study outline:

        # Philippians 2:1-11 — Living Like Jesus
        ## 1. Be Humble (vv. 1-4)
        - We need to stop being selfish and start thinking of others
        - Challenge: This week, do one selfless act every day
        ## 2. Follow Jesus' Example (vv. 5-8)
        - Jesus gave up everything for us, so we should give up our comfort too
        - If Jesus could be humble, so can you
        ## 3. The Reward of Obedience (vv. 9-11)
        - God will reward us when we are obedient like Jesus
        - Humble yourself and God will lift you up
    assert:
      - type: icontains
        value: "MORALISM"
      - type: icontains
        value: "OVERALL:"
      - type: llm-rubric
        value: |
          PASS if:
          - OVERALL is SIGNIFICANT_DRIFT or UNSOUND
          - At least 2 of 3 points classified as DRIFT with type MORALISM
          - Point 3 flagged for prosperity-gospel or reward-based framing
          - Constructive corrections provided (ground in indicative, restore Christology)
          FAIL if drift is missed or vaguely noted without classification.

  # S3: Decontextualized proof-texting
  - description: "S3 GREEN: Proof-texting — DECONTEXTUALIZATION detected"
    vars:
      prompt: |
        Evaluate this Bible study outline:

        # Verses on Humility
        ## Philippians 2:3 — "Do nothing from selfish ambition"
        - Application: Don't be competitive at work
        ## 1 Peter 5:6 — "Humble yourselves under the mighty hand of God"
        - Application: When life is hard, remember God is in control
        ## James 4:10 — "Humble yourselves before the Lord"
        - Application: Stop trying to control everything
    assert:
      - type: icontains
        value: "DECONTEXTUALIZATION"
      - type: llm-rubric
        value: |
          PASS if:
          - Each verse flagged for decontextualization (treated as isolated proverb)
          - Recommendations specify what each verse's literary context requires
          - OVERALL is SIGNIFICANT_DRIFT
          FAIL if verses are evaluated without noting the proof-texting pattern.

  # S4: Transcript with mixed quality
  - description: "S4 GREEN: Mixed transcript — FAITHFUL and DRIFT correctly distinguished"
    vars:
      prompt: |
        Evaluate this Bible study discussion:

        Leader: Let's look at Philippians 2:5-11. What's Paul saying here?
        Participant A: Paul describes Christ's pre-existence and incarnation. "morphē" in v.6 refers to essential nature of God.
        Participant B: Jesus emptied himself — he gave up his divine powers. He couldn't do miracles on his own.
        Participant C: The main point is we should be more humble. Just try harder to put others first.
    assert:
      - type: icontains
        value: "FAITHFUL"
      - type: icontains
        value: "DRIFT"
      - type: llm-rubric
        value: |
          PASS if:
          - INPUT TYPE is transcript
          - Participant A marked FAITHFUL (correct Christology)
          - Participant B flagged for EISEGESIS (kenosis ≠ divesting divine attributes)
          - Participant C flagged for MORALISM
          - OVERALL is SOUND_WITH_DRIFT
          FAIL if all participants treated uniformly (all sound or all drift).

  # S5: Methodology audit — structural vulnerability mapping
  - description: "S5 GREEN: Methodology audit — drift vulnerabilities mapped"
    vars:
      prompt: |
        Audit this Bible study methodology:

        You are a Bible study preparation assistant. When given a passage:
        1. Read the passage and identify the main theme
        2. Create 3 discussion questions
        3. Write a brief devotional application
        4. Suggest a prayer based on the passage

        Focus on making the content accessible and personally relevant.
    assert:
      - type: icontains
        value: "OVERALL:"
      - type: llm-rubric
        value: |
          PASS if:
          - INPUT TYPE is methodology
          - At least 2 structural gaps identified:
            * Missing genre detection (enables GENRE VIOLATION)
            * Missing context check (enables DECONTEXTUALIZATION)
            * "Devotional application" without exegetical grounding (enables MORALISM)
          - OVERALL is SIGNIFICANT_DRIFT (methodology structurally enables drift)
          FAIL if feedback is general without mapping steps to drift vulnerabilities.

  # S6: No passage identified — must ask before proceeding
  - description: "S6 GREEN: No passage — agent asks before evaluating"
    vars:
      prompt: "Here are my study notes: Be kind to others. Love your neighbor. Forgive freely."
    assert:
      - type: llm-rubric
        value: |
          PASS if the response asks which passage is being studied before proceeding.
          FAIL if the response guesses a passage or evaluates without a passage reference.
```

**Step 4: Add npm scripts to package.json**

Add to `tests/promptfoo/package.json`:
```json
"eval:study-evaluator:red": "npm run eval -- --no-cache -c agents/study-evaluator/promptfooconfig-red.yaml",
"eval:study-evaluator:green": "npm run eval -- --no-cache -c agents/study-evaluator/promptfooconfig-green.yaml",
"eval:study-evaluator": "npm run eval:study-evaluator:red && npm run eval:study-evaluator:green"
```

**Note:** These scenarios are starting points. After running the RED phase, add or modify scenarios based on observed failure modes.

---

### Task 3.2: Run RED phase for study-evaluator

**Step 1: Run RED config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/study-evaluator/promptfooconfig-red.yaml
```

Expected: All RED scenarios pass (proving the bare model fails to produce structured drift evaluation).

**Step 2: View results**

```bash
cd tests/promptfoo && npx promptfoo view
```

**Step 3: Commit RED evidence**

```bash
git commit --allow-empty -m "test(study-evaluator): RED phase — baseline failures confirmed via promptfoo"
```

---

### Task 3.3: Write study-evaluator agent (GREEN)

**Files:**
- Create: `plugins/claude-of-alexandria/agents/study-evaluator.md`

**Step 1: Write the agent file**

Write `plugins/claude-of-alexandria/agents/study-evaluator.md`:

```markdown
---
name: study-evaluator
description: Evaluate bible study materials against exegetical standards. Detects outlines, transcripts, and methodology files. Spawns biblical-scholar for reference analysis.
model: sonnet
tools: Task, Read, Write, Bash, Glob, Grep, WebSearch
---

You are the study-evaluator — you assess bible study materials against exegetical standards. You answer one question: "Is this study faithful to the text, or does it drift?"

## When Invoked

1. Read the study materials provided
2. Detect input type (outline, transcript, methodology, combined)
3. Identify the biblical passage being studied — if no passage can be identified, ask before proceeding
4. Spawn biblical-scholar via Task tool for reference analysis
5. Compare each point in the materials against the reference analysis
6. Classify each point as FAITHFUL or DRIFT DETECTED
7. Save evaluation report to file

## Input Type Detection

| Input Type | Detection Signals |
|------------|-------------------|
| Study outline | Markdown headers with passage refs, numbered/bulleted points, discussion questions |
| Discussion transcript | Speaker labels ("Leader:", "Participant:"), timestamps, dialogue format, Q&A |
| Methodology reference | System prompts, agent instructions, structural templates, "guide"/"methodology" language |

**Mixed input:** Process all applicable sections. Label each section's type in the output.
**Ambiguous:** Default to study outline.
**No passage found:** Ask the user which passage is being studied. Do NOT guess. Do NOT proceed without a passage reference.

## Reference Analysis

**Always delegate first.** Spawn biblical-scholar via Task tool:

```
Task tool:
  subagent_type: "claude-of-alexandria:biblical-scholar"
  prompt: "ANALYZE [passage reference]. Provide a reference analysis for evaluating study materials."
```

Use the scholar's CONFIDENCE tier. If reference analysis confidence is LOW, mark all drift findings as PROVISIONAL.

**If biblical-scholar spawn fails entirely:** Set REFERENCE_CONFIDENCE: UNAVAILABLE. Mark ALL drift findings as PROVISIONAL. Include a prominent warning at the top of the output: "WARNING: Evaluation performed without MCP-grounded reference analysis. All drift findings are PROVISIONAL." Do NOT skip the evaluation — still assess the study materials using your own analysis, but be transparent about the reduced confidence.

## Output Location

Save evaluation reports to: `~/.claude/study-evaluations/{book}/{YYYY-MM-DD}-{description}.md`

Examples:
- `~/.claude/study-evaluations/philippians/2026-02-27-phil-2-1-11-study-session.md`
- `~/.claude/study-evaluations/genesis/2026-02-27-gen-1-methodology-audit.md`

Create directories with `Bash` (`mkdir -p`) before writing the file.

## Output Contract

```
EVALUATION: [book] [passage] [description]
INPUT TYPE: [outline|transcript|methodology|combined]
OVERALL: [SOUND|SOUND_WITH_DRIFT|SIGNIFICANT_DRIFT|UNSOUND]

## Passage Reference Analysis
[Delegated to biblical-scholar — compact summary of what the text actually says]
REFERENCE_CONFIDENCE: [HIGH|MEDIUM|LOW]

## Outline Evaluation
[Present if outline detected]
### Point N: "[title]" (vv.X-Y) — [FAITHFUL|DRIFT DETECTED]
[Brief evidence. For DRIFT: type, issue, correction, severity]

## Transcript Trace
[Present if transcript detected]
[Section-by-section trace with FAITHFUL / DRIFT marks]

## Methodology Audit
[Present if methodology files detected]
[Framework evaluation: does the structure prevent or enable drift?]

## Drift Summary
| # | Location | Type | Severity | Confidence | Corrected? |
|---|----------|------|----------|------------|------------|
| 1 | ... | ... | ... | [from biblical-scholar] | ... |

## Recommendations
[Constructive corrections for each drift point. Every drift gets a specific fix.]
```

## Overall Verdicts

- **SOUND** — no drift points detected
- **SOUND_WITH_DRIFT** — 1-2 drift points, all LOW-MODERATE severity
- **SIGNIFICANT_DRIFT** — 3+ drift points or any HIGH severity
- **UNSOUND** — systematic drift throughout, fundamental methodology issue

## Drift Classification

| Drift Type | Description | Severity Guide |
|------------|-------------|----------------|
| MORALISM | Imperative without indicative grounding | MODERATE-HIGH |
| FLATTENING | Covenantal/Christological nuance lost | MODERATE-HIGH |
| DECONTEXTUALIZATION | Verse isolated from discourse unit | MODERATE |
| GENRE VIOLATION | Wrong hermeneutical method for text type | HIGH |
| EISEGESIS | Reading meaning into text not supported by data | MODERATE-HIGH |
| THERAPEUTIC | Psychologizing the text | LOW-MODERATE |
| TRIVIALIZING | Reducing profound theology to platitude | LOW-MODERATE |

## Iron Rules

1. **Reference analysis first** — spawn biblical-scholar via Task tool before evaluating anything. No exceptions.
2. **Classify every drift** — type + severity + confidence for each drift point.
3. **FAITHFUL is the default** — this is not a fault-finding exercise. Sound points get explicit FAITHFUL marks.
4. **Corrections are constructive** — every drift point includes what the study *should* say instead.
5. **Theological guardrails are the rubric** — anti-moralism, Christ-centeredness, context primacy, genre governance, covenantal awareness.
6. **Methodology audits evaluate frameworks, not intentions** — good prompt intentions don't count if the structure enables drift.
7. **Surface upstream confidence** — drift verdicts must include the confidence level from biblical-scholar. If reference analysis was LOW confidence, mark drift findings as PROVISIONAL.
```

---

### Task 3.4: Run GREEN phase for study-evaluator

**Step 1: Run GREEN config**

```bash
cd tests/promptfoo && ./eval.sh --no-cache -c agents/study-evaluator/promptfooconfig-green.yaml
```

Expected: All scenarios pass. The agent should produce structured evaluation with INPUT TYPE, OVERALL verdict, per-point FAITHFUL/DRIFT classification, drift types with severity, and constructive corrections.

**Step 2: Compare RED vs GREEN**

```bash
cd tests/promptfoo && npx promptfoo view
```

**Step 3: REFACTOR if needed**

For each failure:
1. If agent problem: edit `plugins/claude-of-alexandria/agents/study-evaluator.md`
2. If assertion problem: adjust the YAML assertion
3. Re-run: `./eval.sh --no-cache -c agents/study-evaluator/promptfooconfig-green.yaml`

---

### Task 3.5: Commit study-evaluator

**Step 1: Stage**

```bash
git add plugins/claude-of-alexandria/agents/study-evaluator.md \
       tests/promptfoo/agents/study-evaluator/promptfooconfig-red.yaml \
       tests/promptfoo/agents/study-evaluator/promptfooconfig-green.yaml \
       tests/promptfoo/package.json
```

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(agents): add study-evaluator agent for study material evaluation

Sonnet-powered evaluator that assesses bible study outlines, transcripts,
and methodology files against exegetical standards. Detects seven drift
types with severity classification. Delegates reference analysis to
biblical-scholar. Includes promptfoo RED/GREEN test configs.
EOF
)"
```

---

## Phase 4: Release

### Task 4.1: Update CHANGELOG.md and version

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `.claude-plugin/marketplace.json`

**Step 1: Add changelog entry**

Add a new `[2.0.0]` entry at the top of the changelog, above the existing latest version entry:

```markdown
## [2.0.0] - 2026-MM-DD

### Added

- `data-retriever` sub-agent (Haiku) — fetches MCP biblical data and compresses into structured summaries with testament-aware routing
- `biblical-scholar` sub-agent (Sonnet) — scholarly analysis with three auto-detected modes (ANALYZE, VALIDATE, TRACE), confidence tiers, and source attribution
- `study-evaluator` sub-agent (Sonnet) — evaluates bible study outlines, transcripts, and methodology files against exegetical standards with drift classification
- Inter-agent delegation chain: study-evaluator → biblical-scholar → data-retriever
- Agents directory (`plugins/claude-of-alexandria/agents/`) for auto-discovered sub-agents
```

**Step 2: Bump version to 2.0.0 in marketplace.json**

Update BOTH version fields in `.claude-plugin/marketplace.json`:
- `metadata.version` (line 9): `"1.9.4"` → `"2.0.0"`
- `plugins[0].version` (line 17): `"1.9.4"` → `"2.0.0"`

This is a major version bump because it introduces a new architectural layer (sub-agents) alongside the existing skills.

**Step 3: Commit**

```bash
git add CHANGELOG.md .claude-plugin/marketplace.json
git commit -m "chore(release): bump version to 2.0.0"
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Haiku for data-retriever | Cost-effective for structured orchestration. Upgrade to sonnet if testing reveals quality issues. |
| Sonnet for scholar + evaluator | Within 1.2% of Opus on SWE-bench, 5x cheaper. `model` field makes upgrading trivial. |
| Full MCP tool names in `tools` field | Agents use `tools` in frontmatter (verified from kombajn-dev, rspec, superpowers plugins). Skills use `allowed-tools`. Different artifact types, different field names. MCP tool names use the same full qualified format in both. |
| `tools` restriction for data-retriever | Using frontmatter `tools` field to restrict to MCP tools only. Task 0.3 explicitly tests whether this restriction is enforced. If not enforced, fall back to prompt-level restriction. |
| Promptfoo RED/GREEN for agents | Same promptfoo testing methodology as skills. Agents get `promptfooconfig-red.yaml` and `promptfooconfig-green.yaml` under `tests/promptfoo/agents/`. |
| Version 2.0.0 | New architectural layer (agents alongside skills) justifies major bump. |
| Phase 4 (skill refactor) deferred | Whether `consult-biblical-scholar` skill should wrap `biblical-scholar` agent is decided after observing agent quality in production. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Haiku produces unstable output format | MEDIUM | HIGH — blocks Phase 2 | Task 1.4 verification. If unstable, upgrade to sonnet. |
| Agent auto-discovery fails | LOW | HIGH — blocks all phases | Task 0.3 verifies before any real agents are built. |
| MCP tool names not accepted in agent `tools` field | MEDIUM | LOW — agent still works, just not restricted | Remove `tools` field, use prompt-level restriction. |
| Three-layer chain too slow for interactive use | LOW | LOW — study evaluation is batch, not real-time | Acceptable per design. Latency is minutes, not seconds. |
| biblical-scholar doesn't delegate to data-retriever | MEDIUM | MEDIUM — defeats purpose | Iron Rule 1 + verification in Task 2.4. |
