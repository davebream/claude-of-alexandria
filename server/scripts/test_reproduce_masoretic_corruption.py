#!/usr/bin/env python3
"""Tests for reproduce-masoretic-corruption.py."""

import copy
import contextlib
import hashlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
FIXTURES_DIR = SCRIPTS_DIR / "fixtures" / "masoretic-corruption"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "reproduce_masoretic_corruption",
        SCRIPTS_DIR / "reproduce-masoretic-corruption.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = _load_module()


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class AuditFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = audit.verify_fixture_bundle(FIXTURES_DIR)

    def test_fixture_integrity_covers_all_39_corrupt_files(self):
        corrupt_files = sorted((FIXTURES_DIR / "corrupt-json").glob("*.json"))
        self.assertEqual(len(corrupt_files), 39)
        self.assertEqual(set(p.name for p in corrupt_files), set(self.manifest["corrupt_json"]))
        for name, record in self.manifest["corrupt_json"].items():
            self.assertTrue(record["intentionally_wrong"])
            self.assertEqual(record["source_commit"], "56c1e80")
            self.assertEqual(record["pre_repair_commit"], "ed50f51")
            self.assertRegex(record["sha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(record["git_blob_id"], r"^[0-9a-f]{40}$")
            self.assertGreater(record["verse_count"], 0)

    def test_genesis_and_ruth_reproduce_exact_letter_scan_outputs(self):
        lines = audit.prove_genesis_and_ruth(FIXTURES_DIR)
        self.assertIn(
            "PASS Genesis: marked Sefaria scan reproduces corrupt arrays "
            "(655 petuchot, 379 setumot, 208 double-listed verses)",
            lines,
        )
        self.assertIn(
            "PASS Ruth: marked Sefaria scan reproduces corrupt arrays "
            "(31 petuchot, 8 setumot, 4 double-listed verses)",
            lines,
        )

    def test_headline_corpus_counts_and_density_corrections(self):
        corrupt = audit.corrupt_corpus_stats(FIXTURES_DIR, self.manifest)
        self.assertEqual(corrupt["total_entries"], 18796)
        self.assertEqual(corrupt["verse_denominator"], 23213)
        self.assertEqual(corrupt["verses_with_entries"], 14694)
        self.assertAlmostEqual(corrupt["entry_density"], 0.809719, places=6)
        self.assertAlmostEqual(corrupt["unique_marked_verse_density"], 0.633007, places=6)

        corrected = audit.corrected_corpus_stats()
        self.assertEqual(corrected["markers"], 3162)
        self.assertEqual(corrected["graphic_signs"], 20)

    def test_witness_labelled_goldens_match_corrected_corpus(self):
        lines = audit.prove_goldens(FIXTURES_DIR)
        self.assertIn(
            "PASS OSHB/WLC golden: Genesis 42+50 and creation-day/2:3 petuchot match",
            lines,
        )
        self.assertIn(
            "PASS OSHB/WLC golden: Ruth has one verse_end petuchah at 4:17",
            lines,
        )

    def test_cli_main_returns_zero_for_complete_reproduction(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(audit.main(["--fixtures-dir", str(FIXTURES_DIR)]), 0)


class AuditMutationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fixtures = Path(self.tmp.name) / "masoretic-corruption"
        shutil.copytree(FIXTURES_DIR, self.fixtures)
        self.manifest_path = self.fixtures / "manifest.json"
        self.manifest = _load(self.manifest_path)

    def tearDown(self):
        self.tmp.cleanup()

    def _update_manifest_hash(self, section: str, filename: str, path: Path) -> None:
        self.manifest[section][filename]["sha256"] = _sha256(path)
        _write(self.manifest_path, self.manifest)

    def _update_golden_hash(self) -> None:
        golden = self.fixtures / self.manifest["golden_fixture"]["filename"]
        self.manifest["golden_fixture"]["sha256"] = _sha256(golden)
        _write(self.manifest_path, self.manifest)

    def test_changing_source_letter_fails_reproduction(self):
        path = self.fixtures / "sefaria-export" / "genesis-miqra-according-to-the-masorah.json"
        data = _load(path)
        data["text"][0][1] = data["text"][0][1].replace(audit.PE, "")
        _write(path, data)
        self._update_manifest_hash("sefaria_sources", path.name, path)

        with self.assertRaises(audit.AnalyticalMismatchError):
            audit.run_audit(self.fixtures)

    def test_changing_corrupt_reference_fails_reproduction(self):
        path = self.fixtures / "corrupt-json" / "genesis.json"
        data = _load(path)
        data["petuchot"][0] = "1:999"
        _write(path, data)
        self._update_manifest_hash("corrupt_json", path.name, path)

        with self.assertRaises(audit.AnalyticalMismatchError):
            audit.run_audit(self.fixtures)

    def test_changing_manifest_hash_fails_input_validation(self):
        self.manifest["corrupt_json"]["genesis.json"]["sha256"] = "0" * 64
        _write(self.manifest_path, self.manifest)

        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(audit.main(["--fixtures-dir", str(self.fixtures)]), 2)

    def test_changing_marker_type_fails_reproduction(self):
        path = self.fixtures / "corrupt-json" / "ruth.json"
        data = _load(path)
        moved = data["petuchot"].pop(0)
        data["setumot"].append(moved)
        _write(path, data)
        self._update_manifest_hash("corrupt_json", path.name, path)

        with self.assertRaises(audit.AnalyticalMismatchError):
            audit.run_audit(self.fixtures)

    def test_changing_golden_location_fails_reproduction(self):
        path = self.fixtures / "oshb-wlc-golden.json"
        golden = copy.deepcopy(_load(path))
        golden["ruth"]["markers"][0]["verse"] = 18
        _write(path, golden)
        self._update_golden_hash()

        with self.assertRaises(audit.AnalyticalMismatchError):
            audit.run_audit(self.fixtures)


if __name__ == "__main__":
    unittest.main()
