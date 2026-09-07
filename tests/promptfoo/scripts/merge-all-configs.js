#!/usr/bin/env node
/** Merge canonical RED/GREEN configs without changing their actual providers. */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("yaml");

const ROOT = path.resolve(__dirname, "..");

function findConfigs(kind) {
  const root = path.join(ROOT, kind);
  if (!fs.existsSync(root)) return [];
  const configs = [];
  for (const component of fs.readdirSync(root)) {
    for (const phase of ["red", "green"]) {
      const file = path.join(root, component, `promptfooconfig-${phase}.yaml`);
      if (fs.existsSync(file)) configs.push(file);
    }
  }
  return configs;
}

function normalizeFileReference(value, sourceFile) {
  if (typeof value !== "string" || !value.startsWith("file://")) return value;
  const referenced = value.slice("file://".length);
  const absolute = path.resolve(path.dirname(sourceFile), referenced);
  return `file://${path.relative(ROOT, absolute).split(path.sep).join("/")}`;
}

function normalizeProvider(provider, sourceFile) {
  if (typeof provider === "string") return normalizeFileReference(provider, sourceFile);
  return {
    ...provider,
    id: normalizeFileReference(provider.id, sourceFile),
  };
}

function loadConfig(file) {
  return yaml.parse(fs.readFileSync(file, "utf8"));
}

const configs = [
  ...findConfigs("skills"),
  ...findConfigs("agents"),
  ...findConfigs("workflows"),
  path.join(ROOT, "consumer-install/promptfooconfig-green.yaml"),
].filter((file) => fs.existsSync(file));

const tests = [];
for (const file of configs) {
  const config = loadConfig(file);
  const provider = normalizeProvider(config.providers[0], file);
  const defaultOptions = { ...(config.defaultTest?.options ?? {}) };
  if (defaultOptions.provider) {
    defaultOptions.provider = normalizeProvider(defaultOptions.provider, file);
  }
  const suite = path.relative(ROOT, path.dirname(file)).split(path.sep).join("/");
  for (const entry of config.tests ?? []) {
    tests.push({
      ...entry,
      description: `${suite} / ${entry.description ?? "scenario"}`,
      provider,
      options: { ...defaultOptions, ...(entry.options ?? {}) },
      assert: [...(config.defaultTest?.assert ?? []), ...(entry.assert ?? [])],
    });
  }
}

const merged = {
  description: "Claude of Alexandria — canonical RED and GREEN acceptance",
  providers: ["file://providers/sdk-bare.mjs"],
  prompts: ["{{prompt}}"],
  tests,
};

const outputPath = path.join(ROOT, "promptfooconfig-all.yaml");
fs.writeFileSync(outputPath, yaml.stringify(merged), "utf8");
console.log(`Wrote ${outputPath} with ${tests.length} tests.`);
