/** Directly invokes the named plugin agent as the main SDK agent. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import SdkConsumerInstallProvider from "./sdk-consumer-install.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(HERE, "../../../plugins/claude-of-alexandria/agents");

export default class SdkDirectAgentProvider extends SdkConsumerInstallProvider {
  constructor(options = {}) {
    super({ ...options, id: options.id || "sdk-direct-agent" });
    if (!this.config.agent_name) {
      throw new Error("sdk-direct-agent requires config.agent_name");
    }
  }

  buildOptions(cwd) {
    return {
      ...super.buildOptions(cwd),
      agent: this.config.agent_name,
    };
  }

  expectedModelFamily() {
    const localName = this.config.agent_name.split(":").slice(1);
    const source = fs.readFileSync(path.join(AGENTS_DIR, ...localName) + ".md", "utf8");
    const family = source.match(/^model:\s*([^\s#]+)\s*$/m)?.[1];
    if (!family) throw new Error(`${this.config.agent_name} does not declare a model`);
    if (family.toLowerCase() !== "inherit") return family.toLowerCase();

    const inherited = this.config.model?.match(/(?:^|[-_])(haiku|sonnet|opus)(?:[-_]|$)/i)?.[1];
    if (!inherited) {
      throw new Error(
        `${this.config.agent_name} inherits its model, but the evaluation model family is unknown`,
      );
    }
    return inherited.toLowerCase();
  }

  async callApi(prompt, context, callOptions) {
    const response = await super.callApi(prompt, context, callOptions);
    if (response.error) return response;

    const expected = this.expectedModelFamily();
    const effective = response.metadata?.effectiveModels ?? [];
    const verified = effective.some((model) => model.toLowerCase().includes(expected));
    response.metadata = {
      ...(response.metadata ?? {}),
      expectedModelFamily: expected,
      effectiveModelVerified: verified,
    };
    if (!verified) {
      response.error = `Effective model mismatch for ${this.config.agent_name}: expected ${expected}, observed ${effective.join(", ") || "nothing"}`;
    }
    return response;
  }
}
