# Custom Promptfoo Provider: Claude CLI

**Date**: 2026-02-28
**Status**: Design

## Problem

The current promptfoo setup uses the built-in `anthropic:claude-agent-sdk` provider, which requires an `ANTHROPIC_API_KEY` and communicates directly with the Anthropic API. This has two issues:

1. **Authentication**: Cannot use locally-authenticated Claude CLI sessions (e.g., Claude Max subscription, team billing). Requires raw API keys.
2. **Environment contamination**: The Agent SDK loads the full user environment (MCP servers, plugins, project configs). Tests need a clean, explicitly configured environment where only specified tools and skills are available.

## Solution

Build a custom promptfoo provider that shells out to the Claude CLI in `-p` (print) mode. The provider:

- Uses the CLI's native authentication (whatever the user has configured)
- Starts with a bare environment
- Explicitly adds skills, tools, MCP servers, and system prompts via CLI flags
- Returns Agent SDK-compatible responses so existing test assertions work unchanged

## Architecture

```
promptfoo YAML config
    │
    ├── providers:
    │     └── file://../../providers/claude-cli-provider.mjs
    │           config: { model, skills, allowedTools, mcp, ... }
    │
    └── tests:
          └── prompt → ClaudeCliProvider.callApi(prompt)
                │
                ├── Reads skill files from config.skills[]
                ├── Builds CLI args from config
                ├── Spawns: claude -p "prompt" --output-format stream-json [flags]
                ├── Collects NDJSON events line by line
                ├── Counts turns, extracts tool calls
                ├── Extracts final result from 'result' event
                │
                └── Returns ProviderResponse:
                      {
                        output: "final text",
                        tokenUsage: { total, prompt, completion },
                        cost: 0.015,
                        raw: JSON.stringify({
                          num_turns: 3,
                          total_cost_usd: 0.015,
                          events: [...],
                          session_id: "..."
                        })
                      }
```

## Key Design Decisions

### 1. Stream-JSON over simple JSON

Use `--output-format stream-json` instead of `--output-format json`.

**Rationale**: Stream-JSON provides NDJSON events with full agentic trace — individual tool calls, timing per turn, and content blocks. While simple JSON also includes `num_turns`, the event stream enables richer assertions (e.g., "did the agent call the MCP morphology tool?") and better debugging of failed tests.

### 2. Skills injected via system prompt, not Skill tool

The Skill tool may not be available in `-p` mode (slash commands are interactive-only). Instead of depending on runtime Skill tool availability, the provider reads skill files from disk at invocation time and appends their content to `--append-system-prompt`.

```yaml
config:
  skills:
    - ../../plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
```

**Rationale**: Explicit, predictable, no runtime ambiguity. The skill content is guaranteed to be in the system prompt before the first turn.

### 3. Agent SDK-compatible `raw` field

The `raw` field in ProviderResponse is a JSON string containing `num_turns`, `total_cost_usd`, `session_id`, and `events[]`. This matches the Agent SDK provider's format, so existing assertions work unchanged:

```yaml
- type: javascript
  value: |
    const raw = JSON.parse(context.providerResponse?.raw || '{}');
    return (raw.num_turns || 0) > 1;
```

### 4. CLAUDECODE="" environment variable

The CLI refuses to run inside another Claude Code session (nested session protection). Setting `CLAUDECODE=""` bypasses this check. The provider sets this automatically via `config.env`.

### 5. Coexistence with Agent SDK providers

New CLI provider configs live alongside existing Agent SDK configs. Migration is gradual — individual test configs can switch by changing their `providers:` reference. No test assertions need modification.

## Config Schema

```yaml
id: file://./claude-cli-provider.mjs
label: with-skill-cli
config:
  # Model selection (required)
  model: sonnet                      # sonnet, opus, haiku, or full model ID

  # Environment (optional)
  workingDir: ../../                  # Working directory for CLI process
  addDirs:                           # Additional directories to expose
    - ../../plugins/claude-of-alexandria

  # Skill injection (optional)
  skills:                            # Skill files read and appended to system prompt
    - ../../plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md

  # System prompt (optional)
  systemPrompt: null                 # Replace entire system prompt
  appendSystemPrompt: |              # Append to default system prompt
    OUTPUT RULE: Complete ALL tool calls first...
  systemPromptFile: null             # Load from file
  appendSystemPromptFile: null       # Append from file

  # Tool control (optional)
  allowedTools:                      # Auto-approve these tools (no permission prompts)
    - Read
    - Write
    - WebSearch
  disallowedTools: []                # Block these tools entirely

  # MCP servers (optional)
  mcpConfig:                         # Inline object or path to JSON file
    mcpServers:
      claude-of-alexandria-mcp:
        url: https://coa.davebream.com/mcp

  # Budget & limits (optional)
  maxTurns: 10                       # Max agentic turns
  maxBudgetUsd: 5.00                 # Max spend per invocation

  # Session (optional, defaults shown)
  noSessionPersistence: true         # Don't persist sessions between tests

  # Environment variables (optional)
  env:                               # Extra env vars for CLI process
    CLAUDECODE: ""                   # Required to run inside Claude Code
```

### Config-to-CLI flag mapping

| Config Key              | CLI Flag                        |
|-------------------------|---------------------------------|
| `model`                 | `--model`                       |
| `workingDir`            | `cwd` option in `child_process` |
| `addDirs`               | `--add-dir`                     |
| `skills`                | Read file → `--append-system-prompt` |
| `systemPrompt`          | `--system-prompt`               |
| `appendSystemPrompt`    | `--append-system-prompt`        |
| `systemPromptFile`      | `--system-prompt-file`          |
| `appendSystemPromptFile`| `--append-system-prompt-file`   |
| `allowedTools`          | `--allowedTools`                |
| `disallowedTools`       | `--disallowedTools`             |
| `mcpConfig`             | `--mcp-config` (writes temp file if object) |
| `maxTurns`              | `--max-turns`                   |
| `maxBudgetUsd`          | `--max-budget-usd`              |
| `noSessionPersistence`  | `--no-session-persistence`      |

## Stream-JSON Event Parsing

### Event types

| Type        | Meaning                          | Data extracted                    |
|-------------|----------------------------------|-----------------------------------|
| `system`    | Session init, context compaction | `session_id`                      |
| `assistant` | Complete assistant response       | Turn count increment, text blocks |
| `result`    | Final aggregated result          | `result`, `num_turns`, cost, tokens |

### Parsing logic

```javascript
for await (const line of readLines(process.stdout)) {
  const event = JSON.parse(line);
  events.push(event);

  if (event.type === 'assistant') numTurns++;
  if (event.type === 'result') {
    result = event.result;
    totalCost = event.total_cost_usd;
    inputTokens = event.total_input_tokens;
    outputTokens = event.total_output_tokens;
    if (event.num_turns) numTurns = event.num_turns;  // prefer result's count
  }
}
```

## Provider YAML Configs

### RED phase (bare model)

```yaml
# tests/promptfoo/providers/without-skill-cli.yaml
id: file://./claude-cli-provider.mjs
label: without-skill-cli
config:
  model: sonnet
  maxTurns: 10
  noSessionPersistence: true
  env:
    CLAUDECODE: ""
```

### GREEN phase (skills + MCP)

```yaml
# tests/promptfoo/providers/with-skill-cli.yaml
id: file://./claude-cli-provider.mjs
label: with-skill-cli
config:
  model: sonnet
  workingDir: ../../
  skills:
    - ../../plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
  appendSystemPrompt: |
    CRITICAL: When asked to perform a biblical analysis task, follow the skill
    instructions injected into this prompt.
    OUTPUT RULE: Complete ALL tool calls and data gathering first. Then output the
    ENTIRE analysis in your FINAL response — all sections in one message.
    SUB-AGENT RULE: When asked to invoke a named agent, use the Task tool to
    delegate. Return the agent's output VERBATIM.
  allowedTools:
    - Read
    - Write
    - WebSearch
    - query_discourse_features
    - query_paragraph_breaks
    - query_vocabulary
    - query_morphology
    - query_ot_quotes
    - query_lemmas
    - query_themes_for_lemmas
  mcpConfig:
    mcpServers:
      claude-of-alexandria-mcp:
        url: https://coa.davebream.com/mcp
  maxTurns: 10
  noSessionPersistence: true
  env:
    CLAUDECODE: ""
```

**Note**: The `skills` array is per-provider YAML file. Different test configs can reference different provider YAMLs with different skills loaded. For tests that need a different skill, create a separate provider YAML (e.g., `with-pericope-skill-cli.yaml`).

## File Structure

### New files

```
tests/promptfoo/providers/
├── claude-cli-provider.mjs       # Custom provider implementation (~140 lines)
├── with-skill-cli.yaml           # GREEN provider config (CLI-based)
└── without-skill-cli.yaml        # RED provider config (CLI-based)
```

### Unchanged files

All existing provider files, test configs, assertions, and scripts remain unchanged. Migration is opt-in per test config.

## Migration Path

### Phase 1: Create & validate

1. Implement `claude-cli-provider.mjs`
2. Create CLI provider YAML configs
3. Run one GREEN test with the CLI provider to validate output format
4. Compare results with Agent SDK provider to confirm compatibility

### Phase 2: Gradual migration

1. Switch individual test configs from Agent SDK to CLI provider
2. Verify all assertions pass
3. Remove Agent SDK provider configs once fully migrated

### Phase 3: Cleanup

1. Remove `ANTHROPIC_API_KEY` dependency from `.env.example`
2. Update README with CLI provider documentation
3. Remove Agent SDK provider YAML files

## Open Questions

1. **Per-skill provider YAMLs**: With the `skills[]` approach, each skill test needs its own provider YAML (or a way to override skills per test). The current Agent SDK approach uses a single GREEN provider because the Skill tool loads skills dynamically. Trade-off: more explicit config files vs. dynamic loading.

2. **Grader provider**: The grader currently uses `anthropic:claude-agent-sdk` (non-thinking model). Should it also switch to CLI, or remain on the API? The grader doesn't need skills or MCP — it just grades assertions. Keeping it on API may be simpler.

3. **Timeout handling**: The CLI can take 60-120 seconds for complex agentic tasks. Promptfoo has its own timeout. Need to ensure they're aligned.
