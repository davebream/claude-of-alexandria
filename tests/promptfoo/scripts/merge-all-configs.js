#!/usr/bin/env node
/**
 * Merges all RED and GREEN promptfooconfigs into a single config so one
 * promptfoo run executes every test with results in one report.
 * Each test keeps its provider (without-skill for RED, with-skill for GREEN).
 *
 * Run from tests/promptfoo: node scripts/merge-all-configs.js
 * Output: promptfooconfig-all.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const PROVIDER_WITHOUT = 'file://providers/sdk-bare.mjs';
const PROVIDER_WITH = 'file://providers/sdk-with-skill.mjs';
const PROVIDER_GRADER = 'file://providers/sdk-grader.mjs';

function findConfigs(dir, basename) {
  const out = [];
  if (!fs.existsSync(path.join(ROOT, dir))) return out;
  for (const sub of fs.readdirSync(path.join(ROOT, dir))) {
    const p = path.join(dir, sub, basename);
    if (fs.existsSync(path.join(ROOT, p))) out.push(p);
  }
  return out;
}

const RED_GLOB = [
  ...findConfigs('skills', 'promptfooconfig-red.yaml'),
  ...findConfigs('agents', 'promptfooconfig-red.yaml'),
];
const GREEN_GLOB = [
  ...findConfigs('skills', 'promptfooconfig-green.yaml'),
  ...findConfigs('agents', 'promptfooconfig-green.yaml'),
];

function loadConfig(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return yaml.parse(raw);
}

function suiteName(relativePath) {
  const match = relativePath.match(/^(skills|agents)\/([^/]+)\//);
  return match ? match[2] : path.dirname(relativePath);
}

function collectTests() {
  const tests = [];

  for (const rel of RED_GLOB) {
    const config = loadConfig(rel);
    const suite = suiteName(rel);
    const testList = config.tests || [];
    for (const t of testList) {
      tests.push({
        description: `${suite} / ${t.description || 'RED'}`,
        provider: PROVIDER_WITHOUT,
        vars: t.vars,
        assert: t.assert || [],
      });
    }
  }

  for (const rel of GREEN_GLOB) {
    const config = loadConfig(rel);
    const suite = suiteName(rel);
    const defaultAssert = (config.defaultTest && config.defaultTest.assert) || [];
    const testList = config.tests || [];
    for (const t of testList) {
      const assert = [...defaultAssert, ...(t.assert || [])];
      tests.push({
        description: `${suite} / ${t.description || 'GREEN'}`,
        provider: PROVIDER_WITH,
        vars: t.vars,
        assert,
      });
    }
  }

  return tests;
}

// NOTE: No top-level providers array. Each test has its own `provider` field
// (sdk-bare for RED, sdk-with-skill for GREEN). If we listed both providers
// at the top level, promptfoo would run every test against every provider
// (matrix mode), doubling the run and mixing RED/GREEN providers incorrectly.
// Instead we use a single dummy entry so promptfoo doesn't complain, but it
// is overridden by the per-test provider field on every test.
const merged = {
  description: 'Claude of Alexandria — all skills RED + GREEN (single run, one report)',
  providers: [PROVIDER_WITHOUT],  // overridden per-test; just needs one entry
  prompts: ['{{prompt}}'],
  defaultTest: {
    options: {
      provider: PROVIDER_GRADER,
    },
  },
  tests: collectTests(),
};

const outPath = path.join(ROOT, 'promptfooconfig-all.yaml');
fs.writeFileSync(outPath, yaml.stringify(merged), 'utf8');
console.log(`Wrote ${outPath} with ${merged.tests.length} tests.`);
