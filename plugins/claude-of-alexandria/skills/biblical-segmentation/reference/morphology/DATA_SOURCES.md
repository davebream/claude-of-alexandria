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

### NT part-of-speech label for the `RI` code — resolved (issue #148)

MorphGNT tags interrogative and enclitic-indefinite pronouns (e.g. τίς "who?"
and enclitic τις "someone") with a single part-of-speech code, `RI`. The
canonical label for that code in this dataset is
**`interrogative_indefinite_pronoun`**, matching the `POS_MAP` in
`scripts/extract_nt_morphology.py`. This name is preferred over the narrower
`interrogative_pronoun` because the `RI` class covers *both* the interrogative
and the indefinite pronoun; the broader label avoids mislabelling the
enclitic-indefinite members.

The committed `nt/*.json` originally carried the older `interrogative_pronoun`
label for these words — they were generated before `POS_MAP` was edited, and the
gap was surfaced by the pinned-commit re-extraction in issue #145 (AC-2). Issue
#148 refreshed all 27 NT book files to the canonical label: **1,160 word-level
`pos` values** plus the 27 derived `by_pos` summary keys (one per book). Lemma,
parsing, and every count are unchanged, and no other field was touched.

No consumer matched on the old string. The server's morphology tools (e.g.
`query_morphology`) are seeded from a separate MACULA-based source
(`server/scripts/extract-macula-hebrew.py`), not from these skill-bundled
reference JSONs, so the relabel is a reference-data consistency fix with no
runtime effect.
