import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// coa runs exactly one small hook module: the model guard (ADR 0006). Anything
// more belongs in the opt-in coa-desk plugin, so that installing coa stays a
// low-trust decision.
const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/claude-of-alexandria");

test("coa ships only the model guard as code", async () => {
  const hooks = JSON.parse(await fs.readFile(path.join(CORE, "hooks", "hooks.json"), "utf8"));
  assert.deepEqual(hooks, { modules: ["./guard.ts"] });
  const files = (await fs.readdir(path.join(CORE, "hooks"))).sort();
  assert.deepEqual(files, ["guard.ts", "hooks.json"]);
});

test("the guard reaches no files, network, processes or models", async () => {
  const source = await fs.readFile(path.join(CORE, "hooks", "guard.ts"), "utf8");
  for (const api of ["$.fs.", "$.http.", "$.process.", "$.model.", "$.mcp.", "$.store.", "$.prompt.", "import "]) {
    assert.ok(!source.includes(api), `guard.ts must not use ${api}`);
  }
  assert.doesNotMatch(source, /model\s*:\s*['"`][^'"`]*haiku/i);
});
