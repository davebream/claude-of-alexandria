import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectDefinitions,
  inspectWorkflows,
} from "../../scripts/lib/plugin-validation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(HERE, "fixtures", name);

test("model policy rejects Haiku and inherited defaults but permits Sonnet and Opus", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-model-policy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "agents"));
  await fs.mkdir(path.join(root, "skills", "caller"), { recursive: true });
  for (const model of ["haiku", "claude-haiku-4-5", "inherit", "sonnet", "opus", "claude-opus-5-5"]) {
    await fs.writeFile(path.join(root, "agents", "reader.md"), `---\nname: reader\ndescription: Read evidence\nmodel: ${model}\n---\nRead evidence.\n`);
    await fs.writeFile(path.join(root, "skills", "caller", "SKILL.md"), `---\nname: caller\ndescription: Read evidence\nmodel: ${model}\n---\nRead evidence.\n`);
    const result = await inspectDefinitions(root, { pluginName: "fixture" });
    if (["sonnet", "opus", "claude-opus-5-5"].includes(model)) {
      assert.deepEqual(result.errors, [], model);
    } else {
      assert.ok(result.errors.some((error) => error.includes("agents/reader.md") && /model/i.test(error)), model);
      assert.ok(result.errors.some((error) => error.includes("skills/caller/SKILL.md") && /model/i.test(error)), model);
    }
  }
});

test("rejects duplicate YAML frontmatter keys", async () => {
  const result = await inspectDefinitions(fixture("duplicate-key"), {
    pluginName: "fixture",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicate key/i);
});

test("rejects fields ignored on plugin-shipped agents", async () => {
  const result = await inspectDefinitions(fixture("ignored-agent-field"), {
    pluginName: "fixture",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /permissionMode.*ignored/i);
});

test("rejects references to missing plugin agents", async () => {
  const result = await inspectDefinitions(fixture("missing-reference"), {
    pluginName: "fixture",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing-agent.*does not exist/i);
});

test("rejects a forked skill whose native agent does not exist", async () => {
  const result = await inspectDefinitions(fixture("missing-native-agent"), {
    pluginName: "fixture",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /native agent fixture:missing-agent does not exist/i);
});

test("rejects otherwise valid definitions outside discovery locations", async () => {
  const result = await inspectDefinitions(fixture("undiscovered-agent"), {
    pluginName: "fixture",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /not discovered/i);
});

test("rejects undiscovered or non-standalone workflow definitions", async () => {
  const result = await inspectWorkflows(fixture("bad-workflow"), {
    pluginName: "fixture",
    agentNames: new Set(),
  });
  const errors = result.errors.join("\n");

  assert.equal(result.ok, false);
  assert.match(errors, /workflows\/nested\/lost\.js.*not discovered/i);
  assert.match(errors, /meta name.*wrong-name.*bad/i);
  assert.match(errors, /module loading.*not supported/i);
  assert.match(errors, /undeclared.*not listed in meta\.phases/i);
  assert.match(errors, /workflow agent type fixture:missing-leaf does not exist/i);
});
