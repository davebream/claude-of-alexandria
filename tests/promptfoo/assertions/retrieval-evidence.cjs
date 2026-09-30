/** Inspect actual MCP results, never tool-name mentions in the answer. */
function decode(content) {
  if (typeof content === "string") {
    try { return decode(JSON.parse(content)); } catch { return []; }
  }
  if (Array.isArray(content)) return content.flatMap(decode);
  if (!content || typeof content !== "object") return [];
  if (content.isError || content.error || content.truncated === true) return [];
  if (content.structuredContent) return decode(content.structuredContent);
  if (content.type === "text") return decode(content.text);
  if (content.content) return decode(content.content);
  return [content];
}

module.exports = function retrievalEvidence(_output, context) {
  const metadata = context.providerResponse?.metadata || {};
  const calls = (metadata.toolCalls || []).filter(call =>
    !context.vars?.independent_verification || !call.parentToolUseId);
  const packets = name => {
    const scope = input => JSON.stringify(Object.entries(input || {})
      .filter(([key]) => !["cursor", "page_size"].includes(key)).sort());
    const pages = calls.filter(call => call.name?.endsWith("__" + name))
      .flatMap(call => (metadata.toolResults || [])
        .filter(result => result.toolUseId === call.id && !result.isError)
        .flatMap(result => decode(result.content))
        .filter(packet => !packet.isError)
        .map(packet => ({ packet, cursor: call.input?.cursor, scope: scope(call.input) })));
    return pages.filter(page => !page.cursor).flatMap(first => {
      const chain = [];
      let page = first;
      const seen = new Set();
      while (page && !seen.has(page)) {
        seen.add(page);
        chain.push(page.packet);
        const next = page.packet.page?.next_cursor;
        if (!next) return chain;
        page = pages.find(candidate => candidate.cursor === next && candidate.scope === first.scope);
      }
      return []; // An unfinished or cyclic pagination chain is not complete evidence.
    });
  };
  const morphology = packets("query_morphology");
  const word = (book, verse, strongs, predicate = () => true) => morphology.some(packet =>
    packet.book === book && packet.words?.some(row =>
      row.verse === verse && row.strongs === strongs && predicate(row)));
  const pual = row => row.parsing?.stem === "Pual" &&
    row.parsing?.conjugation === "passive_participle" && row.parsing?.gender === "masculine";
  const checks = {
    "OT lemma total": packets("query_lemmas").some(packet => packet.lemmas?.some(row =>
      row.lemma === "H2339" && row.testament === "ot" && row.total_occurrences === 7)),
    "Ecclesiastes Pual": word("Ecclesiastes", "4:12", "H8027", pual),
    "Genesis counterexample": word("Genesis", "15:9", "H8027", pual),
    "woe reference": word("Ecclesiastes", "10:16", "H0337"),
    "reward reference": word("Ecclesiastes", "9:5", "H7939"),
    "marker evidence scope": packets("query_paragraph_breaks").some(packet =>
      packet.book === "Ecclesiastes" && /^(\d+)(?:-(\d+))?$/.test(packet.chapter_range) &&
      Number(packet.chapter_range.split("-")[0]) <= 4 &&
      Number(packet.chapter_range.split("-").at(-1)) >= 4 &&
      packet.evidence_scope?.absence_does_not_attest?.includes("no_literary_unit_boundary")),
    "commentary text": packets("commentary_lookup").some(packet =>
      packet.book === "Ecclesiastes" && packet.entries?.some(entry =>
        entry.commentary === "keil-delitzsch" && entry.chapter === 4 &&
        entry.verse_start <= 12 && entry.verse_end >= 7 && entry.text?.length > 0)),
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { pass: missing.length === 0, score: (7 - missing.length) / 7,
    reason: missing.length ? `Missing successful source evidence: ${missing.join(", ")}` : "All source counterexamples independently observed" };
};
