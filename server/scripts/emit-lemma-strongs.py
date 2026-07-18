#!/usr/bin/env python3
"""Emit deduped (lemma, strongs, occurrence_count) TSV from the MACULA Hebrew
source, to feed the downstream Hebrew lemma_translit generator.

The load-bearing invariant is byte-identity: the lemma bytes written here MUST
equal the bytes the extractor stores into morphology.lemma, because the
transliteration backfill joins on exact lemma bytes. To guarantee that, the
lemma is parsed via extract_macula_hebrew.parse_lemma_field — the SAME helper
the extractor's row loop calls — with no .strip() and no Unicode normalization.

Sub-segment finding (MACULA splits some words into multiple morpheme rows
sharing one word_position): each split row carries the FULL per-morpheme
citation lemma, not a partial fragment. Verified against the real corpus —
GEN 1:1!1 splits into בְּ + רֵאשִׁית, both complete dictionary lemmas, and 0 of
475,911 rows have an empty lemma. Each such lemma is stored verbatim in
morphology.lemma and needs a transliteration, so sub-segment rows are INCLUDED.
The only rows excluded are empty-lemma rows (a defensive guard; none exist in
the current corpus). Exclusions are reported on stderr, never stdout.

Strong's follows the extractor's exact derivation: `H{n}` for a numeric id
(H-prefixed, spelled exactly as MACULA attests — i.e. the source's own
zero-padded 4-digit form, byte-identical to morphology.strongs; the downstream
generator's pad/unpad reconcile the padded↔unpadded consumer spellings), the raw
value for a non-numeric id, and "" when the source row has no Strong's number.

Usage:
    python3 server/scripts/emit-lemma-strongs.py <macula-source.tsv> <out.tsv>
"""

import importlib.util
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

# Column index of strongnumberx in the MACULA Hebrew TSV (mirrors the
# extractor's COL_STRONGNUMBERX).
COL_STRONGNUMBERX = 6
_MACULA_FIELD_COUNT = 32


def _load_extractor():
    """Import the hyphenated extractor as a module so the emit script and the
    extractor share one lemma parse (parse_lemma_field)."""
    spec = importlib.util.spec_from_file_location(
        "extract_macula_hebrew", SCRIPTS_DIR / "extract-macula-hebrew.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_extractor = _load_extractor()
parse_lemma_field = _extractor.parse_lemma_field


def parse_strongs_field(line: str) -> str:
    """Derive the Strong's value for one MACULA line exactly as the extractor's
    row loop does: H-prefix for a numeric id (unpadded), the raw value for a
    non-numeric id, "" when there is no Strong's number."""
    fields = line.strip("\n").split("\t")
    while len(fields) < _MACULA_FIELD_COUNT:
        fields.append("")
    strongnumberx = fields[COL_STRONGNUMBERX] or None
    if not strongnumberx:
        return ""
    s = strongnumberx.strip()
    if s and s[0].isdigit():
        return f"H{s}"
    if s:
        return s
    return ""


def emit(source_path, out_path) -> dict:
    """Read the MACULA TSV at source_path, emit a deduped
    `lemma\\tstrongs\\tcount` TSV to out_path, and print an exclusion report to
    stderr. Returns the report counts."""
    counts: dict[tuple[str, str], int] = {}
    rows_read = 0
    empty_lemma_excluded = 0

    with open(source_path, "r", encoding="utf-8") as f:
        f.readline()  # skip header
        for line in f:
            if not line.strip("\n"):
                continue  # skip blank lines
            rows_read += 1
            lemma = parse_lemma_field(line)
            if lemma == "":
                empty_lemma_excluded += 1
                continue
            strongs = parse_strongs_field(line)
            key = (lemma, strongs)
            counts[key] = counts.get(key, 0) + 1

    # Deterministic ordering keeps the output stable across runs.
    with open(out_path, "w", encoding="utf-8") as out:
        for (lemma, strongs), count in sorted(counts.items()):
            out.write(f"{lemma}\t{strongs}\t{count}\n")

    report = {
        "rows_read": rows_read,
        "empty_lemma_excluded": empty_lemma_excluded,
        "distinct_lemma_strongs": len(counts),
    }
    print(f"rows read: {report['rows_read']}", file=sys.stderr)
    print(
        f"empty-lemma rows excluded: {report['empty_lemma_excluded']}",
        file=sys.stderr,
    )
    print(
        f"distinct (lemma, strongs) emitted: {report['distinct_lemma_strongs']}",
        file=sys.stderr,
    )
    return report


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 2:
        print(
            "usage: emit-lemma-strongs.py <macula-source.tsv> <out.tsv>",
            file=sys.stderr,
        )
        return 2
    emit(Path(argv[0]), Path(argv[1]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
