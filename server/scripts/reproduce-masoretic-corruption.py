#!/usr/bin/env python3
"""Reproduce the Masoretic paragraph-marker corruption from archived inputs.

This is an offline audit artifact for issue #128. It deliberately keeps the
old corrupt JSON files in a quarantined fixture directory and proves how they
were produced from Sefaria text by a naive Hebrew-letter scan.

Usage:
    python3 server/scripts/reproduce-masoretic-corruption.py
    python3 server/scripts/reproduce-masoretic-corruption.py --fixtures-dir PATH

Exit codes:
    0  complete reproduction
    1  analytical mismatch
    2  invalid, missing, or modified inputs
"""

from __future__ import annotations

import argparse
import hashlib
import html.parser
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent.parent
DEFAULT_FIXTURES_DIR = SCRIPTS_DIR / "fixtures" / "masoretic-corruption"
CORRECTED_MASORETIC_DIR = (
    REPO_ROOT
    / "plugins"
    / "claude-of-alexandria"
    / "skills"
    / "biblical-segmentation"
    / "reference"
    / "masoretic"
)

PE = "\u05e4"
SAMEKH = "\u05e1"


class InvalidInputError(Exception):
    """Fixture bundle is missing, modified, or malformed."""


class AnalyticalMismatchError(Exception):
    """Inputs were valid, but the reproduction did not match the audit claims."""


@dataclass(frozen=True)
class ScanResult:
    petuchot: list[str]
    setumot: list[str]

    @property
    def total_entries(self) -> int:
        return len(self.petuchot) + len(self.setumot)

    @property
    def double_listed_verses(self) -> int:
        return len(set(self.petuchot) & set(self.setumot))

    @property
    def unique_marked_verses(self) -> int:
        return len(set(self.petuchot) | set(self.setumot))


class HtmlTextExtractor(html.parser.HTMLParser):
    """Collect text nodes from Sefaria verse HTML without regex parsing."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(65536), b""):
                digest.update(chunk)
    except OSError as exc:
        raise InvalidInputError(f"cannot read {path}: {exc}") from exc
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise InvalidInputError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise InvalidInputError(f"malformed JSON in {path}: {exc}") from exc


def strip_html(value: str) -> str:
    parser = HtmlTextExtractor()
    try:
        parser.feed(value)
        parser.close()
    except html.parser.HTMLParseError as exc:
        raise InvalidInputError(f"malformed Sefaria HTML: {exc}") from exc
    return parser.text()


def iter_verse_strings(node: Any, path: tuple[int, ...] = ()) -> Iterable[tuple[str, str]]:
    """Walk a Sefaria nested text array and yield 1-based chapter:verse refs."""
    if isinstance(node, list):
        for index, child in enumerate(node, start=1):
            yield from iter_verse_strings(child, (*path, index))
        return
    if isinstance(node, str):
        if len(path) != 2:
            raise InvalidInputError(
                f"expected chapter/verse depth 2 in Sefaria text, got path {path}"
            )
        yield f"{path[0]}:{path[1]}", node
        return
    raise InvalidInputError(f"unexpected Sefaria text node type {type(node).__name__}")


def naive_letter_scan(sefaria_source: dict[str, Any]) -> ScanResult:
    text = sefaria_source.get("text")
    if not isinstance(text, list):
        raise InvalidInputError("Sefaria source lacks a top-level text array")

    petuchot: list[str] = []
    setumot: list[str] = []
    for ref, verse_html in iter_verse_strings(text):
        verse_text = strip_html(verse_html)
        if PE in verse_text:
            petuchot.append(ref)
        if SAMEKH in verse_text:
            setumot.append(ref)
    return ScanResult(petuchot=petuchot, setumot=setumot)


def load_corrupt_book(fixtures_dir: Path, filename: str) -> dict[str, Any]:
    data = load_json(fixtures_dir / "corrupt-json" / filename)
    if not isinstance(data.get("petuchot"), list) or not isinstance(data.get("setumot"), list):
        raise InvalidInputError(f"{filename} lacks petuchot/setumot arrays")
    return data


def scan_corrupt_book(data: dict[str, Any]) -> ScanResult:
    return ScanResult(petuchot=list(data["petuchot"]), setumot=list(data["setumot"]))


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AnalyticalMismatchError(f"{label}: expected {expected!r}, got {actual!r}")


def verify_hashes(fixtures_dir: Path, manifest: dict[str, Any]) -> None:
    corrupt_dir = fixtures_dir / "corrupt-json"
    sefaria_dir = fixtures_dir / "sefaria-export"
    if not corrupt_dir.is_dir():
        raise InvalidInputError(f"missing corrupt fixture directory: {corrupt_dir}")
    if not sefaria_dir.is_dir():
        raise InvalidInputError(f"missing Sefaria fixture directory: {sefaria_dir}")

    for filename, record in manifest.get("corrupt_json", {}).items():
        path = corrupt_dir / filename
        if sha256_file(path) != record.get("sha256"):
            raise InvalidInputError(f"checksum mismatch for corrupt fixture {filename}")
        load_corrupt_book(fixtures_dir, filename)

    for filename, record in manifest.get("sefaria_sources", {}).items():
        path = sefaria_dir / filename
        if sha256_file(path) != record.get("sha256"):
            raise InvalidInputError(f"checksum mismatch for Sefaria fixture {filename}")
        data = load_json(path)
        if not isinstance(data, dict) or "text" not in data:
            raise InvalidInputError(f"Sefaria fixture {filename} lacks text")

    golden_record = manifest.get("golden_fixture", {})
    golden_path = fixtures_dir / golden_record.get("filename", "oshb-wlc-golden.json")
    if sha256_file(golden_path) != golden_record.get("sha256"):
        raise InvalidInputError(f"checksum mismatch for golden fixture {golden_path.name}")
    load_json(golden_path)


def load_manifest(fixtures_dir: Path) -> dict[str, Any]:
    manifest = load_json(fixtures_dir / "manifest.json")
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise InvalidInputError("manifest.json has an unsupported schema")
    return manifest


def verify_fixture_bundle(fixtures_dir: Path) -> dict[str, Any]:
    manifest = load_manifest(fixtures_dir)
    verify_hashes(fixtures_dir, manifest)
    return manifest


def source(fixtures_dir: Path, filename: str) -> dict[str, Any]:
    data = load_json(fixtures_dir / "sefaria-export" / filename)
    if not isinstance(data, dict):
        raise InvalidInputError(f"{filename} is not a JSON object")
    return data


def prove_genesis_and_ruth(fixtures_dir: Path) -> list[str]:
    lines: list[str] = []
    cases = [
        (
            "Genesis",
            "genesis.json",
            "genesis-miqra-according-to-the-masorah.json",
            "genesis-tanach-with-text-only.json",
            (655, 379, 208),
            (624, 333),
        ),
        (
            "Ruth",
            "ruth.json",
            "ruth-miqra-according-to-the-masorah.json",
            "ruth-tanach-with-text-only.json",
            (31, 8, 4),
            (30, 8),
        ),
    ]

    for book, corrupt_name, marked_name, plain_name, expected_marked, expected_plain in cases:
        corrupt = scan_corrupt_book(load_corrupt_book(fixtures_dir, corrupt_name))
        marked_scan = naive_letter_scan(source(fixtures_dir, marked_name))
        assert_equal(marked_scan.petuchot, corrupt.petuchot, f"{book} petuchot reproduction")
        assert_equal(marked_scan.setumot, corrupt.setumot, f"{book} setumot reproduction")
        assert_equal(
            (
                len(marked_scan.petuchot),
                len(marked_scan.setumot),
                marked_scan.double_listed_verses,
            ),
            expected_marked,
            f"{book} marked-source counts",
        )
        plain_scan = naive_letter_scan(source(fixtures_dir, plain_name))
        assert_equal(
            (len(plain_scan.petuchot), len(plain_scan.setumot)),
            expected_plain,
            f"{book} plain-text letter controls",
        )
        lines.append(
            f"PASS {book}: marked Sefaria scan reproduces corrupt arrays "
            f"({expected_marked[0]} petuchot, {expected_marked[1]} setumot, "
            f"{expected_marked[2]} double-listed verses)"
        )
        lines.append(
            f"PASS {book}: plain-text running-letter controls are "
            f"{expected_plain[0]}/{expected_plain[1]}"
        )
    return lines


def corrupt_corpus_stats(fixtures_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    totals = Counter()
    unique_verses: set[tuple[str, str]] = set()
    per_book: list[dict[str, Any]] = []

    for filename, record in sorted(manifest["corrupt_json"].items()):
        data = scan_corrupt_book(load_corrupt_book(fixtures_dir, filename))
        verse_count = int(record["verse_count"])
        total_entries = data.total_entries
        unique_count = data.unique_marked_verses
        totals.update(
            {
                "petuchot": len(data.petuchot),
                "setumot": len(data.setumot),
                "total_entries": total_entries,
            }
        )
        for ref in set(data.petuchot) | set(data.setumot):
            unique_verses.add((filename, ref))
        per_book.append(
            {
                "filename": filename,
                "entries": total_entries,
                "unique": unique_count,
                "verse_count": verse_count,
                "entry_density": total_entries / verse_count,
                "unique_density": unique_count / verse_count,
            }
        )

    verse_denominator = sum(int(r["verse_count"]) for r in manifest["corrupt_json"].values())
    return {
        **dict(totals),
        "verses_with_entries": len(unique_verses),
        "verse_denominator": verse_denominator,
        "entry_density": totals["total_entries"] / verse_denominator,
        "unique_marked_verse_density": len(unique_verses) / verse_denominator,
        "per_book": per_book,
    }


def corrected_corpus_stats(corrected_dir: Path = CORRECTED_MASORETIC_DIR) -> dict[str, Any]:
    totals = Counter()
    per_book: list[dict[str, Any]] = []
    for path in sorted(corrected_dir.glob("*.json")):
        data = load_json(path)
        metadata = data.get("_metadata", {})
        markers = data.get("markers", [])
        if not isinstance(markers, list) or "verse_count" not in metadata:
            raise InvalidInputError(f"corrected corpus file {path.name} is malformed")
        verse_count = int(metadata["verse_count"])
        petuchot = sum(1 for marker in markers if marker.get("type") == "petuchah")
        setumot = sum(1 for marker in markers if marker.get("type") == "setumah")
        signs = len(data.get("graphic_signs", []))
        totals.update(
            {
                "petuchot": petuchot,
                "setumot": setumot,
                "markers": len(markers),
                "graphic_signs": signs,
                "verse_count": verse_count,
            }
        )
        per_book.append(
            {
                "filename": path.name,
                "markers": len(markers),
                "verse_count": verse_count,
                "marker_density": len(markers) / verse_count,
            }
        )
    return {**dict(totals), "per_book": per_book}


def min_max_density(per_book: list[dict[str, Any]], key: str) -> tuple[dict[str, Any], dict[str, Any]]:
    nonzero = [row for row in per_book if row[key] > 0]
    if not nonzero:
        raise AnalyticalMismatchError(f"no nonzero rows for {key}")
    return min(nonzero, key=lambda row: row[key]), max(nonzero, key=lambda row: row[key])


def prove_corpus_metrics(fixtures_dir: Path, manifest: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    corrupt = corrupt_corpus_stats(fixtures_dir, manifest)
    expected_corrupt = manifest["corrupt_corpus_summary"]
    assert_equal(corrupt["total_entries"], expected_corrupt["total_entries"], "corrupt entry total")
    assert_equal(corrupt["petuchot"], expected_corrupt["petuchot"], "corrupt petuchot total")
    assert_equal(corrupt["setumot"], expected_corrupt["setumot"], "corrupt setumot total")
    assert_equal(
        corrupt["verses_with_entries"],
        expected_corrupt["verses_with_entries"],
        "corrupt unique verse total",
    )
    assert_equal(
        corrupt["verse_denominator"],
        expected_corrupt["total_verses_denominator"],
        "corrupt verse denominator",
    )

    entry_min, entry_max = min_max_density(corrupt["per_book"], "entry_density")
    unique_min, unique_max = min_max_density(corrupt["per_book"], "unique_density")
    assert_equal(round(entry_min["entry_density"], 3), 0.459, "minimum corrupt entry density")
    assert_equal(round(entry_max["entry_density"], 3), 1.442, "maximum corrupt entry density")
    assert_equal(round(unique_min["unique_density"], 3), 0.412, "minimum corrupt unique density")
    assert_equal(round(unique_max["unique_density"], 3), 0.948, "maximum corrupt unique density")

    lines.append(
        "PASS corrupt corpus: 18,796 entries across 23,213 verses "
        f"(entry density {corrupt['entry_density']:.6f})"
    )
    lines.append(
        "PASS corrupt density range: entries "
        f"{entry_min['filename']}={entry_min['entry_density']:.3f} to "
        f"{entry_max['filename']}={entry_max['entry_density']:.3f}; unique verses "
        f"{unique_min['filename']}={unique_min['unique_density']:.3f} to "
        f"{unique_max['filename']}={unique_max['unique_density']:.3f}"
    )

    corrected = corrected_corpus_stats()
    expected_corrected = manifest["corrected_corpus_summary"]
    assert_equal(corrected["markers"], expected_corrected["markers"], "corrected marker total")
    assert_equal(corrected["petuchot"], expected_corrected["petuchot"], "corrected petuchot total")
    assert_equal(corrected["setumot"], expected_corrected["setumot"], "corrected setumot total")
    assert_equal(corrected["graphic_signs"], expected_corrected["graphic_signs"], "graphic sign total")
    assert_equal(corrected["verse_count"], expected_corrupt["total_verses_denominator"], "corrected denominator")
    corrected_min = min(corrected["per_book"], key=lambda row: row["marker_density"])
    corrected_max = max(corrected["per_book"], key=lambda row: row["marker_density"])
    assert_equal(round(corrected_min["marker_density"], 3), 0.0, "minimum corrected marker density")
    assert_equal(round(corrected_max["marker_density"], 3), 0.578, "maximum corrected marker density")
    lines.append(
        "PASS corrected OSHB/WLC corpus: 3,162 markers and 20 graphic signs "
        f"(density range {corrected_min['marker_density']:.3f}-"
        f"{corrected_max['marker_density']:.3f})"
    )
    return lines


def prove_goldens(fixtures_dir: Path) -> list[str]:
    golden = load_json(fixtures_dir / "oshb-wlc-golden.json")
    genesis = load_json(CORRECTED_MASORETIC_DIR / "genesis.json")
    ruth = load_json(CORRECTED_MASORETIC_DIR / "ruth.json")

    assert_equal(golden["genesis"]["petuchot"], 42, "Genesis golden petuchot")
    assert_equal(golden["genesis"]["setumot"], 50, "Genesis golden setumot")
    assert_equal(golden["genesis"]["total"], 92, "Genesis golden total")
    assert_equal(golden["ruth"]["petuchot"], 1, "Ruth golden petuchot")
    assert_equal(golden["ruth"]["setumot"], 0, "Ruth golden setumot")
    assert_equal(golden["ruth"]["markers"], [{"chapter": 4, "ordinal_in_verse": 1, "position": "verse_end", "type": "petuchah", "verse": 17}], "Ruth marker")

    genesis_slice = [
        {
            "chapter": marker["chapter"],
            "ordinal_in_verse": marker["ordinal_in_verse"],
            "position": marker["position"],
            "type": marker["type"],
            "verse": marker["verse"],
        }
        for marker in genesis["markers"]
        if marker["type"] == "petuchah"
        and marker["position"] == "verse_end"
        and (marker["chapter"] == 1 or (marker["chapter"] == 2 and marker["verse"] == 3))
    ]
    ruth_markers = [
        {
            "chapter": marker["chapter"],
            "ordinal_in_verse": marker["ordinal_in_verse"],
            "position": marker["position"],
            "type": marker["type"],
            "verse": marker["verse"],
        }
        for marker in ruth["markers"]
    ]
    assert_equal(
        genesis_slice,
        golden["genesis"]["verse_end_petuchot_in_genesis_1_plus_2_3"],
        "Genesis 1 plus 2:3 golden slice",
    )
    assert_equal(ruth_markers, golden["ruth"]["markers"], "Ruth golden current-corpus slice")
    return [
        "PASS OSHB/WLC golden: Genesis 42+50 and creation-day/2:3 petuchot match",
        "PASS OSHB/WLC golden: Ruth has one verse_end petuchah at 4:17",
    ]


def run_audit(fixtures_dir: Path = DEFAULT_FIXTURES_DIR) -> list[str]:
    manifest = verify_fixture_bundle(fixtures_dir)
    lines = [f"PASS fixture integrity: {fixtures_dir}"]
    lines.extend(prove_genesis_and_ruth(fixtures_dir))
    lines.extend(prove_goldens(fixtures_dir))
    lines.extend(prove_corpus_metrics(fixtures_dir, manifest))
    lines.append("SUMMARY PASS: Masoretic corruption reproduction is complete.")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures-dir",
        type=Path,
        default=DEFAULT_FIXTURES_DIR,
        help="fixture bundle directory (default: adjacent committed bundle)",
    )
    args = parser.parse_args(argv)

    try:
        for line in run_audit(args.fixtures_dir):
            print(line)
        return 0
    except InvalidInputError as exc:
        print(f"FAIL invalid-input: {exc}", file=sys.stderr)
        return 2
    except AnalyticalMismatchError as exc:
        print(f"FAIL analytical-mismatch: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
