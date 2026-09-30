/**
 * Base class for all Agent SDK-based promptfoo providers.
 *
 * Uses @anthropic-ai/claude-agent-sdk (the same package promptfoo uses)
 * directly, bypassing promptfoo's ClaudeCodeSDKProvider which requires
 * ANTHROPIC_API_KEY and prevents CLAUDE_CODE_OAUTH_TOKEN from working.
 *
 * Subclasses configure tool/MCP/plugin access for their specific phase:
 *   - SdkBareProvider   → RED:    no tools, no MCP, no plugins
 *   - SdkGraderProvider → grader: no tools, basic model inference
 *   - SdkWithSkill      → GREEN:  skills + MCP + plugins
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the Agent SDK from the local node_modules
const SDK_PATH = path.resolve(
  __dirname,
  "../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs"
);

export default class SdkProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.providerId = options.id || "sdk-provider";
    this._sdk = null;
  }

  id() {
    return this.providerId;
  }

  // Override in subclasses to provide phase-specific SDK options.
  // Must return an Options object accepted by sdk.query().
  buildOptions(_cwd) {
    throw new Error("SdkProvider.buildOptions() must be implemented by subclass");
  }

  async _loadSdk() {
    if (!this._sdk) {
      this._sdk = await import(SDK_PATH);
    }
    return this._sdk;
  }

  /**
   * Build a clean environment for the SDK child process.
   * Strips keys that interfere with OAuth auth or introduce
   * machine-specific config (proxy, cloud MCPs, etc.).
   */
  buildEnv() {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;            // Force OAuth token auth
    delete env.ANTHROPIC_BASE_URL;           // Don't route through z.ai proxy
    delete env.CLAUDECODE;                   // Prevent nested session detection
    delete env.ENABLE_CLAUDEAI_MCP_SERVERS;  // No cloud-hosted MCP servers
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    // Claude Code also uses its Haiku selector for background requests, even
    // with no tools/plugins. Scope this remapping to the evaluation child only.
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "sonnet";
    return env;
  }

  /**
   * Process the SDK result message into a promptfoo response object.
   */
  buildResponse(msg) {
    const raw = JSON.stringify(msg);
    const tokenUsage = {
      prompt: msg.usage?.input_tokens,
      completion: msg.usage?.output_tokens,
      total:
        msg.usage?.input_tokens && msg.usage?.output_tokens
          ? msg.usage.input_tokens + msg.usage.output_tokens
          : undefined,
    };
    const cost = msg.total_cost_usd ?? 0;

    if (msg.subtype === "success") {
      return { output: msg.result, tokenUsage, cost, raw };
    }
    return {
      error: `SDK call failed: ${msg.subtype}`,
      tokenUsage,
      cost,
      raw,
    };
  }

  async callApi(prompt, _context, callOptions) {
    if (/haiku/i.test(this.config.model || "")) {
      return { error: "Haiku is not permitted in Claude of Alexandria evaluations" };
    }
    const cwd = this.config.working_dir
      ? path.resolve(__dirname, this.config.working_dir)
      : "/tmp";

    const options = {
      ...this.buildOptions(cwd),
      env: this.buildEnv(),
      cwd,
    };
    if (/haiku/i.test(options.model || "")) {
      return { error: "Haiku is not permitted in Claude of Alexandria evaluations" };
    }

    const abortController = new AbortController();
    options.abortController = abortController;

    let abortHandler;
    if (callOptions?.abortSignal) {
      abortHandler = () =>
        abortController.abort(callOptions.abortSignal.reason);
      callOptions.abortSignal.addEventListener("abort", abortHandler);
      if (callOptions.abortSignal.aborted) abortHandler();
    }

    let releaseInput;
    try {
      const sdk = await this._loadSdk();
      // A string prompt closes SDK stdin after the first turn. Workflows are
      // background tasks: keep the session alive until their final report.
      const inputClosed = new Promise((resolve) => { releaseInput = resolve; });
      const sdkPrompt = this.config.wait_for_background
        ? (async function* () {
            yield { type: "user", session_id: "", message: { role: "user", content: prompt }, parent_tool_use_id: null };
            await inputClosed;
          })()
        : prompt;
      const res = await sdk.query({ prompt: sdkPrompt, options });
      let backgroundTasks = new Set();

      // Accumulate the trajectory (tool calls, skill loads, subagent dispatches)
      // as the SDK streams assistant messages, so assertions can check what the
      // agent ACTUALLY did rather than grepping the final prose for tool names.
      const toolCalls = [];
      const toolResults = [];
      const skillsLoaded = [];
      const subagents = [];
      const childLifecycle = [];
      const trajectory = [];
      const effectiveModels = new Set();

      const recordModels = (value, seen = new Set()) => {
        if (!value || typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
          if (key === "modelUsage" && child && typeof child === "object") {
            for (const model of Object.keys(child)) effectiveModels.add(model);
          }
          if (
            ["model", "model_id", "modelId", "model_name", "modelName"].includes(key) &&
            typeof child === "string"
          ) {
            effectiveModels.add(child);
          } else if (child && typeof child === "object") {
            recordModels(child, seen);
          }
        }
      };

      for await (const msg of res) {
        trajectory.push(msg);
        recordModels(msg);
        if (msg.type === "system" && msg.subtype === "background_tasks_changed") {
          backgroundTasks = new Set(msg.tasks.filter((task) => !task.ambient).map((task) => task.task_id));
        }
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block?.type !== "tool_use") continue;
            toolCalls.push({
              id: block.id ?? null,
              name: block.name,
              input: block.input,
              parentToolUseId: msg.parent_tool_use_id ?? null,
            });
            if (block.name === "Skill") {
              skillsLoaded.push(block.input?.command ?? block.input?.skill ?? "");
            } else if (block.name === "Task" || block.name === "Agent") {
              subagents.push(block.input?.subagent_type ?? block.input?.description ?? "");
            }
          }
        }
        if (msg.type === "user" && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block?.type !== "tool_result") continue;
            toolResults.push({
              toolUseId: block.tool_use_id ?? null,
              content: block.content ?? null,
              isError: block.is_error === true,
              parentToolUseId: msg.parent_tool_use_id ?? null,
            });
          }
        }
        if (
          msg.type === "system" &&
          ["task_started", "task_progress", "task_notification"].includes(msg.subtype)
        ) {
          childLifecycle.push(msg);
        }
        if (msg.type === "result") {
          if (this.config.wait_for_background && backgroundTasks.size > 0 && msg.subtype === "success") continue;
          const response = this.buildResponse(msg);
          response.metadata = {
            toolCalls,
            toolResults,
            skillsLoaded,
            subagents,
            childLifecycle,
            trajectory,
            structuredOutput: msg.structured_output ?? null,
            requestedModel: options.model ?? null,
            effectiveModels: [...effectiveModels],
            usage: msg.usage ?? null,
          };
          if ([...effectiveModels].some((model) => /haiku/i.test(model))) {
            response.error = "Haiku execution is not permitted; see effectiveModels and trajectory";
          }
          return response;
        }
      }

      return { error: "SDK call didn't return a result" };
    } catch (error) {
      if (error?.name === "AbortError" || callOptions?.abortSignal?.aborted) {
        return { error: "SDK call aborted" };
      }
      return { error: `Error calling SDK: ${error}` };
    } finally {
      releaseInput?.();
      if (callOptions?.abortSignal && abortHandler) {
        callOptions.abortSignal.removeEventListener("abort", abortHandler);
      }
    }
  }
}
