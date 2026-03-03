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

const MCP_TOOLS = [
  "mcp__claude-of-alexandria-mcp__query_discourse_features",
  "mcp__claude-of-alexandria-mcp__query_paragraph_breaks",
  "mcp__claude-of-alexandria-mcp__query_vocabulary",
  "mcp__claude-of-alexandria-mcp__query_morphology",
  "mcp__claude-of-alexandria-mcp__query_ot_quotes",
  "mcp__claude-of-alexandria-mcp__query_lemmas",
  "mcp__claude-of-alexandria-mcp__query_themes_for_lemmas",
  "mcp__claude-of-alexandria-mcp__query_theme",
  "mcp__claude-of-alexandria-mcp__query_lexicon",
  "mcp__claude-of-alexandria-mcp__check_versification",
  "mcp__claude-of-alexandria-mcp__query_cross_references",
  "mcp__claude-of-alexandria-mcp__query_people",
  "mcp__claude-of-alexandria-mcp__query_places",
  "mcp__claude-of-alexandria-mcp__query_events",
  "mcp__claude-of-alexandria-mcp__query_person_network",
  "mcp__claude-of-alexandria-mcp__query_speakers",
  "mcp__claude-of-alexandria-mcp__query_syntax",
  "mcp__claude-of-alexandria-mcp__query_variants",
];

export default class SdkWithSkillProvider extends SdkProvider {
  constructor(options = {}) {
    super({
      ...options,
      id: options.id || "sdk-with-skill",
      config: {
        model: "sonnet",
        working_dir: REPO_ROOT,
        max_budget_usd: 3.00,
        max_turns: 30,
        ...options.config,
      },
    });
  }

  buildOptions(cwd) {
    return {
      model: this.config.model || "sonnet",
      mcpServers: {
        "claude-of-alexandria-mcp": {
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
      maxTurns: this.config.max_turns ?? 30,
      persistSession: false,
    };
  }
}
