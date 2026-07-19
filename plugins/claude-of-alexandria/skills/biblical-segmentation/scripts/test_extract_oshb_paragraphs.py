#!/usr/bin/env python3
"""Tests for the OSHB Masoretic paragraph marker extractor (issue #118).

This suite also owns `sefaria_paragraphs.py` loader tests (added in Task 11) —
do not "clean up" by deleting them as misplaced.

STRUCTURAL suite (default, CI-safe): network-free, runs against small inline
OSHB-shaped fixtures. Verifies repo-root resolution, URL construction, marker
extraction, validation, and emission — no network, no server/.cache/ writes
beyond the repo-relative `.cache/oshb/` directory this script itself manages.

CORPUS suite (opt-in, `--corpus`): asserts against the real pinned OSHB
corpus and the committed `reference/masoretic/*.json` files. NOT run by
default; requires network access to fetch the corpus once.

Usage:
    python3 plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/test_extract_oshb_paragraphs.py
    python3 plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/test_extract_oshb_paragraphs.py --corpus
"""

import contextlib
import hashlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

# Parsed once at import time so --corpus can be stripped before unittest.main()
# sees argv (unittest.main() does its own arg parsing and chokes on unknown
# flags).
CORPUS_ENABLED = "--corpus" in sys.argv
if CORPUS_ENABLED:
    sys.argv.remove("--corpus")


def _load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


oshb = _load_module("extract_oshb_paragraphs", "extract_oshb_paragraphs.py")


class TestRepoRoot(unittest.TestCase):
    def test_repo_root_walks_up_to_dot_git(self):
        root = oshb.repo_root()
        self.assertTrue((root / ".git").exists())

    def test_repo_root_is_not_cwd_dependent(self):
        # repo_root() must not derive from os.getcwd(); it is defined by the
        # script's own location, so it should equal a fixed ancestor of this
        # test file's directory regardless of invocation directory.
        root = oshb.repo_root()
        self.assertTrue(str(SCRIPTS_DIR).startswith(str(root)))


class TestBookUrl(unittest.TestCase):
    def test_book_url_contains_pinned_commit_sha(self):
        url = oshb.book_url(oshb.OT_BOOKS["Ruth"])
        self.assertIn(oshb.COMMIT_SHA, url)

    def test_book_url_contains_osis_code_and_raw_host(self):
        url = oshb.book_url(oshb.OT_BOOKS["Ruth"])
        self.assertIn("raw.githubusercontent.com", url)
        self.assertIn("openscriptures/morphhb", url)
        self.assertIn("wlc/Ruth.xml", url)

    def test_book_url_uses_osis_code_directly(self):
        # book_url takes an OSIS code (e.g. OT_BOOKS["Genesis"] == "Gen"), not
        # the English book name.
        url = oshb.book_url(oshb.OT_BOOKS["Genesis"])
        self.assertIn("wlc/Gen.xml", url)


class TestOTBooksMap(unittest.TestCase):
    def test_ot_books_has_39_entries(self):
        self.assertEqual(len(oshb.OT_BOOKS), 39)

    def test_ot_books_includes_song_of_songs(self):
        self.assertEqual(oshb.OT_BOOKS["Song of Songs"], "Song")


class TestVerifyChecksum(unittest.TestCase):
    def test_verify_checksum_passes_on_matching_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.xml"
            path.write_bytes(b"hello world")
            expected = hashlib.sha256(b"hello world").hexdigest()
            # Should not raise.
            oshb.verify_checksum(path, expected)

    def test_verify_checksum_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "book.xml"
            path.write_bytes(b"hello world")
            wrong = hashlib.sha256(b"goodbye world").hexdigest()
            with self.assertRaises(Exception):
                oshb.verify_checksum(path, wrong)


class TestMissingLockfile(unittest.TestCase):
    def test_missing_lockfile_names_write_checksums_flag(self):
        # load_checksums() on a nonexistent lockfile path must raise an error
        # that names --write-checksums rather than silently bootstrapping one.
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist.json"
            with self.assertRaises(Exception) as ctx:
                oshb.load_checksums(missing)
            self.assertIn("--write-checksums", str(ctx.exception))


# ─── Extraction fixtures (Task 4 / Task 5) ───────────────────────────────────
#
# Every fixture MUST carry the OSIS namespace declaration on its root element.
# A fixture without it would pass against a parser that is broken on the real
# corpus (unqualified `elem.tag == 'seg'` matches 0 elements on real OSHB XML;
# the namespace-qualified form matches 269 in Ruth alone).

OSIS_XMLNS = "http://www.bibletechnologies.net/2003/OSIS/namespace"


def _write_fixture(tmp_dir: str, xml_body: str, filename: str = "Fixture.xml") -> Path:
    path = Path(tmp_dir) / filename
    path.write_text(
        f'<?xml version="1.0" encoding="utf-8"?>\n'
        f'<osis xmlns="{OSIS_XMLNS}">\n'
        f"<osisText>\n"
        f'<div type="book" osisID="Fixture">\n'
        f"{xml_body}\n"
        f"</div>\n"
        f"</osisText>\n"
        f"</osis>\n",
        encoding="utf-8",
    )
    return path


class TestExtractMarkersNamespaceFence(unittest.TestCase):
    """The F-2 regression fence: a naive unqualified `elem.tag == 'seg'` match
    yields 0 markers on real (namespaced) OSHB XML — see Task 4 Step 3 for the
    RED demonstration against a throwaway naive implementation."""

    def test_namespaced_fixture_yields_nonzero_markers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17">'
                '<w lemma="1">דָבָר</w><seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-pe">פ</seg>'
                "</verse>",
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, ["4:17"])
            self.assertEqual(setumot, [])


class TestExtractMarkersLettersInWords(unittest.TestCase):
    def test_ordinary_letters_pe_samekh_in_words_produce_no_marker(self):
        # פרי (fruit), נפש (soul), פרו (be fruitful) each contain פ or ס as an
        # ordinary Hebrew letter inside a word, not a marker element. This is
        # the diagnosed original bug: letter-matching instead of marker-matching.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.1">'
                '<w lemma="1">פְּרִי</w>'
                '<w lemma="2">נֶפֶשׁ</w>'
                '<w lemma="3">פְּרוּ</w>'
                "</verse>",
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, [])
            self.assertEqual(setumot, [])


class TestExtractMarkersFinalForms(unittest.TestCase):
    def test_final_forms_pe_tsade_never_affect_parsing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.1">'
                '<w lemma="1">כָּתַף</w>'
                '<w lemma="2">אֶרֶץ</w>'
                "</verse>",
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, [])
            self.assertEqual(setumot, [])


class TestExtractMarkersNonMarkerSegTypes(unittest.TestCase):
    def test_maqqef_paseq_sof_pasuq_produce_no_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.1">'
                '<w lemma="1">a</w><seg type="x-maqqef">־</seg>'
                '<w lemma="2">b</w><seg type="x-paseq">׀</seg>'
                '<w lemma="3">c</w><seg type="x-sof-pasuq">׃</seg>'
                "</verse>",
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, [])
            self.assertEqual(setumot, [])

    def test_setumah_marker_extracted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.2.3">'
                '<w lemma="1">a</w><seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-samekh">ס</seg>'
                "</verse>",
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, [])
            self.assertEqual(setumot, ["2:3"])


class TestExtractMarkersDocumentOrder(unittest.TestCase):
    def test_markers_returned_in_document_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.5"><w lemma="1">a</w><seg type="x-pe">פ</seg></verse>'
                '<verse osisID="Gen.1.8"><w lemma="1">a</w><seg type="x-pe">פ</seg></verse>'
                '<verse osisID="Gen.1.13"><w lemma="1">a</w><seg type="x-pe">פ</seg></verse>',
            )
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, ["1:5", "1:8", "1:13"])
            self.assertEqual(setumot, [])


# ─── Task 5: anchor resolution and structural guards ─────────────────────────


class TestParseOsisId(unittest.TestCase):
    def test_single_verse(self):
        self.assertEqual(oshb.parse_osis_id("Ruth.4.17"), (4, 17))

    def test_multi_verse_span_anchors_to_final_verse(self):
        # A first-verse implementation must be SEEN to fail this case (Task 5
        # Step 3) — both C3 validators are blind to the off-by-one.
        self.assertEqual(oshb.parse_osis_id("Ps.3.1 Ps.3.2"), (3, 2))


class TestExtractMarkersNoAntecedentVerse(unittest.TestCase):
    def test_marker_before_any_verse_hard_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(tmp, '<seg type="x-pe">פ</seg>')
            with self.assertRaises(Exception) as ctx:
                oshb.extract_markers(path)
            self.assertIn("Fixture", str(ctx.exception))


class TestExtractMarkersUnrecognizedSegType(unittest.TestCase):
    def test_unrecognized_seg_type_hard_fails_naming_type_and_book(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.1">'
                '<w lemma="1">a</w><seg type="x-nun-hafucha">נ</seg>'
                "</verse>",
            )
            with self.assertRaises(Exception) as ctx:
                oshb.extract_markers(path)
            self.assertIn("x-nun-hafucha", str(ctx.exception))
            self.assertIn("Fixture", str(ctx.exception))


class TestExtractMarkersUnexpectedPlacementWarns(unittest.TestCase):
    def test_marker_outside_verse_element_warns_not_raises(self):
        # A marker element that is a sibling of <verse> rather than nested
        # inside one is unexpected placement (n=1 evidence in the real
        # corpus) — warn to stderr, never raise.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17"><w lemma="1">a</w></verse>'
                '<seg type="x-pe">פ</seg>'
                '<verse osisID="Ruth.4.18"><w lemma="1">b</w></verse>',
            )
            captured = io.StringIO()
            with contextlib.redirect_stderr(captured):
                petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, ["4:17"])
            self.assertEqual(setumot, [])


if __name__ == "__main__":
    unittest.main()
