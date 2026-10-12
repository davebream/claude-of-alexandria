import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXEMPT_SKILLS, GROUNDED_SKILLS, groundingWarning } from "../../plugins/coa-desk/hooks/grounding.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every coa skill is classified as grounded or exempt", async () => {
  const skills = (await fs.readdir(path.join(ROOT, "plugins/claude-of-alexandria/skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `coa:${entry.name}`)
    .sort();
  assert.deepEqual([...GROUNDED_SKILLS, ...EXEMPT_SKILLS].sort(), skills);
});

test("warns when a grounded skill answered without a single lookup", () => {
  assert.match(
    groundingWarning({ skills: ["coa:consult-biblical-scholar"], lookups: 0, answer: "It means propitiation." }),
    /coa:consult-biblical-scholar answered without any coa data lookups/,
  );
});

test("stays quiet when lookups ran, when no grounded skill fired, or when the answer is a question", () => {
  assert.equal(groundingWarning({ skills: ["coa:exegetical-notes"], lookups: 3, answer: "Notes." }), null);
  assert.equal(groundingWarning({ skills: ["coa:smoke-test"], lookups: 0, answer: "OK" }), null);
  assert.equal(groundingWarning({ skills: [], lookups: 0, answer: "Hello" }), null);
  assert.equal(
    groundingWarning({ skills: ["coa:exegetical-notes"], lookups: 0, answer: "Which passage do you mean?" }),
    null,
  );
});
