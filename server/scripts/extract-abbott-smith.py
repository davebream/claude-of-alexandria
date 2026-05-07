#!/usr/bin/env python3
"""
Abbott-Smith ETL — extract Greek NT definitions from STEPBible TBESG data.

Downloads TBESG from STEPBible-Data GitHub repo.
The TBESG "Brief lexicon" is based on Abbott-Smith (with corrections by Tyndale scholars).
Parses tab-separated format and outputs SQL seed file for lexicon_abbott_smith table.

NOTE: Inspection of the TBESG file header reveals:
  "The Brief lexicon is based on the Abbott-Smith definitions, and edited to conform
   with the extended Strongs."
  There are NO @AS_Def markers — the entire Meaning column is Abbott-Smith content.
  All TBESG Greek entries are extracted as Abbott-Smith definitions.

Format: eStrong\tdStrong\tuStrong\tGreek\tTransliteration\tMorph\tGloss\tMeaning

Usage:
    cd server && python3 scripts/extract-abbott-smith.py

Output:
    d1-seed/lexicon-abbott-smith.sql

Source:
    STEPBible TBESG (CC BY 4.0)
    https://github.com/STEPBible/STEPBible-Data
"""

import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

# ─── Source URL ──────────────────────────────────────────────────────────────
TBESG_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
    "Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20"
    "Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
)

SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
OUTPUT_FILE = SEED_DIR / "lexicon-abbott-smith.sql"
BATCH_SIZE = 20


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

    Examples:
        G1 → G0001
        G0001 → G0001
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


def parse_tbesg(text):
    """Parse TBESG tab-separated file into Abbott-Smith entries.

    Format (from header):
      eStrong\tdStrong\tuStrong\tGreek\tTransliteration\tMorph\tGloss\tMeaning

    Rules:
    - Lines before the data section (===separator===) are skipped
    - Empty lines are skipped
    - Only Greek (G-prefix) entries are included
    - Multiple disambiguations for same eStrong: first entry wins
    - Entries without a Meaning field are skipped (no Abbott-Smith content)
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
        # d_strongs = parts[1]  # disambiguated (e.g. G0001G) — not used
        # u_strongs = parts[2]  # unified — not used
        greek = parts[3].strip()
        transliteration = parts[4].strip() if len(parts) > 4 else ""
        # morph = parts[5]  # not stored
        gloss = parts[6].strip() if len(parts) > 6 else ""
        definition = parts[7].strip() if len(parts) > 7 else ""

        if not e_strongs_raw or not gloss:
            skipped += 1
            continue

        # Skip entries without Abbott-Smith definition content
        if not definition:
            skipped += 1
            continue

        strongs_id = normalize_estrongs(e_strongs_raw)

        # Only Greek entries (G-prefix)
        if not strongs_id.startswith("G"):
            skipped += 1
            continue

        # Deduplicate: first entry wins (most canonical)
        if strongs_id in entries:
            skipped += 1
            continue

        # Use first word from comma-separated Greek forms
        original_word = greek.split(",")[0].strip() if greek else ""
        original_word_nfc = unicodedata.normalize("NFC", original_word)
        original_word_stripped = strip_accents(original_word)

        entries[strongs_id] = {
            "strongs_id": strongs_id,
            "original_word": original_word,
            "original_word_nfc": original_word_nfc,
            "original_word_stripped": original_word_stripped,
            "transliteration": transliteration or None,
            "gloss": gloss,
            "definition": definition,
        }

    entry_list = list(entries.values())
    print(f"  TBESG: {len(entry_list)} entries parsed, {skipped} lines skipped")
    return entry_list


def write_sql(entries, output_path):
    """Write Abbott-Smith entries as batched INSERT statements."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated by extract-abbott-smith.py\n")
        f.write("-- Source: STEPBible TBESG (CC BY 4.0) — Abbott-Smith definitions\n\n")

        for i in range(0, len(entries), BATCH_SIZE):
            batch = entries[i : i + BATCH_SIZE]
            f.write(
                "INSERT OR REPLACE INTO lexicon_abbott_smith "
                "(strongs_id, original_word, original_word_nfc, original_word_stripped, "
                "transliteration, gloss, definition) VALUES\n"
            )
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
            f.write(",\n".join(rows))
            f.write(";\n\n")

    print(f"Wrote {len(entries)} entries to {output_path}")


def main():
    # Download TBESG
    tbesg_text = download_file(TBESG_URL, "TBESG (Greek)")

    # Parse
    entries = parse_tbesg(tbesg_text)

    # Sort for deterministic output
    entries.sort(key=lambda e: e["strongs_id"])

    print(f"\nTotal Abbott-Smith entries: {len(entries)}")

    # Sanity check
    if len(entries) < 5000:
        print(f"ERROR: Expected at least 5000 entries, got {len(entries)}", file=sys.stderr)
        sys.exit(1)

    # Spot checks
    entries_dict = {e["strongs_id"]: e for e in entries}
    spot_ids = [("G0026", "agape"), ("G3056", "logos"), ("G4561", "sarx")]
    print("\nSpot checks:")
    for strongs_id, label in spot_ids:
        entry = entries_dict.get(strongs_id)
        if entry:
            print(f"  {strongs_id} ({label}): gloss={entry['gloss']!r}")
        else:
            print(f"  WARNING: {strongs_id} ({label}) not found", file=sys.stderr)

    # Write SQL
    write_sql(entries, OUTPUT_FILE)
    print("\nDone.")


if __name__ == "__main__":
    main()
