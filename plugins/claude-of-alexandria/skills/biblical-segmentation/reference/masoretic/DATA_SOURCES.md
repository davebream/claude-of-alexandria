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

**What these elements are.** They are *digital encoding elements* in a
WLC-derived transcription. They are not literal פ and ס characters written by
the Leningrad scribe: in the manuscript an open or closed section is marked by
**blank space**, and the printed P/S notation is a later editorial convention
for representing that spacing. So this dataset records where one electronic
transcription encodes open- and closed-section spacing.

A marker also does not separately mark a beginning and an end. Each marker
event denotes **one graphic separation** in this electronic witness. In
discourse terms the same separation may close preceding material and introduce
following material, but that is one event, not two. It is a graphic event
first; its literary function remains interpretive. That matters for the
intra-verse cases below.

## Which witness this is, and why that must be stated

Manuscript traditions genuinely disagree about paragraph divisions. This
dataset follows the **Leningrad Codex as encoded by OSHB**.

Genesis is the standard illustration:

- **OSHB/WLC revision `3d15126f`:** 42 petuchot + 50 setumot = **92** explicit
  P/S events.
- **Maimonides' list, traditionally associated with the Aleppo–Ben Asher
  codex:** 43 open + 48 closed = **91**.

Both are correct for their own witness. The second figure is confirmed directly
in Maimonides (*Mishneh Torah*, Laws of Tefillin, Mezuzah and Torah Scrolls 8),
who states he relied on the Ben Asher codex then in Egypt. It should be labelled
a **Maimonidean / reconstructed Aleppo-tradition** figure rather than a count
from extant Aleppo folios: almost all of the Aleppo Codex's Pentateuch is lost,
so no direct Genesis count can be made from it today. A dataset that does not say
which tradition it follows makes every downstream "confirmed by manuscript"
claim unfalsifiable, because any count can be attributed to some other witness.

## Dataset scope

This dataset extracts only `<seg>` elements whose `type` is exactly `x-pe` or
`x-samekh`. Four further `x-` type values occur in the source on other element
classes and are intentionally excluded:

| Value | Element | Nature |
| --- | --- | --- |
| `x-ketiv` | `<w>` | textual annotation |
| `x-qere` | `<rdg>` | textual annotation (alternate reading) |
| `x-accent` | `<rdg>` | textual annotation |
| `x-BY` | `<rights>` | document/licensing metadata, not a feature of the text |

That they occur on non-`<seg>` elements is a source observation. That they are
out of scope is a schema decision, recorded here rather than presented as a
fact about the manuscript.

## Anchor convention — per marker, not per file

Each marker records the verse it occurs in **and where inside that verse it
occurs**. There is deliberately no single file-level "markers fall after the
verse" claim, because that is false for part of the corpus.

Each marker carries two positional fields. `lexical_position` is what the
parser literally observed; `position` is the convenience interpretation of it.

| `lexical_position` (observed) | `position` (derived) | Supports "the passage ends after this verse"? |
| --- | --- | --- |
| `after_final_word` | `verse_end` | **Yes** |
| `between_words` | `within_verse` | **No** — it directly attests an internal P/S-type *graphic separation* at that token anchor |
| `before_first_word` | `verse_start` | No |

The distinction is small but real: `after_final_word` is exactly what was seen,
whereas "verse end" says slightly more, since non-word nodes (punctuation,
notes, apparatus) may still follow the marker. Keeping both makes that step
visible.

**`before_first_word` / `verse_start` is schema capability, not corpus
knowledge.** No marker in OSHB `3d15126f` exercises it — observed count 0. It
is retained for defensive parsing and forward compatibility, and its behaviour
is covered by a synthetic fixture rather than by a real-corpus example.

**Which words count.** A positional word is a `<w>` element that is a *direct
child* of the `<verse>` container, in document order. Words nested inside
`<note>` do not count — there are 1,278 such words in the corpus, 195 of them
in verses that also carry a marker, and counting them would change those
markers' classification. Ketiv words *do* count: 1,268 `<w type="x-ketiv">`
elements are direct children and are part of the running text. Qere readings
sit on `<rdg>` inside `<note>` and are therefore excluded, which is consistent
— an alternate reading is not the text being divided.

**Corpus counts: 3,072 markers are `verse_end`, 90 are `within_verse`.**

`position` is derived from token context — whether a `<w>` element follows the
marker inside its verse — not from punctuation placement, which varies. The
separate `after_sof_pasuq` field records the punctuation relationship as
provenance, and is not the classifier.

Consuming a `within_verse` marker as a verse boundary certifies a claim the
manuscript does not make. 2 Samuel 16:13 is the clearest case: it carries a
setumah mid-verse *and* a petuchah at the verse end.

These are **two distinct events of different graphic type at two token
anchors** — not one boundary classified two ways. Note the limit of that
statement: petuchah and setumah are different ways of realising blank-space
division, and the difference is one of *graphic form*. It is not a numeric
scale of literary strength, so this dataset does not describe them as carrying
different "weight".

Three verses show this shape (2 Sam 16:13, 2 Chr 5:1, Jer 38:28), and it is the
recognised category **pisqa be-emtsa pasuq** — a section space in mid-verse.
**Jer 38:28 needs a witness caveat:** presentations following the
Aleppo-oriented tradition show the internal setumah but treat the verse-final
position differently. That does not invalidate the OSHB/WLC record; it is
precisely why every figure here is witness-scoped.

## Multiple markers in one verse

A verse may carry more than one marker. **30 verses do.** Nehemiah 3 — the list
of wall-builders — is the clearest example, where several section breaks fall
inside single verses.

These are preserved as distinct events with a 1-based `ordinal_in_verse`.

Three related figures appear in discussions of this dataset and are easy to
mistake for one another. They are all correct and they measure different things:

| Measure | Value | Definition |
| --- | ---: | --- |
| Verses containing two or more marker elements of any type | 30 | count of `(book, chapter, verse)` groups with ≥2 events |
| Verses containing both `x-pe` and `x-samekh` | 3 | 2Sam 16:13, 2Chr 5:1, Jer 38:28 |
| Marker events lost by deduplicating on `(book, chapter, verse, type)` | 29 | `3,162 − 3,133` = total events − distinct tuples |

The third is **not** "29 duplicated verses". It is the number of events that a
naive dedup would silently discard, which is why the arrays are emitted with
repeats intact.

## Books with no marker layer

At the pinned OSHB revision, `Ps.xml` and `Obad.xml` contain **no explicit
`x-pe` or `x-samekh` elements**.

The canonical extraction is namespace-aware XML parsing. As an *independent
corroboration* — implemented differently, so it cannot share a defect with the
parser — an independent literal-source scan of the pinned XML confirms zero
occurrences of `<seg …>` elements whose `type` is `x-pe` or `x-samekh` in
either file, while the same scan finds
exactly 42 and 50 in Genesis. So this is a property of the source, not an empty
result produced by this extractor.

The literal-source scan is a cross-check only, and matches element and
attribute together (`<seg … type="x-pe|x-samekh">`) rather than a bare
attribute substring, so it cannot count a match on another element class, a
comment, or embedded documentation. The production extractor never depends on
an exact serialization, which would be brittle against changes in attribute
order, quote style, whitespace or namespace prefixes.

**What that does and does not mean.** It is a statement about *one feature
layer of one electronic witness*. It is **not** any of the following:

- that the Leningrad Codex contains no graphic divisions in these books;
- that the Masoretic tradition contains no parashah divisions in them;
- that individual psalms are not graphically separated;
- that there is no graphic evidence for boundaries within Psalm 119;
- that absence here is evidence against a proposed boundary.

Psalms belongs to the **three poetic books** (with Proverbs and most of Job),
which use a scribal layout distinct from the prose books. In that layout,
structure can be carried by blank lines, lineation and title formatting —
conventions these two element types do not represent at all. Descriptions of
the Aleppo tradition, for instance, identify blank-line divisions between
psalms and between the alphabetic units of Psalm 119. That is a different
witness, but it is enough to show that "no `x-pe` elements in this source"
cannot be generalised to "no Masoretic graphic divisions in Psalms".

An earlier version of this file asserted that Psalms' canonical chapter
division *is* its paragraph division, so the marker layer was unused. **That
was an inference from the 150 chapter elements, not a verified fact, and it is
withdrawn.** (A still earlier claim — that poetry is not paragraph-divided
prose — is separately false: Job, Proverbs, Song and Lamentations all carry
markers, Lamentations 89 of them.)

The two zeroes should not be read identically:

| Book | Explicit P/S events | Reading |
| --- | ---: | --- |
| Psalms | 0 | No explicit P/S events in this source. Poetic-layout structure needs separate treatment; this layer is plainly not exhaustive here |
| Obadiah | 0 | No explicit P/S events in this source. Do not infer the absence of literary subdivisions from it |

Both files carry `_metadata.marker_layer_absent`, a `feature_coverage` block,
and the same `evidence_scope` policy every other book carries — see below.

## Special scribal signs — a separate channel

Alongside `markers`, each file carries a **`graphic_signs`** array. These are
source-attested graphic facts that are **not** paragraph separations, kept on
their own channel so they can never be counted as P/S evidence. Twenty occur in
the corpus.

| `subtype` | Count | Notes |
| --- | ---: | --- |
| `reversed_nun` | 9 | Num 10:34 and 10:36; Ps 107:20–25 and 107:39 |
| `large` | 4 | special letter form |
| `suspended` | 4 | special letter form |
| `small` | 3 | special letter form |

Every event carries an `interpretive_status`, because the evidence is genuinely
uneven:

- **`traditional_delimitation`** — the Numbers pair. The reversed nuns at
  Num 10:34 and 10:36 are a recognised matched pair (*simaniyyot*) bracketing
  10:35–36. Rabbinic tradition reads them as delimiting the passage; modern
  scholarship often connects them with ancient critical signs marking displaced
  or parenthetical text. The signs' presence is not in dispute even where their
  reason is.
- **`function_uncertain`** — the Psalm 107 signs. Manuscripts agree much less
  about their placement and no consensus explanation exists. They are emitted
  with exact positions and **no** derived boundary.

**Why this channel exists.** Discarding these signs produced a real false
negative. Numbers 10:35–36 is bracketed by two scribal signs in this witness,
yet a P/S-only dataset reported it as having *no manuscript support*. That
phrasing is wrong: what the passage lacks is an explicit **P/S event**, not
graphic evidence.

A consumer must therefore say:

> No explicit P/S event delimits this range; two reversed-nun scribal signs
> bracket Numbers 10:35–36.

and never:

> No manuscript support.

A tool that consults only the P/S channel must say so explicitly rather than
generalising to the manuscript.

## Evidence semantics

This dataset exhaustively extracts the explicit `x-pe` and `x-samekh` elements
present in the pinned OSHB source revision. It does **not** claim to exhaust
all graphic structure in the underlying manuscript or in the wider Masoretic
tradition.

**Presence** of a marker directly attests an explicit P/S event in this
electronic witness. It *may support* a literary-boundary judgment when it
converges with linguistic, discourse, genre and contextual evidence. It does
not establish one on its own.

**Absence** of a marker establishes only that no explicit P/S event is encoded
at that anchor in this source. It must **not** be used as evidence that no
other graphic division, no literary boundary, or no suitable teaching boundary
exists there.

Three claims must stay distinct:

| Claim | Extractable from this dataset? |
| --- | --- |
| A. No `x-pe`/`x-samekh` element here in this source | **Yes** |
| B. No graphic division here in the witness | No |
| C. No literary boundary here | No |

Literary boundaries frequently occur with no corresponding P/S marker, **in
every book**. This is why the machine-readable `evidence_scope` block is
byte-identical in all 39 files and does not vary with a book's marker count. An
earlier draft made the policy depend on whether a book's layer was empty, which
would have licensed absence-as-negative-evidence in the 37 books that have
markers — precisely the inference this section forbids.

Per-book `source_limitations` explain *why* a count is what it is. They never
change the inference policy.

## Marker density varies by text form — it is not a correctness signal

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
previous analysis treated as diagnostic of corruption. Lamentations is a
**structure-sensitive regression invariant for the pinned OSHB/WLC source** —
its marker count tracks the 22-letter acrostic (chapters 1–4 carry 22 each,
chapter 5, which is not alphabetically acrostic, carries 1). The
correspondence is deliberate rather than accidental, and it guards strongly
against indiscriminate or misplaced extraction.

It is **not independent witness verification.** The expected pattern is derived
from the same Leningrad tradition being tested, and other Masoretic traditions
divide Lamentations 3 differently — the Aleppo reconstruction is commonly
reported as placing a setumah between each of its 66 individual verses rather
than each 3-verse letter group. A defective transformation could also preserve
per-chapter counts while misplacing individual events. The strongest guarantee
remains the source-node-to-output-event bijection.

Density is **text-form-, layout-, discourse-function- and witness-dependent**.
Broad genre contributes but does not explain it: the high-density books are not
one genre. Lamentations is acrostic/strophic; Ezra and Nehemiah mix narrative
with documents, registers and building assignments; 1 Chronicles is largely
genealogy and catalogue. What they share is textual forms that divide naturally
into many short graphic units — alphabetic strophes, genealogical entries,
catalogues, administrative clauses, short formulaic records.

The practical consequence for interpretation: in a high-density book a nearby
marker carries little information, while in a sparse book it carries a lot.

Density remains useful as an **anomaly signal against this pinned source** (the
pre-rebuild Genesis figure of 1,034 against an expected 92 is an obvious one).
It is not a correctness criterion — that role belongs to the source-to-output
bijection.

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

## What this dataset does and does not claim

Three different kinds of statement appear in this file, and they carry
different weight. Keeping them apart stops corrected data acquiring more
authority than it has.

**Direct source observations** — raw facts about OSHB commit `3d15126f`, checkable
by inspecting the XML:

- 3,162 matching elements; 1,181 `x-pe`; 1,981 `x-samekh`
- per-book and per-chapter element counts
- 30 verses containing more than one matching element

**Deterministic derivations** — defensible, but produced by an operational rule
rather than read off the source:

- 3,072 `verse_end` and 90 `within_verse` markers

  The rule: *a later `<w>` descendant exists inside the verse → `within_verse`;
  none exists → `verse_end`.* `verse_end` is **not** encoded by OSHB; it is
  derived from document order. It is stated here so no reader assumes otherwise.

**Scholarly interpretations** — none of these are established by the extractor,
and this dataset does not settle them:

- that a marker begins a major literary unit
- that a petuchah is a stronger division than a setumah
- that the absence of a marker weakens a proposed boundary
- that a marker reflects an authorial rather than a scribal division
- that this source exhaustively represents every relevant graphic division

The one-sentence description of what this dataset is:

> A complete, position-aware extraction of explicit `x-pe` and `x-samekh`
> graphic-separation events from one pinned OSHB/WLC electronic witness —
> suitable as witness-specific supporting evidence, not as a self-interpreting
> map of literary units.

The summary formulation:

> This dataset records explicit P/S-type boundary events in one pinned
> WLC-derived electronic witness. It does not exhaust the graphic structure of
> every biblical book, and it does not by itself determine literary or
> teaching-unit boundaries.

## A note on "independent" verification

OSHB, WLC and UXLC are genealogically related electronic texts — UXLC is a fork
of WLC 4.20, and OSHB uses the same WLC textual base. Agreement among them is
therefore **not** independent manuscript evidence.

This matters for how the verification in this repository is described. A second
parser over the same OSHB XML is *independent implementation verification*, and
that is what the test suite provides. It is not *independent witness
verification*, which would require a genuinely different manuscript tradition
such as the Aleppo-based transcriptions.

## Corpus summary

| | |
| --- | --- |
| Books | 39 |
| Marker events | 3,162 |
| Petuchot | 1,181 |
| Setumot | 1,981 |
| Unique verse `osisID` values inspected | 23,213 |
| Verses with more than one marker | 30 |
| Books with no marker layer | 2 (Psalms, Obadiah) |

**On the verse figure.** 23,213 is a count over a precisely defined XML
structure, not a conventional Bible verse total, and should not be compared
directly with totals from other versification systems. Specifically: it counts
**unique `osisID` values on `<verse>` elements**; the corpus contains no
milestone-style `sID`/`eID` verse nodes and no duplicate `osisID` values, so
element count and unique count coincide. It follows OSHB's Hebrew/Masoretic
versification, in which **Psalm superscriptions are numbered verses** — Psalm 3
runs `Ps.3.1`–`Ps.3.9` where English numbering gives 8 verses plus an unnumbered
superscription.

Also worth recording: **no `osisID` in this corpus spans multiple verses.** The
extractor handles a space-separated span by anchoring to its final verse, but
that path is unexercised at this revision.
