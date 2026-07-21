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
    const sdk = await this._loadSdk();

    const cwd = this.config.working_dir
      ? path.resolve(__dirname, this.config.working_dir)
      : "/tmp";

    const options = {
      ...this.buildOptions(cwd),
      env: this.buildEnv(),
      cwd,
    };

    const abortController = new AbortController();
    options.abortController = abortController;

    let abortHandler;
    if (callOptions?.abortSignal) {
      abortHandler = () =>
        abortController.abort(callOptions.abortSignal.reason);
      callOptions.abortSignal.addEventListener("abort", abortHandler);
    }

    try {
      const res = await sdk.query({ prompt, options });

      // Accumulate the trajectory (tool calls, skill loads, subagent dispatches)
      // as the SDK streams assistant messages, so assertions can check what the
      // agent ACTUALLY did rather than grepping the final prose for tool names.
      const toolCalls = [];
      const skillsLoaded = [];
      const subagents = [];

      for await (const msg of res) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block?.type !== "tool_use") continue;
            toolCalls.push({ name: block.name, input: block.input });
            if (block.name === "Skill") {
              skillsLoaded.push(block.input?.command ?? block.input?.skill ?? "");
            } else if (block.name === "Task" || block.name === "Agent") {
              subagents.push(block.input?.subagent_type ?? block.input?.description ?? "");
            }
          }
        }
        if (msg.type === "result") {
          const response = this.buildResponse(msg);
          response.metadata = { toolCalls, skillsLoaded, subagents };
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
      if (callOptions?.abortSignal && abortHandler) {
        callOptions.abortSignal.removeEventListener("abort", abortHandler);
      }
    }
  }
}
