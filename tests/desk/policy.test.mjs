import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../plugins/coa-desk/hooks");

test("coa-desk never selects a Haiku model", async () => {
  for (const name of await fs.readdir(HOOKS)) {
    const source = await fs.readFile(path.join(HOOKS, name), "utf8");
    assert.doesNotMatch(source, /model\s*:\s*['"`][^'"`]*haiku/i, name);
  }
});

test("coa-desk calls only the coa server", async () => {
  for (const name of await fs.readdir(HOOKS)) {
    const source = await fs.readFile(path.join(HOOKS, name), "utf8");
    for (const [url] of source.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      assert.match(url, /^https:\/\/coa\.davebream\.com\//, `${name}: ${url}`);
    }
  }
});
