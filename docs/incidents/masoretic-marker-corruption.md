# Masoretic Marker Corruption Incident

## Summary

Before July 20, 2026, the committed Old Testament paragraph-marker data under `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/` was substantially wrong. The extractor that produced it was not committed to the repository. It matched the bare Hebrew letters `פ` and `ס` inside running text instead of reading explicit paragraph-marker markup, so ordinary words containing those letters were emitted as manuscript breaks.

This inflated the marker density enough that "is there a manuscript break near this boundary?" became close to vacuous in some books. Genesis carried `1034` listed markers where the corrected WLC/OSHB witness has `92`. Ruth carried `39` where the corrected witness has `1`.

## Timeline

- Before `2026-07-20`: corrupt Sefaria-attributed Masoretic JSONs were the committed live dataset.
- `2026-07-20 16:13` UTC+2: commit `769737a` corrected the source and rebuilt the corpus from OSHB markup (`#118` / `#130`).
- `2026-07-20 19:27` UTC+2: commit `3e77050` repaired production D1 seed data (`#119` / `#131`).
- `2026-07-20 21:09` UTC+2: commit `1d5dca6` fixed exact verse-end verification in `verify_claims.py` (`#120` / `#132`).
- `2026-07-20 22:13` UTC+2: commit `86e731e` revalidated GREEN tests against the corrected witness (`#121` / `#133`).
- `2026-07-21 11:43` UTC+2: commit `b204fec` reframed the evidence semantics so markers remain graphic-witness evidence, not literary proof (`#122` / `#138`).
- `2026-07-21`: issue `#128` added permanent forensic reproduction artifacts, archived corrupt fixtures, and this incident report.

## What Failed

The historical bug was mechanically simple:

1. Read verse text.
2. Treat any occurrence of `פ` as a petuchah anchor.
3. Treat any occurrence of `ס` as a setumah anchor.
4. Emit the verse reference once per type.

That procedure confuses ordinary lexical content with explicit scribal markup. It also explains the characteristic shape of the bad data: high per-verse density, many double-listed verses, and counts that track the frequency of the letters themselves.

## Forensic Reproduction

The original uncommitted generator cannot be rerun exactly because it was never archived in the repository. The committed forensic reproduction instead proves the mechanism against the same textual base now pinned for the corrected corpus:

- Witness bytes: OpenScriptures Hebrew Bible / Westminster Leningrad Codex, commit `3d15126fb1ef74867fc1434be1942e837932691f`
- Canonical extractor: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_oshb_paragraphs.py`
- Forensic reproducer: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/reproduce_masoretic_corruption.py`
- Archived corrupt fixtures: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/fixtures/masoretic-corruption/intentionally-corrupt-pre-fix/`

The reproducer measures, book by book:

`same-witness reconstruction := bare-letter verse matches ∪ genuine marker anchors`

where the "genuine" anchors are recomputed directly from the pinned XML via the canonical extractor rather than read from the corrected committed JSONs.

This is not the same thing as replaying the original uncommitted generator byte for byte. In the current repository evidence, Ruth matches that reconstruction exactly, while many books do not. That tells us two things at once:

- the archived fixtures preserve a real bare-letter corruption signature, and
- the historical source pipeline was not identical to "current OSHB WLC bytes plus a letter matcher."

The most plausible explanation is source-base drift between the historical Sefaria-derived text path and the current pinned OSHB witness.

## Load-Bearing Evidence

- Genesis: corrupt `655` petuchot and `379` setumot over `1533` verses (`0.67449` markers/verse). Against the current pinned OSHB witness, bare letters account for `624` `פ` anchors and `333` `ס` anchors; genuine markers account for `42` petuchot and `50` setumot. The same-witness reconstruction lands within single-digit extra/missing deltas per type, which is strong forensic evidence of the mechanism but not an exact replay.
- Ruth: corrupt `31` petuchot and `8` setumot over `85` verses (`0.45882` markers/verse). Bare letters account for `30` `פ` anchors and `8` `ס` anchors. The sole genuine marker is a petuchah at `4:17`. Ruth matches the same-witness reconstruction exactly.
- Corpus-wide corrected witness totals are `3162` explicit markers: `1181` `x-pe`, `1981` `x-samekh`.
- The oft-repeated `0.46` to `0.94` density range is not a valid corpus-wide description. Corrected books range from `0.0` (Psalms, Obadiah) to `1.442` (Lamentations) when counted as marker events per verse, and the corrupt books also do not stay inside that narrower band.

## Impact

- Boundary checks against the corrupt dataset could certify almost any proposed segmentation in dense books.
- Exact verse-end verification was impossible because the old data recorded only verse references, not within-verse position.
- The source attribution was inaccurate: the committed files claimed Sefaria provenance that did not match the actual corrected witness pipeline.

## Corrective Actions

- Replaced the corrupt dataset with a committed OSHB-based extractor, pinned source revision, and SHA-256 lockfile.
- Added per-marker position and stable event identity to the corrected dataset.
- Added permanent forensic fixtures and a reproduction test path so the historical failure mode stays reproducible.
- Added this incident report and a separate provenance note for the paragraph-marker corpus.

## Remaining Boundary

What is reproduced here is a forensic measurement against the same WLC textual base, not a byte-for-byte rerun of the original uncommitted script. That boundary is explicit and intentional.
