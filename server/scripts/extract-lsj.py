#!/usr/bin/env python3
"""
LSJ ETL — extract full Liddell-Scott-Jones definitions from STEPBible TFLSJ data.

Downloads TFLSJ files from STEPBible-Data GitHub repo.
Parses tab-separated format and outputs SQL seed file for lexicon_lsj table.

NOTE: The TFLSJ is split into two files:
  - TFLSJ 0-5624 (main NT range)
  - TFLSJ extra (additional entries for LXX, variants, etc.)

Format: eStrong\tdStrong\tuStrong\tGreek\tTransliteration\tMorph\tGloss\tLSJ Meaning

Usage:
    cd server && python3 scripts/extract-lsj.py

Output:
    d1-seed/lexicon-lsj.sql (or chunked lexicon-lsj-001.sql etc. if >10MB)

Source:
    STEPBible TFLSJ (CC BY 4.0)
    https://github.com/STEPBible/STEPBible-Data
"""

import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

# ─── Source URLs ──────────────────────────────────────────────────────────────
TFLSJ_PART1_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
    "Lexicons/TFLSJ%20%200-5624%20-%20Translators%20Formatted%20full%20LSJ%20"
    "Bible%20lexicon%20-%20STEPBible.org%20CC%20BY.txt"
)
TFLSJ_EXTRA_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
    "Lexicons/TFLSJ%20extra%20-%20Translators%20Formatted%20full%20LSJ%20"
    "Bible%20lexicon%20-%20STEPBible.org%20CC%20BY.txt"
)

SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
CHUNK_SIZE_BYTES = 9 * 1024 * 1024  # 9MB per chunk (stay under 10MB)
BATCH_SIZE = 1  # LSJ definitions can be up to 72KB each


def sql_escape(value):
    """Escape single quotes for SQL string literals."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def strip_accents(text):
    """Remove diacritical marks from Unicode text."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.category(c).startswith("M"))


def pad_strongs(raw_id):
    """Pad Strong's ID to 4-digit format.

    Examples:
        G1 → G0001
        G0001G → G0001  (strip suffix for primary key)
        G0001 → G0001   (already padded)
    """
    # Strip letter suffix (G0001G → G0001G means disambiguator)
    # We only use the numeric part for the primary key lookup
    match = re.match(r"^([HG])0*(\d+)([a-zA-Z]?)$", raw_id.strip())
    if match:
        prefix = match.group(1)
        num = int(match.group(2))
        suffix = match.group(3).lower()
        return f"{prefix}{num:04d}{suffix}"
    return raw_id.strip()


def normalize_estrongs(raw_id):
    """Extract and normalize the primary eStrong ID from the first tab field.

    The eStrong field may contain 'G0001' or 'G0001' — take as-is and pad.
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


def parse_tflsj(text, label):
    """Parse a TFLSJ tab-separated file into LSJ entries.

    Format (from header line 60):
      eStrong\tdStrong\tuStrong\tGreek\tTransliteration\tMorph\tGloss\tLSJ Meaning

    Rules:
    - Lines starting with header/preamble (before the data section) are skipped
    - Empty lines are skipped
    - Each line may have multiple disambiguations (G0001G, G0001H) — we deduplicate
      by eStrong, keeping the first (most canonical) entry
    """
    entries = {}  # strongs_id → entry dict (deduplicate by eStrong)
    skipped = 0
    in_data = False

    for line_num, line in enumerate(text.splitlines(), 1):
        # Detect start of data section
        if line.strip().startswith("==="):
            # The data starts after the separator line following the column header
            in_data = True
            continue

        if not in_data:
            continue

        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Data lines: tab-separated
        parts = line.split("\t")
        if len(parts) < 7:
            skipped += 1
            continue

        e_strongs_raw = parts[0].strip()  # eStrong (e.g. G0001)
        # d_strongs = parts[1].strip()     # dStrong — disambiguated (e.g. G0001G)
        # u_strongs = parts[2].strip()     # uStrong — unified
        greek = parts[3].strip()
        transliteration = parts[4].strip() if len(parts) > 4 else ""
        # morph = parts[5].strip()         # not stored
        gloss = parts[6].strip() if len(parts) > 6 else ""
        definition = parts[7].strip() if len(parts) > 7 else ""

        if not e_strongs_raw or not gloss:
            skipped += 1
            continue

        # Normalize eStrong to 4-digit padded
        strongs_id = normalize_estrongs(e_strongs_raw)

        # Skip non-Greek entries (H-prefix are Hebrew transliterations)
        if not strongs_id.startswith("G"):
            skipped += 1
            continue

        # Deduplicate: first entry wins (canonical disambiguation)
        if strongs_id in entries:
            skipped += 1
            continue

        # Use the first Greek word from comma-separated list
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
            "definition": definition or None,
        }

    entry_list = list(entries.values())
    print(f"  {label}: {len(entry_list)} entries parsed, {skipped} lines skipped")
    return entry_list


def write_sql_chunked(entries, output_dir, base_name):
    """Write LSJ entries as chunked INSERT statements (split at CHUNK_SIZE_BYTES)."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build all INSERT lines first, then split into chunks by size
    insert_lines = []
    for e in entries:
        row = (
            f"INSERT OR REPLACE INTO lexicon_lsj "
            f"(strongs_id, original_word, original_word_nfc, original_word_stripped, "
            f"transliteration, gloss, definition) VALUES "
            f"({sql_escape(e['strongs_id'])}, "
            f"{sql_escape(e['original_word'])}, "
            f"{sql_escape(e['original_word_nfc'])}, "
            f"{sql_escape(e['original_word_stripped'])}, "
            f"{sql_escape(e['transliteration'])}, "
            f"{sql_escape(e['gloss'])}, "
            f"{sql_escape(e['definition'])});\n"
        )
        insert_lines.append(row)

    # Split into chunks
    chunks = []
    current_chunk = []
    current_size = 0
    header = "-- Auto-generated by extract-lsj.py\n-- Source: STEPBible TFLSJ (CC BY 4.0)\n\n"

    for line in insert_lines:
        line_size = len(line.encode("utf-8"))
        if current_size + line_size > CHUNK_SIZE_BYTES and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_size = 0
        current_chunk.append(line)
        current_size += line_size

    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) == 1:
        # Single file
        output_path = output_dir / f"{base_name}.sql"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(header)
            f.writelines(chunks[0])
        print(f"Wrote {len(entries)} entries to {output_path}")
        return [output_path]
    else:
        # Multiple chunks
        paths = []
        for i, chunk in enumerate(chunks, 1):
            output_path = output_dir / f"{base_name}-{i:03d}.sql"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(header)
                f.writelines(chunk)
            print(f"  Chunk {i}: {len(chunk)} entries → {output_path}")
            paths.append(output_path)
        print(f"Wrote {len(entries)} total entries in {len(chunks)} chunks")
        return paths


def run_spot_checks(entries_dict):
    """Run spot checks for key entries."""
    spot_ids = [("G0026", "agape/love"), ("G3056", "logos/word"), ("G4561", "sarx/flesh")]
    print("\nSpot checks:")
    all_pass = True
    for strongs_id, label in spot_ids:
        entry = entries_dict.get(strongs_id)
        if entry:
            gloss = entry.get("gloss", "")
            definition_preview = (entry.get("definition") or "")[:80]
            print(f"  {strongs_id} ({label}): gloss={gloss!r}, def={definition_preview!r}...")
        else:
            print(f"  WARNING: {strongs_id} ({label}) not found", file=sys.stderr)
            all_pass = False
    return all_pass


def main():
    # Download both TFLSJ parts
    part1_text = download_file(TFLSJ_PART1_URL, "TFLSJ 0-5624")
    extra_text = download_file(TFLSJ_EXTRA_URL, "TFLSJ extra")

    # Parse both
    part1_entries = parse_tflsj(part1_text, "TFLSJ 0-5624")
    extra_entries = parse_tflsj(extra_text, "TFLSJ extra")

    # Merge — part1 entries take priority, extra fills gaps
    all_entries_dict = {}
    for e in extra_entries:
        all_entries_dict[e["strongs_id"]] = e
    for e in part1_entries:
        all_entries_dict[e["strongs_id"]] = e  # part1 wins on conflict

    combined = list(all_entries_dict.values())
    # Sort by strongs_id for deterministic output
    combined.sort(key=lambda e: e["strongs_id"])

    print(f"\nTotal unique LSJ entries: {len(combined)}")

    # Sanity check
    if len(combined) < 5000:
        print(f"ERROR: Expected at least 5000 entries, got {len(combined)}", file=sys.stderr)
        sys.exit(1)

    # Spot checks
    run_spot_checks(all_entries_dict)

    # Write SQL (chunked if needed)
    write_sql_chunked(combined, SEED_DIR, "lexicon-lsj")
    print("\nDone.")


if __name__ == "__main__":
    main()
