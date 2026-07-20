#!/usr/bin/env python3
"""
Generate idempotent `paragraph_markers` + `graphic_signs` table SQL from the
corrected Masoretic reference JSONs (#118, merged as 769737a).

This is the sole writer of migration 0023 — 0023 is produced by running this
script with --out and committed verbatim, never hand-edited (plan #119,
Task 1/3). Model: server/scripts/generate-vocabulary-sql.py.

Book keying is the load-bearing correctness point: each source JSON's
filename stem (e.g. "song-of-songs") maps to the DB canonical book name
(e.g. "song_of_songs") through an EXPLICIT dict below, sourced from
server/src/db/books.ts's masoreticsFile<->canonical pairs. The generator
NEVER emits a marker record's internal `.book` (OSIS, e.g. "Gen") or the
top-level `.book` (display name, e.g. "Genesis") as the `book` column value
— both are corruption vectors the corrected corpus's own JSON still carries
for provenance, not for storage.

Column-name mapping: the source JSON marker field is `type`; the SQL column
is `marker_type` (`type` is a SQL/D1-adjacent reserved-ish word best avoided,
and the schema in 0001 already spells it `marker_type`).

`graphic_signs` source objects carry no `book` field of their own — it is
injected here from the filename, exactly like every other emitted column.

Usage:
    python3 server/scripts/generate-paragraph-markers-sql.py
    python3 server/scripts/generate-paragraph-markers-sql.py --out server/migrations/0023_repair_paragraph_markers_data.sql
    python3 server/scripts/generate-paragraph-markers-sql.py --masoretic-dir <dir> --out <path>
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Rows per multi-row INSERT — mirrors generate-vocabulary-sql.py's rationale:
# a few hundred rows per statement stays well within D1's statement/size
# limits while keeping the file compact.
ROWS_PER_INSERT = 400

# Filename stem (server/.../reference/masoretic/<stem>.json) -> DB canonical
# book name. Values are exactly the `canonical` field of every OT entry in
# server/src/db/books.ts; keys are exactly the `masoreticsFile` field of
# every OT entry there. Kept as an explicit, exhaustive literal (not derived
# from books.ts at generation time) so the generator has no runtime
# dependency on the TypeScript source and a change to books.ts can't
# silently alter already-committed SQL — the test suite cross-checks this
# dict against books.ts instead.
FILENAME_TO_CANONICAL_BOOK: Dict[str, str] = {
    '1-chronicles': '1_chronicles',
    '1-kings': '1_kings',
    '1-samuel': '1_samuel',
    '2-chronicles': '2_chronicles',
    '2-kings': '2_kings',
    '2-samuel': '2_samuel',
    'amos': 'amos',
    'daniel': 'daniel',
    'deuteronomy': 'deuteronomy',
    'ecclesiastes': 'ecclesiastes',
    'esther': 'esther',
    'exodus': 'exodus',
    'ezekiel': 'ezekiel',
    'ezra': 'ezra',
    'genesis': 'genesis',
    'habakkuk': 'habakkuk',
    'haggai': 'haggai',
    'hosea': 'hosea',
    'isaiah': 'isaiah',
    'jeremiah': 'jeremiah',
    'job': 'job',
    'joel': 'joel',
    'jonah': 'jonah',
    'joshua': 'joshua',
    'judges': 'judges',
    'lamentations': 'lamentations',
    'leviticus': 'leviticus',
    'malachi': 'malachi',
    'micah': 'micah',
    'nahum': 'nahum',
    'nehemiah': 'nehemiah',
    'numbers': 'numbers',
    'obadiah': 'obadiah',
    'proverbs': 'proverbs',
    'psalms': 'psalms',
    'ruth': 'ruth',
    'song-of-songs': 'song_of_songs',
    'zechariah': 'zechariah',
    'zephaniah': 'zephaniah',
}

# (book, chapter, verse, marker_type, ordinal_in_verse, position,
#  lexical_position, preceding_word_id, following_word_id)
MarkerRow = Tuple[str, int, int, str, int, str, str, Optional[str], Optional[str]]

# (id, book, chapter, verse, kind, subtype, interpretive_status, is_paragraph_separation)
GraphicSignRow = Tuple[str, str, int, int, str, str, str, bool]


# ─── Functional core (pure: input in, value out — no I/O) ─────────────────────

def _sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _sql_opt_str(value: Optional[str]) -> str:
    return "NULL" if value is None else _sql_str(value)


def marker_rows(canonical_book: str, book_data: Dict) -> List[MarkerRow]:
    """Convert one book's `markers` array into MarkerRow tuples, keyed by the
    filename-derived canonical book name — never the record's internal
    `.book` (OSIS, e.g. 'Gen') or the top-level `.book` (display, e.g.
    'Genesis')."""
    rows: List[MarkerRow] = []
    for marker in book_data.get('markers', []):
        rows.append((
            canonical_book,
            marker['chapter'],
            marker['verse'],
            marker['type'],
            marker['ordinal_in_verse'],
            marker['position'],
            marker['lexical_position'],
            marker.get('preceding_word_id'),
            marker.get('following_word_id'),
        ))
    rows.sort(key=lambda r: (r[0], r[1], r[2], r[4]))
    return rows


def graphic_sign_rows(canonical_book: str, book_data: Dict) -> List[GraphicSignRow]:
    """Convert one book's `graphic_signs` array into GraphicSignRow tuples.
    Source objects carry no `book` field — it is injected here from the
    filename-derived canonical book name."""
    rows: List[GraphicSignRow] = []
    for sign in book_data.get('graphic_signs', []):
        rows.append((
            sign['id'],
            canonical_book,
            sign['chapter'],
            sign['verse'],
            sign['kind'],
            sign['subtype'],
            sign['interpretive_status'],
            bool(sign['is_paragraph_separation']),
        ))
    rows.sort(key=lambda r: (r[1], r[2], r[3], r[0]))
    return rows


def render_marker_insert_batch(rows: List[MarkerRow]) -> str:
    """Render a single batch of marker rows as one multi-row INSERT."""
    cols = (
        '(book, chapter, verse, marker_type, ordinal_in_verse, position, '
        'lexical_position, preceding_word_id, following_word_id)'
    )
    values = ',\n'.join(
        f"  ({_sql_str(book)}, {chapter}, {verse}, {_sql_str(marker_type)}, "
        f"{ordinal}, {_sql_str(position)}, {_sql_str(lexical_position)}, "
        f"{_sql_opt_str(preceding_word_id)}, {_sql_opt_str(following_word_id)})"
        for (book, chapter, verse, marker_type, ordinal, position,
             lexical_position, preceding_word_id, following_word_id) in rows
    )
    return f"INSERT INTO paragraph_markers {cols} VALUES\n{values};"


def render_marker_inserts(rows: List[MarkerRow]) -> str:
    if not rows:
        return ''
    batches = [
        render_marker_insert_batch(rows[start:start + ROWS_PER_INSERT])
        for start in range(0, len(rows), ROWS_PER_INSERT)
    ]
    return '\n'.join(batches) + '\n'


def render_graphic_sign_insert_batch(rows: List[GraphicSignRow]) -> str:
    cols = '(id, book, chapter, verse, kind, subtype, interpretive_status, is_paragraph_separation)'
    values = ',\n'.join(
        f"  ({_sql_str(id_)}, {_sql_str(book)}, {chapter}, {verse}, {_sql_str(kind)}, "
        f"{_sql_str(subtype)}, {_sql_str(interpretive_status)}, {1 if is_sep else 0})"
        for (id_, book, chapter, verse, kind, subtype, interpretive_status, is_sep) in rows
    )
    return f"INSERT INTO graphic_signs {cols} VALUES\n{values};"


def render_graphic_sign_inserts(rows: List[GraphicSignRow]) -> str:
    if not rows:
        return ''
    batches = [
        render_graphic_sign_insert_batch(rows[start:start + ROWS_PER_INSERT])
        for start in range(0, len(rows), ROWS_PER_INSERT)
    ]
    return '\n'.join(batches) + '\n'


# ─── Imperative shell (reads the world) ────────────────────────────────────────

def load_book(json_path: Path) -> Dict:
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def iter_books(masoretic_dir: Path):
    """Yield (canonical_book, book_data) for every *.json in masoretic_dir,
    sorted by filename stem for deterministic output. Raises KeyError (via
    FILENAME_TO_CANONICAL_BOOK) if a file's stem is not in the explicit
    mapping — a fail-loud guard against silently dropping or misfiling a
    book."""
    for json_path in sorted(masoretic_dir.glob('*.json')):
        stem = json_path.stem
        canonical = FILENAME_TO_CANONICAL_BOOK[stem]
        yield canonical, load_book(json_path)


def generate_sql(masoretic_dir: Path) -> str:
    """Build the full DELETE-then-INSERT SQL for both tables. Deterministic:
    two calls with the same input directory produce byte-identical output."""
    all_marker_rows: List[MarkerRow] = []
    all_sign_rows: List[GraphicSignRow] = []
    for canonical, book_data in iter_books(masoretic_dir):
        all_marker_rows.extend(marker_rows(canonical, book_data))
        all_sign_rows.extend(graphic_sign_rows(canonical, book_data))

    all_marker_rows.sort(key=lambda r: (r[0], r[1], r[2], r[4]))
    all_sign_rows.sort(key=lambda r: (r[1], r[2], r[3], r[0]))

    parts = [
        "-- Generated by server/scripts/generate-paragraph-markers-sql.py",
        "-- from plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/*.json",
        "-- DO NOT HAND-EDIT — regenerate via the script (plan #119, decisions/0005).",
        "",
        "DELETE FROM paragraph_markers;",
        render_marker_inserts(all_marker_rows).rstrip('\n'),
        "",
        "DELETE FROM graphic_signs;",
        render_graphic_sign_inserts(all_sign_rows).rstrip('\n'),
        "",
    ]
    return '\n'.join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Generate paragraph_markers + graphic_signs table SQL from the corrected Masoretic JSONs'
    )
    default_masoretic_dir = (
        Path(__file__).parent.parent.parent
        / 'plugins' / 'claude-of-alexandria' / 'skills' / 'biblical-segmentation'
        / 'reference' / 'masoretic'
    )
    parser.add_argument(
        '--masoretic-dir', default=str(default_masoretic_dir),
        help='Directory of corrected per-book Masoretic JSON files',
    )
    parser.add_argument('--out', help='Write SQL to this file instead of stdout')
    args = parser.parse_args()

    masoretic_dir = Path(args.masoretic_dir)
    sql = generate_sql(masoretic_dir)

    if args.out:
        Path(args.out).write_text(sql, encoding='utf-8')
        marker_count = sql.count("INSERT INTO paragraph_markers")
        print(f"Wrote SQL to {args.out}", file=sys.stderr)
    else:
        print(sql)


if __name__ == '__main__':
    main()
