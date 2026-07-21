# Morphology Data Sources

## NT Greek Morphology

**Source:** MorphGNT / SBLGNT
- Repository: https://github.com/morphgnt/sblgnt
- License: CC BY-SA 3.0
- Text Base: SBL Greek New Testament
- Pinned Commit: `aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d`

**Data Files:** `nt/*.json` — verse-level morphology per book (27 books).

### Versification note — Matthew has 1,068 verses, not 1,071

The extractor derives each book's verse list purely from the references present
in the SBLGNT source. SBLGNT is a **critical text** and omits three verses that
the Textus Receptus / KJV tradition includes:

- Matthew 17:21
- Matthew 18:11
- Matthew 23:14

So `matthew.json` records 1,068 verses (`1,071 − 3`). This is the source
edition's versification, **not** a missing-data gap — the same three verses are
absent from NA/UBS critical editions. No fix is warranted (issue #145, AC-4).

## OT Hebrew Morphology

**Source:** OpenScriptures Hebrew Bible (morphhb / OSHB)
- Repository: https://github.com/openscriptures/morphhb
- License: CC BY 4.0
- Text Base: Westminster Leningrad Codex
- Pinned Commit: `3d15126fb1ef74867fc1434be1942e837932691f`

**Data Files:** `ot/*.json` — verse-level morphology per book (39 books).

## Provenance & reproducibility

Extraction scripts fetch each source from the **pinned commit above** and verify
the SHA-256 of every downloaded file against a committed checksum lockfile before
parsing. See `scripts/provenance.py`, `scripts/oshb-checksums.json` (morphhb WLC),
and `scripts/sblgnt-checksums.json` (MorphGNT). Extraction logic lives in
`scripts/extract_nt_morphology.py` and `scripts/extract_ot_morphology.py`.

**Known stale data — NT part-of-speech label for the `RI` code.** The committed
`nt/*.json` were generated before a later edit to the extractor's POS map. A
re-extraction at the pinned commit is byte-identical **except** for 1,160 words
tagged MorphGNT code `RI`, whose `pos` label reads `interrogative_pronoun` in the
committed files but `interrogative_indefinite_pronoun` in current output. The
underlying morphology (lemma, parsing, counts) is unchanged. This label refresh
is intentionally **not** applied here — it is tracked as a separate follow-up so
the data change is reviewed on its own (issue #145, AC-2).
