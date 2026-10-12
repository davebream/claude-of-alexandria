import assert from "node:assert/strict";
import test from "node:test";

import { BOOKS } from "../../plugins/coa-desk/hooks/books.ts";
import { parseReference, suggestBooks } from "../../plugins/coa-desk/hooks/reference.ts";

test("parses a book, a range and optional translations", () => {
  assert.deepEqual(parseReference("Rom 8:1-4", BOOKS), {
    book: "Romans",
    range: "8:1-4",
    translations: [],
  });
  assert.deepEqual(parseReference("1 cor 13:4-7 kjv,bsb", BOOKS), {
    book: "1 Corinthians",
    range: "13:4-7",
    translations: ["KJV", "BSB"],
  });
  assert.deepEqual(parseReference("Song of Songs 2:1 web", BOOKS), {
    book: "Song of Songs",
    range: "2:1",
    translations: ["WEB"],
  });
});

test("explains what is wrong with a reference it cannot use", () => {
  assert.match(parseReference("", BOOKS).error, /Usage/);
  assert.match(parseReference("Hezekiah 3:1", BOOKS).error, /book/i);
  assert.match(parseReference("Romans", BOOKS).error, /chapter:verse/);
  assert.match(parseReference("Romans 8:1 NIV", BOOKS).error, /BSB, WEB, KJV, ASV, YLT, DBY/);
});

test("suggests books for a typed prefix, aliases included", () => {
  assert.deepEqual(suggestBooks("rom", BOOKS).map((row) => row.text), ["Romans"]);
  assert.ok(suggestBooks("1co", BOOKS).some((row) => row.text === "1 Corinthians"));
  assert.ok(suggestBooks("phm", BOOKS).length <= 1);
  assert.deepEqual(suggestBooks("r", BOOKS), []);
  assert.deepEqual(suggestBooks("8:1", BOOKS), []);
});

test("the book table covers all 66 books", () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(BOOKS.filter((book) => book.testament === "ot").length, 39);
});
