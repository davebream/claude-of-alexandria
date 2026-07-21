/**
 * GREEN-phase provider: Agent SDK with skills, MCP, and plugin access.
 *
 * Uses OAuth token auth (CLAUDE_CODE_OAUTH_TOKEN) — no ANTHROPIC_API_KEY.
 * The Agent SDK uses a different communication channel than `claude --print`,
 * so it avoids the known CLI bug where remote MCP servers hang indefinitely.
 *
 * Isolation:
 *   - strictMcpConfig: true   → only our declared MCP server
 *   - settingSources: ["project"] → project CLAUDE.md only, no user settings
 *   - plugins: [local only]   → only the project plugin
 *   - persistSession: false   → no session files left on disk
 *
 * Usage in promptfooconfig.yaml:
 *   providers:
 *     - file://../../providers/sdk-with-skill.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import SdkProvider from "./sdk-provider.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root: two levels up from tests/promptfoo/providers/
const REPO_ROOT = path.resolve(__dirname, "../../..");

const APPEND_SYSTEM_PROMPT = `\
CRITICAL: When asked to perform a biblical analysis task, follow the relevant skill \
instructions loaded from this project.
SKILL LOADING RULE: When the user mentions a skill by name (e.g., "use the \
argument-flow skill"), you MUST invoke the Skill tool to load that skill BEFORE \
any other action or response. This is non-negotiable even if the user says \
"without looking anything up" — loading a skill is loading your operating \
instructions, not "looking something up." Never skip skill loading.
OUTPUT RULE: Complete ALL tool calls and data gathering first. Then output the \
ENTIRE analysis in your FINAL response — all sections in one message. \
Never print partial output between tool calls. Never save to file.
SUB-AGENT RULE: When asked to invoke a named agent (e.g., "data-retriever"), use \
the Task tool to delegate to that agent. Return the agent's output VERBATIM — do \
not reformat, summarize, or wrap it in your own structure.`;

// Prefix matches what a real plugin install exposes (mcp__plugin_<pluginName>_<serverName>__*),
// not the bare mcp__<serverName>__* the SDK would otherwise use for a directly-declared server.
// Subagent frontmatter (data-retriever.md, argument-flow.md) declares tools under this same
// prefix; a mismatch here means those subagents see zero matching MCP tools and fail to spawn.
const MCP_SERVER_KEY = "plugin_claude-of-alexandria_claude-of-alexandria-mcp";

const MCP_TOOLS = [
  "list_books",
  "query_discourse_features",
  "query_paragraph_breaks",
  "query_vocabulary",
  "query_morphology",
  "query_ot_quotes",
  "query_lemmas",
  "query_themes_for_lemmas",
  "query_theme_distribution",
  "query_lexicon",
  "check_versification",
  "query_cross_references",
  "trace_cross_reference_path",
  "query_people",
  "query_places",
  "query_events",
  "query_person_network",
  "query_speakers",
  "query_syntax",
  "query_variants",
  "bible_lookup",
  "commentary_lookup",
  "parallel_text",
  "confessional_lookup",
  "liturgical_lookup",
  "query_controversies",
].map((name) => `mcp__${MCP_SERVER_KEY}__${name}`);

export default class SdkWithSkillProvider extends SdkProvider {
  constructor(options = {}) {
    super({
      ...options,
      id: options.id || "sdk-with-skill",
      config: {
        model: "claude-sonnet-5",
        working_dir: REPO_ROOT,
        max_budget_usd: 3.00,
        max_turns: 50,
        ...options.config,
      },
    });
  }

  // The remote MCP server occasionally fails to register its tools at session
  // start under concurrent eval load ("MCP tool access failed / not in the active
  // toolset"), leaving the skill to fall back to ungrounded analysis. Since a
  // GREEN skill session must ground in MCP data, a completed session with zero
  // MCP tool calls signals a transient connection drop — retry it a bounded number
  // of times rather than let flakiness pollute the results.
  async callApi(prompt, context, callOptions) {
    const maxAttempts = this.config.mcp_retries ?? 3;
    let last;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      last = await super.callApi(prompt, context, callOptions);
      if (last?.error) return last; // hard error — do not spin
      const usedMcp = (last?.metadata?.toolCalls || []).some(
        (t) => typeof t?.name === "string" && t.name.startsWith("mcp__")
      );
      if (usedMcp) return last;
      // zero MCP calls → likely a transient MCP registration failure; retry
    }
    return last; // best effort after retries exhausted
  }

  buildOptions(cwd) {
    return {
      model: this.config.model || "claude-sonnet-5",
      mcpServers: {
        [MCP_SERVER_KEY]: {
          type: "http",
          url: "https://coa.davebream.com/mcp",
        },
      },
      strictMcpConfig: true,
      plugins: [{ type: "local", path: "plugins/claude-of-alexandria" }],
      settingSources: ["project"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: this.config.append_system_prompt || APPEND_SYSTEM_PROMPT,
      },
      allowedTools: [
        "Task", "Skill", "Read", "Write", "Glob", "Grep",
        ...MCP_TOOLS,
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxBudgetUsd: this.config.max_budget_usd ?? 3.00, // Keep constructor default and this fallback in sync
      maxTurns: this.config.max_turns ?? 50,
      persistSession: false,
    };
  }
}
