#!/usr/bin/env python3
"""Tests for the paragraph-markers SQL generator (Plan #119, Task 1 / design C3).

Runs against the real corrected corpus committed at
plugins/claude-of-alexandria/skills/biblical-segmentation/reference/masoretic/*.json
(39 files) — no fixture, since the corpus itself is small (~220KB of source
JSON) and is the artifact this generator must faithfully convert. Verifies:

  (a) filename stem -> DB canonical book keying via an explicit dict, sourced
      from server/src/db/books.ts's masoreticsFile<->canonical pairs
  (b) the generator NEVER emits a record's internal `.book` (OSIS, e.g. 'Gen')
      or the top-level `.book` (display, e.g. 'Genesis') — every emitted book
      value is a member of the canonical OT-name set
  (c) DELETE FROM paragraph_markers; / DELETE FROM graphic_signs; each precede
      their respective INSERTs
  (d) per-book and corpus-wide counts match the corrected corpus exactly
      (Genesis=92, Ruth=1, corpus markers=3162, graphic_signs=20)
  (e) graphic_signs.book is derived from the filename (source objects carry no
      `book` field of their own)
  (f) single-quote escaping and NULL emission for absent
      following_word_id/preceding_word_id
  (g) stable sort by (book, chapter, verse, ordinal_in_verse)

Usage:
    python3 server/scripts/test_generate_paragraph_markers_sql.py
    python3 -m pytest server/scripts/test_generate_paragraph_markers_sql.py -v
"""

import importlib.util
import re
import sys
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
REPO_ROOT = SCRIPTS_DIR.parent.parent
MASORETIC_DIR = (
    REPO_ROOT
    / "plugins"
    / "claude-of-alexandria"
    / "skills"
    / "biblical-segmentation"
    / "reference"
    / "masoretic"
)
BOOKS_TS = REPO_ROOT / "server" / "src" / "db" / "books.ts"


def _load_module(name: str, filename: str):
    """Import the hyphenated generator script as a module."""
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


gen = _load_module("generate_paragraph_markers_sql", "generate-paragraph-markers-sql.py")


def _canonical_ot_names_from_books_ts() -> set[str]:
    """Independently derive the canonical OT-name set from books.ts, rather
    than trusting the generator's own copy — this is what makes assertion
    (b) a real cross-check instead of the module checking itself."""
    text = BOOKS_TS.read_text(encoding="utf-8")
    return {
        m.group(1)
        for m in re.finditer(r"canonical: '([^']+)'.*?testament: 'ot'", text)
    }


CANONICAL_OT_NAMES = _canonical_ot_names_from_books_ts()


class GeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = gen.generate_sql(MASORETIC_DIR)

    # (a) filename stem -> canonical dict is explicit and complete
    def test_a_filename_to_canonical_dict_covers_every_source_file(self):
        stems = {p.stem for p in MASORETIC_DIR.glob("*.json")}
        self.assertEqual(stems, set(gen.FILENAME_TO_CANONICAL_BOOK.keys()))
        # every mapped value is itself a canonical OT name
        for canonical in gen.FILENAME_TO_CANONICAL_BOOK.values():
            self.assertIn(canonical, CANONICAL_OT_NAMES)

    # (b) never emit internal .book (OSIS) or top-level .book (display) —
    # only canonical-set values appear as the `book` column value.
    def test_b_every_emitted_book_is_in_canonical_ot_name_set(self):
        # Case-insensitive token class so a capitalized OSIS/display leak
        # ('Gen', 'Song', '1Chr') is MATCHED and then caught by the canonical
        # membership assertion — not silently skipped. Canonical names are
        # lowercase, so any capitalized match fails assertIn.
        match_count = 0
        for match in re.finditer(r"'([A-Za-z0-9_]+)',\s*\d+,\s*\d+,\s*'", self.sql):
            match_count += 1
            self.assertIn(
                match.group(1),
                CANONICAL_OT_NAMES,
                f"emitted book '{match.group(1)}' is not a canonical OT name "
                "(likely an internal OSIS or display-name leak)",
            )
        # Guard against a vacuous pass: the corpus must yield book tokens.
        self.assertGreater(match_count, 0, "no book tokens matched — regex or SQL shape changed")
        # explicit negative check for known internal/display leaks
        self.assertNotIn("'Gen',", self.sql, "leaked internal OSIS book code 'Gen'")
        self.assertNotIn("'Genesis',", self.sql, "leaked display book name 'Genesis'")
        self.assertNotIn("'Ruth',", self.sql, "leaked internal/display book name 'Ruth'")
        self.assertNotIn("'2Sam',", self.sql, "leaked internal OSIS book code '2Sam'")

    # (c) DELETE precedes INSERT for each table
    def test_c_delete_precedes_insert_for_each_table(self):
        markers_delete = self.sql.find("DELETE FROM paragraph_markers;")
        markers_insert = self.sql.find("INSERT INTO paragraph_markers")
        signs_delete = self.sql.find("DELETE FROM graphic_signs;")
        signs_insert = self.sql.find("INSERT INTO graphic_signs")
        self.assertNotEqual(markers_delete, -1)
        self.assertNotEqual(markers_insert, -1)
        self.assertNotEqual(signs_delete, -1)
        self.assertNotEqual(signs_insert, -1)
        self.assertLess(markers_delete, markers_insert)
        self.assertLess(signs_delete, signs_insert)

    # (d) per-book and corpus-wide counts
    def test_d_genesis_marker_count_is_92(self):
        self.assertEqual(self.sql.count("'genesis', 1, 5, "), 1)
        genesis_rows = re.findall(r"\('genesis', \d+, \d+, '", self.sql)
        self.assertEqual(len(genesis_rows), 92)

    def test_d_ruth_marker_count_is_1(self):
        ruth_rows = re.findall(r"\('ruth', \d+, \d+, '", self.sql)
        self.assertEqual(len(ruth_rows), 1)

    def test_d_corpus_marker_count_is_3162(self):
        # Every marker row is a 9-tuple opening with the book column; count
        # rows across the whole paragraph_markers section specifically.
        markers_section_start = self.sql.find("DELETE FROM paragraph_markers;")
        markers_section_end = self.sql.find("DELETE FROM graphic_signs;")
        self.assertNotEqual(markers_section_end, -1)
        section = self.sql[markers_section_start:markers_section_end]
        rows = re.findall(r"\('[a-z0-9_]+', \d+, \d+, '", section)
        self.assertEqual(len(rows), 3162)

    def test_d_corpus_graphic_signs_count_is_20(self):
        signs_section_start = self.sql.find("DELETE FROM graphic_signs;")
        section = self.sql[signs_section_start:]
        rows = re.findall(r"INSERT INTO graphic_signs", section)
        self.assertGreaterEqual(len(rows), 1)
        id_rows = re.findall(r"\('WLC@", section)
        self.assertEqual(len(id_rows), 20)

    # (e) graphic_signs.book is derived from filename, not present in source
    def test_e_graphic_signs_book_derived_from_filename(self):
        psalms_data = gen.load_book(MASORETIC_DIR / "psalms.json")
        for sign in psalms_data["graphic_signs"]:
            self.assertNotIn("book", sign, "fixture assumption violated: source now has 'book'")
        rows = gen.graphic_sign_rows("psalms", psalms_data)
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(row[1], "psalms")

    # (f) escaping + NULL emission
    def test_f_null_emitted_for_absent_word_ids(self):
        genesis_data = gen.load_book(MASORETIC_DIR / "genesis.json")
        rows = gen.marker_rows("genesis", genesis_data)
        # Gen 1:5 marker has following_word_id: null in source
        row = next(r for r in rows if r[1] == 1 and r[2] == 5)
        following_word_id = row[8]
        self.assertIsNone(following_word_id)
        rendered = gen.render_marker_insert_batch([row])
        self.assertIn("NULL", rendered)

    def test_f_single_quotes_are_escaped(self):
        escaped = gen._sql_str("d'Israel")
        self.assertEqual(escaped, "'d''Israel'")

    # (g) stable sort order
    def test_g_stable_sort_by_book_chapter_verse_ordinal(self):
        markers_section_start = self.sql.find("DELETE FROM paragraph_markers;")
        markers_section_end = self.sql.find("DELETE FROM graphic_signs;")
        section = self.sql[markers_section_start:markers_section_end]
        rows = re.findall(r"\('([a-z0-9_]+)', (\d+), (\d+), '[^']+', (\d+),", section)
        parsed = [(b, int(c), int(v), int(o)) for (b, c, v, o) in rows]
        self.assertEqual(parsed, sorted(parsed))

    # Determinism: running the generator twice yields byte-identical output
    def test_deterministic_output(self):
        sql_again = gen.generate_sql(MASORETIC_DIR)
        self.assertEqual(self.sql, sql_again)

    # Column-name mapping: source `type` field renders under `marker_type`
    def test_marker_type_column_used_not_json_type_key(self):
        self.assertIn("INSERT INTO paragraph_markers", self.sql)
        # Column list should use marker_type, never a bare `type` column.
        header_match = re.search(r"INSERT INTO paragraph_markers \(([^)]+)\)", self.sql)
        self.assertIsNotNone(header_match)
        columns = header_match.group(1)
        self.assertIn("marker_type", columns)


if __name__ == "__main__":
    unittest.main()
