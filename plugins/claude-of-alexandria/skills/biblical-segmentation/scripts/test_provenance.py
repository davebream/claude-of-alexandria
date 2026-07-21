#!/usr/bin/env python3
"""
Tests for provenance.py — the pinned-source download + checksum verification
module shared by the biblical-segmentation extractors.

Network is never touched: fetch_file is monkeypatched so every test is
deterministic and offline. Run:

    cd plugins/claude-of-alexandria/skills/biblical-segmentation/scripts
    python3 -m pytest test_provenance.py -q
    #   or: python3 -m unittest test_provenance -v
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import provenance  # noqa: E402


class FileUrlTests(unittest.TestCase):
    def test_url_pins_the_commit_and_layout(self):
        # morphhb WLC lives under wlc/<code>.xml at the pinned commit.
        url = provenance.file_url("morphhb", "Gen")
        self.assertIn(provenance.MORPHHB_COMMIT_SHA, url)
        self.assertTrue(url.endswith("/wlc/Gen.xml"), url)

        # sblgnt morphgnt files live at the repo root as <code>.txt.
        url = provenance.file_url("sblgnt", "61-Mt-morphgnt")
        self.assertIn(provenance.SBLGNT_COMMIT_SHA, url)
        self.assertTrue(url.endswith("/61-Mt-morphgnt.txt"), url)

        # Levinsohn discourse features live under LGNTDF/<feature>.xml.
        url = provenance.file_url("levinsohn", "Historical_Present")
        self.assertIn(provenance.LEVINSOHN_COMMIT_SHA, url)
        self.assertTrue(url.endswith("/LGNTDF/Historical_Present.xml"), url)

    def test_unknown_source_rejected(self):
        with self.assertRaises((KeyError, ValueError)):
            provenance.file_url("nonesuch", "Gen")


class ChecksumTests(unittest.TestCase):
    def test_verify_checksum_passes_on_match(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "f.bin"
            p.write_bytes(b"hello world")
            expected = hashlib.sha256(b"hello world").hexdigest()
            provenance.verify_checksum(p, expected)  # must not raise

    def test_verify_checksum_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "f.bin"
            p.write_bytes(b"hello world")
            with self.assertRaises(ValueError):
                provenance.verify_checksum(p, "0" * 64)


class LockfileTests(unittest.TestCase):
    def test_lockfiles_exist_for_all_sources(self):
        # Every committed lockfile must be present and cover the extractor codes.
        oshb = provenance.load_checksums("morphhb")
        sblgnt = provenance.load_checksums("sblgnt")
        levinsohn = provenance.load_checksums("levinsohn")
        self.assertIn("Gen", oshb)
        self.assertIn("61-Mt-morphgnt", sblgnt)
        self.assertIn("Historical_Present", levinsohn)
        self.assertIn("levinsohn", levinsohn)

    def test_missing_checksum_entry_is_hard_failure(self):
        # An unknown book code must fail loudly, never be silently skipped.
        with self.assertRaises(RuntimeError):
            provenance.fetch_and_verify(
                "morphhb", "NoSuchBook", Path("/tmp/never"), {"Gen": "abc"}
            )


class FetchAndVerifyTests(unittest.TestCase):
    def test_redownloads_once_then_raises_on_persistent_mismatch(self):
        calls = {"n": 0}

        def fake_fetch(source, code, dest, force=False):
            calls["n"] += 1
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"corrupt")
            return dest

        original = provenance.fetch_file
        provenance.fetch_file = fake_fetch
        try:
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaises(RuntimeError):
                    provenance.fetch_and_verify(
                        "morphhb",
                        "Gen",
                        Path(d) / "Gen.xml",
                        {"Gen": "d" * 64},
                    )
            # One initial attempt + exactly one forced re-download.
            self.assertEqual(calls["n"], 2)
        finally:
            provenance.fetch_file = original

    def test_returns_verified_file_on_match(self):
        payload = b"<xml>ok</xml>"
        digest = hashlib.sha256(payload).hexdigest()

        def fake_fetch(source, code, dest, force=False):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            return dest

        original = provenance.fetch_file
        provenance.fetch_file = fake_fetch
        try:
            with tempfile.TemporaryDirectory() as d:
                out = provenance.fetch_and_verify(
                    "morphhb", "Gen", Path(d) / "Gen.xml", {"Gen": digest}
                )
                self.assertTrue(out.exists())
        finally:
            provenance.fetch_file = original


class EnsureSourceRootTests(unittest.TestCase):
    def test_unknown_source_raises(self):
        with self.assertRaises(ValueError):
            provenance.ensure_source_root("nonesuch", ["Gen"])

    def test_lays_out_files_in_source_native_layout(self):
        payload = b"data"
        digest = hashlib.sha256(payload).hexdigest()

        def fake_fetch(source, code, dest, force=False):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            return dest

        original_fetch = provenance.fetch_file
        original_load = provenance.load_checksums
        provenance.fetch_file = fake_fetch
        provenance.load_checksums = lambda source: {"Gen": digest}
        try:
            with tempfile.TemporaryDirectory() as d:
                root = provenance.ensure_source_root(
                    "morphhb", ["Gen"], cache_dir=Path(d)
                )
                # morphhb extractors read root / "wlc" / "<code>.xml"
                self.assertTrue((root / "wlc" / "Gen.xml").exists())
        finally:
            provenance.fetch_file = original_fetch
            provenance.load_checksums = original_load

    def test_lays_out_levinsohn_feature_under_lgntdf(self):
        payload = b"<feature/>"
        digest = hashlib.sha256(payload).hexdigest()

        def fake_fetch(source, code, dest, force=False):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            return dest

        original_fetch = provenance.fetch_file
        original_load = provenance.load_checksums
        provenance.fetch_file = fake_fetch
        provenance.load_checksums = lambda source: {"Historical_Present": digest}
        try:
            with tempfile.TemporaryDirectory() as d:
                root = provenance.ensure_source_root(
                    "levinsohn", ["Historical_Present"], cache_dir=Path(d)
                )
                self.assertTrue(
                    (root / "LGNTDF" / "Historical_Present.xml").exists()
                )
        finally:
            provenance.fetch_file = original_fetch
            provenance.load_checksums = original_load


if __name__ == "__main__":
    unittest.main()
