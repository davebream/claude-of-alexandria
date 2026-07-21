# MCP Tool Contract V4 Migration

Version 4.0.0 is an atomic, breaking cutover on `/mcp`. There are no v3 aliases.

## Client Changes

1. Rename `query_theme` to `query_theme_distribution`.
2. Send arrays as native JSON arrays. JSON-encoded strings such as `"[\"G3056\"]"` are rejected.
3. Remove unknown arguments. Every input object is strict.
4. Add the required `mode` discriminator to variant tools:

| Tool | Modes |
| --- | --- |
| `query_vocabulary` | `frequency`, `theme` |
| `query_lexicon` | `strongs`, `lemmas`, `search` |
| `confessional_lookup` | `direct`, `scripture`, `keyword`, `list` |
| `liturgical_lookup` | `season`, `passage`, `list` |
| `query_controversies` | `topic`, `passage`, `list` |

For example:

```json
{"mode":"strongs","strongs_ids":["G3056"],"compact":false}
```

## Pagination

Twenty-one tools now accept `page_size` (default 50, range 1..200) and `cursor`. Read `page.next_cursor` and repeat the same filters until it is absent. `page_size` may change during continuation; other filters may not.

```json
{"page_size":50,"cursor":"<opaque cursor>","book":"Romans","range":"8:1-39"}
```

Every page reports `page.returned` and `page.total`. The server returns fewer complete records when necessary to remain under 25,000 characters. It never cuts a record. A single oversized record returns `RESULT_TOO_LARGE`.

Malformed, cross-tool, changed-filter, and stale-data cursors return `INVALID_CURSOR`, `CURSOR_FILTER_MISMATCH`, or `CURSOR_EXPIRED`.

## Output Changes

| V3 contract | V4 contract |
| --- | --- |
| `truncated`, `truncation_message`, `results_capped`, ad hoc returned counts | `page` and continuation cursors |
| Discourse `features` plus `word_level_boundaries` maps | Discriminated `records` stream |
| Person network nested collections | Discriminated `connections` stream |
| Commentary grouped by commentary | Flat `entries` records carrying commentary metadata |
| Confessional nested documents/sections | Mode-specific flat `results` records |
| Liturgical nested seasons/readings | Season summaries for `list`; enriched flat reading `results` for `season`/`passage` |
| Morphology optional field bag | `detail_level`-discriminated output variants |
| Lexicon compact/full permissive entry bag | `response_type` (`<mode>_compact` or `<mode>_full`) with exact entry fields |
| Cross-reference path `truncated` | `complete` plus typed `termination_reason` |
| `list_books.available_tools` | Removed; use MCP `tools/list` |

Liturgical reading records now include `season_slug`, aggregate `season_themes`, per-reading `themes`, and explicit `start`/`end` chapter-and-verse coordinates.

Successful calls continue to return both `structuredContent` and an equivalent JSON text block.

## SDK Scope

The production server remains on `@modelcontextprotocol/sdk` 1.29 for this release. The v1 registration adapter is isolated in `server/src/tools/contract.ts`. Test and migrate against the final SDK v2 release after July 28, 2026; do not introduce v2 beta code into the v4 contract release.
