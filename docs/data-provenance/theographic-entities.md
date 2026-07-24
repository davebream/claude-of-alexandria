# Theographic Entity Data Provenance

## Current Corpus

People, places, events, groups, and verse/event junction tables are generated
from Theographic Bible Metadata by:

`server/scripts/etl-theographic.py`

Pinned inputs:

| Item | Value |
| --- | --- |
| Source repository | <https://github.com/robertrouse/theographic-bible-metadata> |
| Source revision | `cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc` |
| Input files | `people.json`, `places.json`, `events.json`, `verses.json`, `peopleGroups.json` |
| Checksum lock | `server/scripts/theographic-checksums.json` |

The extractor verifies the SHA-256 of every downloaded file against the
committed checksum lock before parsing. Cache hits are verified the same way.

## Licenses

| Layer | License |
| --- | --- |
| Theographic Bible Metadata | CC BY-SA 4.0 |
| TIPNR (Tyndale House / STEPBible.org), underlying name data | CC BY 4.0 |
| Extraction / seed-generation code in this repository | GPL-3.0-or-later |

## Place Canonicalization Rule

Some Theographic place records are aliases of another place and carry a
`duplicate_of` Airtable reference. Those duplicate records are **not** inserted
into the `places` table.

Every verse-place and event-location reference is resolved by walking
`duplicate_of` chains to a non-duplicate terminal record, then emitting that
terminal record’s `placeID`. Appearance counts for canonical places are derived
from the unique emitted verse-place tuples, not from upstream `verseCount`.

At this pinned revision:

| Measure | Count |
| --- | ---: |
| Upstream `duplicate_of` records | 27 |
| Chained duplicates (≥2 hops) | 3 |
| Duplicate place IDs referenced by verses/events | 21 |
| Orphan verse-place rows under the prior buggy emit | 234 |
| Orphan event-location rows under the prior buggy emit | 6 |
| Corrected junction rows total | 240 |

Notable resolutions:

| Duplicate placeID | Name | Canonical placeID | Canonical name |
| ---: | --- | ---: | --- |
| 1263 | Zion | 636 | Jerusalem |
| 1264 | Zion’s | 636 | Jerusalem |

Jerusalem’s aliases already include “Zion.” After canonicalization, Jerusalem’s
derived `appearance_count` is **858**.

## Known Gap: Psalm 126:4 (Negev)

In this pinned Theographic revision, `Ps.126.4` has `"places": null`. There is
no upstream place mention-tag for “Negev” / “South” on that verse, so the ETL
emits no place row for it.

This is a gap in the pinned upstream dataset for this revision — not a claim
that Scripture lacks the toponym, and not a permanent claim about future
Theographic revisions. A general curated place-mention override layer is out of
scope for this corpus.

Psalm 126:1 does resolve: its upstream Zion tag canonicalizes to Jerusalem
(`places.id = 636`).

## Production Correction Path

Production D1 that still contains orphan duplicate place IDs is repaired by:

```bash
cd server && python3 scripts/etl-theographic.py --emit place-redirect
```

which writes gitignored runner artifacts under `server/d1-seed/`:

- `theographic-place-redirect-head.sql`
- `theographic-place-redirect-apply.sql`
- `theographic-place-redirect-tail.sql`
- `theographic-place-redirect-manifest.json`

The guarded local `server/scripts/backfill-theographic-places.sh` command
generates those artifacts, asserts the pinned corpus, applies them only after
explicit confirmation, and verifies zero remaining orphans. No migration file
is used.
