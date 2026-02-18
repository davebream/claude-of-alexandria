# Vocabulary Data Sources

## NT Greek Lemma Data

**Source:** MorphGNT
- Repository: https://github.com/morphgnt/sblgnt
- License: CC BY-SA 3.0
- Text Base: SBL Greek New Testament
- Extraction Date: 2026-01-21

**Data Files:**
- `nt_lemmas.yaml` - Lemma frequencies per book (27 books)
- `nt_clusters.yaml` - Thematic clustering patterns

**Verification:**
- Philippians χαίρω: 9 occurrences (verified against MorphGNT)
- Philippians χαρά: 5 occurrences (verified)
- Romans δικαιοσύνη: 33 occurrences (verified)

## OT Hebrew Lemma Data

**Source:** OpenScriptures Hebrew Bible (morphhb)
- Repository: https://github.com/openscriptures/morphhb
- License: CC BY 4.0
- Text Base: Westminster Leningrad Codex
- Extraction Date: 2026-01-21

**Data Files:**
- `ot_lemmas.yaml` - Lemma frequencies per book (39 books)

**Verification:**
- Genesis H430 (אֱלֹהִים): 217 occurrences (verified against morphhb)
- Genesis H1285 (בְּרִית): 27 occurrences (verified)

## Methodology

Extraction scripts clone source repositories, parse morphological data,
aggregate lemma frequencies per book, and output YAML format matching
existing reference file patterns (levinsohn/, masoretic/).

See `scripts/extract_nt_vocabulary.py` and `scripts/extract_ot_vocabulary.py`
for extraction logic.

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
