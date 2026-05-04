/**
 * Grading provider for llm-rubric assertions.
 *
 * Minimal isolation — grader only needs basic model inference,
 * no tools, no MCP, no plugins. Used as defaultTest.options.provider.
 *
 * Usage in promptfooconfig.yaml:
 *   defaultTest:
 *     options:
 *       provider: file://../../providers/sdk-grader.mjs
 */
import SdkProvider from "./sdk-provider.mjs";

export default class SdkGraderProvider extends SdkProvider {
  constructor(options = {}) {
    super({
      ...options,
      id: options.id || "sdk-grader",
      config: {
        model: "claude-sonnet-4-6-20250514",
        working_dir: "/tmp",
        ...options.config,
      },
    });
  }

  buildOptions(_cwd) {
    return {
      model: this.config.model || "claude-sonnet-4-6-20250514",
      tools: [],          // No tools needed for grading
      mcpServers: {},
      plugins: [],
      settingSources: [],
      strictMcpConfig: true,
      permissionMode: "dontAsk",
      persistSession: false,
    };
  }
}
