#!/usr/bin/env python3
"""
BDB ETL — extract Hebrew definitions from STEPBible TBESH data.

Downloads TBESH (Translators Brief lexicon of Extended Strongs for Hebrew)
from STEPBible-Data GitHub repo. The TBESH contains Hebrew word definitions
sourced from Brown-Driver-Briggs and other Hebrew lexicons.

NOTE: The originally planned eliranwong BDB JSON source returned HTTP 404
as of 2026-05-08. Fallback: use TBESH which contains equivalent Hebrew
definitions. The lexicon_bdb table stores these entries.

Format: eStrong\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning

IMPORTANT: All Strong's IDs are 4-digit padded to match normalizeStrongs() in
the TypeScript query handler. This fixes the H1-H9 unreachability bug:
  H0001 (not H1) → matches normalizeStrongs('H1') = 'H0001'

Usage:
    cd server && python3 scripts/extract-bdb.py

Output:
    d1-seed/lexicon-bdb.sql (or chunked if >10MB)

Source:
    STEPBible TBESH (CC BY 4.0)
    https://github.com/STEPBible/STEPBible-Data
"""

import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

# ─── Source URL ──────────────────────────────────────────────────────────────
TBESH_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
    "Lexicons/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20"
    "Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
)

SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
CHUNK_SIZE_BYTES = 9 * 1024 * 1024  # 9MB per chunk
BATCH_SIZE = 5


def sql_escape(value):
    """Escape single quotes for SQL string literals."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def strip_accents(text):
    """Remove diacritical marks from Unicode text."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.category(c).startswith("M"))


def normalize_estrongs(raw_id):
    """Normalize eStrong ID to 4-digit padded format.

    Critically: pads to 4 digits so H1 → H0001 matches normalizeStrongs() in TS.

    Examples:
        H1 → H0001
        H0001 → H0001
        H7225 → H7225
    """
    stripped = raw_id.strip()
    match = re.match(r"^([HG])0*(\d+)$", stripped)
    if match:
        return f"{match.group(1)}{int(match.group(2)):04d}"
    return stripped


def download_file(url, label):
    """Download a file and return its text content."""
    print(f"Downloading {label}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read().decode("utf-8")
        print(f"  Downloaded {len(data):,} bytes")
        return data
    except Exception as e:
        print(f"  ERROR: Failed to download {label}: {e}", file=sys.stderr)
        sys.exit(1)


def parse_tbesh(text):
    """Parse TBESH tab-separated file into Hebrew BDB entries.

    Format:
      eStrong\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning

    Rules:
    - Lines before the data section (===separator===) are skipped
    - Only Hebrew (H-prefix) entries are included
    - Multiple disambiguations for same eStrong: first entry wins
    - Entries without Meaning field are still included (gloss is sufficient)
    """
    entries = {}  # strongs_id → entry dict (deduplicate by eStrong)
    skipped = 0
    in_data = False

    for line_num, line in enumerate(text.splitlines(), 1):
        # Detect start of data section after the separator
        if line.strip().startswith("==="):
            in_data = True
            continue

        if not in_data:
            continue

        line_stripped = line.strip()
        if not line_stripped:
            continue

        parts = line.split("\t")
        if len(parts) < 7:
            skipped += 1
            continue

        e_strongs_raw = parts[0].strip()
        # d_strongs = parts[1]  # not used
        # u_strongs = parts[2]  # not used
        hebrew = parts[3].strip()
        transliteration = parts[4].strip() if len(parts) > 4 else ""
        # morph = parts[5]  # not stored
        gloss = parts[6].strip() if len(parts) > 6 else ""
        definition = parts[7].strip() if len(parts) > 7 else ""

        if not e_strongs_raw or not gloss:
            skipped += 1
            continue

        strongs_id = normalize_estrongs(e_strongs_raw)

        # Only Hebrew entries (H-prefix)
        if not strongs_id.startswith("H"):
            skipped += 1
            continue

        # Deduplicate: first entry wins (most canonical)
        if strongs_id in entries:
            skipped += 1
            continue

        # Use first Hebrew word (some entries have multiple separated by comma)
        original_word = hebrew.split(",")[0].strip() if hebrew else ""
        original_word_nfc = unicodedata.normalize("NFC", original_word)
        original_word_stripped = strip_accents(original_word)

        entries[strongs_id] = {
            "strongs_id": strongs_id,
            "original_word": original_word,
            "original_word_nfc": original_word_nfc,
            "original_word_stripped": original_word_stripped,
            "transliteration": transliteration or None,
            "gloss": gloss,
            "definition": definition or None,
        }

    entry_list = list(entries.values())
    print(f"  TBESH: {len(entry_list)} entries parsed, {skipped} lines skipped")
    return entry_list


def write_sql_chunked(entries, output_dir, base_name):
    """Write BDB entries as batched INSERT statements (chunked if >CHUNK_SIZE_BYTES)."""
    output_dir.mkdir(parents=True, exist_ok=True)

    header = "-- Auto-generated by extract-bdb.py\n-- Source: STEPBible TBESH (CC BY 4.0)\n\n"

    # Build batched INSERT blocks
    blocks = []
    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i : i + BATCH_SIZE]
        rows = []
        for e in batch:
            row = (
                f"({sql_escape(e['strongs_id'])}, "
                f"{sql_escape(e['original_word'])}, "
                f"{sql_escape(e['original_word_nfc'])}, "
                f"{sql_escape(e['original_word_stripped'])}, "
                f"{sql_escape(e['transliteration'])}, "
                f"{sql_escape(e['gloss'])}, "
                f"{sql_escape(e['definition'])})"
            )
            rows.append(row)
        block = (
            "INSERT OR REPLACE INTO lexicon_bdb "
            "(strongs_id, original_word, original_word_nfc, original_word_stripped, "
            "transliteration, gloss, definition) VALUES\n"
            + ",\n".join(rows)
            + ";\n\n"
        )
        blocks.append(block)

    # Group blocks into chunks by size
    chunks = []
    current_chunk_blocks = []
    current_size = 0

    for block in blocks:
        block_size = len(block.encode("utf-8"))
        if current_size + block_size > CHUNK_SIZE_BYTES and current_chunk_blocks:
            chunks.append(current_chunk_blocks)
            current_chunk_blocks = []
            current_size = 0
        current_chunk_blocks.append(block)
        current_size += block_size

    if current_chunk_blocks:
        chunks.append(current_chunk_blocks)

    if len(chunks) == 1:
        output_path = output_dir / f"{base_name}.sql"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(header)
            f.writelines(chunks[0])
        print(f"Wrote {len(entries)} entries to {output_path}")
        return [output_path]
    else:
        paths = []
        for i, chunk_blocks in enumerate(chunks, 1):
            output_path = output_dir / f"{base_name}-{i:03d}.sql"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(header)
                f.writelines(chunk_blocks)
            entry_count = sum(block.count("(") - 1 for block in chunk_blocks)
            print(f"  Chunk {i}: approx {entry_count} batches → {output_path}")
            paths.append(output_path)
        print(f"Wrote {len(entries)} total entries in {len(chunks)} chunks")
        return paths


def main():
    # Download TBESH
    tbesh_text = download_file(TBESH_URL, "TBESH (Hebrew)")

    # Parse
    entries = parse_tbesh(tbesh_text)

    # Sort for deterministic output
    entries.sort(key=lambda e: e["strongs_id"])

    print(f"\nTotal Hebrew BDB entries: {len(entries)}")

    # Sanity check
    if len(entries) < 8000:
        print(f"ERROR: Expected at least 8000 entries, got {len(entries)}", file=sys.stderr)
        sys.exit(1)

    # Spot checks — including H1 (av/father) which was previously unreachable
    entries_dict = {e["strongs_id"]: e for e in entries}
    spot_ids = [("H0001", "av/father — padding fix"), ("H7225", "reshit/beginning")]
    print("\nSpot checks:")
    all_pass = True
    for strongs_id, label in spot_ids:
        entry = entries_dict.get(strongs_id)
        if entry:
            print(f"  {strongs_id} ({label}): gloss={entry['gloss']!r}")
        else:
            print(f"  WARNING: {strongs_id} ({label}) not found", file=sys.stderr)
            all_pass = False

    # Critical: verify H0001 is present (H1-H9 padding fix)
    if not all_pass:
        print("ERROR: Critical spot check failed — H0001 must be present", file=sys.stderr)
        sys.exit(1)

    # Verify no unpadded H1-H9 entries
    unpadded = [e["strongs_id"] for e in entries if re.match(r"^H\d$", e["strongs_id"])]
    if unpadded:
        print(f"ERROR: Found unpadded Hebrew IDs: {unpadded[:5]}", file=sys.stderr)
        sys.exit(1)
    print("  Padding check: all Hebrew IDs are 4-digit padded (no H1-H9)")

    # Write SQL
    write_sql_chunked(entries, SEED_DIR, "lexicon-bdb")
    print("\nDone.")


if __name__ == "__main__":
    main()
