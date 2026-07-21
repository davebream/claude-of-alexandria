# Paragraph Marker Provenance

## Canonical Corpus

The live Old Testament paragraph-marker corpus is the schema-v2 dataset under:

`plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/`

Its provenance chain is:

- Witness: Westminster Leningrad Codex as encoded by OpenScriptures Hebrew Bible
- Upstream revision: `3d15126fb1ef74867fc1434be1942e837932691f`
- Extractor: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_oshb_paragraphs.py`
- Checksum lockfile: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/oshb-checksums.json`
- Verification suite: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/test_extract_oshb_paragraphs.py`

The canonical extraction reads explicit `seg[type=x-pe|x-samekh]` markup. It does not infer markers from lexical content.

## Forensic Archive

The historical corrupt corpus is committed only as read-only incident evidence:

`plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/fixtures/masoretic-corruption/intentionally-corrupt-pre-fix/`

Those files were imported on `2026-07-21` from commit:

`ed50f5139e5747b57460e0e4e8b6de4235e51c16`

They are accompanied by:

- `MANIFEST.md`: source commit, warning, file count, total bytes, SHA-256
- `genuine-goldens.json`: independent literal goldens for Genesis and Ruth
- `reproduce_masoretic_corruption.py`: deterministic forensic proof of the bug

These fixtures are not fallback data, not alternate witness data, and not regeneration input for the live corpus.

## Independent Goldens

Two literal goldens are committed because they are independent of the reproduction mechanism:

- Genesis: `42` petuchot and `50` setumot, with the creation-sequence petuchot at `1:5`, `1:8`, `1:13`, `1:19`, `1:23`, `1:31`, and `2:3`
- Ruth: exactly one petuchah at `4:17`

The Genesis sequence intentionally extends through `2:3`. Labeling it merely "Genesis 1" is too loose and obscures the final creation marker.

## Historical Boundary

The original corrupt generator was never committed, so the repository cannot preserve an exact rerun of that script. What the repository now preserves is stronger for audit purposes:

- the exact corrupt outputs that shipped,
- their hashes and source commit,
- the exact corrected witness bytes used now,
- and a deterministic measurement of how closely those corrupt outputs track bare-letter matches union genuine markers for that witness base.

That is the provenance boundary future maintainers need to keep straight.
