#!/usr/bin/env node
// Runs `claude plugin test` for every marketplace plugin that ships a hooks
// module (a mod). See scripts/lib/mod-tests.mjs for the skip rule.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { modPluginDirs, runModTests } from "./lib/mod-tests.mjs";
import { claudeBinary } from "./lib/claude-binary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDirs = await modPluginDirs(ROOT);
if (pluginDirs.length === 0) {
  console.log("No mods to test.");
  process.exit(0);
}
const { code, messages } = runModTests({ claudeBin: await claudeBinary(ROOT), pluginDirs });
for (const message of messages) console.log(message);
process.exit(code);
