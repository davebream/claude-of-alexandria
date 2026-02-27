# Spike Findings: Promptfoo + Claude Agent SDK

**Date:** 2026-02-27
**Plan:** `2026-02-27-promptfoo-skill-testing.md` Task 0

---

## Environment Setup That Works

### Auth (Claude Max, no API key)
```bash
CLAUDE_CODE_OAUTH_TOKEN=$(fish -c 'echo $CLAUDE_CODE_OAUTH_TOKEN') \
CLAUDE_CODE_USE_BEDROCK=bypass-validation \
env -u CLAUDECODE -u ANTHROPIC_API_KEY \
npx promptfoo eval -c promptfooconfig.yaml
```

**Why this works:**
- `CLAUDE_CODE_OAUTH_TOKEN` is set in fish but not exported to the Claude Code session — extract it explicitly
- `CLAUDE_CODE_USE_BEDROCK=bypass-validation` bypasses the promptfoo validation gate that requires `ANTHROPIC_API_KEY` (validation: `if (!apiKey && !(env.BEDROCK || env.VERTEX)) throw error`)
- `-u ANTHROPIC_API_KEY` unsets the env var so the spawned claude process uses OAuth instead of trying a missing key
- `-u CLAUDECODE` unsets the var that prevents nested claude sessions

This is a workaround for a promptfoo bug — it doesn't check `CLAUDE_CODE_OAUTH_TOKEN` in its validation gate. Consider filing a PR.

### Provider config required fields
```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ../../          # repo root (skills discovered from here)
      setting_sources:
        - project                  # loads SKILL.md files
      permission_mode: bypassPermissions
      allow_dangerously_skip_permissions: true   # REQUIRED with bypassPermissions
      max_turns: 40
      max_budget_usd: 2.00
      mcp:
        enabled: true
        servers:
          - name: claude-of-alexandria-mcp
            url: https://coa.davebream.com/mcp
```

---

## Findings by Question

### Q1: Does `setting_sources: ['project']` load skills?
**Status:** Not directly tested in spike. Based on SDK behavior: `working_dir: ../../` + `setting_sources: ['project']` should load skills from `plugins/claude-of-alexandria/skills/`. Skill loading will be verified in Task 4 (pilot skill test) by running a prompt that triggers a skill.

### Q2: Can MCP tools be called?
**Answer: YES.** Both tests confirmed real MCP data returned:
- T1: `list_books` → Matthew, Mark, Luke (all 27 NT books available)
- T2: `query_morphology` → ἐναρξάμενος parsed as aorist middle participle (correct)

### Q3: What are the actual MCP tool names?
**Answer: The bare names.** The server uses: `list_books`, `query_discourse_features`, `query_paragraph_breaks`, `query_vocabulary`, `query_morphology`, `query_ot_quotes`, `query_themes_for_lemmas`, `query_lemmas`

NOT the Claude Code plugin convention (`mcp__plugin_claude-of-alexandria_...`). Update all `append_allowed_tools` entries in provider configs.

### Q4: Does `metadata.toolCalls` expose tool calls in JS assertions?
**Answer: NO.** `metadata` is `undefined`. There is no tool call history in the response metadata.

**Alternative that works:** Check `raw.num_turns > 1`. When `num_turns === 2`, the agent made at least one tool call.

```javascript
// Assertion for "agent used tools"
const raw = JSON.parse(context.providerResponse?.raw || '{}');
return raw.num_turns > 1;
```

### Q5: Do `file://` provider references work?
**Not tested.** Will verify in Task 2 when shared provider configs are created.

### Q6: Tool call metadata structure (full `raw` shape)
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": ...,
  "duration_api_ms": ...,
  "num_turns": 2,
  "result": "...text output...",
  "stop_reason": "end_turn",
  "session_id": "...",
  "total_cost_usd": 0.048584,
  "usage": {
    "input_tokens": 18,
    "cache_creation_input_tokens": 564,
    "cache_read_input_tokens": 70838,
    "output_tokens": 382,
    "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
    "service_tier": "standard"
  },
  "modelUsage": {
    "claude-sonnet-4-5-20250929": {
      "inputTokens": 18,
      "outputTokens": 382,
      "cacheReadInputTokens": 70838,
      "cacheCreationInputTokens": 564,
      "webSearchRequests": 0,
      "costUSD": 0.048584,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  },
  "permission_denials": [],
  "uuid": "..."
}
```

### Q7: Report generation command
**Not tested.** `promptfoo view` starts a web server. `promptfoo export` may generate static HTML. Verify during Task 12.

---

## Required Plan Updates

1. **Auth section:** Add the fish + BEDROCK bypass workaround. Note it as a workaround pending promptfoo fix.

2. **MCP tool names in `append_allowed_tools`:** Change from `mcp__plugin_claude-of-alexandria_...__list_books` to bare `list_books` etc. The plugin prefix convention is Claude Code CLI, not the Agent SDK.

3. **JS assertion for tool calls:** Replace `metadata.toolCalls` with `raw.num_turns > 1`:
   ```javascript
   // OLD (broken):
   const tools = context.providerResponse?.metadata?.toolCalls || [];
   return tools.some(t => t.name.includes('query_morphology'));

   // NEW (working):
   const raw = JSON.parse(context.providerResponse?.raw || '{}');
   return raw.num_turns > 1; // agent made at least one tool call
   ```

4. **`tool-calls.js` helper file** (Task 3): Update to use `num_turns` approach, not metadata.

5. **No RED-phase `working_dir: /tmp/promptfoo-no-skill`:** The provider can use a temp dir without specifying one — if `working_dir` is omitted, the SDK creates a temp dir automatically. For RED phase (no skills), just omit `setting_sources` and `working_dir`.

---

## Cost Observed

- T1 (list_books): $0.048584, 2 turns, 400 tokens
- T2 (morphology): ~similar

Cost per scenario is higher than estimated due to large skill cache (70K cache_read_input_tokens). Estimate: ~$0.05-0.15/scenario with caching. 65 scenarios ≈ $3-10 per full run, not $100.

---

## Go/No-Go: PROCEED

The provider works. MCP works. Auth works. Assertion strategy clear.
