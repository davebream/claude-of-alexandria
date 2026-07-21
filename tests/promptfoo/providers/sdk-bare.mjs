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
        // RED runs on the CHEAPEST supported model, not the newest. RED asks
        // "does a bare model still need this skill?" — answered most honestly on
        // the weakest model a user might run, where documented failures reliably
        // reproduce. This also insulates RED from frontier-model drift. See
        // docs/adr/0002. (GREEN, the gate, is pinned to claude-sonnet-5.)
        model: "claude-haiku-4-5",
        working_dir: "/tmp",
        ...options.config,
      },
    });
  }

  buildOptions(_cwd) {
    return {
      model: this.config.model || "claude-haiku-4-5",
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
