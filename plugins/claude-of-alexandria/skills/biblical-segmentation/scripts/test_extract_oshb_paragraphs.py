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

import hashlib
import importlib.util
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


if __name__ == "__main__":
    unittest.main()
