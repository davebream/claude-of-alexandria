import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { BOOKS_PATH, generateDeskBooks } from "../../scripts/generate-desk-books.mjs";

test("plugins/coa-desk/hooks/books.ts matches the server's book table", async () => {
  assert.equal(await fs.readFile(BOOKS_PATH, "utf8"), await generateDeskBooks());
});
