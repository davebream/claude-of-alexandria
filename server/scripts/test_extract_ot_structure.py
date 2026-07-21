#!/usr/bin/env python3
"""Tests for extract-ot-structure.py."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
CORPUS = "--corpus" in sys.argv
if CORPUS:
    sys.argv.remove("--corpus")
SPEC = importlib.util.spec_from_file_location("extract_ot_structure", SCRIPTS_DIR / "extract-ot-structure.py")
extractor = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = extractor
SPEC.loader.exec_module(extractor)


GENESIS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<chapter lang="he" id="GEN 1">
  <sentence id="GEN 1:1">
    <wg class="cl" rule="V-S" head="true">
      <w role="v" xml:id="o010010010011" ref="GEN 1:1!1" frame="A0:010010010021;" sdbh="skip" gloss="skip">אמר</w>
      <w role="s" xml:id="o010010010021" ref="GEN 1:1!2" participantref="010010010021" lexdomain="skip">אלהים</w>
    </wg>
  </sentence>
  <sentence id="GEN 1:2">
    <wg class="cl" rule="S-V" role="adv">
      <w role="s" xml:id="o010010020011" ref="GEN 1:2!1" participantref="010010020011">ארץ</w>
      <w role="v" xml:id="o010010020021" ref="GEN 1:2!2" subjref="010010020011" sensenumber="skip">היתה</w>
    </wg>
  </sentence>
  <sentence id="GEN 1:3">
    <wg class="cl" rule="V-S">
      <w role="v" xml:id="o010010030011" ref="GEN 1:3!1" frame="A0:010010030021;">ויאמר</w>
      <w role="s" xml:id="o010010030021" ref="GEN 1:3!2" participantref="010010030021">אלהים</w>
    </wg>
  </sentence>
</chapter>
"""

OPEN_CLAUSE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<chapter lang="he" id="GEN 2">
  <sentence id="GEN 2:1">
    <wg class="cl" rule="V-O">
      <w role="v" xml:id="o010020010011" ref="GEN 2:1!1">יכלו</w>
      <wg class="cl" rule="InfCmpl">
        <w role="v" xml:id="o010020020011" ref="GEN 2:2!1">ויכל</w>
      </wg>
    </wg>
  </sentence>
</chapter>
"""

SPEAKER_TSV = """KEY\tSTART VS\tEND VS\tSPEAKER (FCBH)\tALT SPEAKER (FCBH)\tSPEAKER REFERENT (CLEAR)\tSPEAKER REFERENT LABEL (CLEAR)\tQUOTE TYPE\tQUOTE DELIVERY\tPROJECTION START\tPROJECTION END\tCLEAR START\tCLEAR END
GEN 1:3|GEN 1:3|God\tGEN 1:3\tGEN 1:3\tGod\t\to010010030021\tGod\tNormal\t\tGEN 1:3\tGEN 1:3\to010010030031\to010010030041
MAT 1:1|MAT 1:1|Narrator\tMAT 1:1\tMAT 1:1\tNarrator\t\t\tNormal\t\tMAT 1:1\tMAT 1:1\tw1\tw2
"""


class OtStructureExtractorTests(unittest.TestCase):
    def test_parse_lowfat_xml_extracts_verses_clauses_and_participants(self):
        structure = extractor.BookStructure(code="GEN", canonical="genesis")
        extractor.parse_lowfat_xml(GENESIS_XML, structure)

        self.assertEqual(structure.verse_order, [1001, 1002, 1003])
        self.assertEqual(len(structure.sentence_spans), 3)
        self.assertEqual(len(structure.clause_spans), 3)
        self.assertEqual(structure.verses[1001].participants, {"010010010021"})
        self.assertEqual(structure.verses[1002].participants, {"010010020011"})

    def test_render_boundary_rows_derives_edges_without_arithmetic(self):
        structure = extractor.BookStructure(code="GEN", canonical="genesis")
        extractor.parse_lowfat_xml(GENESIS_XML, structure)
        extractor.attach_quotations({"GEN": structure}, extractor.parse_speaker_tsv(SPEAKER_TSV))

        rows = extractor.render_boundary_rows(structure)

        self.assertEqual(len(rows), 2)
        self.assertEqual((rows[0][2], rows[0][3], rows[0][4], rows[0][5]), (1, 1, 1, 2))
        self.assertEqual((rows[1][2], rows[1][3], rows[1][4], rows[1][5]), (1, 2, 1, 3))
        self.assertTrue(rows[1][23])  # quotation_opened
        self.assertEqual(rows[1][21], ["God"])  # speakers_after

    def test_open_clause_depth_counts_clause_spanning_edge(self):
        structure = extractor.BookStructure(code="GEN", canonical="genesis")
        extractor.parse_lowfat_xml(OPEN_CLAUSE_XML, structure)

        rows = extractor.render_boundary_rows(structure)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][10], 1)  # open_clause_depth

    def test_malformed_ref_fails(self):
        with self.assertRaises(ValueError):
            extractor.parse_ref("GENESIS 1.1")

    def test_checksum_drift_fails(self):
        lowfat = {"WLC/lowfat/01-Gen-001-lowfat.xml": b"<chapter/>"}
        speaker = SPEAKER_TSV.encode("utf-8")
        manifest = extractor.build_checksum_manifest(lowfat, speaker)
        manifest["macula_hebrew"]["files"]["WLC/lowfat/01-Gen-001-lowfat.xml"] = "bad"

        with self.assertRaises(ValueError):
            extractor.verify_checksums(manifest, lowfat, speaker)

    def test_generated_sql_is_deterministic_and_excludes_word_sense_fields(self):
        structure = extractor.BookStructure(code="GEN", canonical="genesis")
        extractor.parse_lowfat_xml(GENESIS_XML, structure)
        rows = extractor.render_boundary_rows(structure)

        first = extractor.render_sql("genesis", rows)
        second = extractor.render_sql("genesis", rows)

        self.assertEqual(first, second)
        self.assertNotIn("sdbh", first)
        self.assertNotIn("lexdomain", first)
        self.assertNotIn("sensenumber", first)
        self.assertNotIn("skip", first)

    def test_write_outputs_counts_boundaries(self):
        structure = extractor.BookStructure(code="GEN", canonical="genesis")
        extractor.parse_lowfat_xml(GENESIS_XML, structure)
        structures = {"GEN": structure}
        for code, canonical in extractor.BOOK_CODE_TO_CANONICAL.items():
            if code != "GEN":
                other = extractor.BookStructure(code=code, canonical=canonical)
                other.verses[1001] = extractor.VerseData(code, 1, 1)
                other.verses[1002] = extractor.VerseData(code, 1, 2)
                other.verse_order = [1001, 1002]
                structures[code] = other

        with tempfile.TemporaryDirectory() as tmp:
            counts = extractor.write_outputs(structures, Path(tmp))

        self.assertEqual(counts["books"]["genesis"]["boundaries"], 2)
        self.assertEqual(counts["books"]["ruth"]["boundaries"], 1)
        self.assertEqual(counts["total_boundaries"], 40)


@unittest.skipUnless(CORPUS, "corpus tests require --corpus")
class OtStructureCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cache_dir = SCRIPTS_DIR.parent / ".cache" / "ot-structure"
        lowfat_files, speaker_bytes = extractor.load_upstream(cache_dir)
        manifest = extractor.json.loads(extractor.CHECKSUM_FILE.read_text(encoding="utf-8"))
        extractor.verify_checksums(manifest, lowfat_files, speaker_bytes)
        cls.lowfat_files = lowfat_files
        cls.speaker_bytes = speaker_bytes
        cls.structures = extractor.build_structures(lowfat_files, speaker_bytes)

    def test_corpus_coverage_and_boundary_count(self):
        self.assertEqual(len(self.lowfat_files), 929)
        self.assertEqual(len(self.structures), 39)
        total_verses = sum(len(s.verse_order) for s in self.structures.values())
        total_boundaries = sum(len(extractor.render_boundary_rows(s)) for s in self.structures.values())
        self.assertEqual(total_verses, 23213)
        self.assertEqual(total_boundaries, 23174)
        self.assertEqual(len(self.structures["GEN"].verse_order), 1533)
        self.assertEqual(len(extractor.render_boundary_rows(self.structures["RUT"])), 84)

    def test_generated_sql_excludes_word_sense_fields_on_real_corpus(self):
        sql = extractor.render_sql("genesis", extractor.render_boundary_rows(self.structures["GEN"]))
        for forbidden in ("sdbh", "lexdomain", "coredomain", "sensenumber", "gloss"):
            self.assertNotIn(forbidden, sql)


if __name__ == "__main__":
    unittest.main()
