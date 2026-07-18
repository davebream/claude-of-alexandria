#!/usr/bin/env python3
"""Tests for emit-lemma-strongs.py (Hebrew lemma_translit backfill, Task 3).

Runs against a small, committed MACULA-shaped fixture under
testdata/emit-lemma-strongs-fixture.tsv — no network, no server/.cache/.

The load-bearing property is byte-identity: the lemma bytes the emit script
writes MUST equal the lemma bytes the extractor stores into morphology.lemma,
because the downstream transliteration join keys on exact lemma bytes. Both the
extractor's row loop and the emit script derive the lemma from the SAME
`extract_macula_hebrew.parse_lemma_field` helper — test_a pins that all three
values (extractor-stored, emit-emitted, helper-returned) are the identical
bytes, so any drift (e.g. someone adds a .strip() to the extractor loop) breaks
the test.

Usage:
    python3 server/scripts/test_emit_lemma_strongs.py
    python3 server/scripts/test_emit_lemma_strongs.py -v
"""

import importlib.util
import io
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
FIXTURE_PATH = SCRIPTS_DIR / "testdata" / "emit-lemma-strongs-fixture.tsv"
EMIT_SCRIPT = SCRIPTS_DIR / "emit-lemma-strongs.py"


def _load_module(name: str, filename: str):
    """Import a hyphenated ETL script as a module — hyphens make
    'extract-macula-hebrew' an invalid Python identifier for a normal import."""
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


macula = _load_module("extract_macula_hebrew", "extract-macula-hebrew.py")
emit = _load_module("emit_lemma_strongs", "emit-lemma-strongs.py")


def _fixture_data_lines() -> list[str]:
    """Return the fixture's data lines (header dropped), newline preserved so
    parse_lemma_field sees exactly what the extractor's loop sees."""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        f.readline()  # header
        return [line for line in f if line.strip("\n")]


def _run_emit() -> tuple[list[tuple[str, str, str]], str]:
    """Run the emit function against the fixture into a scratch file and return
    (parsed rows, captured stderr). Each parsed row is (lemma, strongs, count)."""
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / "out.tsv"
        err = io.StringIO()
        with redirect_stderr(err):
            emit.emit(FIXTURE_PATH, out_path)
        content = out_path.read_text(encoding="utf-8")
    rows = []
    for line in content.splitlines():
        if not line:
            continue
        rows.append(tuple(line.split("\t")))
    return rows, err.getvalue()


class EmitLemmaStrongsTests(unittest.TestCase):

    def test_a_lemma_bytes_identical_to_extractor(self):
        """(a) TRUE byte-identity pin. For a real fixture line, the lemma the
        emit script emits, the lemma the extractor's process_tsv stores, and
        the lemma extract_macula_hebrew.parse_lemma_field returns are the SAME
        bytes. Expected is derived from the extractor's own helper (never a
        re-split in the test) so this is not a tautology; extractor-loop drift
        away from the helper would break it via the process_tsv leg."""
        # Locate the split sub-segment line for רֵאשִׁית in the fixture.
        target_line = next(
            ln for ln in _fixture_data_lines() if ln.split("\t")[17] == "רֵאשִׁית"
        )
        expected = macula.parse_lemma_field(target_line)
        self.assertEqual(expected, "רֵאשִׁית")

        # Leg 1: the extractor's row loop stores this exact value.
        books = macula.process_tsv(FIXTURE_PATH)
        stored = [
            w["lemma"]
            for words in books.values()
            for w in words
            if w["lemma"] == expected
        ]
        self.assertIn(
            expected, stored, "extractor did not store the helper's lemma bytes"
        )

        # Leg 2: the emit script emits this exact value.
        rows, _ = _run_emit()
        emitted_lemmas = [r[0] for r in rows]
        self.assertIn(
            expected, emitted_lemmas, "emit did not emit the helper's lemma bytes"
        )

    def test_b_empty_lemma_row_excluded_and_counted(self):
        """(b) The empty-lemma row is never emitted, and the count of excluded
        empty-lemma rows is reported on stderr."""
        rows, stderr = _run_emit()
        self.assertNotIn(
            "", [r[0] for r in rows], "an empty-lemma row leaked into the output"
        )
        self.assertIn("empty-lemma rows excluded: 1", stderr)

    def test_c_subsegment_full_lemma_is_included(self):
        """(c) FINDING: MACULA split rows carry the full per-morpheme citation
        lemma (a complete dictionary form), NOT a partial fragment — confirmed
        against the real corpus (GEN 1:1!1 → בְּ + רֵאשִׁית, both complete
        lemmas; 0 empty lemmas across all 475,911 rows). Per Task 3's "if full,
        include" branch, sub-segment lemmas MUST be emitted: they are stored
        verbatim in morphology.lemma and need transliterations (רֵאשִׁית is in
        the downstream lemma-translit fixture and only occurs as a sub-segment
        of a split word). This asserts both halves of the split are present."""
        rows, _ = _run_emit()
        emitted = [r[0] for r in rows]
        self.assertIn("רֵאשִׁית", emitted, "sub-segment noun lemma was dropped")
        self.assertIn("בְּ", emitted, "sub-segment prefix lemma was dropped")

    def test_d_dedup_sums_occurrence_counts(self):
        """(d) A lemma+strongs pair occurring on multiple rows is deduped to a
        single output row whose count is the summed occurrences (בָּרָא/H1254
        appears on two fixture rows → count 2)."""
        rows, _ = _run_emit()
        bara = [r for r in rows if r[0] == "בָּרָא"]
        self.assertEqual(len(bara), 1, "בָּרָא was not deduped to one row")
        self.assertEqual(bara[0][1], "H1254")
        self.assertEqual(bara[0][2], "2", "occurrence count was not summed")

    def test_e_output_shape_is_lemma_strongs_count(self):
        """(e) Every output line is exactly `lemma\\tstrongs\\tcount` — three
        fields, an integer count, and the strongs field carries the extractor's
        unpadded H-form."""
        rows, _ = _run_emit()
        self.assertTrue(rows, "no rows emitted")
        for r in rows:
            self.assertEqual(len(r), 3, f"row does not have exactly 3 fields: {r!r}")
            self.assertTrue(r[2].isdigit(), f"count is not an integer: {r!r}")
        # Strongs follows the extractor's `f"H{s}"` unpadded form.
        reeshit = next(r for r in rows if r[0] == "רֵאשִׁית")
        self.assertEqual(reeshit[1], "H7225")

    def test_f_cli_invocation_writes_output(self):
        """The documented CLI contract works end-to-end:
        `emit-lemma-strongs.py <source> <out.tsv>` writes the TSV and reports
        to stderr (not stdout)."""
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "out.tsv"
            proc = subprocess.run(
                [sys.executable, str(EMIT_SCRIPT), str(FIXTURE_PATH), str(out_path)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue(out_path.exists(), "CLI did not write the output file")
            content = out_path.read_text(encoding="utf-8")
            self.assertIn("רֵאשִׁית\tH7225\t", content)
            # The exclusion report goes to stderr, keeping stdout clean.
            self.assertEqual(proc.stdout, "")
            self.assertIn("empty-lemma rows excluded", proc.stderr)


if __name__ == "__main__":
    unittest.main()
