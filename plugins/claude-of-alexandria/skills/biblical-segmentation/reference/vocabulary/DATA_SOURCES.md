# Vocabulary Data Sources

## NT Greek Lemma Data

**Source:** MorphGNT
- Repository: https://github.com/morphgnt/sblgnt
- License: CC BY-SA 3.0
- Text Base: SBL Greek New Testament
- Pinned Commit: `aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d`
- Extraction Date: 2026-01-21 (re-verified against the pinned commit 2026-07-21)

**Data Files:**
- `nt_lemmas.yaml` - Lemma frequencies per book (27 books)
- `nt_clusters.yaml` - Thematic clustering patterns

**Verification** (against the pinned commit):
- Philippians χαίρω: 9 occurrences
- Philippians χαρά: 5 occurrences
- Romans δικαιοσύνη: 33 occurrences

## OT Hebrew Lemma Data

**Source:** OpenScriptures Hebrew Bible (morphhb)
- Repository: https://github.com/openscriptures/morphhb
- License: CC BY 4.0
- Text Base: Westminster Leningrad Codex
- Pinned Commit: `3d15126fb1ef74867fc1434be1942e837932691f`
- Extraction Date: 2026-01-21 (re-verified against the pinned commit 2026-07-21)

**Data Files:**
- `ot_lemmas.yaml` - Lemma frequencies per book (39 books)

**Verification** (against the pinned commit):
- Genesis H430 (אֱלֹהִים): **219** occurrences. This counts every Genesis word
  token tagged Strong's H430 in the WLC — the bare noun plus legitimate Hebrew
  prefixes (ה/ו/ל/כ/ב). A prior "217" figure here was a stale a-priori value
  that never matched the extractor's output; the pinned re-extraction confirms
  219 (issue #145).
- Genesis H1285 (בְּרִית): 27 occurrences

## Methodology

Extraction scripts fetch their source corpus from a **pinned upstream commit**,
verify the SHA-256 of every downloaded file against a committed checksum
lockfile, parse morphological data, aggregate lemma frequencies per book, and
output YAML/JSON matching existing reference file patterns (levinsohn/,
masoretic/). Pinning makes a re-extraction reproducible and tamper-evident: the
same commit yields the same data, and a changed input fails verification instead
of silently diverging.

- Pinning + verification: `scripts/provenance.py` (pattern mirrors
  `server/scripts/extract-macula-hebrew.py`).
- Checksum lockfiles: `scripts/oshb-checksums.json` (morphhb WLC, shared with
  `extract_oshb_paragraphs.py`) and `scripts/sblgnt-checksums.json` (MorphGNT).
- Extraction logic: `scripts/extract_nt_vocabulary.py`,
  `scripts/extract_ot_vocabulary.py`.

A caller may point an extractor at a local clone (`--morphhb-path` /
`--morphgnt-path`) for offline work; the pinned-download path is the reproducible
default when no clone is present.

## Clustering Algorithm

Thematic clustering calculated as:
- Concentration = occurrences_in_chapter_range / total_book_occurrences
- Notable clustering threshold: ≥60%
- Configurable in vocabulary_parser.py

## Citation Requirements

When using vocabulary data in skill output:
1. Cite exact lemma form (Greek/Hebrew)
2. Include occurrence count
3. For OT: include Strong's number (H####)
4. For NT: include transliteration option
5. Note if web search for scholarly framework succeeded/failed
