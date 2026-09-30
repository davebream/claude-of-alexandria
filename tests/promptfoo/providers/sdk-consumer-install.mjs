/**
 * Consumer-install provider: exercises the plugin from a clean directory with
 * its real MCP declaration and no injected behavioral instructions.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import SdkProvider from "./sdk-provider.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, "../../../plugins/claude-of-alexandria");
const pluginManifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, ".claude-plugin/plugin.json"), "utf8"));
const pluginMcp = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, ".mcp.json"), "utf8"));
// Strict isolation excludes even plugin-discovered MCP servers. Forward the
// shipped declaration explicitly, using its native plugin namespace.
const MCP_SERVERS = Object.fromEntries(Object.entries(pluginMcp.mcpServers).map(
  ([name, config]) => [`plugin_${pluginManifest.name}_${name}`, config],
));
const CONSUMER_DIR = path.join(os.tmpdir(), "coa-consumer-install-evals");
fs.mkdirSync(CONSUMER_DIR, { recursive: true });

export default class SdkConsumerInstallProvider extends SdkProvider {
  constructor(options = {}) {
    super({
      ...options,
      id: options.id || "sdk-consumer-install",
      config: {
        model: "claude-sonnet-5",
        working_dir: CONSUMER_DIR,
        max_turns: 50,
        ...options.config,
      },
    });
  }

  buildOptions() {
    return {
      model: this.config.model,
      // An omitted SDK systemPrompt becomes an empty override, erasing the
      // selected native agent's instructions. Use the native preset, no append.
      systemPrompt: { type: "preset", preset: "claude_code" },
      plugins: [{ type: "local", path: PLUGIN_DIR }],
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: MCP_SERVERS,
      allowedTools: [
        "Agent",
        "Skill",
        "Workflow",
        "Read",
        "WebSearch",
        "WebFetch",
        "mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__*",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: this.config.max_turns,
      persistSession: false,
    };
  }
}
