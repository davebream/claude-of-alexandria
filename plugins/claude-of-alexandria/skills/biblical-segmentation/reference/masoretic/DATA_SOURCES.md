# Masoretic Paragraph Markers — Data Sources

## Overview

This directory holds Masoretic paragraph markers (petuchot and setumot) for all
39 Old Testament books, generated from the OpenScriptures Hebrew Bible (OSHB)
at a pinned commit by a committed extractor.

**The extractor is the only legitimate way these files change.** Hand-editing a
file here is never correct; a CI drift check regenerates the corpus and fails
the build on any difference.

## Primary source

**OpenScriptures Hebrew Bible (OSHB / morphhb)**

- Repository: <https://github.com/openscriptures/morphhb>
- Pinned commit: `3d15126fb1ef74867fc1434be1942e837932691f`
- Path within the repository: `wlc/<OsisCode>.xml`
- Text basis: Westminster Leningrad Codex (WLC)
- Integrity: every downloaded file is verified against a committed SHA-256
  lockfile (`../../scripts/oshb-checksums.json`) on every run, including cache
  hits.

Markers are read from explicit XML markup — `<seg type="x-pe">` for a petuchah
and `<seg type="x-samekh">` for a setumah — not by matching Hebrew letters in
running text.

## Which witness this is, and why that must be stated

Manuscript traditions genuinely disagree about paragraph divisions. This
dataset follows the **Leningrad Codex as encoded by OSHB**.

Genesis is the standard illustration: **OSHB/Leningrad gives 42 petuchot and 50
setumot (92 total), where the Maimonides/Aleppo tradition gives 43 and 48 (91
total).** Both are correct for their own witness. A dataset that does not say
which tradition it follows makes every downstream "confirmed by manuscript"
claim unfalsifiable, because any count can be attributed to some other witness.

## Anchor convention — per marker, not per file

Each marker records the verse it occurs in **and where inside that verse it
occurs**. There is deliberately no single file-level "markers fall after the
verse" claim, because that is false for part of the corpus.

| `position` | Meaning | Supports "the passage ends after this verse"? |
| --- | --- | --- |
| `verse_end` | No word follows the marker in its verse | **Yes** |
| `within_verse` | Words on both sides of the marker | **No** — it marks a subdivision inside the verse |
| `verse_start` | No word precedes the marker in its verse | No |

**Corpus counts: 3,072 markers are `verse_end`, 90 are `within_verse`.**

`position` is derived from token context — whether a `<w>` element follows the
marker inside its verse — not from punctuation placement, which varies. The
separate `after_sof_pasuq` field records the punctuation relationship as
provenance, and is not the classifier.

Consuming a `within_verse` marker as a verse boundary certifies a claim the
manuscript does not make. 2 Samuel 16:13 is the clearest case: it carries a
setumah mid-verse *and* a petuchah at the verse end — two boundaries at two
positions, not one boundary bearing two types.

## Multiple markers in one verse

A verse may carry more than one marker. **30 verses do.** Nehemiah 3 — the list
of wall-builders — is the clearest example, where several section breaks fall
inside single verses.

These are preserved as distinct events with a 1-based `ordinal_in_verse`.
Collapsing them by verse reference would discard 29 genuine markers.

## Books with no marker layer

**Psalms and Obadiah carry zero paragraph markers.** This is a real property of
the witness, not a gap in extraction.

For Psalms the reason is structural: its canonical chapter division *is* the
manuscript's paragraph division, so the scribal marker layer is unused — the
150 `<chapter osisID="Ps.N">` elements are themselves the division mechanism.
The explanation is **not** that poetry lacks paragraph division: Job, Proverbs,
Song of Songs and Lamentations are all poetry and all carry markers, with
Lamentations carrying 89.

Verified as a genuine absence rather than a parse failure: `Ps.xml` contains
5,461 `<seg>` elements, none of them markers. A parse failure would drop every
seg type, not exactly the two marker types.

Both files carry `_metadata.marker_layer_absent`. A consumer must report **"this
book has no marker layer"**, never "no marker found at X" — the latter reads as
evidence *against* a proposed boundary when it is the absence of the instrument.

## Marker density varies by genre — it is not a correctness signal

Observed density spans **0.000 to 0.578 markers per verse**, and **16 of 39
books exceed 0.15**. Corpus mean is 0.136.

| Book | Markers / verses | Density |
| --- | --- | --- |
| Lamentations | 89 / 154 | 0.578 |
| Ezra | 135 / 280 | 0.482 |
| Nehemiah | 120 / 405 | 0.296 |
| Genesis | 92 / 1533 | 0.060 |
| Job | 39 / 1070 | 0.036 |
| Ruth | 1 / 85 | 0.012 |
| Psalms, Obadiah | 0 | 0.000 |

Density is reported by the extractor but never gates it. No threshold separates
genuine data from corrupt: genuine Lamentations sits inside the range that a
previous analysis treated as diagnostic of corruption. Lamentations is in fact
the strongest validation evidence available — its marker count tracks the
22-letter acrostic (chapters 1–4 carry 22 each, chapter 5 carries 1), a shape a
miscount cannot produce.

The practical consequence for interpretation: in a high-density book a nearby
marker carries little information, while in a sparse book it carries a lot.

## File format

```json
{
  "schema_version": 2,
  "book": "2 Samuel",
  "_metadata": {
    "witness": "WLC/OSHB@3d15126fb1ef74867fc1434be1942e837932691f",
    "source": "OpenScriptures Hebrew Bible (morphhb), wlc/",
    "marker_count": 2,
    "verse_count": 695,
    "licenses": { "...": "see below" }
  },
  "markers": [
    {
      "id": "WLC@3d15126fb1ef:2Sam.16.13#1:setumah",
      "chapter": 16, "verse": 13, "type": "setumah",
      "ordinal_in_verse": 1, "position": "within_verse",
      "preceding_word_id": "10Jty", "following_word_id": "10VA7",
      "after_sof_pasuq": false, "source_child_index": 4
    }
  ],
  "legacyIndexes": {
    "_comment": "Verse-reference indexes. INSUFFICIENT for boundary position.",
    "petuchot": ["16:13"],
    "setumot": ["16:13"]
  }
}
```

`markers` is canonical. `legacyIndexes` exists only for the pre-existing loader
contract and **must not be used by pericope or segmentation logic** — it cannot
express where in a verse a marker falls, and two markers in one verse collapse
to one entry per type.

Files are written with `indent=2`, `ensure_ascii=False`, and **no trailing
newline**. Arrays are in source document order, never sorted.

## Licensing, per layer

These are separate claims and must not be merged into one blanket statement:

| Layer | License |
| --- | --- |
| Biblical text | Public domain (Westminster Leningrad Codex) |
| Source markup | CC BY 4.0 (OpenScriptures Hebrew Bible) |
| Derived metadata (these files) | CC BY 4.0, inheriting OSHB's attribution requirement |
| Extraction code | GPL-3.0-or-later |

The previous per-file `"CC0"` declaration was wrong for this source: CC BY 4.0
carries an attribution requirement that CC0 does not.

## Usage in segmentation

Markers are graphic-witness evidence for where an ancient tradition divided the
text. They are used to corroborate a proposed division, to cite manuscript
support for a segmentation choice, and to flag a division that cuts across a
recorded break.

Two constraints on that use follow from the data above: only a `verse_end`
marker bears on a verse-level boundary, and in a high-density book the presence
of a nearby marker is weak evidence because markers are abundant there.

## Regenerating

```bash
python3 plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_oshb_paragraphs.py
```

The extractor validates before it writes anything, so a failure on any book
leaves all 39 files untouched rather than shipping a half-updated tree.

To re-pin to a different upstream commit, run the **Re-pin Masoretic Corpus**
workflow (`workflow_dispatch` only) with the target SHA. It regenerates the
lockfile and datasets and uploads them as an artifact for review.

## Break-glass: upstream unavailable

If `raw.githubusercontent.com` is unreachable, clone the pinned source directly
and populate the cache the extractor reads:

```bash
git clone https://github.com/openscriptures/morphhb.git /tmp/morphhb
git -C /tmp/morphhb checkout 3d15126fb1ef74867fc1434be1942e837932691f
mkdir -p .cache/oshb && cp /tmp/morphhb/wlc/*.xml .cache/oshb/
```

The checksum lockfile still verifies every file, so this path is no less safe
than a download — it changes only how the bytes arrive.

## Verifying

```bash
# Structural suite (network-free)
python3 ../../scripts/test_extract_oshb_paragraphs.py -v

# Corpus goldens against the committed data
python3 ../../scripts/test_extract_oshb_paragraphs.py --corpus -v

# Load one book, including per-marker position
python3 ../../scripts/sefaria_paragraphs.py Nehemiah
```

## Academic citation

> Masoretic paragraph markers (petuchot and setumot) from the Westminster
> Leningrad Codex as encoded by the OpenScriptures Hebrew Bible, commit
> `3d15126fb1ef74867fc1434be1942e837932691f`.
> <https://github.com/openscriptures/morphhb>

State the witness when citing counts. Leningrad and Maimonides/Aleppo differ,
and a count given without its witness cannot be checked.

## History

These files previously claimed extraction from Sefaria-Export. That provenance
was inaccurate and the data was substantially wrong: an uncommitted script had
matched the bare Hebrew letters pe and samekh in running text rather than
marker elements, so ordinary words containing those letters produced spurious
markers. Genesis listed 1,034 markers where the manuscript has 92; Ruth listed
39 where it has 1. Boundary checks against that data appeared to confirm almost
any proposed passage division.

## Related documentation

- New Testament discourse features: `../levinsohn/README.md`
- Extractor: `../../scripts/extract_oshb_paragraphs.py`
- Loader: `../../scripts/sefaria_paragraphs.py` (loads only; does not extract)
- Usage in skill: `../../SKILL.md`

## Corpus summary

| | |
| --- | --- |
| Books | 39 |
| Marker events | 3,162 |
| Petuchot | 1,181 |
| Setumot | 1,981 |
| Verses covered | 23,213 |
| Verses with more than one marker | 30 |
| Books with no marker layer | 2 (Psalms, Obadiah) |
