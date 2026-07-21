#!/usr/bin/env python3
"""
Old Testament structure ETL.

Derives compact verse-edge boundary context from Clear-Bible/macula-hebrew
WLC lowfat XML plus Clear-Bible/speaker-quotations aligned projection spans.

Usage:
    cd server
    python3 scripts/extract-ot-structure.py
    python3 scripts/extract-ot-structure.py --write-checksums

Output:
    d1-seed/ot-structure-{book}.sql
    d1-seed/ot-structure-counts.json
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from xml.etree import ElementTree as ET

MACULA_COMMIT_SHA = "47db250bd55d0d8577f2a94fba114ef16c35b23c"
SPEAKER_COMMIT_SHA = "b09e308a3a1aafdb7d6c75baf0fe2a31d61601da"
MACULA_ARCHIVE_URL = f"https://codeload.github.com/Clear-Bible/macula-hebrew/zip/{MACULA_COMMIT_SHA}"
SPEAKER_TSV_PATH = "tsv/Clear-Aligned-Projections.tsv"
SPEAKER_TSV_URL = (
    "https://raw.githubusercontent.com/Clear-Bible/speaker-quotations/"
    f"{SPEAKER_COMMIT_SHA}/{SPEAKER_TSV_PATH}"
)

ROWS_PER_INSERT = 100
BYTE_LIMIT_PER_INSERT = 900_000
CHECKSUM_FILE = Path(__file__).resolve().parent / "ot-structure-checksums.json"

BOOK_CODE_TO_CANONICAL = {
    "GEN": "genesis", "EXO": "exodus", "LEV": "leviticus", "NUM": "numbers",
    "DEU": "deuteronomy", "JOS": "joshua", "JDG": "judges", "RUT": "ruth",
    "1SA": "1_samuel", "2SA": "2_samuel", "1KI": "1_kings", "2KI": "2_kings",
    "1CH": "1_chronicles", "2CH": "2_chronicles", "EZR": "ezra", "NEH": "nehemiah",
    "EST": "esther", "JOB": "job", "PSA": "psalms", "PRO": "proverbs",
    "ECC": "ecclesiastes", "SNG": "song_of_songs", "ISA": "isaiah", "JER": "jeremiah",
    "LAM": "lamentations", "EZK": "ezekiel", "DAN": "daniel", "HOS": "hosea",
    "JOL": "joel", "AMO": "amos", "OBA": "obadiah", "JON": "jonah",
    "MIC": "micah", "NAM": "nahum", "HAB": "habakkuk", "ZEP": "zephaniah",
    "HAG": "haggai", "ZEC": "zechariah", "MAL": "malachi",
}

OT_BOOK_CODES = tuple(BOOK_CODE_TO_CANONICAL.keys())
REF_RE = re.compile(r"^([1-3]?[A-Z]{2,3})\s+(\d+):(\d+)(?:!(\d+))?$")
WORD_ID_RE = re.compile(r"\d{12}")
LOWFAT_CHAPTER_RE = re.compile(r"^WLC/lowfat/\d{2}-[1-3]?[A-Za-z]{2,3}-\d{3}-lowfat\.xml$")


@dataclass
class ClauseSpan:
    start_enc: int
    end_enc: int
    class_name: Optional[str]
    rule: Optional[str]
    role: Optional[str]


@dataclass
class SentenceSpan:
    start_enc: int
    end_enc: int


@dataclass
class VerseData:
    book_code: str
    chapter: int
    verse: int
    participants: set[str] = field(default_factory=set)
    speakers: set[str] = field(default_factory=set)


@dataclass
class Quotation:
    book_code: str
    start_enc: int
    end_enc: int
    speech_key: str
    speaker_id: str
    speaker_label: Optional[str]
    quote_type: Optional[str]


@dataclass
class BookStructure:
    code: str
    canonical: str
    verses: Dict[int, VerseData] = field(default_factory=dict)
    verse_order: List[int] = field(default_factory=list)
    sentence_spans: List[SentenceSpan] = field(default_factory=list)
    clause_spans: List[ClauseSpan] = field(default_factory=list)
    quotations: List[Quotation] = field(default_factory=list)


def encode_position(chapter: int, verse: int) -> int:
    return chapter * 1000 + verse


def parse_ref(ref: str) -> Tuple[str, int, int, int]:
    match = REF_RE.match(ref.strip())
    if not match:
        raise ValueError(f"Malformed reference: {ref!r}")
    book, chapter, verse, word = match.groups()
    return book, int(chapter), int(verse), int(word or "0")


def ref_enc(ref: str) -> Tuple[str, int]:
    book, chapter, verse, _word = parse_ref(ref)
    return book, encode_position(chapter, verse)


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def json_str(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def sorted_json_array(values: Iterable[str]) -> str:
    return json_str(sorted(values))


def clause_summary(clause: ClauseSpan) -> dict:
    return {
        "class": clause.class_name,
        "rule": clause.rule,
        "role": clause.role,
    }


def collect_word_refs(element: ET.Element) -> List[Tuple[str, int, str]]:
    refs: List[Tuple[str, int, str]] = []
    for word in element.iter("w"):
        ref = word.attrib.get("ref")
        word_id = word.attrib.get("{http://www.w3.org/XML/1998/namespace}id", "")
        if not ref:
            continue
        book, enc = ref_enc(ref)
        refs.append((book, enc, word_id))
    refs.sort(key=lambda item: (item[1], item[2]))
    return refs


def participant_refs(word: ET.Element) -> set[str]:
    refs: set[str] = set()
    for attr in ("subjref", "participantref"):
        raw = word.attrib.get(attr)
        if raw:
            refs.update(WORD_ID_RE.findall(raw))
    frame = word.attrib.get("frame")
    if frame:
        refs.update(WORD_ID_RE.findall(frame))
    return refs


def parse_lowfat_xml(xml_text: str, structure: BookStructure) -> None:
    root = ET.fromstring(xml_text)

    for word in root.iter("w"):
      ref = word.attrib.get("ref")
      if not ref:
          continue
      book, chapter, verse, _word = parse_ref(ref)
      if book != structure.code:
          raise ValueError(f"Expected {structure.code}, found {book} in {ref}")
      enc = encode_position(chapter, verse)
      if enc not in structure.verses:
          structure.verses[enc] = VerseData(book, chapter, verse)
          structure.verse_order.append(enc)
      structure.verses[enc].participants.update(participant_refs(word))

    for sentence in root.iter("sentence"):
        refs = collect_word_refs(sentence)
        if refs:
            structure.sentence_spans.append(SentenceSpan(refs[0][1], refs[-1][1]))

    for group in root.iter("wg"):
        if group.attrib.get("class") != "cl":
            continue
        refs = collect_word_refs(group)
        if not refs:
            continue
        structure.clause_spans.append(ClauseSpan(
            start_enc=refs[0][1],
            end_enc=refs[-1][1],
            class_name=group.attrib.get("class"),
            rule=group.attrib.get("rule"),
            role=group.attrib.get("role"),
        ))


def parse_projection_ref(ref: str) -> Tuple[str, int]:
    book, enc = ref_enc(ref)
    if book not in BOOK_CODE_TO_CANONICAL:
        raise ValueError(f"Not an OT source reference: {ref!r}")
    return book, enc


def parse_speaker_tsv(text: str) -> List[Quotation]:
    quotations: List[Quotation] = []
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    for row in reader:
        start = row.get("START VS", "")
        end = row.get("END VS", "")
        if not start or not end:
            continue
        try:
            start_book, start_enc = parse_projection_ref(start)
            end_book, end_enc = parse_projection_ref(end)
        except ValueError:
            continue
        if start_book != end_book:
            continue
        speaker_id = (row.get("SPEAKER (FCBH)") or "").strip()
        if not speaker_id:
            continue
        quotations.append(Quotation(
            book_code=start_book,
            start_enc=start_enc,
            end_enc=end_enc,
            speech_key=(row.get("KEY") or "").strip(),
            speaker_id=speaker_id,
            speaker_label=(row.get("SPEAKER REFERENT LABEL (CLEAR)") or "").strip() or None,
            quote_type=(row.get("QUOTE TYPE") or "").strip() or None,
        ))
    return quotations


def attach_quotations(structures: Dict[str, BookStructure], quotations: Sequence[Quotation]) -> None:
    for quote in quotations:
        structure = structures.get(quote.book_code)
        if not structure:
            continue
        structure.quotations.append(quote)
        for enc in structure.verse_order:
            if quote.start_enc <= enc <= quote.end_enc:
                structure.verses[enc].speakers.add(quote.speaker_id)


def quotation_payload(quote: Quotation) -> dict:
    return {
        "speech_key": quote.speech_key,
        "speaker_id": quote.speaker_id,
        "speaker_label": quote.speaker_label,
        "quote_type": quote.quote_type,
    }


def render_boundary_rows(structure: BookStructure) -> List[Tuple]:
    rows: List[Tuple] = []
    ordered = sorted(set(structure.verse_order))
    for idx, (before_enc, after_enc) in enumerate(zip(ordered, ordered[1:]), 1):
        before = structure.verses[before_enc]
        after = structure.verses[after_enc]
        ending_clauses = [c for c in structure.clause_spans if c.end_enc == before_enc]
        starting_clauses = [c for c in structure.clause_spans if c.start_enc == after_enc]
        opened = [q for q in structure.quotations if q.start_enc == after_enc]
        closed = [q for q in structure.quotations if q.end_enc == before_enc]
        before_participants = before.participants
        after_participants = after.participants
        before_speakers = before.speakers
        after_speakers = after.speakers

        rows.append((
            structure.canonical,
            idx,
            before.chapter,
            before.verse,
            after.chapter,
            after.verse,
            before_enc,
            after_enc,
            any(s.end_enc == before_enc for s in structure.sentence_spans),
            any(s.start_enc == after_enc for s in structure.sentence_spans),
            sum(1 for c in structure.clause_spans if c.start_enc <= before_enc and c.end_enc >= after_enc),
            len(ending_clauses),
            len(starting_clauses),
            [clause_summary(c) for c in ending_clauses],
            [clause_summary(c) for c in starting_clauses],
            sorted(before_participants),
            sorted(after_participants),
            sorted(after_participants - before_participants),
            sorted(before_participants - after_participants),
            before_participants != after_participants,
            sorted(before_speakers),
            sorted(after_speakers),
            before_speakers != after_speakers,
            bool(opened),
            bool(closed),
            [quotation_payload(q) for q in opened],
            [quotation_payload(q) for q in closed],
        ))
    return rows


def render_insert_batch(rows: Sequence[Tuple]) -> str:
    columns = (
        "book, boundary_ordinal, before_chapter, before_verse, after_chapter, after_verse, "
        "before_ref_enc, after_ref_enc, previous_sentence_ended, new_sentence_begins, "
        "open_clause_depth, clause_end_count, clause_start_count, clause_endings_json, "
        "clause_beginnings_json, participants_before_json, participants_after_json, "
        "participants_entered_json, participants_exited_json, participant_set_changed, "
        "speakers_before_json, speakers_after_json, speaker_changed, quotation_opened, "
        "quotation_closed, quotations_opened_json, quotations_closed_json, "
        "source_macula_commit, source_speaker_commit"
    )
    values: List[str] = []
    for row in rows:
        (
            book, ordinal, before_chapter, before_verse, after_chapter, after_verse,
            before_ref_enc, after_ref_enc, previous_sentence_ended, new_sentence_begins,
            open_clause_depth, clause_end_count, clause_start_count, clause_endings,
            clause_beginnings, participants_before, participants_after, participants_entered,
            participants_exited, participant_set_changed, speakers_before, speakers_after,
            speaker_changed, quotation_opened, quotation_closed, quotations_opened,
            quotations_closed,
        ) = row
        values.append(
            "("
            f"{sql_str(book)}, {ordinal}, {before_chapter}, {before_verse}, {after_chapter}, {after_verse}, "
            f"{before_ref_enc}, {after_ref_enc}, {1 if previous_sentence_ended else 0}, {1 if new_sentence_begins else 0}, "
            f"{open_clause_depth}, {clause_end_count}, {clause_start_count}, {sql_str(json_str(clause_endings))}, "
            f"{sql_str(json_str(clause_beginnings))}, {sql_str(json_str(participants_before))}, {sql_str(json_str(participants_after))}, "
            f"{sql_str(json_str(participants_entered))}, {sql_str(json_str(participants_exited))}, {1 if participant_set_changed else 0}, "
            f"{sql_str(json_str(speakers_before))}, {sql_str(json_str(speakers_after))}, {1 if speaker_changed else 0}, "
            f"{1 if quotation_opened else 0}, {1 if quotation_closed else 0}, {sql_str(json_str(quotations_opened))}, "
            f"{sql_str(json_str(quotations_closed))}, {sql_str(MACULA_COMMIT_SHA)}, {sql_str(SPEAKER_COMMIT_SHA)}"
            ")"
        )
    return f"INSERT INTO ot_structure_boundaries ({columns}) VALUES\n" + ",\n".join(values) + ";"


def render_sql(book: str, rows: Sequence[Tuple]) -> str:
    parts = [
        "-- Generated by server/scripts/extract-ot-structure.py",
        "-- DO NOT HAND-EDIT. Bulk corpus data is generated in-runner.",
        f"DELETE FROM ot_structure_boundaries WHERE book = {sql_str(book)};",
        "",
    ]
    batch: List[Tuple] = []
    for row in rows:
        candidate = batch + [row]
        rendered = render_insert_batch(candidate)
        if batch and (len(candidate) > ROWS_PER_INSERT or len(rendered.encode("utf-8")) > BYTE_LIMIT_PER_INSERT):
            parts.append(render_insert_batch(batch))
            batch = [row]
        else:
            batch = candidate
    if batch:
        parts.append(render_insert_batch(batch))
    return "\n".join(parts) + "\n"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, dest: Path) -> bytes:
    if dest.exists():
        return dest.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/1.0"})
    with urllib.request.urlopen(req) as response:
        data = response.read()
    dest.write_bytes(data)
    return data


def load_upstream(cache_dir: Path) -> Tuple[Dict[str, bytes], bytes]:
    archive_bytes = download(MACULA_ARCHIVE_URL, cache_dir / f"macula-hebrew-{MACULA_COMMIT_SHA}.zip")
    lowfat_files: Dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
        for info in zf.infolist():
            path = "/".join(info.filename.split("/")[1:])
            if LOWFAT_CHAPTER_RE.match(path):
                lowfat_files[path] = zf.read(info)
    speaker_bytes = download(SPEAKER_TSV_URL, cache_dir / f"speaker-quotations-{SPEAKER_COMMIT_SHA}.tsv")
    return lowfat_files, speaker_bytes


def build_checksum_manifest(lowfat_files: Dict[str, bytes], speaker_bytes: bytes) -> dict:
    return {
        "macula_hebrew": {
            "commit": MACULA_COMMIT_SHA,
            "files": {path: sha256(data) for path, data in sorted(lowfat_files.items())},
        },
        "speaker_quotations": {
            "commit": SPEAKER_COMMIT_SHA,
            "files": {SPEAKER_TSV_PATH: sha256(speaker_bytes)},
        },
    }


def verify_checksums(manifest: dict, lowfat_files: Dict[str, bytes], speaker_bytes: bytes) -> None:
    expected_macula = manifest.get("macula_hebrew", {})
    expected_speaker = manifest.get("speaker_quotations", {})
    if expected_macula.get("commit") != MACULA_COMMIT_SHA:
        raise ValueError("Macula checksum manifest commit does not match extractor pin")
    if expected_speaker.get("commit") != SPEAKER_COMMIT_SHA:
        raise ValueError("Speaker checksum manifest commit does not match extractor pin")

    expected_files = expected_macula.get("files", {})
    actual_files = {path: sha256(data) for path, data in sorted(lowfat_files.items())}
    if expected_files != actual_files:
        missing = sorted(set(expected_files) - set(actual_files))[:5]
        extra = sorted(set(actual_files) - set(expected_files))[:5]
        changed = sorted(path for path in set(expected_files) & set(actual_files) if expected_files[path] != actual_files[path])[:5]
        raise ValueError(f"Macula checksum mismatch. missing={missing} extra={extra} changed={changed}")

    expected_speaker_files = expected_speaker.get("files", {})
    actual_speaker = sha256(speaker_bytes)
    if expected_speaker_files.get(SPEAKER_TSV_PATH) != actual_speaker:
        raise ValueError("Speaker quotation checksum mismatch")


def build_structures(lowfat_files: Dict[str, bytes], speaker_bytes: bytes) -> Dict[str, BookStructure]:
    structures = {
        code: BookStructure(code=code, canonical=canonical)
        for code, canonical in BOOK_CODE_TO_CANONICAL.items()
    }
    for path, data in sorted(lowfat_files.items()):
        name = Path(path).name
        parts = name.split("-")
        if len(parts) < 4:
            raise ValueError(f"Unexpected lowfat filename: {path}")
        book_code = parts[1].upper()
        if book_code not in structures:
            raise ValueError(f"Unexpected OT book code in {path}: {book_code}")
        parse_lowfat_xml(data.decode("utf-8"), structures[book_code])

    for structure in structures.values():
        structure.verse_order = sorted(set(structure.verse_order))
        if len(structure.verse_order) < 2:
            raise ValueError(f"{structure.code} has too few verses for boundary extraction")

    attach_quotations(structures, parse_speaker_tsv(speaker_bytes.decode("utf-8")))
    return structures


def write_outputs(structures: Dict[str, BookStructure], output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "macula_commit": MACULA_COMMIT_SHA,
        "speaker_commit": SPEAKER_COMMIT_SHA,
        "books": {},
        "total_boundaries": 0,
    }
    for code in OT_BOOK_CODES:
        structure = structures[code]
        rows = render_boundary_rows(structure)
        (output_dir / f"ot-structure-{structure.canonical}.sql").write_text(render_sql(structure.canonical, rows), encoding="utf-8")
        counts["books"][structure.canonical] = {
            "verses": len(structure.verse_order),
            "boundaries": len(rows),
        }
        counts["total_boundaries"] += len(rows)
    (output_dir / "ot-structure-counts.json").write_text(json.dumps(counts, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract OT boundary structure features from Macula Hebrew lowfat XML")
    parser.add_argument("--cache-dir", default=str(Path(__file__).resolve().parent.parent / ".cache" / "ot-structure"))
    parser.add_argument("--out-dir", default=str(Path(__file__).resolve().parent.parent / "d1-seed"))
    parser.add_argument("--checksums", default=str(CHECKSUM_FILE))
    parser.add_argument("--write-checksums", action="store_true", help="Write checksum manifest for the pinned upstream inputs")
    args = parser.parse_args()

    lowfat_files, speaker_bytes = load_upstream(Path(args.cache_dir))
    manifest = build_checksum_manifest(lowfat_files, speaker_bytes)
    checksum_path = Path(args.checksums)

    if args.write_checksums:
        checksum_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Wrote {checksum_path}")
        return

    if not checksum_path.exists():
        print(f"ERROR: checksum manifest not found: {checksum_path}", file=sys.stderr)
        print("Run with --write-checksums after intentionally changing upstream pins.", file=sys.stderr)
        sys.exit(1)

    verify_checksums(json.loads(checksum_path.read_text(encoding="utf-8")), lowfat_files, speaker_bytes)
    structures = build_structures(lowfat_files, speaker_bytes)
    counts = write_outputs(structures, Path(args.out_dir))
    print(f"Wrote {counts['total_boundaries']:,} OT structure boundary rows across {len(counts['books'])} books.")


if __name__ == "__main__":
    main()
