#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

import {
  inspectDefinitions,
  inspectWorkflows,
  runNativeValidation,
} from "./lib/plugin-validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = path.join(ROOT, "plugins", "claude-of-alexandria");
const EVAL_ROOT = path.join(ROOT, "tests", "promptfoo");

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function bundledClaudePath() {
  const platform = process.platform;
  const arch = process.arch === "x64" ? "x64" : "arm64";
  const suffix = platform === "win32" ? ".exe" : "";
  return path.join(
    ROOT,
    "node_modules",
    "@anthropic-ai",
    `claude-code-${platform}-${arch}`,
    `claude${suffix}`,
  );
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateEvalCoverage(inventory, workflowInventory) {
  const errors = [];
  const groups = [
    ["skills", inventory.skills],
    ["agents", inventory.agents],
  ];
  for (const [kind, names] of groups) {
    for (const name of names) {
      for (const phase of ["red", "green"]) {
        const file = path.join(
          EVAL_ROOT,
          kind,
          name,
          `promptfooconfig-${phase}.yaml`,
        );
        if (!(await exists(file))) {
          errors.push(`${relative(file)}: required eval config is missing`);
          continue;
        }
        const source = await fs.readFile(file, "utf8");
        if (phase === "red" && !source.includes("providers/sdk-bare.mjs")) {
          errors.push(`${relative(file)}: RED config must use sdk-bare.mjs`);
        }
        if (phase === "green" && kind === "agents") {
          if (!source.includes("providers/sdk-direct-agent.mjs")) {
            errors.push(`${relative(file)}: agent GREEN config must use sdk-direct-agent.mjs`);
          }
          if (!source.includes(`agent_name: claude-of-alexandria:${name}`)) {
            errors.push(`${relative(file)}: agent GREEN config must select claude-of-alexandria:${name}`);
          }
        }
        if (
          phase === "green" &&
          kind === "skills" &&
          !source.includes("providers/sdk-with-skill.mjs") &&
          !source.includes("providers/sdk-consumer-install.mjs")
        ) {
          errors.push(
            `${relative(file)}: skill GREEN config must use a skill or consumer-install provider`,
          );
        }
      }
    }
  }

  for (const workflow of workflowInventory.workflows) {
    for (const phase of ["red", "green"]) {
      const file = path.join(
        EVAL_ROOT,
        "workflows",
        workflow,
        `promptfooconfig-${phase}.yaml`,
      );
      if (!(await exists(file))) {
        errors.push(`${relative(file)}: required workflow eval config is missing`);
        continue;
      }
      const source = await fs.readFile(file, "utf8");
      const requiredProvider = phase === "red"
        ? "providers/sdk-bare.mjs"
        : "providers/sdk-consumer-install.mjs";
      if (!source.includes(requiredProvider)) {
        errors.push(`${relative(file)}: workflow ${phase.toUpperCase()} config must use ${requiredProvider}`);
      }
    }
  }
  return errors;
}

async function validateEvalReferences() {
  const errors = [];
  const roots = [
    "skills",
    "agents",
    "workflows",
    "consumer-install",
    "integration",
    "smoke",
    "assertions",
  ];
  for (const root of roots) {
    const dir = path.join(EVAL_ROOT, root);
    if (!(await exists(dir))) continue;
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      const rel = relative(file);
      const document = parseDocument(await fs.readFile(file, "utf8"), {
        uniqueKeys: true,
      });
      if (document.errors.length > 0) {
        errors.push(`${rel}: ${document.errors.map((error) => error.message).join("; ")}`);
        continue;
      }
      const text = await fs.readFile(file, "utf8");
      for (const match of text.matchAll(/file:\/\/([^\s"'\]}]+)/g)) {
        const reference = match[1]
          .replace(/\\:/g, ":")
          .replace(/(\.m?js):[A-Za-z_$][\w$]*$/, "$1");
        const target = path.resolve(path.dirname(file), reference);
        if (!(await exists(target))) {
          errors.push(`${rel}: referenced file does not exist: ${reference}`);
        }
      }
    }
  }
  return errors;
}

const definitions = await inspectDefinitions(PLUGIN_DIR, {
  pluginName: "claude-of-alexandria",
  serverSourceDir: path.join(ROOT, "server", "src"),
});
const workflows = await inspectWorkflows(PLUGIN_DIR, {
  pluginName: "claude-of-alexandria",
  agentNames: new Set(definitions.inventory.agents),
});
const native = runNativeValidation(PLUGIN_DIR, {
  claudeBin: process.env.CLAUDE_BIN ||
    ((await exists(bundledClaudePath()))
      ? bundledClaudePath()
      : "claude"),
});
const errors = [
  ...definitions.errors,
  ...workflows.errors,
  ...(native.ok ? [] : [native.error]),
  ...(await validateEvalCoverage(definitions.inventory, workflows.inventory)),
  ...(await validateEvalReferences()),
];

console.log("=== COA Plugin Validation ===");
console.log(`Agents discovered: ${definitions.inventory.agents.length}`);
console.log(`Skills discovered: ${definitions.inventory.skills.length}`);
console.log(`Workflows discovered: ${workflows.inventory.workflows.length}`);
console.log(`Native strict validation: ${native.ok ? "passed" : "failed"}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`Validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("Definitions, tool wiring, references, native loading, and eval coverage are valid.");
