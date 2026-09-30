import assert from "node:assert/strict";
import test from "node:test";
import evidence from "../promptfoo/assertions/retrieval-evidence.cjs";

function context() {
  const word = (verse, strongs) => ({ verse, strongs, parsing: {
    stem: "Pual", conjugation: "passive_participle", gender: "masculine",
  } });
  const data = [
    ["query_lemmas", { lemmas: [{ lemma: "H2339", testament: "ot", total_occurrences: 7 }] }],
    ["query_morphology", { book: "Ecclesiastes", words: [word("4:12", "H8027"), word("10:16", "H0337"), word("9:5", "H7939")] }],
    ["query_morphology", { book: "Genesis", words: [word("15:9", "H8027")] }],
    ["query_paragraph_breaks", { book: "Ecclesiastes", chapter_range: "4", markers: [], evidence_scope: { absence_does_not_attest: ["no_literary_unit_boundary"] } }],
    ["commentary_lookup", { book: "Ecclesiastes", entries: [{ commentary: "keil-delitzsch", chapter: 4, verse_start: 12, verse_end: 12, text: "source text" }] }],
  ];
  return { vars: { independent_verification: true }, providerResponse: { metadata: {
    toolCalls: data.map(([name], id) => ({ id, name: "mcp__test__" + name, parentToolUseId: null })),
    toolResults: data.map(([, packet], id) => ({ toolUseId: id, content: [{ type: "text", text: JSON.stringify(packet) }], isError: false })),
  } } };
}

test("source assertion accepts complete parent verification including empty markers with warnings", () => {
  assert.equal(evidence("", context()).pass, true);
});

test("paragraph checks accept a wider chapter range that actually includes the claim", () => {
  const c = context();
  const result = c.providerResponse.metadata.toolResults[3];
  const packet = JSON.parse(result.content[0].text);
  packet.chapter_range = "3-5";
  result.content = JSON.stringify(packet);
  assert.equal(evidence("", c).pass, true);
  packet.chapter_range = "1-3";
  result.content = JSON.stringify(packet);
  assert.equal(evidence("", c).pass, false);
});

test("source assertion rejects prose-only, failed, empty, partial and delegated evidence", () => {
  assert.equal(evidence("I called all tools and checked everything", {}).pass, false);
  for (const mutate of [
    c => { c.providerResponse.metadata.toolResults[0].isError = true; },
    c => { c.providerResponse.metadata.toolResults[0].content = []; },
    c => { c.providerResponse.metadata.toolResults[0].content = { isError: true, content: c.providerResponse.metadata.toolResults[0].content }; },
    c => { const result = c.providerResponse.metadata.toolResults[0]; result.content = { ...JSON.parse(result.content[0].text), truncated: true }; },
    c => { c.providerResponse.metadata.toolResults[0].content = JSON.stringify({ page: { next_cursor: "more" }, lemmas: [{ lemma: "H2339", testament: "ot", total_occurrences: 7 }] }); },
    c => { c.providerResponse.metadata.toolCalls[0].parentToolUseId = "retriever"; },
  ]) {
    const c = context(); mutate(c);
    assert.equal(evidence("all verified", c).pass, false);
  }
});

test("source assertion retains evidence on earlier pages only after matching continuation completes", () => {
  const c = context();
  const m = c.providerResponse.metadata;
  const packet = JSON.parse(m.toolResults[0].content[0].text);
  packet.page = { next_cursor: "next-page" };
  m.toolResults[0].content = JSON.stringify(packet);
  m.toolCalls[0].input = { lemmas: ["H2339"] };
  m.toolCalls.push({ id: 5, name: "mcp__test__query_lemmas", input: { lemmas: ["H2339"], cursor: "next-page", page_size: 1 } });
  m.toolResults.push({ toolUseId: 5, content: JSON.stringify({ lemmas: [], page: {} }) });
  assert.equal(evidence("", c).pass, true);
  m.toolCalls.at(-1).input.lemmas = ["different-scope"];
  assert.equal(evidence("", c).pass, false);
});
