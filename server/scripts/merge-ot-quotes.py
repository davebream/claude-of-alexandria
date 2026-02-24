#!/usr/bin/env python3
"""
Merge Levinsohn OT_quotes.json with STEPBible ot_in_nt_refs.json.
Outputs: server/d1-seed/ot-quotes.sql + merge-report.json

STEPBible format: array of [nt_ref, ot_refs, english_text]
  nt_ref:  "Matt.1:23" or "Matt.4:6-7" (OSIS: book.ch:v[-v])
  ot_refs: "Isa.7:14" or "Ps.91:11-12;Deut.6:16" (semicolons for multiple)

Levinsohn format: {"references": [{"verse": "Matt 1:23", "word": "Greek text"}, ...]}
"""
import json
import re
import sys
from collections import defaultdict

LEVINSOHN_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/levinsohn/OT_quotes.json"
STEPBIBLE_PATH = "server/scripts/ot_in_nt_refs.json"
OUTPUT_SQL = "server/d1-seed/ot-quotes.sql"
OUTPUT_REPORT = "server/scripts/merge-report.json"

# OSIS abbreviation → canonical book name (matches server/src/db/books.ts)
BOOK_ALIASES = {
    # NT
    "Matt": "matthew", "Mark": "mark", "Luke": "luke", "John": "john",
    "Acts": "acts", "Rom": "romans", "1Cor": "1_corinthians", "2Cor": "2_corinthians",
    "Gal": "galatians", "Eph": "ephesians", "Phil": "philippians", "Col": "colossians",
    "1Thess": "1_thessalonians", "2Thess": "2_thessalonians",
    "1Tim": "1_timothy", "2Tim": "2_timothy", "Titus": "titus", "Phlm": "philemon",
    "Heb": "hebrews", "Jas": "james", "1Pet": "1_peter", "2Pet": "2_peter",
    "1John": "1_john", "2John": "2_john", "3John": "3_john",
    "Jude": "jude", "Rev": "revelation",
    # OT
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus", "Num": "numbers",
    "Deut": "deuteronomy", "Josh": "joshua", "Judg": "judges", "Ruth": "ruth",
    "1Sam": "1_samuel", "2Sam": "2_samuel", "1Kgs": "1_kings", "2Kgs": "2_kings",
    "1Chr": "1_chronicles", "2Chr": "2_chronicles", "Ezra": "ezra", "Neh": "nehemiah",
    "Esth": "esther", "Job": "job", "Ps": "psalms", "Prov": "proverbs",
    "Eccl": "ecclesiastes", "Song": "song_of_songs", "Isa": "isaiah", "Jer": "jeremiah",
    "Lam": "lamentations", "Ezek": "ezekiel", "Dan": "daniel", "Hos": "hosea",
    "Joel": "joel", "Amos": "amos", "Obad": "obadiah", "Jonah": "jonah",
    "Mic": "micah", "Nah": "nahum", "Hab": "habakkuk", "Zeph": "zephaniah",
    "Hag": "haggai", "Zech": "zechariah", "Mal": "malachi",
}


def normalize_book(abbr: str) -> str | None:
    return BOOK_ALIASES.get(abbr)


def parse_osis_ref(ref: str) -> tuple[str, int, int] | None:
    """Parse OSIS ref like 'Matt.1:23' or 'Matt.4:6-7' → (canonical, ch, v).
    For ranges, returns the starting verse."""
    ref = ref.strip()
    m = re.match(r'^([A-Za-z0-9]+)\.(\d+):(\d+)(?:-\d+)?$', ref)
    if not m:
        return None
    book_abbr = m.group(1)
    ch = int(m.group(2))
    v = int(m.group(3))
    canonical = normalize_book(book_abbr)
    if not canonical:
        return None
    return (canonical, ch, v)


def parse_osis_ot_ref(ref: str) -> dict | None:
    """Parse OT ref like 'Isa.7:14' or 'Ps.91:11-12' → source dict."""
    ref = ref.strip()
    m = re.match(r'^([A-Za-z0-9]+)\.(\d+):(\d+)(?:-(\d+))?$', ref)
    if not m:
        return None
    canonical = normalize_book(m.group(1))
    if not canonical:
        return None
    return {
        "book": canonical,
        "chapter": int(m.group(2)),
        "verse": int(m.group(3)),
        "verse_end": int(m.group(4)) if m.group(4) else None,
    }


def parse_levinsohn_ref(verse: str) -> tuple[str, int, int] | None:
    """Parse Levinsohn ref like 'Matt 1:23' → (canonical, ch, v)."""
    m = re.match(r'^(\S+)\s+(\d+):(\d+)$', verse.strip())
    if not m:
        return None
    canonical = normalize_book(m.group(1))
    if not canonical:
        return None
    return (canonical, int(m.group(2)), int(m.group(3)))


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def main():
    # Load Levinsohn
    with open(LEVINSOHN_PATH) as f:
        lev_data = json.load(f)
    lev_refs = lev_data["references"]
    print(f"Levinsohn: {len(lev_refs)} entries")

    # Load STEPBible
    with open(STEPBIBLE_PATH) as f:
        step_data = json.load(f)
    print(f"STEPBible: {len(step_data)} entries")

    # Index STEPBible by normalized NT ref (starting verse) → list of OT sources
    step_by_ref: dict[tuple, list] = defaultdict(list)
    step_parse_errors = []

    for entry in step_data:
        nt_ref_str, ot_refs_str, _ = entry
        nt_parsed = parse_osis_ref(nt_ref_str)
        if not nt_parsed:
            step_parse_errors.append({"entry": nt_ref_str, "error": "unparseable NT ref"})
            continue

        for ot_ref_str in ot_refs_str.split(';'):
            ot_parsed = parse_osis_ot_ref(ot_ref_str.strip())
            if not ot_parsed:
                step_parse_errors.append({"entry": ot_ref_str, "error": "unparseable OT ref"})
                continue
            step_by_ref[nt_parsed].append(ot_parsed)

    print(f"STEPBible indexed: {len(step_by_ref)} NT refs, {len(step_parse_errors)} parse errors")

    # Track matched STEPBible keys
    matched_step_keys: set[tuple] = set()

    # Build SQL from Levinsohn (primary source — has Greek text)
    quote_id = 0
    source_id = 0
    quote_lines = ["-- OT Quotes seed data (merged Levinsohn + STEPBible)"]
    source_lines = []
    report = {
        "matched": 0,
        "levinsohn_only": 0,
        "stepbible_only": 0,
        "parse_errors": [],
        "step_parse_errors": len(step_parse_errors),
    }

    for entry in lev_refs:
        parsed = parse_levinsohn_ref(entry["verse"])
        if not parsed:
            report["parse_errors"].append(entry["verse"])
            continue

        book, chapter, verse = parsed
        greek = escape_sql(entry["word"])
        quote_id += 1

        quote_lines.append(
            f"INSERT OR REPLACE INTO ot_quotes (id, nt_book, nt_chapter, nt_verse, greek_text, quote_type) "
            f"VALUES ({quote_id}, '{book}', {chapter}, {verse}, '{greek}', 'direct');"
        )

        key = (book, chapter, verse)
        if key in step_by_ref:
            report["matched"] += 1
            matched_step_keys.add(key)
            for ot_src in step_by_ref[key]:
                source_id += 1
                ve = ot_src.get("verse_end")
                ve_sql = str(ve) if ve else "NULL"
                source_lines.append(
                    f"INSERT OR REPLACE INTO ot_quote_sources (id, quote_id, ot_book, ot_chapter, ot_verse, ot_verse_end) "
                    f"VALUES ({source_id}, {quote_id}, '{ot_src['book']}', {ot_src['chapter']}, {ot_src['verse']}, {ve_sql});"
                )
        else:
            report["levinsohn_only"] += 1

    # STEPBible-only entries → quote_type = 'allusion', no greek_text
    stepbible_only_keys = set(step_by_ref.keys()) - matched_step_keys
    for key in sorted(stepbible_only_keys):
        book, chapter, verse = key
        quote_id += 1
        report["stepbible_only"] += 1

        quote_lines.append(
            f"INSERT OR REPLACE INTO ot_quotes (id, nt_book, nt_chapter, nt_verse, greek_text, quote_type) "
            f"VALUES ({quote_id}, '{book}', {chapter}, {verse}, '', 'allusion');"
        )

        for ot_src in step_by_ref[key]:
            source_id += 1
            ve = ot_src.get("verse_end")
            ve_sql = str(ve) if ve else "NULL"
            source_lines.append(
                f"INSERT OR REPLACE INTO ot_quote_sources (id, quote_id, ot_book, ot_chapter, ot_verse, ot_verse_end) "
                f"VALUES ({source_id}, {quote_id}, '{ot_src['book']}', {ot_src['chapter']}, {ot_src['verse']}, {ve_sql});"
            )

    # Write SQL
    all_lines = quote_lines + ["", "-- OT Quote Sources"] + source_lines
    with open(OUTPUT_SQL, "w") as f:
        f.write("\n".join(all_lines) + "\n")

    # Write report
    with open(OUTPUT_REPORT, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Output: {OUTPUT_SQL} ({quote_id} quotes, {source_id} sources)")
    print(
        f"Report: matched={report['matched']}, "
        f"levinsohn_only={report['levinsohn_only']}, "
        f"stepbible_only={report['stepbible_only']}, "
        f"parse_errors={len(report['parse_errors'])}"
    )


if __name__ == "__main__":
    main()
