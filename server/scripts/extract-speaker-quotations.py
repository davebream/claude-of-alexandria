#!/usr/bin/env python3
"""
Speaker Quotations ETL — extract speaker attribution and quotation data from
Clear Bible FCBH consensus data.

Downloads two TSV files from Clear-Bible/speaker-quotations:
1. character_detail.semantic_data.tsv (~1,272 rows) — speaker metadata
2. Clear-Aligned-Projections.tsv (~7,306 rows) — verse-level quotation spans

Usage:
    cd server && python3 scripts/extract-speaker-quotations.py

Output:
    d1-seed/speakers.sql
    d1-seed/quotations.sql

Source:
    MACULA Quotation and Speaker Data (CC BY 4.0)
    Clear Bible, Inc. — https://github.com/Clear-Bible/speaker-quotations/
    Character data: Glyssen (MIT License, SIL LSDev / Faith Comes By Hearing)
"""

import os
import re
import sys
import urllib.request
from pathlib import Path

# ─── Source URLs ──────────────────────────────────────────────────────────────
CHARACTER_DETAIL_URL = (
    "https://raw.githubusercontent.com/Clear-Bible/speaker-quotations/main/"
    "tsv/character_detail.semantic_data.tsv"
)
PROJECTIONS_URL = (
    "https://raw.githubusercontent.com/Clear-Bible/speaker-quotations/main/"
    "tsv/Clear-Aligned-Projections.tsv"
)

SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
SPEAKERS_FILE = SEED_DIR / "speakers.sql"
QUOTATIONS_FILE = SEED_DIR / "quotations.sql"
BATCH_SIZE = 100

# ─── USFM → Canonical Book Name Mapping ──────────────────────────────────────
USFM_TO_CANONICAL = {
    "GEN": "Genesis", "EXO": "Exodus", "LEV": "Leviticus", "NUM": "Numbers",
    "DEU": "Deuteronomy", "JOS": "Joshua", "JDG": "Judges", "RUT": "Ruth",
    "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
    "1CH": "1 Chronicles", "2CH": "2 Chronicles", "EZR": "Ezra", "NEH": "Nehemiah",
    "EST": "Esther", "JOB": "Job", "PSA": "Psalms", "PRO": "Proverbs",
    "ECC": "Ecclesiastes", "SNG": "Song of Songs", "ISA": "Isaiah",
    "JER": "Jeremiah", "LAM": "Lamentations", "EZK": "Ezekiel", "DAN": "Daniel",
    "HOS": "Hosea", "JOL": "Joel", "AMO": "Amos", "OBA": "Obadiah",
    "JON": "Jonah", "MIC": "Micah", "NAM": "Nahum", "HAB": "Habakkuk",
    "ZEP": "Zephaniah", "HAG": "Haggai", "ZEC": "Zechariah", "MAL": "Malachi",
    "MAT": "Matthew", "MRK": "Mark", "LUK": "Luke", "JHN": "John",
    "ACT": "Acts", "ROM": "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians",
    "GAL": "Galatians", "EPH": "Ephesians", "PHP": "Philippians", "COL": "Colossians",
    "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
    "1TI": "1 Timothy", "2TI": "2 Timothy", "TIT": "Titus", "PHM": "Philemon",
    "HEB": "Hebrews", "JAS": "James", "1PE": "1 Peter", "2PE": "2 Peter",
    "1JN": "1 John", "2JN": "2 John", "3JN": "3 John", "JUD": "Jude",
    "REV": "Revelation",
}


def sql_escape(value):
    """Escape single quotes for SQL string literals."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def download_file(url, label):
    """Download a file and return its text content."""
    print(f"Downloading {label}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode("utf-8")
        print(f"  Downloaded {len(data):,} bytes")
        return data
    except Exception as e:
        print(f"  ERROR: Failed to download {label}: {e}", file=sys.stderr)
        sys.exit(1)


def parse_projection_ref(ref_str):
    """Parse a projection reference like 'GEN 1:3' into (usfm, chapter, verse).

    Returns (usfm_book, chapter, verse) or None on failure.
    """
    match = re.match(r"^([A-Z0-9]+)\s+(\d+):(\d+)$", ref_str.strip())
    if not match:
        return None
    return match.group(1), int(match.group(2)), int(match.group(3))


def parse_character_detail(text):
    """Parse character_detail.semantic_data.tsv into speaker entries.

    TSV columns (tab-separated):
      0: CharacterID
      1: MaxSpeakers
      2: Gender
      3: Age
      4: Status (divinity flag: Y = divine)
      5: Divinty (descriptive notes — NOT the divinity flag, ignore)
      6: FCBHCharacter
      7: SDBH (skip — license concern)
      8: Louw-Nida (skip — license concern)
    """
    speakers = {}
    skipped = 0

    for line_num, line in enumerate(text.splitlines(), 1):
        line = line.rstrip("\n\r")
        if not line.strip() or line.startswith("#"):
            continue

        parts = line.split("\t")

        # Skip header row
        if parts[0] == "CharacterID" or parts[0] == "character_id":
            continue

        if len(parts) < 5:
            skipped += 1
            continue

        character_id = parts[0].strip()
        if not character_id:
            skipped += 1
            continue

        max_speakers_raw = parts[1].strip() if len(parts) > 1 else ""
        gender = parts[2].strip() if len(parts) > 2 else ""
        age = parts[3].strip() if len(parts) > 3 else ""
        status = parts[4].strip() if len(parts) > 4 else ""
        # parts[5] is "Divinty" — descriptive notes, NOT the divinity flag. Skip.
        fcbh_character = parts[6].strip() if len(parts) > 6 else ""

        # Divinity: Status column (col 4) == 'Y' means divine
        divinity = "Y" if status == "Y" else "N"

        # MaxSpeakers: parse as integer, default to 1
        try:
            max_speakers = int(max_speakers_raw) if max_speakers_raw else 1
        except ValueError:
            max_speakers = 1

        speakers[character_id] = {
            "character_id": character_id,
            "name": character_id,
            "gender": gender or None,
            "age": age or None,
            "divinity": divinity,
            "max_speakers": max_speakers,
            "fcbh_character": fcbh_character or None,
        }

    print(f"  Character detail: {len(speakers)} speakers parsed, {skipped} lines skipped")

    # Verify divine characters
    divine = [s["character_id"] for s in speakers.values() if s["divinity"] == "Y"]
    print(f"  Divine characters ({len(divine)}): {', '.join(sorted(divine))}")

    return speakers


def parse_projections(text, speakers):
    """Parse Clear-Aligned-Projections.tsv into quotation entries.

    TSV columns (tab-separated):
      0: KEY (speech_key)
      1: BOOK
      2: CHAPTER
      3: SPEAKER (FCBH) — speaker_id
      4: ALT SPEAKER (FCBH) — alt_speaker_id
      5: SPEAKER REFERENT (CLEAR) — word IDs, skip
      6: SPEAKER REFERENT LABEL (CLEAR) — speaker_label
      7: QUOTE TYPE
      8: QUOTE DELIVERY
      9: PROJECTION START — "BOOK CH:V"
     10: PROJECTION END — "BOOK CH:V"
     11: CLEAR START — word IDs, skip
     12: CLEAR END — word IDs, skip
    """
    quotations = []
    skipped = 0
    unmatched_speakers = set()

    for line_num, line in enumerate(text.splitlines(), 1):
        line = line.rstrip("\n\r")
        if not line.strip() or line.startswith("#"):
            continue

        parts = line.split("\t")

        # Skip header
        if parts[0] == "KEY" or parts[0] == "key":
            continue

        if len(parts) < 11:
            skipped += 1
            continue

        speech_key = parts[0].strip()
        speaker_id = parts[3].strip()
        alt_speaker_id = parts[4].strip() or None
        speaker_label = parts[6].strip() or None
        quote_type = parts[7].strip() or None
        quote_delivery = parts[8].strip() or None
        proj_start = parts[9].strip()
        proj_end = parts[10].strip()

        if not speaker_id or not proj_start or not proj_end:
            skipped += 1
            continue

        # Parse projection references
        start_ref = parse_projection_ref(proj_start)
        end_ref = parse_projection_ref(proj_end)

        if not start_ref or not end_ref:
            print(f"  WARN line {line_num}: Could not parse projection: {proj_start!r} / {proj_end!r}", file=sys.stderr)
            skipped += 1
            continue

        start_usfm, start_chapter, start_verse = start_ref
        end_usfm, end_chapter, end_verse = end_ref

        # Map USFM to canonical
        book = USFM_TO_CANONICAL.get(start_usfm)
        if not book:
            print(f"  WARN line {line_num}: Unknown USFM abbreviation: {start_usfm!r}", file=sys.stderr)
            skipped += 1
            continue

        # Validate speaker exists
        if speaker_id not in speakers:
            unmatched_speakers.add(speaker_id)

        quotations.append({
            "book": book,
            "chapter": start_chapter,
            "verse_start": start_verse,
            "verse_end": end_verse,
            "speaker_id": speaker_id,
            "speaker_label": speaker_label,
            "alt_speaker_id": alt_speaker_id,
            "quote_type": quote_type,
            "quote_delivery": quote_delivery,
            "speech_key": speech_key,
        })

    print(f"  Projections: {len(quotations)} quotations parsed, {skipped} lines skipped")

    # Create synthetic speakers for unmatched IDs
    if unmatched_speakers:
        print(f"  Unmatched speaker IDs ({len(unmatched_speakers)}): {', '.join(sorted(unmatched_speakers))}")
        for sid in sorted(unmatched_speakers):
            speakers[sid] = {
                "character_id": sid,
                "name": sid,
                "gender": None,
                "age": None,
                "divinity": "N",
                "max_speakers": 1,
                "fcbh_character": None,
            }
        print(f"  Created {len(unmatched_speakers)} synthetic speaker entries")

    return quotations


def write_speakers_sql(speakers, output_path):
    """Write speaker entries as batched INSERT statements."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    entries = list(speakers.values())

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated by extract-speaker-quotations.py\n")
        f.write("-- Source: MACULA Quotation and Speaker Data (CC BY 4.0), Clear Bible, Inc.\n")
        f.write("-- Character data: Glyssen (MIT License, SIL LSDev / FCBH)\n\n")

        for i in range(0, len(entries), BATCH_SIZE):
            batch = entries[i : i + BATCH_SIZE]
            f.write(
                "INSERT OR REPLACE INTO speakers "
                "(character_id, name, gender, age, divinity, max_speakers, fcbh_character) VALUES\n"
            )
            rows = []
            for e in batch:
                row = (
                    f"({sql_escape(e['character_id'])}, "
                    f"{sql_escape(e['name'])}, "
                    f"{sql_escape(e['gender'])}, "
                    f"{sql_escape(e['age'])}, "
                    f"{sql_escape(e['divinity'])}, "
                    f"{e['max_speakers']}, "
                    f"{sql_escape(e['fcbh_character'])})"
                )
                rows.append(row)
            f.write(",\n".join(rows))
            f.write(";\n\n")

    print(f"Wrote {len(entries)} speakers to {output_path}")


def write_quotations_sql(quotations, output_path):
    """Write quotation entries as batched INSERT statements."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated by extract-speaker-quotations.py\n")
        f.write("-- Source: MACULA Quotation and Speaker Data (CC BY 4.0), Clear Bible, Inc.\n\n")

        for i in range(0, len(quotations), BATCH_SIZE):
            batch = quotations[i : i + BATCH_SIZE]
            f.write(
                "INSERT INTO quotations "
                "(book, chapter, verse_start, verse_end, speaker_id, speaker_label, "
                "alt_speaker_id, quote_type, quote_delivery, speech_key) VALUES\n"
            )
            rows = []
            for q in batch:
                row = (
                    f"({sql_escape(q['book'])}, "
                    f"{q['chapter']}, "
                    f"{q['verse_start']}, "
                    f"{q['verse_end']}, "
                    f"{sql_escape(q['speaker_id'])}, "
                    f"{sql_escape(q['speaker_label'])}, "
                    f"{sql_escape(q['alt_speaker_id'])}, "
                    f"{sql_escape(q['quote_type'])}, "
                    f"{sql_escape(q['quote_delivery'])}, "
                    f"{sql_escape(q['speech_key'])})"
                )
                rows.append(row)
            f.write(",\n".join(rows))
            f.write(";\n\n")

    print(f"Wrote {len(quotations)} quotations to {output_path}")


def main():
    # Download both files
    char_text = download_file(CHARACTER_DETAIL_URL, "character_detail.semantic_data.tsv")
    proj_text = download_file(PROJECTIONS_URL, "Clear-Aligned-Projections.tsv")

    # Parse character details first (speakers dict needed for validation)
    speakers = parse_character_detail(char_text)

    # Parse projections (creates synthetic speakers for unmatched IDs)
    quotations = parse_projections(proj_text, speakers)

    # Summary
    print(f"\nTotal speakers: {len(speakers)} (including synthetic)")
    print(f"Total quotations: {len(quotations)}")

    # Quote type distribution
    type_counts = {}
    for q in quotations:
        qt = q["quote_type"] or "(empty)"
        type_counts[qt] = type_counts.get(qt, 0) + 1
    print("\nQuote type distribution:")
    for qt, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {qt}: {count}")

    # Top speakers
    speaker_counts = {}
    for q in quotations:
        sid = q["speaker_id"]
        speaker_counts[sid] = speaker_counts.get(sid, 0) + 1
    print("\nTop 10 speakers:")
    for sid, count in sorted(speaker_counts.items(), key=lambda x: -x[1])[:10]:
        div = speakers.get(sid, {}).get("divinity", "?")
        print(f"  {sid} (divinity={div}): {count} quotations")

    # Sanity checks
    if len(speakers) < 1000:
        print(f"ERROR: Expected at least 1000 speakers, got {len(speakers)}", file=sys.stderr)
        sys.exit(1)

    if len(quotations) < 5000:
        print(f"ERROR: Expected at least 5000 quotations, got {len(quotations)}", file=sys.stderr)
        sys.exit(1)

    divine_count = sum(1 for s in speakers.values() if s["divinity"] == "Y")
    if divine_count != 4:
        print(f"WARNING: Expected 4 divine characters, got {divine_count}", file=sys.stderr)

    # Verify FK integrity
    orphaned = sum(1 for q in quotations if q["speaker_id"] not in speakers)
    if orphaned > 0:
        print(f"ERROR: {orphaned} quotations reference non-existent speakers!", file=sys.stderr)
        sys.exit(1)
    print(f"\nFK integrity: 0 orphaned quotations")

    # Write SQL files
    write_speakers_sql(speakers, SPEAKERS_FILE)
    write_quotations_sql(quotations, QUOTATIONS_FILE)

    print("\nDone.")


if __name__ == "__main__":
    main()
