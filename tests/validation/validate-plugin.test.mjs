import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkMarketplaceEntries,
  findLegacyIdentifiers,
  inspectDefinitions,
  inspectWorkflows,
  nativeValidationTargets,
  readPluginIdentity,
  runNativeValidation,
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

async function scratchPlugin(t, { name = "demo", mcpKey = "data", files = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  if (name !== null) {
    await fs.writeFile(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name, version: "1.0.0", description: "Scratch plugin" }),
    );
  }
  if (mcpKey) {
    await fs.writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { [mcpKey]: { type: "http", url: "https://example.com/mcp" } } }),
    );
  }
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}

const agent = (name, extra = "", body = "Read evidence.") =>
  `---\nname: ${name}\ndescription: Read evidence\nmodel: sonnet\n${extra}---\n${body}\n`;

test("plugin identity comes from plugin.json, not the directory name", async (t) => {
  const root = await scratchPlugin(t, { name: "demo", mcpKey: "data" });
  const identity = await readPluginIdentity(root);
  assert.equal(identity.name, "demo");
  assert.deepEqual(identity.mcpPrefixes, ["mcp__plugin_demo_data__"]);
});

test("a plugin directory without plugin.json is reported", async (t) => {
  const root = await scratchPlugin(t, { name: null, files: { "agents/reader.md": agent("reader") } });
  const result = await inspectDefinitions(root);
  assert.match(result.errors.join("\n"), /plugin\.json/);
});

test("MCP tools must use the prefix derived from the manifests", async (t) => {
  const root = await scratchPlugin(t, {
    files: {
      "agents/good.md": agent("good", "tools: mcp__plugin_demo_data__bible_lookup\n"),
      "agents/stale.md": agent("stale", "tools: mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__bible_lookup\n"),
    },
  });
  const errors = (await inspectDefinitions(root)).errors.join("\n");
  assert.doesNotMatch(errors, /agents\/good\.md/);
  assert.match(errors, /agents\/stale\.md: MCP tool uses unsupported plugin prefix/);
});

test("namespaced references to another plugin's namespace are errors", async (t) => {
  const root = await scratchPlugin(t, {
    files: {
      "agents/reader.md": agent("reader"),
      "agents/caller.md": agent("caller", "skills: other:notes\n", '```\nsubagent_type: "other:reader"\n```'),
      "skills/fork/SKILL.md": "---\nname: fork\ndescription: Fork\ncontext: fork\nagent: other:reader\n---\nGo.\n",
      "skills/ok/SKILL.md": "---\nname: ok\ndescription: Ok\n---\n```\nsubagent_type: \"demo:reader\"\nsubagent_type: \"general-purpose\"\n```\n",
    },
  });
  const errors = (await inspectDefinitions(root)).errors.join("\n");
  assert.match(errors, /agents\/caller\.md: .*other:reader.*namespace/);
  assert.match(errors, /agents\/caller\.md: .*other:notes.*namespace/);
  assert.match(errors, /skills\/fork\/SKILL\.md: .*other:reader.*namespace/);
  assert.doesNotMatch(errors, /skills\/ok\/SKILL\.md/);
});

test("workflow agent types in another namespace are errors", async (t) => {
  const root = await scratchPlugin(t, {
    files: {
      "workflows/flow.js": 'export const meta = { name: "flow", description: "Flow", phases: ["a"] };\nphase("a");\nagent("x", { agentType: "other:reader" });\n',
    },
  });
  const result = await inspectWorkflows(root, { agentNames: new Set(["reader"]) });
  assert.match(result.errors.join("\n"), /other:reader.*namespace/);
});

test("autoCompactWindow is accepted only as a positive integer", async (t) => {
  const root = await scratchPlugin(t, {
    files: {
      "agents/good.md": agent("good", "autoCompactWindow: 120000\n"),
      "agents/bad.md": agent("bad", "autoCompactWindow: big\n"),
    },
  });
  const errors = (await inspectDefinitions(root)).errors.join("\n");
  assert.doesNotMatch(errors, /agents\/good\.md/);
  assert.match(errors, /agents\/bad\.md: autoCompactWindow must be a positive integer/);
});

async function scratchMarketplace(t, entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-marketplace-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".claude-plugin"));
  const plugins = [];
  for (const entry of entries) {
    const dir = path.join(root, "plugins", entry.dir);
    await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: entry.manifestName ?? entry.name, version: entry.manifestVersion ?? entry.version }),
    );
    plugins.push({ name: entry.name, version: entry.version, source: `./plugins/${entry.dir}` });
  }
  await fs.writeFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "mkt", owner: { name: "x" }, plugins }),
  );
  return root;
}

test("native validation targets the marketplace and every listed plugin", async (t) => {
  const root = await scratchMarketplace(t, [
    { dir: "core", name: "core", version: "1.0.0" },
    { dir: "extra", name: "extra", version: "0.1.0" },
  ]);
  const targets = await nativeValidationTargets(root);
  assert.deepEqual(targets, [
    path.join(root, ".claude-plugin", "marketplace.json"),
    path.join(root, "plugins", "core"),
    path.join(root, "plugins", "extra"),
  ]);
});

test("runNativeValidation passes the target to claude plugin validate --strict --json", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "coa-fake-claude-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const log = path.join(dir, "args.log");
  const bin = path.join(dir, "claude");
  await fs.writeFile(bin, `#!/bin/sh\necho "$@" >> ${log}\necho '{"success":true}'\n`, { mode: 0o755 });
  const result = runNativeValidation("/some/target", { claudeBin: bin });
  assert.equal(result.ok, true);
  assert.equal((await fs.readFile(log, "utf8")).trim(), "plugin validate --strict --json /some/target");
});

test("marketplace entries must match their plugin.json name and version", async (t) => {
  const root = await scratchMarketplace(t, [
    { dir: "core", name: "core", version: "1.0.0" },
    { dir: "renamed", name: "fresh", manifestName: "stale", version: "1.0.0" },
    { dir: "drift", name: "drift", version: "2.0.0", manifestVersion: "1.9.0" },
  ]);
  const errors = (await checkMarketplaceEntries(root)).join("\n");
  assert.doesNotMatch(errors, /"core"/);
  assert.match(errors, /"fresh".*name.*"stale"/);
  assert.match(errors, /"drift".*version.*2\.0\.0.*1\.9\.0/);
});

test("legacy plugin identifiers are rejected outside historical records", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-legacy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = {
    "skills/a/SKILL.md": "Call mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__bible_lookup.",
    "agents/b.md": 'subagent_type: "claude-of-alexandria:data-retriever"',
    "README.md": "/plugin install claude-of-alexandria@claude-of-alexandria",
    "tests/c.mjs": 'const KEY = "plugin_claude-of-alexandria_claude-of-alexandria-mcp";',
    "paths.md": "See plugins/claude-of-alexandria/skills and davebream/claude-of-alexandria.",
    "manifest.json": '{"renames": {"claude-of-alexandria": "coa"}}',
    "CHANGELOG.md": "Old: claude-of-alexandria:deep-study",
    "docs/adr/0003-old.md": "claude-of-alexandria:deep-study",
    "docs/incidents/x.md": "claude-of-alexandria:deep-study",
    "docs/v6-rename-migration.md": "claude-of-alexandria@claude-of-alexandria",
  };
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  const errors = (await findLegacyIdentifiers(root, Object.keys(files))).join("\n");
  for (const flagged of ["skills/a/SKILL.md", "agents/b.md", "README.md", "tests/c.mjs"]) {
    assert.match(errors, new RegExp(flagged.replaceAll(".", "\\.")), flagged);
  }
  for (const allowed of ["paths.md", "manifest.json", "CHANGELOG.md", "docs/adr", "docs/incidents", "docs/v6-rename-migration.md"]) {
    assert.doesNotMatch(errors, new RegExp(allowed.replaceAll(".", "\\.")), allowed);
  }
});
