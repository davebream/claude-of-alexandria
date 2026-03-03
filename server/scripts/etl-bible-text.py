#!/usr/bin/env python3
"""
ETL: Bible text from scrollmapper SQLite databases → D1 seed SQL files.
Source: https://github.com/scrollmapper/bible_databases

Translations: KJV, ASV, YLT, DBY
Output: server/d1-seed/bible-verses-{translation}-{book}.sql (chunked per book)
"""
import sqlite3
import os
import sys

OUTPUT_DIR = "server/d1-seed"

# scrollmapper table names → our translation IDs
TRANSLATIONS = {
    "t_kjv": "KJV",
    "t_asv": "ASV",
    "t_ylt": "YLT",
    "t_dby": "DBY",
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


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


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

    cursor.execute(f"SELECT b, c, v, t FROM {table_name} ORDER BY b, c, v")
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
        print("Usage: python3 etl-bible-text.py <path-to-scrollmapper-bible.db>")
        print("  Download from: https://github.com/scrollmapper/bible_databases")
        print("  File needed: bible-sqlite.db (contains t_kjv, t_asv, t_ylt, t_dby tables)")
        sys.exit(1)

    db_path = sys.argv[1]
    if not os.path.exists(db_path):
        print(f"ERROR: Database file not found: {db_path}")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    grand_total = 0
    for table_name, translation_id in TRANSLATIONS.items():
        print(f"Processing {translation_id} ({table_name})...")
        count = process_translation(db_path, table_name, translation_id)
        print(f"  {count} verses written")
        grand_total += count

    print(f"\nTotal: {grand_total} verses across {len(TRANSLATIONS)} translations")
    print(f"Output: {OUTPUT_DIR}/bible-verses-*.sql")


if __name__ == "__main__":
    main()
