# Paragraph Marker Data Provenance

## Current Corpus

The committed Masoretic paragraph-marker JSON files live at:

`plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/`

They are generated from:

- Source repository: <https://github.com/openscriptures/morphhb>
- Source revision: `3d15126fb1ef74867fc1434be1942e837932691f`
- Source path pattern: `wlc/<OsisCode>.xml`
- Witness: Westminster Leningrad Codex as encoded by OSHB/WLC
- Extractor: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_oshb_paragraphs.py`
- Checksum lock: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/oshb-checksums.json`

The extractor reads explicit OSHB XML elements:

| OSHB markup | Emitted type |
| --- | --- |
| `<seg type="x-pe">` | `petuchah` |
| `<seg type="x-samekh">` | `setumah` |

It does not scan running Hebrew text for the letters pe or samekh.

## Counts

At the pinned OSHB revision, the committed corpus contains:

| Measure | Count |
| --- | ---: |
| Old Testament books | 39 |
| Verse denominator | 23,213 |
| Paragraph marker events | 3,162 |
| Petuchot | 1,181 |
| Setumot | 1,981 |
| Graphic signs on separate channel | 20 |
| Verse-end paragraph markers | 3,072 |
| Within-verse paragraph markers | 90 |

Psalms and Obadiah contain no explicit `x-pe` or `x-samekh` elements in this
source. That is a statement about this feature layer of this electronic
witness, not a claim that those books lack all Masoretic graphic structure.

## Event Position Semantics

Each marker is an event. It does not separately mark both an end and a
beginning, and it is not a universal `position: "after"` field.

Current records use:

| Field | Meaning |
| --- | --- |
| `position: "verse_end"` | The marker occurs after the final direct word of the verse and can support a claim that the passage ends after that verse. |
| `position: "within_verse"` | The marker occurs between direct word tokens and cannot support a verse-level boundary claim after that verse. |
| `lexical_position` | The observed token relation, such as `after_final_word` or `between_words`. |
| `ordinal_in_verse` | 1-based source-order index preserving multiple marker events in a verse. |

Genesis and Ruth goldens used by the issue #128 audit are specifically
verse-end events: Genesis has 42 petuchot and 50 setumot total in OSHB/WLC, and
Ruth has one petuchah at 4:17.

## Licenses

The current JSON metadata records the license layering per book:

| Layer | License |
| --- | --- |
| Biblical text | Public domain, Westminster Leningrad Codex |
| OSHB source markup | CC BY 4.0 |
| Derived marker metadata | CC BY 4.0, inheriting OSHB attribution |
| Extraction code | GPL-3.0-or-later |

Historical Sefaria fixtures used only for the corruption audit preserve their
own source metadata:

| Fixture source | Revision | License in source JSON |
| --- | --- | --- |
| Sefaria-Export, Tanach with Text Only | `bb791327` | Public Domain |
| Sefaria-Export, Miqra according to the Masorah | `bb791327` | CC-BY-SA |

## Repair And Audit Commits

| Commit | Role |
| --- | --- |
| `56c1e80` | Introduced the corrupt Masoretic JSON files now archived as fixtures. |
| `ed50f51` | Last pre-repair tree; corrupt files are byte-identical to `56c1e80`. |
| `769737a` | Rebuilt the committed JSON corpus from pinned OSHB/WLC XML. |
| `3e77050` | Repaired production D1 paragraph-marker rows. |
| `1d5dca6` | Fixed exact verse/type/position certification in `verify_claims.py`. |
| `b204fec` | Reframed Masoretic markers as witness-relative graphic evidence. |

## Historical Fixture Bundle

The audit fixtures live at:

`server/scripts/fixtures/masoretic-corruption/`

They include:

- all 39 corrupt JSON files, archived byte-identically from `56c1e80`;
- four Sefaria-Export JSON source files for Genesis and Ruth at `bb791327`;
- `oshb-wlc-golden.json`, a witness-labelled OSHB/WLC golden summary;
- `manifest.json`, recording SHA-256 hashes, Git blob IDs, licenses, witness
  identities, verse counts, and corrected record counts.

The original uncommitted extractor cannot be recovered. The historical
Sefaria sources are a byte-pinned reconstruction that exactly reproduces the
committed corrupt Genesis and Ruth arrays under the naive letter-scan method.

A separate skill-local forensic archive also exists under
`plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/fixtures/masoretic-corruption/`.
That archive preserves the pre-fix corrupt corpus beside the canonical
extractor. The server-side bundle above is the issue #128 offline audit used by
`server/scripts/reproduce-masoretic-corruption.py`.

Run the audit with:

```bash
python3 server/scripts/reproduce-masoretic-corruption.py
```
