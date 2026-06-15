# passage-glossary Skill

Development notes for the `passage-glossary` reader skill.

---

## Purpose

`passage-glossary` produces a passage reader artifact: the biblical text followed by a deduplicated, MCP-grounded glossary of every distinct headword occurring in it. It is a study-aid skill — a graded-reader companion for preachers, students, and scholars who want to see every word's lexical meaning without hunting through concordances.

The skill is **pure composition** over three existing MCP tools:

1. `query_morphology` (`fields: "lexical"`) — per-word lemma, Strong's number, and nullable gloss.
2. `query_lexicon` — authoritative, multi-source scholarly definitions (LSJ, Abbott-Smith, BDB).
3. `bible_lookup` — passage text in a readable translation.

No new server code, database tables, migrations, or seed data. Auto-registered via the `"skills": "./skills"` directory pointer in `plugins/claude-of-alexandria/.claude-plugin/plugin.json`.

---

## Why Strong's Is the Join Key

The lexicon tool (`query_lexicon`) returns `entries` keyed by `strongs_id`, not by lemma string. Joining on lemma strings is lossy: the lexicon internally normalizes lemmas (NFC/diacritic stripping), which silently collapses accent variants. A passage with both `αὐτός` and `αὐτος` would produce two glossary rows under a lemma-keyed join but should produce one — they are the same headword.

The design therefore keys deduplication on the Strong's number: `headword identity = strongs ?? lemma`. When `strongs` is null (uncommon but possible), the exact lemma string is the fallback key. This matches the lexicon's own `strongs_id`-keyed output and makes association unambiguous.

---

## The 20-per-Call Cap

`query_lexicon` enforces a hard maximum of 20 entries per call (either `strongs_ids` or `lemmas`). Any real passage exceeds this. The skill batches the distinct-headword list into chunks of at most 20 and calls `query_lexicon` once per chunk. The arithmetic is shown explicitly in the skill: 47 distinct Strong's IDs → 3 calls of 20 + 20 + 7.

This batching step is not an edge case — it is the spine of the skill.

---

## Failure Mode Prevented

Without the skill, a bare language model asked to produce a passage glossary exhibits two documented failure modes:

1. **Incomplete glossary**: the model omits words, particularly repeated function words and less common vocabulary. It does not call `query_morphology` to enumerate every word; it relies on training memory of the passage.
2. **Duplicate glossary rows**: the model lists the same lemma more than once (under different inflected forms or accent variants), breaking the "deduplicated" guarantee.

The skill prevents both failures by:
- Requiring an MCP call to `query_morphology` for a complete, authoritative word list.
- Applying the explicit dedup rule (`strongs ?? lemma`) before rendering.
- Requiring a per-row key token on every glossary row (the Strong's number or `(no-strongs)`), which makes duplicate rows mechanically detectable in test assertions.

---

## Test Evidence

RED and GREEN promptfoo configs live at:

```
tests/promptfoo/skills/passage-glossary/
├── promptfooconfig-red.yaml    # bare model — documents incomplete / duplicated glossary
└── promptfooconfig-green.yaml  # with skill + MCP — asserts completeness and dedup
```

GREEN's load-bearing assertion is a deterministic `javascript` check that parses the `## Glossary` rows, extracts the per-row key token (Strong's number or `(no-strongs)`), and asserts each token appears exactly once. One `llm-rubric` per failure mode (completeness, dedup, MCP-grounding) keeps the GREEN config CI-cheap.

---

## Known Untested Paths

The following edge cases are specified in the SKILL.md instructions but do not have direct promptfoo eval assertions (they rest on the skill instruction, not on eval evidence):

- `summary.truncated = true` → range split and re-query path.
- Morphology gloss is null → fall through to `(unresolved — not in lexicon)`.
- Empty passage (no words) → empty glossary with explicit note.
- Transport failure on a `query_lexicon` chunk → retry-once → `(gloss lookup failed)` continuation.

These paths are correct-by-specification; adding eval assertions for them would require stochastic mocking of MCP failure states, which is out of scope for the current test methodology.

---

## Methodology Note: `superpowers:writing-skills` Not Installed

The repo CLAUDE.md mandates invoking `superpowers:writing-skills` before creating or editing any skill. That skill is **not installed** in this environment (it is a `superpowers:` namespaced plugin absent from the current plugin set).

The RED/GREEN TDD methodology was applied directly without the `superpowers:writing-skills` scaffolding:
- RED config documents bare-model failure modes first.
- GREEN config asserts the skill corrects each documented failure.
- This order is preserved per the repo's prescribed cycle.

**Flagged for human review:** a human reviewer should verify that the RED/GREEN configs satisfy the same quality bar that `superpowers:writing-skills` would have enforced, and optionally re-run the full methodology once the skill is available in the environment.
