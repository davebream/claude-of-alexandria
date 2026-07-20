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


class TestSegTypeSetsArePinned(unittest.TestCase):
    """Pin both sets against a one-character edit.

    Nothing else in this suite catches a change that promotes a layout
    annotation (x-large, x-small, x-suspended, x-reversednun) into a paragraph
    marker: such an edit still parses, still validates, and would silently
    inject spurious paragraph divisions into the emitted corpus.
    """

    def test_marker_seg_types_are_exactly_pe_and_samekh(self):
        self.assertEqual(set(oshb.MARKER_SEG_TYPES), {"x-pe", "x-samekh"})

    def test_known_seg_types_is_the_nine_from_the_corpus_census(self):
        # Established by a full 39-book census, not inferred from two books.
        self.assertEqual(
            oshb.KNOWN_SEG_TYPES,
            {
                "x-pe",
                "x-samekh",
                "x-maqqef",
                "x-sof-pasuq",
                "x-paseq",
                "x-reversednun",
                "x-large",
                "x-suspended",
                "x-small",
            },
        )
        self.assertEqual(len(oshb.KNOWN_SEG_TYPES), 9)


class TestLayoutSegTypesRecognizedButNotMarkers(unittest.TestCase):
    """The four types the Phase-2 census added: recognized, never emitted.

    These hard-failed 9 of 39 books (Lev, Num, Deut, Judg, Job, Ps, Prov, Isa,
    Jer) under the original five-type allowlist. They are scribal-layout
    annotations, not paragraph divisions.
    """

    def test_all_four_layout_types_parse_clean_and_emit_no_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Num.10.35">'
                '<w lemma="1">a</w><seg type="x-reversednun">׆</seg>'
                '<w lemma="2">b</w><seg type="x-large">ב</seg>'
                '<w lemma="3">c</w><seg type="x-suspended">ע</seg>'
                '<w lemma="4">d</w><seg type="x-small">ק</seg>'
                "</verse>",
            )
            # Must not raise, and must emit nothing.
            petuchot, setumot = oshb.extract_markers(path)
            self.assertEqual(petuchot, [])
            self.assertEqual(setumot, [])


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
        # `x-nun-hafucha` is DELIBERATELY FICTIONAL — it is not an OSHB seg
        # type. That matters: the real inverted-nun type is `x-reversednun`,
        # which the Phase-2 census added to KNOWN_SEG_TYPES. Had this fixture
        # used the real name, widening the allowlist from five to nine types
        # would have silently turned this test into a no-op. Keep it fictional.
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


# ─── Task 6: contradiction and absence hard-fails ────────────────────────────


class TestSegTypeCounting(unittest.TestCase):
    """Two counting paths that must stay INDEPENDENT.

    `count_seg_types` walks the parsed tree (ElementTree). `count_marker_segs_raw`
    regex-matches raw bytes and never touches ElementTree. That independence is
    load-bearing for parity: if the source-side count came from the same walk as
    the output, a namespace regression would zero BOTH sides and parity would
    pass vacuously — reintroducing the exact bug at the spot claimed to close it.
    """

    def test_element_tree_and_raw_paths_agree_on_a_good_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Gen.1.5"><w lemma="1">a</w><seg type="x-pe">פ</seg></verse>'
                '<verse osisID="Gen.1.8"><w lemma="1">b</w><seg type="x-samekh">ס</seg></verse>',
            )
            tree_counts = oshb.count_seg_types(path)
            raw_counts = oshb.count_marker_segs_raw(path)
            self.assertEqual(tree_counts["x-pe"], 1)
            self.assertEqual(tree_counts["x-samekh"], 1)
            self.assertEqual(raw_counts["x-pe"], 1)
            self.assertEqual(raw_counts["x-samekh"], 1)

    def test_raw_path_never_parses_xml_at_all(self):
        # INDEPENDENCE WITNESS. An earlier version of this test merely stripped
        # the xmlns declaration — which proved nothing, because count_seg_types
        # uses _local_tag() and is itself namespace-agnostic, so BOTH paths
        # passed. That test asserted independence while being structurally
        # unable to fail, and a mutation refactoring count_marker_segs_raw onto
        # the shared ElementTree walk slipped straight past it.
        #
        # The property that actually separates the two paths is that the raw
        # counter never parses. So: feed it XML that is NOT well-formed. If the
        # raw path is genuinely regex-over-bytes it still counts; if anyone
        # "deduplicates" it onto ElementTree, ET.parse raises and this fails.
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Malformed.xml"
            path.write_text(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                f'<osis xmlns="{OSIS_XMLNS}"><osisText>'
                '<verse osisID="Gen.1.5"><seg type="x-pe">פ</seg></verse>'
                '<unclosed-tag>'  # deliberately never closed
                "</osisText></osis>\n",
                encoding="utf-8",
            )
            # Precondition: ElementTree genuinely cannot read this file.
            import xml.etree.ElementTree as _ET

            with self.assertRaises(_ET.ParseError):
                _ET.parse(path)
            # The raw path is unbothered — it never parses.
            self.assertEqual(oshb.count_marker_segs_raw(path)["x-pe"], 1)


class TestValidateBookContradictionAndAbsence(unittest.TestCase):
    VERSES = {"1:1", "1:2", "4:17"}

    def _counts(self, **kw):
        base = {"x-sof-pasuq": 10}
        base.update(kw)
        return base

    def test_verse_in_both_arrays_warns_but_does_not_raise(self):
        # CORRECTED AGAINST THE CORPUS. The design called a verse carrying both
        # a petuchah and a setumah "structurally impossible". It is not: OSHB
        # has three genuine cases, each with an x-samekh AND an x-pe as direct
        # children of the same <verse> element — 2Sam 16:13, 2Chr 5:1,
        # Jer 38:28. A hard-fail here rejects correct upstream data.
        # (The existing committed corpus also carries 4,102 double-typed
        # verses, so this shape is not new to downstream consumers.)
        captured = io.StringIO()
        with contextlib.redirect_stderr(captured):
            oshb.validate_book(
                "2Sam", ["16:13"], ["16:13"], {"16:13"},
                self._counts(**{"x-pe": 1, "x-samekh": 1}),
            )
        self.assertIn("16:13", captured.getvalue())

    def test_anchor_absent_from_verse_inventory_hard_fails_naming_book(self):
        with self.assertRaises(Exception) as ctx:
            oshb.validate_book(
                "Ruth", ["9:99"], [], self.VERSES, self._counts(**{"x-pe": 1})
            )
        self.assertIn("Ruth", str(ctx.exception))

    def test_zero_markers_hard_fails_for_a_non_allowlisted_book(self):
        with self.assertRaises(Exception) as ctx:
            oshb.validate_book("Ruth", [], [], self.VERSES, self._counts())
        self.assertIn("Ruth", str(ctx.exception))


class TestZeroMarkerAllowlist(unittest.TestCase):
    """Three arms. The third is the one that matters."""

    VERSES = {"1:1", "1:2"}

    def test_allowlist_is_keyed_by_osis_code_not_english_name(self):
        # THE SILENT NO-OP GUARD. The extractor keys books by OSIS abbreviation.
        # An allowlist written {"Psalms","Obadiah"} would never match, both
        # books would hard-fail exactly as if no allowlist existed, and the
        # failure would look like a data problem rather than a spelling one.
        self.assertEqual(oshb.ZERO_MARKER_ALLOWLIST, {"Ps", "Obad"})
        self.assertNotIn("Psalms", oshb.ZERO_MARKER_ALLOWLIST)
        self.assertNotIn("Obadiah", oshb.ZERO_MARKER_ALLOWLIST)

    def test_arm_a_allowlisted_book_with_zero_markers_but_real_segs_validates(self):
        # Psalms: 5,461 non-marker segs, 0 markers. Must NOT raise.
        oshb.validate_book("Ps", [], [], self.VERSES, {"x-maqqef": 2404, "x-sof-pasuq": 2527})

    def test_arm_b_non_allowlisted_book_with_zero_markers_hard_fails(self):
        with self.assertRaises(Exception):
            oshb.validate_book("Gen", [], [], self.VERSES, {"x-maqqef": 100})

    def test_arm_c_allowlisted_book_with_zero_markers_AND_zero_segs_hard_fails(self):
        # ← THE ONE THAT MATTERS. Without this arm the allowlist is a channel
        # through which a Psalms-scoped parse failure passes silently: the
        # "validator vacuously satisfied by empty output" class this whole
        # design exists to prevent, reintroduced at the spot claimed to close
        # it. The exemption must require positive evidence of a real parse.
        with self.assertRaises(Exception) as ctx:
            oshb.validate_book("Ps", [], [], self.VERSES, {})
        self.assertIn("Ps", str(ctx.exception))

    def test_arm_c_message_distinguishes_empty_parse_from_legitimate_absence(self):
        # A maintainer hitting this must not read it as "Psalms has no markers".
        with self.assertRaises(Exception) as ctx:
            oshb.validate_book("Ps", [], [], self.VERSES, {})
        msg = str(ctx.exception).lower()
        self.assertTrue(
            "no <seg> elements" in msg or "parse" in msg,
            f"message should point at an empty parse, got: {ctx.exception}",
        )


class TestPerSegTypeParity(unittest.TestCase):
    """Task 7's primary oracle, checked against the INDEPENDENT raw count."""

    def test_parity_passes_when_output_matches_source(self):
        oshb.validate_parity("Lam", ["1:1"] * 5, ["1:2"] * 84, {"x-pe": 5, "x-samekh": 84})

    def test_type_conflation_localized_to_one_book_hard_fails(self):
        # All markers emitted as petuchot; total is RIGHT, only the split is
        # wrong. Survives every Task 6 check and any corpus-wide total floor.
        with self.assertRaises(Exception) as ctx:
            oshb.validate_parity("Lam", ["1:1"] * 89, [], {"x-pe": 5, "x-samekh": 84})
        self.assertIn("Lam", str(ctx.exception))

    def test_namespace_regression_is_caught_by_parity(self):
        # ElementTree yields nothing; the raw path still sees the markers.
        with self.assertRaises(Exception) as ctx:
            oshb.validate_parity("Gen", [], [], {"x-pe": 42, "x-samekh": 50})
        self.assertIn("Gen", str(ctx.exception))

    def test_psalms_zero_equals_zero_parity_passes(self):
        oshb.validate_parity("Ps", [], [], {"x-pe": 0, "x-samekh": 0})


class TestDegeneracyTierAllowlistShortCircuit(unittest.TestCase):
    """Blocking item 6: the distribution floor must not hard-fail Psalms.

    "Markers must span more than one chapter in a multi-chapter book" is
    trivially violated by zero markers, which span zero chapters. If the
    allowlist short-circuits only the zero-marker check and not the whole
    degeneracy tier, Phase 3 stalls on Psalms for a reason nothing documents.
    """

    def test_allowlisted_book_passes_the_whole_tier(self):
        # Blocking item 6, stated as an OUTCOME rather than a mechanism:
        # Phase 3 must not stall on Psalms. Today this holds for two
        # independent reasons — the allowlist short-circuit, and the fact that
        # the refuted distribution floor is gone — so it is deliberately
        # written to assert the outcome, which survives either implementation.
        oshb.validate_degeneracy("Ps", [], [], chapter_count=150)
        oshb.validate_degeneracy("Obad", [], [], chapter_count=1)


class TestValidateCorpusBand(unittest.TestCase):
    """The corpus-total sanity band. Untested until a mutation sweep found that
    widening CORPUS_TOTAL_MIN to 0 changed nothing — the band was asserted
    nowhere and could not fail."""

    def test_observed_corpus_total_is_in_band(self):
        oshb.validate_corpus(3162)  # the real census figure

    def test_far_too_few_markers_hard_fails(self):
        # The namespace-regression shape: near-empty output, well-formed files.
        with self.assertRaises(Exception):
            oshb.validate_corpus(0)
        with self.assertRaises(Exception):
            oshb.validate_corpus(1499)

    def test_far_too_many_markers_hard_fails(self):
        # The original corruption's shape: Genesis alone claimed 1,034.
        with self.assertRaises(Exception):
            oshb.validate_corpus(4001)
        with self.assertRaises(Exception):
            oshb.validate_corpus(40000)

    def test_band_bounds_are_the_calibrated_values(self):
        # Pin them: the failure message tells a future maintainer NOT to widen
        # the band to get past a failure, and this stops a silent widening.
        self.assertEqual(oshb.CORPUS_TOTAL_MIN, 1500)
        self.assertEqual(oshb.CORPUS_TOTAL_MAX, 4000)

    def test_ruth_single_marker_in_one_chapter_is_VALID(self):
        # REGRESSION FENCE FOR THE REFUTED DISTRIBUTION FLOOR.
        # Ruth carries exactly one petuchah, at 4:17, in a 4-chapter book —
        # and that is AC-2 GROUND TRUTH. The plan's floor ("markers must span
        # more than one chapter in a multi-chapter book") hard-failed the
        # single best-verified book in the corpus. The floor was dropped, not
        # re-tuned: per-seg-type parity already catches every corruption class
        # it reached for. This test exists so nobody reinstates it.
        oshb.validate_degeneracy("Ruth", ["4:17"], [], chapter_count=4)

    def test_repeated_anchor_is_LEGITIMATE_and_does_not_raise(self):
        # CORRECTED AGAINST THE CORPUS. 29 genuine repeated anchors across 7
        # books: Neh 3:2/3:23/3:29 (the wall-builders list), Ezra 3:1,
        # Deut 5:21, 1Chr, 2Chr, 2Sam, Ezek. Each is two x-samekh elements as
        # direct children of one <verse>. In a list passage, multiple section
        # breaks inside a single verse is exactly the expected shape.
        oshb.validate_degeneracy("Neh", [], ["3:2", "3:2", "3:23"], chapter_count=13)

    def test_stalled_cursor_collapsing_every_anchor_to_one_value_hard_fails(self):
        # What the naive duplicate check was REACHING for, stated precisely.
        # A stalled verse cursor emits the right COUNT with every anchor
        # collapsed to a single value. Parity cannot see this (the count is
        # correct), so this check is genuinely load-bearing.
        with self.assertRaises(Exception) as ctx:
            oshb.validate_degeneracy("Lev", [], ["1:1"] * 12, chapter_count=27)
        self.assertIn("Lev", str(ctx.exception))

    def test_genuine_repeats_alongside_distinct_anchors_do_not_trip_the_check(self):
        # Realistic Nehemiah shape: many markers, several genuine repeats
        # inside the builder-list, and plenty of distinct anchors. This is the
        # case the naive duplicate check wrongly rejected.
        setumot = ["3:2", "3:2", "3:23", "3:23", "3:29", "3:29"] + [
            f"{c}:{v}" for c in range(4, 13) for v in (1, 5)
        ]
        oshb.validate_degeneracy("Neh", [], setumot, chapter_count=13)

    def test_a_lone_marker_on_one_verse_stays_valid(self):
        # Below the stalled-cursor threshold by construction — Ruth proves a
        # book may legitimately carry a single marker.
        oshb.validate_degeneracy("Jonah", ["1:1"], [], chapter_count=4)


class TestHighDensityIsNotAnError(unittest.TestCase):
    """Lamentations fence. Named so a future maintainer cannot re-add a
    threshold "for safety" without deleting a test that says why not.

    Lamentations is 89 markers / 154 verses = 0.578 markers-per-verse, which
    sits INSIDE the band issue #118 called diagnostic of corruption. It is
    genuine: the count tracks the 22-letter acrostic (ch. 1-4 = 22 each,
    ch. 5 = 1, non-acrostic), a shape a miscount cannot produce. Any density
    ceiling low enough to catch the original corruption also fires here.
    """

    def test_density_of_0_578_validates_clean(self):
        verses = {f"{c}:{v}" for c in range(1, 6) for v in range(1, 40)}
        petuchot = [f"{c}:1" for c in range(1, 6)]
        setumot = [f"{c}:{v}" for c in range(1, 5) for v in range(2, 23)]
        # Must not raise: density is a reported observable, never a gate.
        oshb.validate_book("Lam", petuchot, setumot, verses, {"x-pe": 5, "x-samekh": 84})

    def test_no_density_threshold_constants_survive_in_the_module(self):
        # The gate was RETIRED, not re-tuned. If someone reintroduces a
        # threshold constant, this fails and points them at the census.
        for dead in ("DENSITY_CEILING", "DENSITY_FLOOR", "MAX_DENSITY", "MIN_DENSITY"):
            self.assertFalse(
                hasattr(oshb, dead),
                f"{dead} reintroduces a retired gate; genuine densities span "
                "0.0 (Ps, Obad) to 0.578 (Lam), so no threshold discriminates",
            )


if __name__ == "__main__":
    unittest.main()
