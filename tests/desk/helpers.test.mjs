import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseRpcResponse, rpcBody } from "../../plugins/coa-desk/hooks/mcp.ts";
import { datasetIdsOf } from "../../plugins/coa-desk/hooks/provenance.ts";
import { createLedger } from "../../plugins/coa-desk/hooks/ledger.ts";
import { renderPassage } from "../../plugins/coa-desk/hooks/passage.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SSE = await fs.readFile(path.join(HERE, "fixtures", "parallel-text-rom-8-1-2.sse"), "utf8");

test("builds a JSON-RPC tools/call body", () => {
  assert.deepEqual(JSON.parse(rpcBody("parallel_text", { book: "Romans", range: "8:1" }, 7)), {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "parallel_text", arguments: { book: "Romans", range: "8:1" } },
  });
});

test("reads the structured payload from an SSE-framed response", () => {
  const response = parseRpcResponse(SSE);
  assert.equal(response.isError, false);
  assert.equal(response.payload.book, "Romans");
  assert.equal(response.payload.verses.length, 2);
});

test("reports tool errors and JSON-RPC errors", () => {
  const toolError = JSON.stringify({ result: { isError: true, content: [{ type: "text", text: '{"error":{"code":"BOOK_NOT_FOUND","message":"No book named Hezekiah"}}' }] } });
  assert.deepEqual(
    { isError: parseRpcResponse(toolError).isError, message: parseRpcResponse(toolError).message },
    { isError: true, message: "No book named Hezekiah" },
  );
  const rpcError = JSON.stringify({ error: { code: -32602, message: "Invalid params" } });
  assert.equal(parseRpcResponse(rpcError).message, "Invalid params");
  assert.equal(parseRpcResponse("not json").isError, true);
});

test("finds dataset ids in every shape a tool result can take", () => {
  const payload = JSON.parse(SSE.split("\n").find((line) => line.startsWith("data: ")).slice(6)).result;
  const expected = ["bible_bsb", "bible_kjv"];
  assert.deepEqual(datasetIdsOf(payload), expected);
  assert.deepEqual(datasetIdsOf(payload.structuredContent), expected);
  assert.deepEqual(datasetIdsOf(payload.content[0].text), expected);
  assert.deepEqual(datasetIdsOf({ ref: 1, result: payload, text: payload.content[0].text }), expected);
  assert.deepEqual(datasetIdsOf({ ref: 1, result: "plain words", text: "plain words" }), []);
  assert.deepEqual(datasetIdsOf(undefined), []);
});

test("the ledger summarises the turn's lookups and keeps the session's", () => {
  const ledger = createLedger();
  ledger.startTurn();
  assert.equal(ledger.turnSummary(), null);
  ledger.record({ tool: "bible_lookup", target: "Romans 8:1-4", datasetIds: ["bible_bsb"], isError: false });
  ledger.record({ tool: "bible_lookup", target: "Romans 8:5-8", datasetIds: ["bible_bsb"], isError: false });
  ledger.record({ tool: "query_morphology", target: "Romans 8:1-4", datasetIds: ["opengnt"], isError: false, agentId: "a1" });
  ledger.record({ tool: "query_lexicon", target: "", datasetIds: [], isError: true });
  assert.equal(
    ledger.turnSummary(),
    "Grounded in 3 lookups: bible_lookup ×2, query_morphology · data: bible_bsb, opengnt · 1 failed lookup",
  );
  ledger.startTurn();
  assert.equal(ledger.turnSummary(), null);
  assert.equal(ledger.sessionEntries().length, 4);
  ledger.reset();
  assert.equal(ledger.sessionEntries().length, 0);
});

test("renders a passage as Markdown with its sources", () => {
  const markdown = renderPassage(parseRpcResponse(SSE).payload);
  assert.match(markdown, /^## Romans 8:1-2/);
  assert.match(markdown, /\*\*8:1\*\*/);
  assert.match(markdown, /BSB/);
  assert.match(markdown, /KJV/);
  assert.match(markdown, /Sources: Berean Standard Bible/);
});

test("the ledger tracks the skills fired and the successful lookups of the turn", () => {
  const ledger = createLedger();
  ledger.startTurn();
  ledger.noteSkill("coa:exegetical-notes");
  ledger.noteSkill("coa:exegetical-notes");
  ledger.record({ tool: "query_lexicon", target: "", datasetIds: [], isError: true });
  assert.deepEqual(ledger.turnSkills(), ["coa:exegetical-notes"]);
  assert.equal(ledger.turnLookups(), 0);
  ledger.record({ tool: "bible_lookup", target: "John 3:16", datasetIds: ["bible_bsb"], isError: false });
  assert.equal(ledger.turnLookups(), 1);
  ledger.startTurn();
  assert.deepEqual(ledger.turnSkills(), []);
});
