# Masoretic Marker Corruption Incident

## Summary

The Old Testament Masoretic paragraph-marker corpus introduced in `56c1e80`
was corrupted by a letter-matching extraction method. It treated any Hebrew
letter pe (`פ`) as a petuchah marker and any samekh (`ס`) as a setumah marker,
even when the letter occurred inside an ordinary word. The result was a dense
false-positive layer: Genesis carried 1,034 marker entries where the corrected
OSHB/WLC corpus carries 92, and Ruth carried 39 where OSHB/WLC carries one.

Production data has been repaired. This document records the incident and the
offline audit added for issue #128:
`server/scripts/reproduce-masoretic-corruption.py` and the quarantined fixture
bundle under `server/scripts/fixtures/masoretic-corruption/`.

## Timeline

| Date / commit | Event |
| --- | --- |
| `56c1e80` | Added the original Masoretic JSON files under `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/`. These are now archived as intentionally corrupt fixtures. |
| `ed50f51` | Last pre-repair tree; the corrupt JSON files are byte-identical to `56c1e80`. |
| `769737a` | Rebuilt the Masoretic marker corpus from explicit OSHB XML `<seg type="x-pe">` and `<seg type="x-samekh">` markup at `openscriptures/morphhb@3d15126fb1ef74867fc1434be1942e837932691f`. |
| `3e77050` | Repaired production D1 paragraph-marker data. |
| `1d5dca6` | Fixed `biblical-segmentation` verification so a claim is certified only by exact chapter:verse, marker type, and `verse_end` position. |
| `b204fec` | Reframed Masoretic markers as witness-relative graphic evidence, not proof of authorial literary intent. |
| Issue #128 audit | Added the reproducible corruption audit, historical fixtures, incident report, and provenance record. |

## Mechanism

The original extractor cannot be recovered from the repository. The archived
outputs are reproducible, however, from byte-pinned Sefaria-Export sources at
`bb791327`.

The reproducer proves two separate facts for Genesis and Ruth:

- Scanning the Sefaria **Miqra according to the Masorah** JSON with a naive
  per-verse `פ` / `ס` character test exactly reproduces the corrupt arrays.
- Scanning Sefaria **Tanach with Text Only** gives the running-letter control
  counts. For Genesis those controls are 624 petuchah-bearing verses and 333
  setumah-bearing verses, proving the false positives are ordinary letters in
  text, not just visible paragraph symbols.

Correct headline counts:

| Book | Corrupt petuchot | Corrupt setumot | Double-listed verses | Corrected OSHB/WLC markers |
| --- | ---: | ---: | ---: | ---: |
| Genesis | 655 | 379 | 208 | 42 petuchot + 50 setumot |
| Ruth | 31 | 8 | 4 | 1 petuchah |

The issue’s attempted reconciliation of `31+11=42` and mirrored `46+4=50`
mixed the Sefaria/Maimonidean source with OSHB/WLC locations. It is not
reproducible as a witness-scoped claim and is not retained.

## Blast Radius

The corrupted layer affected the data served by `query_paragraph_breaks` and
therefore any instruction path that asked agents to consult Masoretic paragraph
markers. The seven direct repository consumers were:

- `plugins/claude-of-alexandria/agents/data-retriever.md`
- `plugins/claude-of-alexandria/agents/pericope-delimitation.md`
- `plugins/claude-of-alexandria/agents/argument-flow.md`
- `plugins/claude-of-alexandria/agents/biblical-scholar.md`
- `plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md`
- `plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md`
- `plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`

The practical failure mode was over-certification. Because the corrupt marker
layer was so dense, a proposed Old Testament boundary could look supported by
Masoretic evidence almost anywhere.

## Verification Failure

`verify_claims.py` had a separate self-certification bug: it matched cited
references by substring. A claim at `1:2`, for example, could match a real
marker at `1:23`. After `1d5dca6`, certification requires all of the following:

- exact chapter and verse;
- exact marker type;
- `position == "verse_end"`.

Within-verse markers are real graphic events, but they no longer certify a
claim that a passage ends after that verse.

## Repair And Validation

The repaired corpus is generated from OSHB/WLC XML at
`3d15126fb1ef74867fc1434be1942e837932691f` by
`plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_oshb_paragraphs.py`.
It reads explicit XML marker elements, verifies every source file against
`oshb-checksums.json`, and emits schema-versioned JSON with per-marker
position semantics.

The issue #128 audit is intentionally independent of production runtime APIs.
It archives all 39 corrupt JSON files, verifies fixture SHA-256 values before
analysis, reproduces Genesis/Ruth from historical Sefaria sources, checks
witness-labelled OSHB/WLC goldens, and prints corrected density metrics.

The main branch also carries a skill-local forensic archive under
`plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/fixtures/masoretic-corruption/`.
That archive is useful incident evidence beside the canonical extractor; the
server-side bundle documented here is the independently checkable issue #128
audit artifact.

Run:

```bash
python3 server/scripts/reproduce-masoretic-corruption.py
python3 server/scripts/test_reproduce_masoretic_corruption.py -v
```

Validation limits:

- The original uncommitted extractor is not recoverable.
- The historical Sefaria sources are a byte-pinned reconstruction that exactly
  reproduces its committed outputs for Genesis and Ruth.
- The current corpus is OSHB/WLC-specific; other witnesses can legitimately
  disagree.

## Prevention Lessons

- Feature extraction must parse source structure, not inspect display text for
  meaningful letters or symbols.
- Every data source must name its witness and upstream revision.
- Dense-reference data needs count and density checks that can fail loudly.
- Verification code must match exact structured references, not substrings.
- Historical corrupt data may be archived only in clearly quarantined fixture
  locations with manifest hashes and explicit "intentionally wrong" labels.
