import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// `claude plugin test` prints this when installed mods cannot load in this
// process, for example when Anthropic's rollout switch is off for the account
// or no signed-in session has refreshed it yet.
const MODS_OFF = /claude plugin test: hooks modules are turned off/;

export async function modPluginDirs(root) {
  const marketplace = JSON.parse(
    await fs.readFile(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"),
  );
  const dirs = [];
  for (const entry of marketplace.plugins ?? []) {
    if (typeof entry.source !== "string") continue;
    const dir = path.resolve(root, entry.source);
    try {
      const hooks = JSON.parse(await fs.readFile(path.join(dir, "hooks", "hooks.json"), "utf8"));
      if (Array.isArray(hooks.modules) && hooks.modules.length > 0) dirs.push(dir);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return dirs;
}

export function runModTests({ claudeBin, pluginDirs, env = process.env }) {
  const messages = [];
  let code = 0;
  for (const dir of pluginDirs) {
    const run = spawnSync(claudeBin, ["plugin", "test", dir], { encoding: "utf8" });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    messages.push(output.trimEnd());
    if (run.status === 0) continue;
    if (MODS_OFF.test(output) && env.COA_REQUIRE_MOD_TESTS !== "1") {
      messages.push(
        `::warning::mod tests skipped for ${path.basename(dir)}: hooks modules are turned off in this environment (set COA_REQUIRE_MOD_TESTS=1 to fail instead)`,
      );
      continue;
    }
    code = 1;
  }
  return { code, messages };
}
