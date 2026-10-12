#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

import {
  checkMarketplaceEntries,
  findLegacyIdentifiers,
  inspectDefinitions,
  inspectWorkflows,
  nativeValidationTargets,
  readPluginIdentity,
  runNativeValidation,
} from "./lib/plugin-validation.mjs";
import { claudeBinary } from "./lib/claude-binary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_ROOT = path.join(ROOT, "tests", "promptfoo");

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateEvalCoverage(pluginName, inventory, workflowInventory) {
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
          if (!source.includes(`agent_name: ${pluginName}:${name}`)) {
            errors.push(`${relative(file)}: agent GREEN config must select ${pluginName}:${name}`);
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

const claudeBin = await claudeBinary(ROOT);
const errors = [...(await checkMarketplaceEntries(ROOT))];
const summary = [];
let nativeOk = true;

for (const target of await nativeValidationTargets(ROOT)) {
  const native = runNativeValidation(target, { claudeBin });
  if (!native.ok) {
    nativeOk = false;
    errors.push(`${relative(target)}: ${native.error}`);
  }
  if (target.endsWith(".json")) continue;

  const identity = await readPluginIdentity(target);
  const definitions = await inspectDefinitions(target, {
    serverSourceDir: path.join(ROOT, "server", "src"),
  });
  const workflows = await inspectWorkflows(target, {
    agentNames: new Set(definitions.inventory.agents),
  });
  errors.push(
    ...definitions.errors.map((error) => `${relative(target)}/${error}`),
    ...workflows.errors.map((error) => `${relative(target)}/${error}`),
  );
  if (identity) {
    errors.push(
      ...(await validateEvalCoverage(identity.name, definitions.inventory, workflows.inventory)),
    );
  }
  summary.push({ name: identity?.name ?? relative(target), definitions, workflows });
}
errors.push(...(await validateEvalReferences()));
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
errors.push(...(await findLegacyIdentifiers(ROOT, trackedFiles)));

console.log("=== COA Plugin Validation ===");
for (const { name, definitions, workflows } of summary) {
  console.log(
    `${name}: ${definitions.inventory.skills.length} skills, ${definitions.inventory.agents.length} agents, ${workflows.inventory.workflows.length} workflows`,
  );
}
console.log(`Native strict validation: ${nativeOk ? "passed" : "failed"}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`Validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("Definitions, tool wiring, references, native loading, and eval coverage are valid.");
