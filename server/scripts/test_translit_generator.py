#!/usr/bin/env python3
"""Tests for the transliteration staging-SQL generator (Task 3 / design C4).

STRUCTURAL suite (default, CI-safe): runs against a small, committed fixture
under testdata/translit-fixture.tsv — no network, no server/.cache/, no
server/d1-seed/. Verifies generator-level SQL safety invariants that need no
real corpus: head-drop-before-create ordering, no DELETE against morphology,
the D1 100,000-byte per-statement ceiling, and OT collision-key exclusion.

CORPUS suite (opt-in, `--corpus`): asserts against the real generated output
under server/d1-seed/ — the counts sidecar and a spot-check anchor row. NOT
run by CI (would require the ~101MB corpus download). Run the two generators
first (`extract-opengnt.py --emit translit-staging` and
`extract-macula-hebrew.py --emit translit-staging`), then this suite with
`--corpus`. Executed by Task 15 (local dry run) and Task 16 (in-runner,
pre-apply) — this phase only proves the assertions exist and the structural
suite passes; it does not run the corpus suite.

Usage:
    python3 server/scripts/test_translit_generator.py            # structural only
    python3 server/scripts/test_translit_generator.py --corpus   # + corpus-scale
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
D1_SEED_DIR = SCRIPTS_DIR.parent / "d1-seed"
FIXTURE_PATH = SCRIPTS_DIR / "testdata" / "translit-fixture.tsv"

# Parsed once at import time so --corpus can be stripped before unittest.main()
# sees argv (unittest.main() does its own arg parsing and chokes on unknown
# flags).
CORPUS_ENABLED = "--corpus" in sys.argv
if CORPUS_ENABLED:
    sys.argv.remove("--corpus")


def _load_module(name: str, filename: str):
    """Import a hyphenated ETL script as a module — hyphens make
    'extract-opengnt' an invalid Python identifier for a normal import."""
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


opengnt = _load_module("extract_opengnt", "extract-opengnt.py")
macula = _load_module("extract_macula_hebrew", "extract-macula-hebrew.py")


def _split_sql_statements(content: str) -> list[str]:
    """Split SQL text into whole top-level statements by tracking paren
    depth — a ';' only ends a statement at depth 0. A naive
    `content.split(";\\n")` fragments a multi-line UPDATE at the ')' that
    closes its EXISTS(...) subquery whenever that close isn't also the
    statement's true end, silently checking sub-fragments instead of whole
    statements (Phase-2 review fix — code-reviewer flagged this as vacuous
    coverage on test_c)."""
    statements = []
    depth = 0
    start = 0
    for i, ch in enumerate(content):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            stmt = content[start:i + 1].strip()
            if stmt:
                statements.append(stmt)
            start = i + 1
    tail = content[start:].strip()
    if tail:
        statements.append(tail)
    return statements


def _load_fixture():
    """Parse testdata/translit-fixture.tsv into NT word dicts and OT book
    dicts, shaped exactly like the real parsers' output (the generator's
    real input contract) — a simplified test-only schema, not either
    upstream corpus's raw column layout, since the generator functions
    under test operate on already-parsed rows, not raw TSV columns."""
    nt_words: list[dict] = []
    ot_books: dict[str, list[dict]] = {}

    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            fields = dict(zip(header, line.split("\t")))
            transliteration = fields["transliteration"] or None
            if fields["testament"] == "nt":
                nt_words.append({
                    "book_code": 40,
                    "book": fields["book"],
                    "chapter": int(fields["chapter"]),
                    "verse": int(fields["verse"]),
                    "word_position": int(fields["word_position"]),
                    "text": fields["text"],
                    "lemma": fields["lemma"],
                    "transliteration": transliteration,
                })
            else:
                ot_books.setdefault(fields["book"], []).append({
                    "chapter": int(fields["chapter"]),
                    "verse": int(fields["verse"]),
                    "word_position": int(fields["word_position"]),
                    "text": fields["text"],
                    "lemma": fields["lemma"],
                    "transliteration": transliteration,
                })

    return nt_words, ot_books


class StructuralGeneratorTests(unittest.TestCase):
    """Fixture-driven properties that need no corpus (Task 4 Step 1)."""

    @classmethod
    def setUpClass(cls):
        cls.nt_words, cls.ot_books = _load_fixture()

    def _generate(self):
        """Run both real generator functions against the fixture into a
        scratch directory and return {filename: content} plus the counts
        sidecar."""
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            opengnt.write_translit_staging_sql(self.nt_words, output_dir)
            macula.write_translit_staging_sql(self.ot_books, output_dir)
            files = {
                p.name: p.read_text(encoding="utf-8")
                for p in output_dir.glob("morphology-translit-*.sql")
            }
            counts = json.loads(
                (output_dir / "morphology-translit-counts.json").read_text(encoding="utf-8")
            )
        return files, counts

    def test_a_drop_before_create_in_every_file(self):
        """(a) DROP TABLE IF EXISTS translit_staging appears before CREATE
        TABLE translit_staging in every emitted file — load-bearing: an
        interrupted d1 import must never leave a tail-only drop unreached."""
        files, _ = self._generate()
        self.assertTrue(files, "no staging SQL files were generated")
        for name, content in files.items():
            drop_idx = content.find("DROP TABLE IF EXISTS translit_staging")
            create_idx = content.find("CREATE TABLE translit_staging")
            self.assertNotEqual(drop_idx, -1, f"{name}: missing head DROP TABLE IF EXISTS")
            self.assertNotEqual(create_idx, -1, f"{name}: missing CREATE TABLE")
            self.assertLess(drop_idx, create_idx, f"{name}: DROP does not precede CREATE")

    def test_b_no_delete_against_morphology(self):
        """(b) no emitted file contains a DELETE statement — the backfill is
        UPDATE-only by construction (AC-4 holds by construction)."""
        files, _ = self._generate()
        self.assertTrue(files, "no staging SQL files were generated")
        for name, content in files.items():
            self.assertNotIn("DELETE", content.upper(), f"{name}: contains a DELETE statement")

    def test_c_every_statement_under_byte_ceiling(self):
        """(c) every emitted statement is < 100,000 bytes, and the fixture's
        two oversized padded rows force >= 2 INSERT chunks so this assertion
        actually exercises the boundary it exists for.

        Splits on real statement boundaries (paren-depth-tracked, only a
        top-level ';' ends a statement) rather than a naive content.split(";\\n")
        — the naive split fragments each multi-line UPDATE at the ');' that
        closes its EXISTS(...) subquery whenever that isn't also the true
        end of the statement, which silently checked sub-fragments instead
        of whole UPDATE statements (Phase-2 review fix — code-reviewer)."""
        files, _ = self._generate()
        for name, content in files.items():
            for stmt in _split_sql_statements(content):
                size = len(stmt.encode("utf-8"))
                self.assertLess(
                    size, 100_000, f"{name}: statement is {size} bytes, >= the D1 ceiling"
                )
                # Every UPDATE statement must be checked as a WHOLE unit —
                # confirm depth-tracked splitting never hands us a bare
                # fragment that stops mid-statement at the EXISTS(...) close.
                if stmt.strip().startswith("UPDATE"):
                    self.assertIn(
                        "EXISTS", stmt, f"{name}: UPDATE fragment missing EXISTS guard"
                    )
                    self.assertTrue(
                        stmt.rstrip().endswith(";"),
                        f"{name}: UPDATE fragment does not end at a real statement boundary",
                    )
        nt_file = files.get("morphology-translit-nt-matthew.sql", "")
        insert_count = nt_file.count("INSERT INTO translit_staging")
        self.assertGreaterEqual(
            insert_count, 2, "fixture does not force >= 2 INSERT chunks in the NT matthew file"
        )

    def test_d_collision_keys_excluded(self):
        """(d) the fabricated OT collision key pair (test_collision_book
        9:9:9 'פ') is excluded from the OT staging INSERTs entirely — and,
        since every one of its rows collides, no per-book file is emitted
        for it at all."""
        files, _ = self._generate()
        self.assertNotIn(
            "morphology-translit-ot-test_collision_book.sql",
            files,
            "a per-book file was emitted for a book with zero non-colliding rows",
        )
        for name, content in files.items():
            self.assertNotIn(
                "test_collision_book",
                content,
                f"{name}: fabricated collision key was not excluded from the OT staging INSERTs",
            )

    def test_blank_transliteration_row_is_skipped_not_inserted(self):
        """Sanity check on the fixture's blank-transliteration OT row
        (genesis 1:1:2) — it must never appear as a staged INSERT row,
        distinct from being NULL in morphology (that's the designed OT gap)."""
        files, _ = self._generate()
        ot_file = files.get("morphology-translit-ot-genesis.sql", "")
        self.assertTrue(ot_file, "OT genesis staging file was not generated")
        self.assertNotIn("1, 1, 2, 'בָּרָא'", ot_file)


class CorpusScaleTests(unittest.TestCase):
    """(e)/(f) — real ~101MB corpus, real generated output (Task 4 Step 5a).
    Opt-in only (`--corpus`) so the CI structural job never touches the
    network or server/.cache/. Run the generators first:
        cd server && python3 scripts/extract-opengnt.py --emit translit-staging
        cd server && python3 scripts/extract-macula-hebrew.py --emit translit-staging
    """

    def test_e_counts_sidecar_matches_expected(self):
        counts_path = D1_SEED_DIR / "morphology-translit-counts.json"
        self.assertTrue(
            counts_path.exists(),
            f"{counts_path} not found — run both --emit translit-staging generators first",
        )
        counts = json.loads(counts_path.read_text(encoding="utf-8"))
        self.assertEqual(counts, {"nt": 138013, "ot": 378952})

    def test_f_eph_6_23_anchor_present_in_staging(self):
        """Eph 6:23 pos 5 (ἀγάπη, text === lemma) is the conformance anchor
        (verified present at morphology-nt-022.sql:1293, spot-checked 8/8
        during understand). The load-bearing check confirms the anchor row
        is present in the freshly generated staging output — the SQL the
        backfill actually applies. (lemma_translit is derived downstream via
        a lexicon_lsj join (C7) that this generator-only test cannot see.)

        The primary NT seed chunk (`morphology-nt-022.sql`) is gitignored under
        Option B / decision 0005 and is NOT generated by `--emit translit-staging`
        (the backfill runner's only mode), so it is absent in a clean CI checkout.
        The optional cross-check below therefore runs only when a prior full ETL
        left the seed on disk locally; it is skipped, not failed, in the runner —
        the staging assertion is the one that gates the backfill."""
        staging_path = D1_SEED_DIR / "morphology-translit-nt-ephesians.sql"
        self.assertTrue(
            staging_path.exists(),
            f"{staging_path} not found — run extract-opengnt.py --emit translit-staging first",
        )
        staging_sql = staging_path.read_text(encoding="utf-8")
        self.assertIn(
            "'ephesians', 6, 23, 5,",
            staging_sql,
            "Eph 6:23 pos 5 missing from the generated staging INSERTs",
        )

        # Optional cross-check: when a prior full ETL left the primary seed on
        # disk locally (it is gitignored and absent in the `--emit
        # translit-staging`-only backfill runner), confirm the anchor is present
        # there too. Skipped, never failed, when the seed is absent.
        seed_path = D1_SEED_DIR / "morphology-nt-022.sql"
        if seed_path.exists():
            seed_sql = seed_path.read_text(encoding="utf-8")
            self.assertIn(
                "'ephesians', 'nt', 6, 23, 5,",
                seed_sql,
                "Eph 6:23 pos 5 not found in the local primary NT seed chunk",
            )


if not CORPUS_ENABLED:
    CorpusScaleTests = unittest.skip(  # type: ignore[misc,assignment]
        "opt-in only — pass --corpus to enable"
    )(CorpusScaleTests)


if __name__ == "__main__":
    unittest.main()
