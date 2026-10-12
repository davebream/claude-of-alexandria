import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { modPluginDirs, runModTests } from "../../scripts/lib/mod-tests.mjs";

async function fakeClaude(t, { stdout = "", exitCode = 0 }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "coa-fake-mod-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const log = path.join(dir, "args.log");
  const bin = path.join(dir, "claude");
  await fs.writeFile(
    bin,
    `#!/bin/sh\necho "$@" >> ${log}\nprintf '%s\\n' ${JSON.stringify(stdout)}\nexit ${exitCode}\n`,
    { mode: 0o755 },
  );
  return { bin, log };
}

const OFF = "claude plugin test: hooks modules are turned off in this process: the rollout switch served off";

test("runs claude plugin test once per mod directory and passes on success", async (t) => {
  const { bin, log } = await fakeClaude(t, { stdout: " 3 pass\n 0 fail" });
  const result = runModTests({ claudeBin: bin, pluginDirs: ["/a", "/b"], env: {} });
  assert.equal(result.code, 0);
  assert.deepEqual((await fs.readFile(log, "utf8")).trim().split("\n"), ["plugin test /a", "plugin test /b"]);
});

test("a failing test run fails", async (t) => {
  const { bin } = await fakeClaude(t, { stdout: " 1 fail", exitCode: 1 });
  const result = runModTests({ claudeBin: bin, pluginDirs: ["/a"], env: {} });
  assert.equal(result.code, 1);
});

test("mods switched off for this machine is a warning, not a failure", async (t) => {
  const { bin } = await fakeClaude(t, { stdout: OFF, exitCode: 1 });
  const result = runModTests({ claudeBin: bin, pluginDirs: ["/a"], env: {} });
  assert.equal(result.code, 0);
  assert.match(result.messages.join("\n"), /^::warning::.*mod tests skipped/m);
});

test("COA_REQUIRE_MOD_TESTS=1 turns the skip into a failure", async (t) => {
  const { bin } = await fakeClaude(t, { stdout: OFF, exitCode: 1 });
  const result = runModTests({ claudeBin: bin, pluginDirs: ["/a"], env: { COA_REQUIRE_MOD_TESTS: "1" } });
  assert.equal(result.code, 1);
});

test("only marketplace plugins with a hooks module are mod directories", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-mod-dirs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".claude-plugin"));
  await fs.mkdir(path.join(root, "plugins", "core"), { recursive: true });
  await fs.mkdir(path.join(root, "plugins", "mod", "hooks"), { recursive: true });
  await fs.writeFile(path.join(root, "plugins", "mod", "hooks", "hooks.json"), JSON.stringify({ modules: ["./register.ts"] }));
  await fs.writeFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ plugins: [{ name: "core", source: "./plugins/core" }, { name: "mod", source: "./plugins/mod" }] }),
  );
  assert.deepEqual(await modPluginDirs(root), [path.join(root, "plugins", "mod")]);
});
