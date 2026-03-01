#!/usr/bin/env python3
"""
Macula Hebrew ETL — extract OT morphology from Clear Bible's Macula Hebrew TSV.

Downloads the TSV via Git LFS from a pinned commit, parses ~305K word rows,
and outputs per-book SQL seed files with multi-row INSERTs (100 rows/statement).

Usage:
    cd server && python3 scripts/extract-macula-hebrew.py

Output:
    d1-seed/morphology-ot-{book}.sql  (one file per OT book)

Source:
    MACULA Hebrew Linguistic Datasets (CC BY 4.0)
    https://github.com/Clear-Bible/macula-hebrew/
"""

import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# ─── Version pinning ─────────────────────────────────────────────────────────
COMMIT_SHA = "28464e48eafc981fd58b4c8eb773fa44f17500ae"
LFS_OID = "5317eac0c2aaa24a920a2a95fe9e27a852233fb9d3d60a9206e4416aff6f964c"
LFS_SIZE = 84374369
EXPECTED_SHA256 = LFS_OID  # LFS OID is the SHA-256 of the file content

TSV_FILENAME = "macula-hebrew.tsv"
LFS_BATCH_URL = "https://github.com/Clear-Bible/macula-hebrew.git/info/lfs/objects/batch"

# ─── Book mapping: Macula abbreviation → lowercase book name for D1 ──────────
BOOK_ABBREV_TO_NAME = {
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

# ─── POS mapping ─────────────────────────────────────────────────────────────
POS_MAP = {
    "V": "verb", "N": "noun", "A": "adjective", "P": "pronoun",
    "R": "preposition", "C": "conjunction", "D": "adverb",
    "T": "particle", "S": "suffix", "X": "unknown",
}

# ─── Verb stem mappings (binyanim) ───────────────────────────────────────────
HEBREW_STEM_MAP = {
    "q": "Qal", "N": "Niphal", "p": "Piel", "P": "Pual",
    "h": "Hiphil", "H": "Hophal", "t": "Hithpael",
    "o": "Polel", "O": "Polal", "r": "Hithpolel",
    "m": "Poel", "M": "Poal", "k": "Palel", "K": "Pulal",
    "Q": "Qal_passive", "l": "Pilpel", "L": "Polpal",
    "f": "Hithpalpel", "D": "Nithpael", "j": "Pealal",
    "i": "Pilel", "u": "Hothpaal", "c": "Tiphil",
    "v": "Hishtaphel", "w": "Nithpalel", "y": "Nithpoel",
    "z": "Hithpoel",
}
ARAMAIC_STEM_MAP = {
    "q": "Peal", "Q": "Peil", "u": "Hithpeel",
    "p": "Pael", "P": "Ithpaal", "M": "Hithpaal",
    "a": "Aphel", "h": "Haphel", "s": "Saphel",
    "e": "Shaphel", "H": "Hophal", "i": "Ithpeel",
    "t": "Hishtaphel", "v": "Ishtaphel", "w": "Hithaphel",
    "o": "Polel", "z": "Ithpoel", "r": "Hithpolel",
    "f": "Hithpalpel", "b": "Hephal", "c": "Tiphel",
    "m": "Poel", "l": "Palpel", "L": "Ithpalpel",
    "O": "Ithpolel", "G": "Ittaphal",
}

CONJUGATION_MAP = {
    "p": "perfect", "q": "sequential_perfect", "i": "imperfect",
    "w": "wayyiqtol", "v": "imperative",
    "r": "active_participle", "s": "passive_participle",
    "a": "infinitive_absolute", "c": "infinitive_construct",
    "h": "cohortative", "j": "jussive",
}
NOUN_TYPE_MAP = {"c": "common", "p": "proper", "g": "gentilic"}
GENDER_MAP = {"m": "mas", "f": "fem", "b": "com", "c": "com"}
NUMBER_MAP = {"s": "sg", "p": "pl", "d": "du"}
STATE_MAP = {"a": "abs", "c": "cst", "d": "det"}

# Cantillation marks: U+0591–U+05AF
CANTILLATION_RE = re.compile(r"[\u0591-\u05AF]")


def strip_cantillation(text: str) -> str:
    """Remove cantillation marks, preserving vowel points."""
    return CANTILLATION_RE.sub("", text)


def decode_morph_to_compact(morph_code: str, lang: str) -> str | None:
    """
    Decode MorphHB morph code to compact JSON with Hebrew keys.

    Keys: st=stem, cj=conjugation, p=person, g=gender, n=number,
          s=state, nt=noun_type, sf=suffix, pg=paragogic
    Values: mas/fem/com, sg/pl/du, abs/cst/det
    """
    if not morph_code:
        return None

    # Split compound forms (e.g., "HR/Ncfsa")
    parts = morph_code.split("/")
    main_part = parts[-1]  # Use last part (main word)

    # Strip language prefix (H or A)
    code = main_part
    if code and code[0] in ("H", "A"):
        lang_char = code[0]
        code = code[1:]
    else:
        lang_char = "H" if lang == "H" else "A"

    if not code:
        return None

    pos_char = code[0]
    rest = code[1:]
    result = {}

    if pos_char == "V":
        result = _decode_verb_compact(rest, lang_char)
    elif pos_char in ("N", "A"):
        result = _decode_noun_compact(rest)
    elif pos_char == "P":
        result = _decode_pronoun_compact(rest)
    elif pos_char == "S":
        result = _decode_suffix_compact(rest)
    # R, C, D, T, X: no further parsing needed

    # Check for pronominal suffix in compound forms
    if len(parts) > 1:
        for prefix_part in parts[:-1]:
            p = prefix_part
            if p and p[0] in ("H", "A"):
                p = p[1:]
            if p and p[0] == "S":
                sf = _decode_suffix_compact(p[1:])
                if sf:
                    result["sf"] = sf

    # Check for paragogic markers
    if "h" in morph_code.lower() and pos_char == "V":
        conj = result.get("cj", "")
        if conj == "cohortative":
            result["pg"] = "he"
    # Paragogic nun detection from specific verb forms
    if rest and len(rest) >= 4 and rest[-1] == "n" and pos_char == "V":
        cj_char = rest[0] if len(rest) > 0 else ""
        if cj_char in ("i", "v"):  # imperfect or imperative with nun
            result["pg"] = "nun"

    if not result:
        return None
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))


def _decode_verb_compact(code: str, lang_char: str) -> dict:
    """Decode verb: [stem][conjugation][person][gender][number]"""
    result = {}
    if not code:
        return result

    stem_map = ARAMAIC_STEM_MAP if lang_char == "A" else HEBREW_STEM_MAP
    stem = stem_map.get(code[0])
    if stem:
        result["st"] = stem
    rest = code[1:]
    if not rest:
        return result

    conj = CONJUGATION_MAP.get(rest[0])
    if conj:
        result["cj"] = conj
    rest = rest[1:]
    if not rest:
        return result

    if rest[0].isdigit():
        result["p"] = rest[0]
        rest = rest[1:]
    if not rest:
        return result

    g = GENDER_MAP.get(rest[0])
    if g:
        result["g"] = g
        rest = rest[1:]
    if not rest:
        return result

    n = NUMBER_MAP.get(rest[0])
    if n:
        result["n"] = n
    return result


def _decode_noun_compact(code: str) -> dict:
    """Decode noun/adjective: [type][gender][number][state]"""
    result = {}
    if not code:
        return result

    nt = NOUN_TYPE_MAP.get(code[0])
    if nt:
        result["nt"] = nt
    elif code[0] == "o":
        result["nt"] = "ordinal"
    rest = code[1:]
    if not rest:
        return result

    g = GENDER_MAP.get(rest[0])
    if g:
        result["g"] = g
        rest = rest[1:]
    if not rest:
        return result

    n = NUMBER_MAP.get(rest[0])
    if n:
        result["n"] = n
        rest = rest[1:]
    if not rest:
        return result

    s = STATE_MAP.get(rest[0])
    if s:
        result["s"] = s
    return result


def _decode_pronoun_compact(code: str) -> dict:
    """Decode pronoun: [type][person][gender][number]"""
    result = {}
    if not code:
        return result

    pron_types = {"p": "personal", "d": "demonstrative", "i": "interrogative",
                  "r": "relative", "n": "indefinite", "f": "reflexive", "s": "suffixed"}
    if code[0] in pron_types:
        result["nt"] = pron_types[code[0]]
        rest = code[1:]
    else:
        rest = code

    if not rest:
        return result
    if rest[0].isdigit():
        result["p"] = rest[0]
        rest = rest[1:]
    if not rest:
        return result

    g = GENDER_MAP.get(rest[0])
    if g:
        result["g"] = g
        rest = rest[1:]
    if not rest:
        return result

    n = NUMBER_MAP.get(rest[0])
    if n:
        result["n"] = n
    return result


def _decode_suffix_compact(code: str) -> dict:
    """Decode suffix: [type][person][gender][number]"""
    result = {}
    if not code:
        return result

    suffix_types = {"p": "pronominal", "n": "paragogic", "d": "directional"}
    if code[0] in suffix_types:
        result["nt"] = suffix_types[code[0]]
        rest = code[1:]
    else:
        rest = code

    if not rest:
        return result
    if rest[0].isdigit():
        result["p"] = rest[0]
        rest = rest[1:]
    if not rest:
        return result

    g = GENDER_MAP.get(rest[0])
    if g:
        result["g"] = g
        rest = rest[1:]
    if not rest:
        return result

    n = NUMBER_MAP.get(rest[0])
    if n:
        result["n"] = n
    return result


def get_pos_from_morph(morph_code: str) -> str:
    """Extract POS from morph code (last segment, first char after language prefix)."""
    if not morph_code:
        return "unknown"
    parts = morph_code.split("/")
    main = parts[-1]
    if main and main[0] in ("H", "A"):
        main = main[1:]
    if main:
        return POS_MAP.get(main[0], "unknown")
    return "unknown"


def sql_escape(val: str | None) -> str:
    """Escape a string value for SQL insertion."""
    if val is None:
        return "NULL"
    escaped = val.replace("'", "''")
    return f"'{escaped}'"


def download_tsv(dest_dir: Path) -> Path:
    """Download Macula Hebrew TSV via Git LFS. Skip if cached and checksum matches."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    tsv_path = dest_dir / TSV_FILENAME

    if tsv_path.exists():
        print(f"Checking existing file: {tsv_path}")
        sha256 = hashlib.sha256()
        with open(tsv_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        if sha256.hexdigest() == EXPECTED_SHA256:
            print(f"  Checksum matches — skipping download.")
            return tsv_path
        else:
            print(f"  Checksum mismatch — re-downloading.")

    print(f"Requesting Git LFS download URL...")
    lfs_request = json.dumps({
        "operation": "download",
        "objects": [{"oid": LFS_OID, "size": LFS_SIZE}]
    }).encode()

    req = urllib.request.Request(
        LFS_BATCH_URL,
        data=lfs_request,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/vnd.git-lfs+json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        lfs_response = json.loads(resp.read())

    download_url = lfs_response["objects"][0]["actions"]["download"]["href"]
    print(f"Downloading TSV ({LFS_SIZE / 1024 / 1024:.1f} MB)...")

    sha256 = hashlib.sha256()
    downloaded = 0
    with urllib.request.urlopen(download_url) as resp, open(tsv_path, "wb") as out:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            out.write(chunk)
            sha256.update(chunk)
            downloaded += len(chunk)

    if sha256.hexdigest() != EXPECTED_SHA256:
        tsv_path.unlink()
        print(f"ERROR: SHA-256 mismatch after download!", file=sys.stderr)
        print(f"  Expected: {EXPECTED_SHA256}", file=sys.stderr)
        print(f"  Got:      {sha256.hexdigest()}", file=sys.stderr)
        sys.exit(1)

    print(f"  Downloaded {downloaded / 1024 / 1024:.1f} MB, checksum verified.")
    return tsv_path


def parse_ref(ref: str) -> tuple[str, int, int, int] | None:
    """Parse ref like 'GEN 1:1!1' → (book_abbrev, chapter, verse, word_pos)."""
    match = re.match(r"(\w+)\s+(\d+):(\d+)!(\d+)", ref)
    if not match:
        return None
    return match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(4))


def process_tsv(tsv_path: Path) -> dict[str, list[dict]]:
    """Parse TSV into per-book word lists."""
    books: dict[str, list[dict]] = {}
    line_num = 0
    skipped = 0

    # TSV column indices (0-based)
    COL_XMLID = 0
    COL_REF = 1
    COL_CLASS = 2
    COL_TEXT = 3
    COL_STRONGNUMBERX = 6
    COL_GLOSS = 11
    COL_MORPH = 15
    COL_LANG = 16
    COL_LEMMA = 17
    COL_FRAME = 29
    COL_SUBJREF = 30
    COL_PARTICIPANTREF = 31

    with open(tsv_path, "r", encoding="utf-8") as f:
        header = f.readline()  # skip header
        cols = header.strip().split("\t")
        print(f"  TSV columns: {len(cols)}")

        for line in f:
            line_num += 1
            fields = line.strip("\n").split("\t")

            # Pad fields if shorter than expected
            while len(fields) < 32:
                fields.append("")

            ref = fields[COL_REF]
            parsed_ref = parse_ref(ref)
            if not parsed_ref:
                skipped += 1
                continue

            book_abbrev, chapter, verse, word_pos = parsed_ref
            book_name = BOOK_ABBREV_TO_NAME.get(book_abbrev)
            if not book_name:
                skipped += 1
                continue

            text = fields[COL_TEXT]
            morph_code = fields[COL_MORPH]
            lang = fields[COL_LANG]
            lemma = fields[COL_LEMMA] or ""
            gloss = fields[COL_GLOSS] or None
            strongnumberx = fields[COL_STRONGNUMBERX] or None
            clause_type = fields[COL_CLASS] or None
            frame = fields[COL_FRAME] or None
            subjref = fields[COL_SUBJREF] or None
            participantref = fields[COL_PARTICIPANTREF] or None
            xml_id = fields[COL_XMLID]

            # Normalized: strip cantillation, keep vowel points
            normalized = strip_cantillation(text) if text else None

            # POS from morph code (more reliable than TSV pos column)
            pos = get_pos_from_morph(morph_code)

            # Parse morph code to compact JSON
            parsing = decode_morph_to_compact(morph_code, lang)

            # Format Strong's with H prefix
            strongs = None
            if strongnumberx:
                s = strongnumberx.strip()
                if s and s[0].isdigit():
                    strongs = f"H{s}"
                elif s:
                    strongs = s

            # Derive clause_id from xml:id
            # Format: o{book:2}{chapter:3}{verse:3}{word:2}{part:1}
            # Clause grouping: use book+chapter+verse as basic unit
            clause_id = f"c.{book_abbrev}.{chapter}.{verse}" if xml_id else None

            word = {
                "book": book_name,
                "chapter": chapter,
                "verse": verse,
                "word_position": word_pos,
                "text": text,
                "normalized": normalized,
                "lemma": lemma,
                "pos": pos,
                "parsing": parsing,
                "gloss": gloss,
                "strongs": strongs,
                "clause_id": clause_id,
                "clause_type": clause_type,
                "semantic_frame": frame,
                "subject_ref": subjref,
                "participant_ref": participantref,
            }

            if book_name not in books:
                books[book_name] = []
            books[book_name].append(word)

    print(f"  Parsed {line_num} lines, skipped {skipped}, got {sum(len(w) for w in books.values())} words in {len(books)} books")
    return books


def write_sql_files(books: dict[str, list[dict]], output_dir: Path) -> None:
    """Write per-book SQL seed files with multi-row INSERTs (100 rows/statement)."""
    output_dir.mkdir(parents=True, exist_ok=True)

    cols = ("book", "testament", "chapter", "verse", "word_position",
            "text", "normalized", "lemma", "pos", "parsing",
            "gloss", "strongs", "clause_id", "clause_type",
            "semantic_frame", "subject_ref", "participant_ref")
    col_list = ", ".join(cols)

    total_rows = 0
    for book_name, words in sorted(books.items()):
        filename = f"morphology-ot-{book_name.replace('_', '-')}.sql"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"-- Macula Hebrew OT morphology: {book_name} ({len(words)} words)\n")
            f.write(f"DELETE FROM morphology WHERE testament = 'ot' AND book = {sql_escape(book_name)};\n\n")

            # Multi-row INSERT, 100 rows per statement
            batch_size = 100
            for i in range(0, len(words), batch_size):
                batch = words[i:i + batch_size]
                f.write(f"INSERT INTO morphology ({col_list}) VALUES\n")

                rows = []
                for w in batch:
                    vals = (
                        sql_escape(w["book"]),
                        "'ot'",
                        str(w["chapter"]),
                        str(w["verse"]),
                        str(w["word_position"]),
                        sql_escape(w["text"]),
                        sql_escape(w["normalized"]),
                        sql_escape(w["lemma"]),
                        sql_escape(w["pos"]),
                        sql_escape(w["parsing"]),
                        sql_escape(w["gloss"]),
                        sql_escape(w["strongs"]),
                        sql_escape(w["clause_id"]),
                        sql_escape(w["clause_type"]),
                        sql_escape(w["semantic_frame"]),
                        sql_escape(w["subject_ref"]),
                        sql_escape(w["participant_ref"]),
                    )
                    rows.append(f"  ({', '.join(vals)})")

                f.write(",\n".join(rows))
                f.write(";\n\n")

            total_rows += len(words)

        print(f"  Written: {filepath} ({len(words)} words)")

    print(f"\nTotal: {total_rows} rows across {len(books)} books")


def verify_genesis(books: dict[str, list[dict]]) -> None:
    """Spot-check Genesis 1:1 data quality."""
    print("\nVerification — Genesis 1:1:")
    gen_words = books.get("genesis", [])
    verse_1_1 = [w for w in gen_words if w["chapter"] == 1 and w["verse"] == 1]

    if not verse_1_1:
        print("  ERROR: No words found for Genesis 1:1")
        return

    print(f"  Word count: {len(verse_1_1)}")

    first_word = verse_1_1[0]
    print(f"  First word: text={first_word['text']!r}, gloss={first_word['gloss']!r}, strongs={first_word['strongs']!r}")

    # Check for bara (created) - should be word position 2
    bara_words = [w for w in verse_1_1 if w["strongs"] and "1254" in w["strongs"]]
    if bara_words:
        bw = bara_words[0]
        print(f"  בָּרָא (bara): pos={bw['pos']}, parsing={bw['parsing']}, strongs={bw['strongs']}")
        if bw["parsing"]:
            p = json.loads(bw["parsing"])
            stem = p.get("st", "?")
            conj = p.get("cj", "?")
            status = "PASS" if stem == "Qal" and conj == "perfect" else "CHECK"
            print(f"    stem={stem}, conjugation={conj} [{status}]")
    else:
        print("  בָּרָא (H1254): not found")

    # Check Elohim
    elohim = [w for w in verse_1_1 if w["strongs"] and "0430" in w["strongs"]]
    if elohim:
        ew = elohim[0]
        print(f"  אֱלֹהִים: gloss={ew['gloss']!r}, strongs={ew['strongs']!r}")

    # Check normalized (should not have cantillation)
    for w in verse_1_1[:3]:
        has_cant = bool(CANTILLATION_RE.search(w["normalized"] or ""))
        status = "FAIL" if has_cant else "PASS"
        print(f"  Normalized check: {w['text']!r} → {w['normalized']!r} [{status}]")


def main():
    script_dir = Path(__file__).parent
    server_dir = script_dir.parent
    cache_dir = server_dir / ".cache"
    output_dir = server_dir / "d1-seed"

    print("=== Macula Hebrew ETL ===")
    print(f"Commit SHA: {COMMIT_SHA}")
    print()

    # Step 1: Download TSV
    tsv_path = download_tsv(cache_dir)

    # Step 2: Parse TSV
    print(f"\nParsing {tsv_path}...")
    books = process_tsv(tsv_path)

    # Step 3: Verify
    verify_genesis(books)

    # Step 4: Write SQL
    print(f"\nWriting SQL seed files to {output_dir}...")
    write_sql_files(books, output_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
