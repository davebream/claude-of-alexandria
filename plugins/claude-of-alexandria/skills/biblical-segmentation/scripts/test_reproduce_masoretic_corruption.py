#!/usr/bin/env python3
"""Unit tests for reproduce_masoretic_corruption.py."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

import reproduce_masoretic_corruption as repro  # noqa: E402


FIXTURE_XML = """\
<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace">
  <osisText>
    <div type="book">
      <chapter osisID="Gen.1">
        <verse osisID="Gen.1.1">
          <w id="w1">פנים</w>
          <seg type="x-pe" />
          <seg type="x-sof-pasuq" />
        </verse>
        <verse osisID="Gen.1.2">
          <w id="w2">סוס</w>
          <seg type="x-samekh" />
          <w id="w3">דבר</w>
          <seg type="x-sof-pasuq" />
        </verse>
        <verse osisID="Gen.1.3">
          <w id="w4">ספר</w>
          <seg type="x-pe" />
          <seg type="x-sof-pasuq" />
        </verse>
      </chapter>
    </div>
  </osisText>
</osis>
"""


class TestReproduceMasoreticCorruption(unittest.TestCase):
    def write(self, directory: Path, name: str, content: str) -> Path:
        path = directory / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_collect_bare_letter_anchors(self):
        with tempfile.TemporaryDirectory() as tmp:
            xml_path = self.write(Path(tmp), "Gen.xml", FIXTURE_XML)
            anchors = repro.collect_bare_letter_anchors(xml_path)
            self.assertEqual(anchors["petuchot"], ["1:1", "1:3"])
            self.assertEqual(anchors["setumot"], ["1:2", "1:3"])

    def test_reproduce_book_matches_exact_mechanism(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            xml_path = self.write(tmpdir, "Gen.xml", FIXTURE_XML)
            fixture_path = self.write(
                tmpdir,
                "genesis.json",
                json.dumps(
                    {
                        "book": "Genesis",
                        "petuchot": ["1:1", "1:3"],
                        "setumot": ["1:2", "1:3"],
                    }
                ),
            )
            goldens = {
                "witness": f"WLC/OSHB@{repro.oshb.COMMIT_SHA}",
                "books": {},
            }
            row = repro.reproduce_book("Genesis", "Gen", xml_path, fixture_path, goldens)
            self.assertEqual(row["corrupt"], {"petuchot": 2, "setumot": 2})
            self.assertEqual(row["bare"], {"petuchot": 2, "setumot": 2})
            self.assertEqual(row["genuine"], {"petuchot": 2, "setumot": 1})
            self.assertEqual(row["residual"], {"petuchot": 0, "setumot": 0})
            self.assertEqual(row["double_listed"], 1)

    def test_reproduce_book_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            xml_path = self.write(tmpdir, "Gen.xml", FIXTURE_XML)
            fixture_path = self.write(
                tmpdir,
                "genesis.json",
                json.dumps(
                    {
                        "book": "Genesis",
                        "petuchot": ["1:1"],
                        "setumot": ["1:2"],
                    }
                ),
            )
            row = repro.reproduce_book(
                "Genesis",
                "Gen",
                xml_path,
                fixture_path,
                {"witness": f"WLC/OSHB@{repro.oshb.COMMIT_SHA}", "books": {}},
            )
            with self.assertRaisesRegex(ValueError, "not exactly"):
                repro.enforce_exact_reconstruction(row)

    def test_parse_corrupt_fixture_rejects_malformed_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = self.write(
                Path(tmp),
                "bad.json",
                json.dumps({"book": "Genesis", "petuchot": ["1:1"]}),
            )
            with self.assertRaisesRegex(ValueError, "expected 'setumot'"):
                repro.parse_corrupt_fixture(bad)


if __name__ == "__main__":
    unittest.main()
