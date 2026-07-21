#!/usr/bin/env python3
"""Tests for the pinned Levinsohn discourse-feature extractor (issue #144).

The unit suite is network-free. The full pinned corpus is exercised by running
the extractor itself, which verifies every downloaded XML against the committed
SHA-256 lockfile before parsing it.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import extract_levinsohn_discourse as extractor  # noqa: E402
import levinsohn_parser  # noqa: E402


FEATURE_XML = """\
<?xml version="1.0" encoding="utf-8"?>
<feature>
  <header>
    <name>Historical Present</name>
    <description>Highlights the event that follows.</description>
  </header>
  <references>
    <reference osisRef="Matt.2.13!7" type="Historical Present" verse="Matt 2:13">φαίνεται</reference>
    <reference osisRef="Matt.2.13!19" type="Historical Present" verse="Matt 2:13">φαίνεται</reference>
  </references>
</feature>
"""

INDEX_XML = """\
<levinsohn xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="Historical_Present.xml"/>
</levinsohn>
"""


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


class ParseFeatureTests(unittest.TestCase):
    def test_preserves_document_order_and_word_occurrence_index(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "Historical_Present.xml", FEATURE_XML)
            feature = extractor.parse_feature_xml(path, "Historical_Present")

        self.assertEqual(feature.feature, "Historical Present")
        self.assertEqual(feature.description, "Highlights the event that follows.")
        self.assertEqual(feature.source_count, 2)
        self.assertEqual(
            feature.references,
            [
                {
                    "verse": "Matt 2:13",
                    "word_index": 7,
                    "word": "φαίνεται",
                    "type": "Historical Present",
                },
                {
                    "verse": "Matt 2:13",
                    "word_index": 19,
                    "word": "φαίνεται",
                    "type": "Historical Present",
                },
            ],
        )

    def test_preserves_multiline_annotation_text(self):
        xml = FEATURE_XML.replace(
            "φαίνεται</reference>",
            "first line\nsecond line</reference>",
            1,
        )
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "Annotations.xml", xml)
            feature = extractor.parse_feature_xml(path, "Annotations")
        self.assertEqual(feature.references[0]["word"], "first line\nsecond line")

    def test_trims_xml_edge_whitespace_without_collapsing_content(self):
        xml = FEATURE_XML.replace(
            "φαίνεται</reference>",
            "  first line\nsecond line  </reference>",
            1,
        )
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "Annotations.xml", xml)
            feature = extractor.parse_feature_xml(path, "Annotations")
        self.assertEqual(feature.references[0]["word"], "first line\nsecond line")

    def test_missing_word_index_is_a_hard_failure(self):
        xml = FEATURE_XML.replace("Matt.2.13!7", "Matt.2.13", 1)
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "Historical_Present.xml", xml)
            with self.assertRaisesRegex(ValueError, "Historical_Present.*osisRef"):
                extractor.parse_feature_xml(path, "Historical_Present")

    def test_source_to_output_count_mismatch_is_a_hard_failure(self):
        feature = extractor.ExtractedFeature(
            stem="Fixture",
            feature="Fixture",
            description="",
            references=[{"verse": "Matt 1:1", "word_index": 1, "word": "x", "type": "x"}],
            source_count=2,
        )
        with self.assertRaisesRegex(ValueError, "Fixture.*source.*2.*output.*1"):
            extractor.validate_feature(feature)


class IndexTests(unittest.TestCase):
    def test_reads_xinclude_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "levinsohn.xml", INDEX_XML)
            self.assertEqual(
                extractor.parse_index_xml(path),
                ("Historical_Present",),
            )

    def test_rejects_duplicate_index_entries(self):
        duplicate = INDEX_XML.replace(
            "</levinsohn>",
            '  <xi:include href="Historical_Present.xml"/>\n</levinsohn>',
        )
        with tempfile.TemporaryDirectory() as d:
            path = _write(Path(d) / "levinsohn.xml", duplicate)
            with self.assertRaisesRegex(ValueError, "duplicate"):
                extractor.parse_index_xml(path)

    def test_corpus_validation_rejects_unexpected_index_entry(self):
        feature = extractor.ExtractedFeature(
            stem="Historical_Present",
            feature="Historical Present",
            description="fixture",
            references=[],
            source_count=0,
        )
        with self.assertRaisesRegex(ValueError, "index mismatch"):
            extractor.validate_corpus(
                [feature],
                ("Unexpected",),
                expected_stems=("Historical_Present",),
                expected_total=0,
            )


class ValidateThenWriteTests(unittest.TestCase):
    def _feature(self, stem: str, source_count: int = 1):
        return extractor.ExtractedFeature(
            stem=stem,
            feature=stem,
            description=f"{stem} description",
            references=[
                {"verse": "Matt 1:1", "word_index": 1, "word": stem, "type": stem}
            ],
            source_count=source_count,
        )

    def test_later_validation_failure_writes_nothing(self):
        features = [self._feature("Good"), self._feature("Bad", source_count=2)]
        with tempfile.TemporaryDirectory() as d:
            output_dir = Path(d) / "output"
            with self.assertRaises(ValueError):
                extractor.validate_all_then_write_all(
                    features,
                    ("Good", "Bad"),
                    output_dir,
                    expected_stems=("Good", "Bad"),
                    expected_total=None,
                )
            self.assertFalse(output_dir.exists())

    def test_writes_features_and_index_stub_after_validation(self):
        features = [self._feature("First"), self._feature("Second")]
        with tempfile.TemporaryDirectory() as d:
            output_dir = Path(d) / "output"
            extractor.validate_all_then_write_all(
                features,
                ("First", "Second"),
                output_dir,
                expected_stems=("First", "Second"),
                expected_total=2,
            )

            first = json.loads((output_dir / "First.json").read_text(encoding="utf-8"))
            index = json.loads((output_dir / "levinsohn.json").read_text(encoding="utf-8"))

        self.assertEqual(first["references"][0]["word_index"], 1)
        self.assertEqual(
            index,
            {"feature": "levinsohn", "description": "", "references": []},
        )

    def test_rendered_json_has_no_trailing_newline(self):
        rendered = extractor.render_feature(self._feature("Fixture"))
        self.assertFalse(rendered.endswith("\n"))


class ManifestTests(unittest.TestCase):
    def test_manifest_has_33_features_plus_index(self):
        self.assertEqual(len(extractor.FEATURE_STEMS), 33)
        self.assertEqual(len(set(extractor.FEATURE_STEMS)), 33)
        self.assertEqual(extractor.XML_STEMS, extractor.FEATURE_STEMS + ("levinsohn",))


class LoaderCompatibilityTests(unittest.TestCase):
    def test_loader_preserves_word_index_and_text_output_surfaces_it(self):
        payload = {
            "feature": "Historical Present",
            "description": "fixture",
            "references": [
                {
                    "verse": "Matt 2:13",
                    "word_index": 7,
                    "word": "φαίνεται",
                    "type": "Historical Present",
                }
            ],
        }
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "Historical_Present.json"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            references = levinsohn_parser.parse_feature_json(path)

        self.assertEqual(references[0]["word_index"], 7)
        rendered = levinsohn_parser.format_output(
            {
                "book": "Matthew",
                "features": {"historical_present": references},
                "summary": {"historical_present": 1},
            },
            "text",
        )
        self.assertIn("word 7", rendered)


class CommittedCorpusGoldenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference_dir = (
            Path(__file__).resolve().parent.parent / "reference" / "levinsohn"
        )

    def test_exact_manifest_and_total_reference_count(self):
        expected_files = {f"{stem}.json" for stem in extractor.XML_STEMS}
        actual_files = {path.name for path in self.reference_dir.glob("*.json")}
        self.assertEqual(actual_files, expected_files)

        total = 0
        for stem in extractor.FEATURE_STEMS:
            payload = json.loads(
                (self.reference_dir / f"{stem}.json").read_text(encoding="utf-8")
            )
            total += len(payload["references"])
            for reference in payload["references"]:
                self.assertIsInstance(reference["word_index"], int)
                self.assertGreater(reference["word_index"], 0)
        self.assertEqual(total, extractor.EXPECTED_TOTAL_REFERENCES)

    def test_ambiguous_anchor_pair_is_disambiguated(self):
        payload = json.loads(
            (self.reference_dir / "Historical_Present.json").read_text(
                encoding="utf-8"
            )
        )
        matches = [
            reference
            for reference in payload["references"]
            if reference["verse"] == "Mark 11:27"
            and reference["word"] == "ἔρχονται"
        ]
        self.assertEqual([reference["word_index"] for reference in matches], [2, 12])


if __name__ == "__main__":
    unittest.main()
