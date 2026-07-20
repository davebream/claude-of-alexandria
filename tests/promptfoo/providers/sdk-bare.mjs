/**
 * RED-phase provider: bare model, no tools, no MCP, no plugins.
 *
 * Isolation guarantees:
 *   - tools: []           → no built-in tools available
 *   - mcpServers: {}      → no MCP servers
 *   - plugins: []         → no plugin loading
 *   - settingSources: []  → no settings files (not even project CLAUDE.md)
 *   - permissionMode: dontAsk → deny tool use if any slip through
 *   - strictMcpConfig: true → ignore any ambient MCP config
 *
 * Usage in promptfooconfig.yaml:
 *   providers:
 *     - file://../../providers/sdk-bare.mjs
 */
import SdkProvider from "./sdk-provider.mjs";

export default class SdkBareProvider extends SdkProvider {
  constructor(options = {}) {
    super({
      ...options,
      id: options.id || "sdk-bare",
      config: {
        model: "claude-sonnet-5",
        working_dir: "/tmp",
        ...options.config,
      },
    });
  }

  buildOptions(_cwd) {
    return {
      model: this.config.model || "claude-sonnet-5",
      tools: [],              // No built-in tools
      mcpServers: {},         // No MCP servers
      plugins: [],            // No plugins
      settingSources: [],     // No settings files
      strictMcpConfig: true,
      permissionMode: "dontAsk",
      persistSession: false,
    };
  }
}
