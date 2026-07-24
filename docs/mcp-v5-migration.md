# MCP Tool Contract V5 Migration

Version 5.0.0 is an atomic, breaking cutover on `/mcp`. There are no v4 aliases.

## Client Changes

1. Expect a required top-level `provenance` object on every successful tool response.
2. Continue to honor existing scholarly `attribution` / caveat fields; they remain for compatibility.
3. For heterogeneous record streams, read per-record `source_ids` when present:
   - `query_discourse_features` records
   - `query_ot_quotes` quotes
   - `query_lexicon` full entries
   - `commentary_lookup` entries
   - `confessional_lookup` results/documents
4. Treat error responses as unchanged: errors still carry no provenance because they return no dataset content.
5. Prefer `provenance.attribution_url` (`https://coa.davebream.com/legal/datasets`) for human-readable license detail.

Example envelope:

```json
{
  "provenance": {
    "attribution_url": "https://coa.davebream.com/legal/datasets",
    "datasets": [
      {
        "id": "lgntdf",
        "title": "Levinsohn Greek New Testament Discourse Features",
        "creator": "SIL International",
        "creator_url": "https://www.sil.org/",
        "attribution": "LGNTDF references marked \"LGNTDF\" are from Levinsohn Greek New Testament Discourse Features, Copyright 2016 SIL International®. With online or electronic quotations, link \"LGNTDF\" to https://github.com/biblicalhumanities/levinsohn and \"SIL International®\" to http://sil.org. Greek text referenced is from the Greek New Testament NA27/UBS4",
        "source_url": "https://github.com/biblicalhumanities/levinsohn",
        "rights": {
          "status": "custom-license",
          "name": "SIL International LGNTDF EULA",
          "url": "https://github.com/biblicalhumanities/levinsohn/blob/master/LICENSE.md"
        },
        "version": "badd3a1043aebfa9907d0515069a4be1dd6eeb7a"
      }
    ]
  }
}
```

## Pagination

Pagination mechanics are unchanged from v4 (`page_size`, `cursor`, `page.next_cursor`, 25,000-character budget). Provenance is attached before pagination, counted inside the size budget, and repeated on every continuation page.

## Output Changes

| V4 contract | V5 contract |
| --- | --- |
| No shared provenance envelope | Required `provenance` on every successful output |
| Discourse / OT-quote responses without dataset credit | SIL LGNTDF prescribed attribution on every page; `source_ids` on records |
| Lexicon `sources[]` tokens only | Full entries also carry registry `source_ids` |
| Commentary nullable string attribution only | Per-entry `source_ids` plus top-level provenance datasets |
| Confessional slug-only identity | Per-record `source_ids` (Creeds.json, Savoy Apache-2.0, Anglican, Wesley/CCEL) |
| Unpinned imports silently unmentioned | `version: null` with legal-page disclosure |

## Legal Surfaces

- `GET` / `HEAD` `https://coa.davebream.com/legal/datasets` — HTML generated from the shared registry with `#dataset-id` anchors.
- Root `NOTICE` and `server/NOTICE.md` MCP sections are generated from the same registry (`npm run generate-notices` / `npm run check-notices`).

## Cache / Version

Server and marketplace versions are `5.0.0`. The edge cache namespace bumps from `v8` to `v9` so stale v4 responses are not reused.

## SDK Scope

The production server remains on `@modelcontextprotocol/sdk` 1.29 for this release. The v1 registration adapter remains in `server/src/tools/contract.ts`.
