#!/usr/bin/env python3
"""
ETL: Commentary text from HelloAO API → D1 seed SQL files.
Source: https://bible.helloao.org/api/c/{commentary_id}/books.json

Commentaries: adam-clarke, jamieson-fausset-brown, john-gill,
              keil-delitzsch, matthew-henry, tyndale

Output: server/d1-seed/commentary-{name}.sql (one per commentary, split by book if large)
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

OUTPUT_DIR = "server/d1-seed"

COMMENTARIES = [
    "adam-clarke",
    "jamieson-fausset-brown",
    "john-gill",
    "keil-delitzsch",
    "matthew-henry",
    "tyndale",
]

# HelloAO commentary book names → canonical book names
# Populated dynamically from HelloAO /books.json endpoint
# (HelloAO uses its own abbreviations; we map at fetch time)

# Same mapping as etl-bible-text.py, but reversed: HelloAO short → canonical
HELLOAO_BOOK_TO_CANONICAL = {
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
    "MAT": "matthew", "MRK": "mark", "LUK": "luke", "JHN": "john", "ACT": "acts",
    "ROM": "romans", "1CO": "1_corinthians", "2CO": "2_corinthians",
    "GAL": "galatians", "EPH": "ephesians", "PHP": "philippians",
    "COL": "colossians", "1TH": "1_thessalonians", "2TH": "2_thessalonians",
    "1TI": "1_timothy", "2TI": "2_timothy", "TIT": "titus", "PHM": "philemon",
    "HEB": "hebrews", "JAS": "james", "1PE": "1_peter", "2PE": "2_peter",
    "1JN": "1_john", "2JN": "2_john", "3JN": "3_john", "JUD": "jude",
    "REV": "revelation",
    # Alternate IDs used by some commentaries (e.g., Tyndale)
    "Ezek": "ezekiel", "Nah": "nahum", "Phil": "philippians", "Phlm": "philemon",
}


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def fetch_with_retry(url: str, max_retries: int = 3) -> dict | None:
    """Fetch JSON with exponential backoff."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"    Retry {attempt + 1}/{max_retries} after {wait}s: {e}")
                time.sleep(wait)
            else:
                print(f"    FAILED after {max_retries} attempts: {url} — {e}")
                return None


def flatten_commentary_content(content) -> str:
    """Recursively extract plain text from HelloAO commentary content structure."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [flatten_commentary_content(item) for item in content]
        return " ".join(p for p in parts if p)
    if isinstance(content, dict):
        text_parts = []
        if "text" in content and isinstance(content["text"], str):
            text_parts.append(content["text"].strip())
        if "content" in content:
            text_parts.append(flatten_commentary_content(content["content"]))
        if "items" in content:
            text_parts.append(flatten_commentary_content(content["items"]))
        return " ".join(p for p in text_parts if p)
    return ""


def process_commentary(commentary_id: str):
    """Fetch all chapters for a commentary, write SQL seed files."""
    # Fetch book list
    books_url = f"https://bible.helloao.org/api/c/{commentary_id}/books.json"
    books_data = fetch_with_retry(books_url)
    if not books_data:
        print(f"  ERROR: Could not fetch book list for {commentary_id}")
        return 0

    books = books_data.get("books", [])
    if not books:
        print(f"  ERROR: No books found for {commentary_id}")
        return 0

    # Write DELETE file first for idempotency (design C3 requirement)
    delete_file = os.path.join(OUTPUT_DIR, f"commentary-{commentary_id}-000-delete.sql")
    with open(delete_file, "w") as f:
        f.write(f"-- Delete existing entries for {commentary_id} before re-seed\n")
        f.write(f"DELETE FROM commentary_entries WHERE commentary = '{commentary_id}';\n")

    total_entries = 0

    for book_info in books:
        book_id = book_info.get("id") or book_info.get("name", "")
        canonical = HELLOAO_BOOK_TO_CANONICAL.get(book_id)
        if not canonical:
            # Try case-insensitive lookup
            for k, v in HELLOAO_BOOK_TO_CANONICAL.items():
                if k.lower() == book_id.lower():
                    canonical = v
                    break
        if not canonical:
            print(f"    WARNING: Unknown book '{book_id}' in {commentary_id}, skipping")
            continue

        # Per-book output file (avoids wrangler d1 execute payload limits)
        book_lines = [f"-- {commentary_id} — {canonical}"]
        book_entries = 0

        num_chapters = book_info.get("numberOfChapters", 0)
        if not num_chapters:
            continue

        for ch_num in range(1, num_chapters + 1):
            url = f"https://bible.helloao.org/api/c/{commentary_id}/{book_id}/{ch_num}.json"
            data = fetch_with_retry(url)
            if not data:
                continue

            # Extract verse-level commentary entries from chapter.content
            chapter_data = data.get("chapter", {})
            content_list = chapter_data.get("content", [])

            if isinstance(content_list, list):
                for item in content_list:
                    if not isinstance(item, dict):
                        continue
                    if item.get("type") != "verse":
                        continue
                    verse_num = item.get("number", 0)
                    if not verse_num:
                        continue
                    verse_content = item.get("content", [])
                    text = flatten_commentary_content(verse_content)
                    if not text:
                        continue
                    escaped = escape_sql(text)
                    book_lines.append(
                        f"INSERT INTO commentary_entries "
                        f"(commentary, book, chapter, verse_start, verse_end, text) "
                        f"VALUES ('{commentary_id}', '{canonical}', {ch_num}, "
                        f"{verse_num}, {verse_num}, '{escaped}');"
                    )
                    book_entries += 1

        # Write per-book file
        if book_entries > 0:
            filename = f"commentary-{commentary_id}-{canonical}.sql"
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "w") as f:
                f.write("\n".join(book_lines) + "\n")

        total_entries += book_entries

        # Rate limit politeness
        time.sleep(0.1)

    return total_entries


def main():
    commentaries = sys.argv[1:] if len(sys.argv) > 1 else COMMENTARIES
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    grand_total = 0
    for cid in commentaries:
        if cid not in COMMENTARIES:
            print(f"WARNING: Unknown commentary '{cid}', skipping")
            continue
        print(f"Processing {cid}...")
        count = process_commentary(cid)
        print(f"  {count} entries written")
        grand_total += count

    print(f"\nTotal: {grand_total} commentary entries")
    print(f"Output: {OUTPUT_DIR}/commentary-*.sql")


if __name__ == "__main__":
    main()
