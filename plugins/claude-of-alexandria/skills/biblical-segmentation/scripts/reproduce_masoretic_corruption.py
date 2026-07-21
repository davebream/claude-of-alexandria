#!/usr/bin/env python3
"""Forensically reproduce the historical Masoretic marker corruption.

This script does NOT regenerate the committed schema-v2 corpus. Its job is to
measure the historical failure mode against archived corrupt fixtures:

  same-witness reconstruction := bare-letter verse matches U genuine markers

The "genuine" side is recomputed directly from the pinned OSHB XML with the
canonical extractor, not read back from the committed corrected JSONs. The
historical corrupt fixtures came from a different, uncommitted source pipeline,
so an exact match is informative when it happens but is not assumed silently.

Usage:
    python3 reproduce_masoretic_corruption.py
    python3 reproduce_masoretic_corruption.py --book Genesis --book Ruth
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import extract_oshb_paragraphs as oshb

SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURE_ROOT = SCRIPT_DIR / "fixtures" / "masoretic-corruption"
CORRUPT_DIR = FIXTURE_ROOT / "intentionally-corrupt-pre-fix"
GOLDENS_PATH = FIXTURE_ROOT / "genuine-goldens.json"

LEGACY_KEYS = ("petuchot", "setumot")
BARE_LETTERS = {"petuchot": "פ", "setumot": "ס"}


def verse_ref(chapter: int, verse: int) -> str:
    return f"{chapter}:{verse}"


def ordered_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def parse_corrupt_fixture(path: Path) -> dict[str, list[str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("book") is None:
        raise ValueError(f"{path.name}: missing 'book'")
    for key in LEGACY_KEYS:
        value = payload.get(key)
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError(f"{path.name}: expected '{key}' to be a list[str]")
    return {key: payload[key] for key in LEGACY_KEYS}


def load_goldens(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("witness") != f"WLC/OSHB@{oshb.COMMIT_SHA}":
        raise ValueError(
            f"{path.name}: witness mismatch, expected WLC/OSHB@{oshb.COMMIT_SHA}"
        )
    return payload


def verse_order(xml_path: Path) -> list[str]:
    order: list[str] = []
    root = ET.parse(xml_path).getroot()
    for elem in root.iter():
        if oshb._local_tag(elem) != "verse" or not elem.get("osisID"):
            continue
        chapter, verse = oshb.parse_osis_id(elem.get("osisID"))
        order.append(verse_ref(chapter, verse))
    return order


def collect_bare_letter_anchors(xml_path: Path) -> dict[str, list[str]]:
    root = ET.parse(xml_path).getroot()
    anchors = {key: [] for key in LEGACY_KEYS}
    seen = {key: set() for key in LEGACY_KEYS}

    for elem in root.iter():
        if oshb._local_tag(elem) != "verse" or not elem.get("osisID"):
            continue
        chapter, verse = oshb.parse_osis_id(elem.get("osisID"))
        anchor = verse_ref(chapter, verse)
        for child in list(elem):
            if oshb._local_tag(child) != "w":
                continue
            text = "".join(child.itertext())
            for key, letter in BARE_LETTERS.items():
                if letter in text and anchor not in seen[key]:
                    seen[key].add(anchor)
                    anchors[key].append(anchor)
    return anchors


def canonicalize_anchors(anchors: set[str], order: list[str]) -> list[str]:
    rank = {anchor: idx for idx, anchor in enumerate(order)}
    unknown = sorted(anchors - set(rank))
    if unknown:
        raise ValueError(f"anchor(s) not present in source verse order: {unknown[:5]}")
    return sorted(anchors, key=rank.__getitem__)


def genuine_marker_events(xml_path: Path) -> list[dict]:
    root = ET.parse(xml_path).getroot()
    events: list[dict] = []
    book_label = xml_path.stem
    for elem in root.iter():
        if oshb._local_tag(elem) != "verse" or not elem.get("osisID"):
            continue
        chapter, verse = oshb.parse_osis_id(elem.get("osisID"))
        events.extend(oshb._marker_events_in_verse(elem, chapter, verse, book_label))
    return events


def genuine_marker_anchors(xml_path: Path) -> dict[str, list[str]]:
    events = genuine_marker_events(xml_path)
    return {
        "petuchot": [verse_ref(e["chapter"], e["verse"]) for e in events if e["type"] == "petuchah"],
        "setumot": [verse_ref(e["chapter"], e["verse"]) for e in events if e["type"] == "setumah"],
    }


def validate_ground_truth(book: str, genuine: dict[str, list[str]], goldens: dict) -> None:
    expected = goldens["books"].get(book)
    if expected is None:
        return
    for key in LEGACY_KEYS:
        if len(genuine[key]) != expected["counts"][key]:
            raise ValueError(
                f"{book}: expected {expected['counts'][key]} genuine {key}, "
                f"got {len(genuine[key])}"
            )
    if "creation_sequence_petuchot" in expected:
        got = [ref for ref in genuine["petuchot"] if ref in expected["creation_sequence_petuchot"]]
        if got != expected["creation_sequence_petuchot"]:
            raise ValueError(
                f"{book}: creation-sequence petuchot mismatch against committed goldens: "
                f"{got} != {expected['creation_sequence_petuchot']}"
            )
    if "petuchot" in expected and genuine["petuchot"] != expected["petuchot"]:
        raise ValueError(
            f"{book}: petuchot mismatch against committed goldens: "
            f"{genuine['petuchot']} != {expected['petuchot']}"
        )
    if "setumot" in expected and genuine["setumot"] != expected["setumot"]:
        raise ValueError(
            f"{book}: setumot mismatch against committed goldens: "
            f"{genuine['setumot']} != {expected['setumot']}"
        )


def reproduce_book(
    book: str,
    code: str,
    xml_path: Path,
    corrupt_path: Path,
    goldens: dict,
) -> dict:
    order = verse_order(xml_path)
    corrupt = parse_corrupt_fixture(corrupt_path)
    bare = collect_bare_letter_anchors(xml_path)
    genuine = genuine_marker_anchors(xml_path)
    validate_ground_truth(book, genuine, goldens)

    comparison = {}
    for key in LEGACY_KEYS:
        expected = canonicalize_anchors(set(bare[key]) | set(genuine[key]), order)
        corrupt_set = set(corrupt[key])
        expected_set = set(expected)
        comparison[key] = {
            "exact": corrupt[key] == expected,
            "extra": [ref for ref in corrupt[key] if ref not in expected_set],
            "missing": [ref for ref in expected if ref not in corrupt_set],
            "expected_count": len(expected),
        }

    corrupt_pet = set(corrupt["petuchot"])
    corrupt_set = set(corrupt["setumot"])
    verse_count = len(order)

    return {
        "book": book,
        "code": code,
        "verses": verse_count,
        "corrupt": {key: len(corrupt[key]) for key in LEGACY_KEYS},
        "bare": {key: len(bare[key]) for key in LEGACY_KEYS},
        "genuine": {key: len(genuine[key]) for key in LEGACY_KEYS},
        "residual": {
            key: len(set(corrupt[key]) - set(bare[key])) for key in LEGACY_KEYS
        },
        "double_listed": len(corrupt_pet & corrupt_set),
        "density": round((len(corrupt["petuchot"]) + len(corrupt["setumot"])) / verse_count, 6),
        "comparison": comparison,
    }


def enforce_exact_reconstruction(row: dict) -> None:
    for key in LEGACY_KEYS:
        if row["comparison"][key]["exact"]:
            continue
        raise ValueError(
            f"{row['book']}: corrupt {key} fixture is not exactly "
            f"bare-letter anchors U genuine markers "
            f"(extra={len(row['comparison'][key]['extra'])}, "
            f"missing={len(row['comparison'][key]['missing'])})"
        )


def fixture_name(book: str) -> str:
    return oshb.book_output_path(Path("."), book).name


def selected_books(names: list[str] | None) -> list[str]:
    if not names:
        return list(oshb.OT_BOOKS.keys())
    by_lower = {name.lower(): name for name in oshb.OT_BOOKS}
    chosen: list[str] = []
    for raw in names:
        key = raw.strip().lower()
        if key not in by_lower:
            raise ValueError(f"unknown book {raw!r}")
        chosen.append(by_lower[key])
    return chosen


def print_report(rows: list[dict]) -> None:
    print("Masoretic corruption reproduction")
    print(f"  source witness : WLC/OSHB@{oshb.COMMIT_SHA}")
    print(f"  corrupt source : {CORRUPT_DIR}")
    print("  reconstruction : bare-letter verse matches U genuine markers")
    print("")
    for row in rows:
        total = row["corrupt"]["petuchot"] + row["corrupt"]["setumot"]
        print(
            f"  {row['book']:<14} "
            f"corrupt P/S {row['corrupt']['petuchot']:>4}/{row['corrupt']['setumot']:<4} "
            f"bare P/S {row['bare']['petuchot']:>4}/{row['bare']['setumot']:<4} "
            f"genuine P/S {row['genuine']['petuchot']:>3}/{row['genuine']['setumot']:<3} "
            f"residual P/S {row['residual']['petuchot']:>3}/{row['residual']['setumot']:<3} "
            f"doubles {row['double_listed']:>3} "
            f"density {row['density']:.6f} "
            f"total {total:>4}"
        )
        print(
            f"    exact P/S {str(row['comparison']['petuchot']['exact']):<5}/"
            f"{str(row['comparison']['setumot']['exact']):<5} "
            f"extra P/S {len(row['comparison']['petuchot']['extra']):>3}/"
            f"{len(row['comparison']['setumot']['extra']):<3} "
            f"missing P/S {len(row['comparison']['petuchot']['missing']):>3}/"
            f"{len(row['comparison']['setumot']['missing']):<3}"
        )
    print("")
    exact_books = sum(
        1
        for row in rows
        if row["comparison"]["petuchot"]["exact"] and row["comparison"]["setumot"]["exact"]
    )
    print(
        f"PASS: processed {len(rows)} archived corrupt fixture(s); "
        f"{exact_books} matched the same-witness reconstruction exactly."
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Forensically reproduce the historical Masoretic corruption"
    )
    parser.add_argument(
        "--book",
        action="append",
        help="Limit to one or more English OT book names, e.g. --book Genesis",
    )
    parser.add_argument(
        "--corrupt-dir",
        type=Path,
        default=CORRUPT_DIR,
        help="Directory containing archived corrupt fixtures",
    )
    parser.add_argument(
        "--goldens",
        type=Path,
        default=GOLDENS_PATH,
        help="Committed independent goldens for Genesis and Ruth",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=oshb.repo_root() / ".cache" / "oshb",
        help="OSHB XML cache directory",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail unless every selected book matches the same-witness reconstruction exactly",
    )
    args = parser.parse_args()

    checksums = oshb.load_checksums(oshb.checksums_path())
    goldens = load_goldens(args.goldens)

    try:
        books = selected_books(args.book)
        rows: list[dict] = []
        for book in books:
            code = oshb.OT_BOOKS[book]
            xml_path = oshb.fetch_and_verify(code, args.cache_dir, checksums)
            row = reproduce_book(
                book=book,
                code=code,
                xml_path=xml_path,
                corrupt_path=args.corrupt_dir / fixture_name(book),
                goldens=goldens,
            )
            if args.strict:
                enforce_exact_reconstruction(row)
            rows.append(row)
    except Exception as exc:  # noqa: BLE001 - non-zero exit is the interface
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    print_report(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
