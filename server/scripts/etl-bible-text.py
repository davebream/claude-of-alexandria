#!/usr/bin/env python3
"""
ETL: Bible text from scrollmapper SQLite databases + HelloAO API → D1 seed SQL files.
Sources:
  - scrollmapper: https://github.com/scrollmapper/bible_databases (KJV, ASV, YLT, DBY)
  - HelloAO: https://bible.helloao.org (BSB, WEB)

Output: server/d1-seed/bible-verses-{translation}-{book}.sql (chunked per book)
"""
import json
import sqlite3
import os
import sys
import time
import urllib.request
import urllib.error

OUTPUT_DIR = "server/d1-seed"

# scrollmapper per-translation .db files → (table_name, our translation ID)
# Each .db file has a table named {TranslationName}_verses with columns:
#   id, book_id, chapter, verse, text
TRANSLATIONS = {
    "KJV.db": ("KJV_verses", "KJV"),
    "ASV.db": ("ASV_verses", "ASV"),
    "YLT.db": ("YLT_verses", "YLT"),
    "Darby.db": ("Darby_verses", "DBY"),
}

# scrollmapper book numbers (1-66) → canonical book names
# Must match server/src/db/books.ts canonical names exactly
BOOK_NUMBER_TO_CANONICAL = {
    1: "genesis", 2: "exodus", 3: "leviticus", 4: "numbers", 5: "deuteronomy",
    6: "joshua", 7: "judges", 8: "ruth", 9: "1_samuel", 10: "2_samuel",
    11: "1_kings", 12: "2_kings", 13: "1_chronicles", 14: "2_chronicles",
    15: "ezra", 16: "nehemiah", 17: "esther", 18: "job", 19: "psalms",
    20: "proverbs", 21: "ecclesiastes", 22: "song_of_songs", 23: "isaiah",
    24: "jeremiah", 25: "lamentations", 26: "ezekiel", 27: "daniel",
    28: "hosea", 29: "joel", 30: "amos", 31: "obadiah", 32: "jonah",
    33: "micah", 34: "nahum", 35: "habakkuk", 36: "zephaniah",
    37: "haggai", 38: "zechariah", 39: "malachi",
    40: "matthew", 41: "mark", 42: "luke", 43: "john", 44: "acts",
    45: "romans", 46: "1_corinthians", 47: "2_corinthians", 48: "galatians",
    49: "ephesians", 50: "philippians", 51: "colossians",
    52: "1_thessalonians", 53: "2_thessalonians", 54: "1_timothy",
    55: "2_timothy", 56: "titus", 57: "philemon", 58: "hebrews",
    59: "james", 60: "1_peter", 61: "2_peter", 62: "1_john",
    63: "2_john", 64: "3_john", 65: "jude", 66: "revelation",
}


HELLOAO_TRANSLATIONS = {
    "BSB": "BSB",
    "ENGWEBP": "WEB",  # HelloAO ID → our ID
}

# HelloAO uses OSIS-style book names
CANONICAL_TO_HELLOAO = {
    "genesis": "GEN", "exodus": "EXO", "leviticus": "LEV", "numbers": "NUM",
    "deuteronomy": "DEU", "joshua": "JOS", "judges": "JDG", "ruth": "RUT",
    "1_samuel": "1SA", "2_samuel": "2SA", "1_kings": "1KI", "2_kings": "2KI",
    "1_chronicles": "1CH", "2_chronicles": "2CH", "ezra": "EZR", "nehemiah": "NEH",
    "esther": "EST", "job": "JOB", "psalms": "PSA", "proverbs": "PRO",
    "ecclesiastes": "ECC", "song_of_songs": "SNG", "isaiah": "ISA", "jeremiah": "JER",
    "lamentations": "LAM", "ezekiel": "EZK", "daniel": "DAN", "hosea": "HOS",
    "joel": "JOL", "amos": "AMO", "obadiah": "OBA", "jonah": "JON",
    "micah": "MIC", "nahum": "NAM", "habakkuk": "HAB", "zephaniah": "ZEP",
    "haggai": "HAG", "zechariah": "ZEC", "malachi": "MAL",
    "matthew": "MAT", "mark": "MRK", "luke": "LUK", "john": "JHN", "acts": "ACT",
    "romans": "ROM", "1_corinthians": "1CO", "2_corinthians": "2CO",
    "galatians": "GAL", "ephesians": "EPH", "philippians": "PHP",
    "colossians": "COL", "1_thessalonians": "1TH", "2_thessalonians": "2TH",
    "1_timothy": "1TI", "2_timothy": "2TI", "titus": "TIT", "philemon": "PHM",
    "hebrews": "HEB", "james": "JAS", "1_peter": "1PE", "2_peter": "2PE",
    "1_john": "1JN", "2_john": "2JN", "3_john": "3JN", "jude": "JUD",
    "revelation": "REV",
}

# Chapter counts per book (for iteration)
CHAPTER_COUNTS = {
    "genesis": 50, "exodus": 40, "leviticus": 27, "numbers": 36, "deuteronomy": 34,
    "joshua": 24, "judges": 21, "ruth": 4, "1_samuel": 31, "2_samuel": 24,
    "1_kings": 22, "2_kings": 25, "1_chronicles": 29, "2_chronicles": 36,
    "ezra": 10, "nehemiah": 13, "esther": 10, "job": 42, "psalms": 150,
    "proverbs": 31, "ecclesiastes": 12, "song_of_songs": 8, "isaiah": 66,
    "jeremiah": 52, "lamentations": 5, "ezekiel": 48, "daniel": 12,
    "hosea": 14, "joel": 3, "amos": 9, "obadiah": 1, "jonah": 4,
    "micah": 7, "nahum": 3, "habakkuk": 3, "zephaniah": 3,
    "haggai": 2, "zechariah": 14, "malachi": 4,
    "matthew": 28, "mark": 16, "luke": 24, "john": 21, "acts": 28,
    "romans": 16, "1_corinthians": 16, "2_corinthians": 13,
    "galatians": 6, "ephesians": 6, "philippians": 4, "colossians": 4,
    "1_thessalonians": 5, "2_thessalonians": 3, "1_timothy": 6,
    "2_timothy": 4, "titus": 3, "philemon": 1, "hebrews": 13,
    "james": 5, "1_peter": 5, "2_peter": 3, "1_john": 5, "2_john": 1,
    "3_john": 1, "jude": 1, "revelation": 22,
}


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def fetch_with_retry(url: str, max_retries: int = 3) -> dict | None:
    """Fetch JSON from URL with exponential backoff."""
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


def flatten_helloao_content(content: list) -> dict[int, str]:
    """Flatten HelloAO content array to {verse_number: plain_text}.

    HelloAO content is nested: arrays of objects with 'type' and 'content' or 'text'.
    We recursively extract all text nodes and group by verse number.
    """
    verses: dict[int, list[str]] = {}
    current_verse = 0

    def walk(node):
        nonlocal current_verse
        if isinstance(node, str):
            text = node.strip()
            if text and current_verse > 0:
                verses.setdefault(current_verse, []).append(text)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            if node.get("type") == "verse" and "number" in node:
                current_verse = int(node["number"])
            if "text" in node and isinstance(node["text"], str):
                text = node["text"].strip()
                if text and current_verse > 0:
                    verses.setdefault(current_verse, []).append(text)
            if "content" in node:
                walk(node["content"])
            if "items" in node:
                walk(node["items"])

    walk(content)
    return {v: " ".join(parts) for v, parts in verses.items()}


def process_helloao_translation(helloao_id: str, our_id: str):
    """Fetch all chapters from HelloAO API, write chunked SQL."""
    total_verses = 0
    books_done = 0

    for canonical, helloao_book in CANONICAL_TO_HELLOAO.items():
        chapters = CHAPTER_COUNTS.get(canonical, 0)
        if chapters == 0:
            continue

        lines = [f"-- {our_id} — {canonical}"]
        book_verses = 0

        for ch in range(1, chapters + 1):
            url = f"https://bible.helloao.org/api/{helloao_id}/{helloao_book}/{ch}.json"
            data = fetch_with_retry(url)
            if not data:
                print(f"    SKIP {canonical} ch {ch} — fetch failed")
                continue

            # Validate expected structure
            content = data.get("chapter", {}).get("content")
            if not content:
                # Fallback: some responses use top-level "content"
                content = data.get("content")
            if not content:
                print(f"    SKIP {canonical} ch {ch} — no content in response")
                continue

            verse_texts = flatten_helloao_content(content)
            for v in sorted(verse_texts.keys()):
                text = escape_sql(verse_texts[v])
                lines.append(
                    f"INSERT OR REPLACE INTO bible_verses "
                    f"(translation, book, chapter, verse, text) "
                    f"VALUES ('{our_id}', '{canonical}', {ch}, {v}, '{text}');"
                )
                book_verses += 1

        if book_verses > 0:
            filename = f"bible-verses-{our_id.lower()}-{canonical}.sql"
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "w") as f:
                f.write("\n".join(lines) + "\n")

        total_verses += book_verses
        books_done += 1
        if books_done % 10 == 0:
            print(f"    {books_done}/66 books done ({total_verses} verses so far)")

    return total_verses


def process_translation(db_path: str, table_name: str, translation_id: str):
    """Extract all verses from a scrollmapper SQLite table, write chunked SQL."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Validate table exists
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,)
    )
    if not cursor.fetchone():
        print(f"  WARNING: Table {table_name} not found in {db_path}, skipping")
        conn.close()
        return 0

    cursor.execute(f"SELECT book_id, chapter, verse, text FROM {table_name} ORDER BY book_id, chapter, verse")
    rows = cursor.fetchall()
    conn.close()

    # Group by book
    books: dict[int, list] = {}
    for b, c, v, t in rows:
        books.setdefault(b, []).append((c, v, t))

    total_verses = 0
    for book_num, verses in books.items():
        canonical = BOOK_NUMBER_TO_CANONICAL.get(book_num)
        if not canonical:
            print(f"  WARNING: Unknown book number {book_num}, skipping")
            continue

        filename = f"bible-verses-{translation_id.lower()}-{canonical}.sql"
        filepath = os.path.join(OUTPUT_DIR, filename)

        lines = [f"-- {translation_id} — {canonical} ({len(verses)} verses)"]
        for c, v, t in verses:
            text = escape_sql(t.strip())
            lines.append(
                f"INSERT OR REPLACE INTO bible_verses "
                f"(translation, book, chapter, verse, text) "
                f"VALUES ('{translation_id}', '{canonical}', {c}, {v}, '{text}');"
            )

        with open(filepath, "w") as f:
            f.write("\n".join(lines) + "\n")

        total_verses += len(verses)

    return total_verses


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 etl-bible-text.py <path-to-scrollmapper-sqlite-dir>")
        print("  Clone from: https://github.com/scrollmapper/bible_databases")
        print("  Directory needed: formats/sqlite/ (contains KJV.db, ASV.db, YLT.db, Darby.db)")
        sys.exit(1)

    db_dir = sys.argv[1]
    if not os.path.isdir(db_dir):
        print(f"ERROR: Directory not found: {db_dir}")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    grand_total = 0
    for db_file, (table_name, translation_id) in TRANSLATIONS.items():
        db_path = os.path.join(db_dir, db_file)
        if not os.path.exists(db_path):
            print(f"  WARNING: {db_file} not found in {db_dir}, skipping {translation_id}")
            continue
        print(f"Processing {translation_id} ({db_file} → {table_name})...")
        count = process_translation(db_path, table_name, translation_id)
        print(f"  {count} verses written")
        grand_total += count

    print(f"\n--- HelloAO translations ---")
    for helloao_id, our_id in HELLOAO_TRANSLATIONS.items():
        print(f"Processing {our_id} (HelloAO: {helloao_id})...")
        count = process_helloao_translation(helloao_id, our_id)
        print(f"  {count} verses written")
        grand_total += count

    all_translations = len(TRANSLATIONS) + len(HELLOAO_TRANSLATIONS)
    print(f"\nTotal: {grand_total} verses across {all_translations} translations")
    print(f"Output: {OUTPUT_DIR}/bible-verses-*.sql")


if __name__ == "__main__":
    main()
