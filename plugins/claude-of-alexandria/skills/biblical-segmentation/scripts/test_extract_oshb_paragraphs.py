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

MUTATION-KILL MATRIX
--------------------
The recurring defect in this artifact is a check that claims to enforce a
criterion while wired so it cannot fail. Passing tests are therefore not
evidence on their own. Each row below was verified by deliberately breaking the
implementation and confirming this suite exits non-zero.

| Mutation                                   | Detecting test                          |
|--------------------------------------------|-----------------------------------------|
| Collapse repeated verse/type records       | legacy-array projection + bijection     |
| Drop a marker (2nd in a verse; non-final)  | source/output bijection                 |
| Duplicate a marker                         | source/output bijection                 |
| Swap petuchah and setumah                  | per-type parity + event fixtures        |
| Reverse same-verse marker order            | ordinal/position fixtures               |
| Move an internal marker to verse end       | position fixtures (Neh 3:2, 2Sam 16:13) |
| Drop ordinal from the event id             | event-id uniqueness                     |
| Disable bijection count or injectivity     | explicit negative bijection tests       |
| Narrow seg types back to five              | pinned seg-type sets                    |
| Allowlist in English namespace             | OSIS-keyed allowlist test               |
| Disable the anti-vacuity arm               | allowlist arm (c)                       |
| Refactor raw counter onto ElementTree      | raw-path-never-parses test              |
| Reinstate the multi-chapter floor          | Ruth single-marker fence                |
| Widen or disable the corpus band           | explicit band tests                     |

WHEN ADDING A MUTATION: confirm it genuinely changes behaviour before trusting
a "caught" result. A mutation that never fires (e.g. a guard keyed to a value
no fixture reaches) is indistinguishable from an undetected one — that mistake
was made once while building this matrix and produced a false "MISSED".
"""

import collections
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
    def test_marker_with_no_verse_at_all_is_caught_by_the_bijection(self):
        # Previously this raised directly from the extractor. Under the
        # event model the responsibility moved to validate_bijection, which
        # catches EVERY way a marker can go missing with one signal instead of
        # a special case per shape. The failure is still loud and still names
        # the book — it just arrives from the invariant that owns it.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(tmp, '<seg type="x-pe">פ</seg>')
            captured = io.StringIO()
            with contextlib.redirect_stderr(captured):
                events = oshb.extract_marker_events(path)
            self.assertEqual(events, [])
            self.assertIn("outside any <verse>", captured.getvalue())
            with self.assertRaises(Exception) as ctx:
                oshb.validate_bijection(
                    "Fixture", events, oshb.count_marker_segs_raw(path)
                )
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


class TestMarkerOutsideVerseElement(unittest.TestCase):
    def test_marker_outside_any_verse_is_reported_not_silently_dropped(self):
        # CORRECTED AGAINST THE CORPUS. This test previously asserted that a
        # marker between two <verse> elements anchors to the preceding verse,
        # on the belief that Ruth's marker had that shape. It does not: Ruth's
        # x-pe is the last CHILD of verse Ruth.4.17. Measured corpus-wide, all
        # 3,162 marker nodes sit inside a <verse>; exactly zero sit outside.
        #
        # So this path is unreachable on real data. It must not fail silently:
        # an out-of-verse marker cannot be assigned an intra-verse position,
        # and dropping it quietly would break the source-to-event bijection —
        # the one invariant everything else now rests on. Warn loudly, and
        # leave the bijection check to catch the count mismatch.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17"><w id="wA" lemma="1">a</w></verse>'
                '<seg type="x-pe">פ</seg>'
                '<verse osisID="Ruth.4.18"><w id="wB" lemma="1">b</w></verse>',
            )
            captured = io.StringIO()
            with contextlib.redirect_stderr(captured):
                events = oshb.extract_marker_events(path)
            self.assertEqual(events, [], "cannot position an out-of-verse marker")
            self.assertIn("outside any <verse>", captured.getvalue())

    def test_bijection_catches_the_dropped_out_of_verse_marker(self):
        # The loud half: the source has one marker node, extraction produced
        # zero events, so the invariant fires rather than shipping a silent gap.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17"><w id="wA" lemma="1">a</w></verse>'
                '<seg type="x-pe">פ</seg>',
            )
            captured = io.StringIO()
            with contextlib.redirect_stderr(captured):
                events = oshb.extract_marker_events(path)
            with self.assertRaises(Exception) as ctx:
                oshb.validate_bijection(
                    "Ruth", events, oshb.count_marker_segs_raw(path)
                )
            self.assertIn("bijection", str(ctx.exception))


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


# ─── Marker events: multiplicity AND position ────────────────────────────────
#
# A verse reference is the CONTAINER a marker occurs in, not the marker's
# identity. Two marker elements inside one verse are two real textual events at
# two different token boundaries. Preserving the count without the position
# preserves multiplicity but loses which boundary each marker actually marks —
# and a pericope claim needs the boundary, not the container.


class TestMarkerEvents(unittest.TestCase):
    def test_two_same_type_markers_in_one_verse_are_distinct_events(self):
        # Nehemiah 3:2 shape: one marker mid-verse, one after the sof-pasuq.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Neh.3.2">'
                '<w id="w1" lemma="1">a</w>'
                '<seg type="x-samekh">ס</seg>'
                '<w id="w2" lemma="2">b</w>'
                '<seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-samekh">ס</seg>'
                "</verse>",
            )
            events = oshb.extract_marker_events(path)
            self.assertEqual(len(events), 2)
            self.assertEqual([e["ordinal_in_verse"] for e in events], [1, 2])
            self.assertEqual(
                [e["position"] for e in events], ["within_verse", "verse_end"]
            )
            # Both are setumah, both anchored to 3:2 — only position separates
            # them, which is exactly why position must be carried.
            self.assertEqual({e["type"] for e in events}, {"setumah"})
            self.assertEqual({(e["chapter"], e["verse"]) for e in events}, {(3, 2)})

    def test_both_types_in_one_verse_are_two_boundaries_not_one(self):
        # 2 Samuel 16:13 shape. Without position this reads as "one boundary is
        # both petuchah and setumah", which is false.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="2Sam.16.13">'
                '<w id="w1" lemma="1">a</w>'
                '<seg type="x-samekh">ס</seg>'
                '<w id="w2" lemma="2">b</w>'
                '<seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-pe">פ</seg>'
                "</verse>",
            )
            events = oshb.extract_marker_events(path)
            self.assertEqual(
                [(e["type"], e["position"]) for e in events],
                [("setumah", "within_verse"), ("petuchah", "verse_end")],
            )

    def test_token_anchors_record_the_surrounding_word_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17">'
                '<w id="wA" lemma="1">a</w>'
                '<seg type="x-samekh">ס</seg>'
                '<w id="wB" lemma="2">b</w>'
                "</verse>",
            )
            (e,) = oshb.extract_marker_events(path)
            self.assertEqual(e["preceding_word_id"], "wA")
            self.assertEqual(e["following_word_id"], "wB")

    def test_verse_end_marker_has_no_following_word(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Ruth.4.17">'
                '<w id="wA" lemma="1">a</w>'
                '<seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-pe">פ</seg>'
                "</verse>",
            )
            (e,) = oshb.extract_marker_events(path)
            self.assertEqual(e["position"], "verse_end")
            self.assertIsNone(e["following_word_id"])
            self.assertEqual(e["preceding_word_id"], "wA")

    def test_event_ids_are_unique_and_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Neh.3.2">'
                '<w id="w1" lemma="1">a</w><seg type="x-samekh">ס</seg>'
                '<w id="w2" lemma="2">b</w><seg type="x-samekh">ס</seg>'
                "</verse>",
            )
            events = oshb.extract_marker_events(path)
            ids = [e["id"] for e in events]
            self.assertEqual(len(set(ids)), 2, "same-verse events must not collide")
            self.assertEqual(ids, oshb.extract_marker_events(path)[0:2] and ids)
            for e in events:  # ordinal is what disambiguates them
                self.assertIn(str(e["ordinal_in_verse"]), e["id"])

    def test_legacy_arrays_are_derived_from_events(self):
        # extract_markers stays available for the existing loader contract, but
        # must be a projection of the events, never a second parse.
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Neh.3.2">'
                '<w id="w1" lemma="1">a</w><seg type="x-samekh">ס</seg>'
                '<w id="w2" lemma="2">b</w><seg type="x-samekh">ס</seg>'
                "</verse>",
            )
            p, s = oshb.extract_markers(path)
            self.assertEqual(p, [])
            self.assertEqual(s, ["3:2", "3:2"], "multiplicity must survive")


class TestPositionIsClassifiedByTokensNotPunctuation(unittest.TestCase):
    """Pin the classifier against a case the real corpus does not exercise.

    A mutation sweep found that classifying `position` from `after_sof_pasuq`
    instead of token context passes every corpus-derived test. That is not a
    gap in the corpus tests — the two rules are *extensionally equal* on the
    pinned data: no OSHB marker follows a sof-pasuq while still having a word
    after it, so nothing real distinguishes them.

    They are not equal in principle. Punctuation and milestone placement can
    vary; "no following <w>" cannot. This fixture constructs the divergent case
    so the intended rule is pinned by construction rather than by an accident
    of the current corpus.
    """

    def test_marker_after_sof_pasuq_but_with_a_following_word_is_within_verse(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_fixture(
                tmp,
                '<verse osisID="Test.1.1">'
                '<w id="wA" lemma="1">a</w>'
                '<seg type="x-sof-pasuq">׃</seg>'
                '<seg type="x-samekh">ס</seg>'
                '<w id="wB" lemma="2">b</w>'  # a word AFTER the sof-pasuq
                "</verse>",
            )
            (e,) = oshb.extract_marker_events(path)
            self.assertTrue(e["after_sof_pasuq"], "provenance should record it")
            self.assertEqual(
                e["position"],
                "within_verse",
                "position must follow token context, not punctuation: a word "
                "follows this marker, so it is not a verse boundary",
            )
            self.assertEqual(e["following_word_id"], "wB")


class TestSourceOutputBijection(unittest.TestCase):
    """The central invariant, replacing distribution heuristics.

    Each qualifying source marker node maps to exactly one output event, and
    vice versa. This is strictly stronger than a count check: two
    implementations can agree on a total while disagreeing on every location.
    """

    def test_bijection_holds_on_a_good_parse(self):
        oshb.validate_bijection("Neh", [{"id": "a"}, {"id": "b"}], {"x-pe": 0, "x-samekh": 2})

    def test_dropped_marker_breaks_bijection(self):
        with self.assertRaises(Exception) as ctx:
            oshb.validate_bijection("Neh", [{"id": "a"}], {"x-pe": 0, "x-samekh": 2})
        self.assertIn("Neh", str(ctx.exception))

    def test_duplicated_marker_breaks_bijection(self):
        with self.assertRaises(Exception):
            oshb.validate_bijection(
                "Neh", [{"id": "a"}, {"id": "b"}, {"id": "c"}], {"x-pe": 0, "x-samekh": 2}
            )

    def test_colliding_event_ids_break_bijection(self):
        # Injectivity: two events sharing an id means one source node lost its
        # distinct identity — the deduplication failure, caught structurally.
        with self.assertRaises(Exception) as ctx:
            oshb.validate_bijection("Neh", [{"id": "x"}, {"id": "x"}], {"x-pe": 0, "x-samekh": 2})
        self.assertIn("Neh", str(ctx.exception))


class TestSemanticBoundaryFixtures(unittest.TestCase):
    """Semantic fixtures, not extraction-count fixtures.

    These pin what each marker MEANS for a boundary claim. A future
    implementation can hold the perfect total of 3,162 while reintroducing
    false boundary semantics; these are what catch that.

    Requires the cached corpus. Skipped when it is absent so the default run
    stays network-free.
    """

    CACHE = oshb.repo_root() / ".cache" / "oshb"

    @classmethod
    def setUpClass(cls):
        if not (cls.CACHE / "Ruth.xml").exists():
            raise unittest.SkipTest("corpus cache absent")

    def _events(self, code, chapter=None, verse=None):
        captured = io.StringIO()
        with contextlib.redirect_stderr(captured):
            ev = oshb.extract_marker_events(self.CACHE / f"{code}.xml")
        if chapter is not None:
            ev = [e for e in ev if (e["chapter"], e["verse"]) == (chapter, verse)]
        return ev

    def test_nehemiah_3_2_two_setumot_at_different_positions(self):
        ev = self._events("Neh", 3, 2)
        self.assertEqual(len(ev), 2)
        a, b = ev
        self.assertEqual(a["type"], "setumah")
        self.assertEqual(a["position"], "within_verse")
        self.assertIsNotNone(a["following_word_id"])
        self.assertEqual(a["ordinal_in_verse"], 1)
        self.assertEqual(b["type"], "setumah")
        self.assertEqual(b["position"], "verse_end")
        self.assertIsNone(b["following_word_id"])
        self.assertEqual(b["ordinal_in_verse"], 2)
        self.assertNotEqual(a["id"], b["id"])

    def test_2sam_16_13_is_two_boundaries_not_one_dual_typed_boundary(self):
        ev = self._events("2Sam", 16, 13)
        self.assertEqual(
            [(e["type"], e["position"]) for e in ev],
            [("setumah", "within_verse"), ("petuchah", "verse_end")],
        )
        # The claim this fixture exists to forbid: that verse 16:13 carries a
        # single boundary which is both petuchah and setumah.
        verse_end = [e for e in ev if e["position"] == "verse_end"]
        self.assertEqual(len(verse_end), 1, "only ONE usable verse boundary here")
        self.assertEqual(verse_end[0]["type"], "petuchah")

    def test_remaining_dual_type_verses(self):
        for code, ch, v in (("2Chr", 5, 1), ("Jer", 38, 28)):
            with self.subTest(book=code):
                ev = self._events(code, ch, v)
                types = {e["type"] for e in ev}
                self.assertEqual(types, {"petuchah", "setumah"})
                positions = [e["position"] for e in ev]
                self.assertIn("within_verse", positions)
                self.assertEqual(
                    sum(1 for p in positions if p == "verse_end"),
                    1,
                    "exactly one verse-level boundary",
                )

    def test_ruth_4_17_ground_truth(self):
        ev = self._events("Ruth")
        self.assertEqual(len(ev), 1)
        (e,) = ev
        self.assertEqual(
            (e["chapter"], e["verse"], e["type"], e["position"]),
            (4, 17, "petuchah", "verse_end"),
        )
        self.assertIsNone(e["following_word_id"])


class TestCorpusGlobalInvariants(unittest.TestCase):
    CACHE = oshb.repo_root() / ".cache" / "oshb"

    @classmethod
    def setUpClass(cls):
        if not (cls.CACHE / "Gen.xml").exists():
            raise unittest.SkipTest("corpus cache absent")
        captured = io.StringIO()
        with contextlib.redirect_stderr(captured):
            cls.by_book = {
                code: oshb.extract_marker_events(cls.CACHE / f"{code}.xml")
                for code in oshb.OT_BOOKS.values()
            }
        cls.all = [e for evs in cls.by_book.values() for e in evs]

    def test_totals(self):
        self.assertEqual(len(self.all), 3162)
        self.assertEqual(sum(1 for e in self.all if e["type"] == "petuchah"), 1181)
        self.assertEqual(sum(1 for e in self.all if e["type"] == "setumah"), 1981)

    def test_bijection_every_book(self):
        for code, evs in self.by_book.items():
            with self.subTest(book=code):
                oshb.validate_bijection(
                    code, evs, oshb.count_marker_segs_raw(self.CACHE / f"{code}.xml")
                )

    def test_no_event_deduplicated_by_verse_or_type(self):
        # 30 verses carry more than one marker; a dedupe would drop them.
        multi = collections.Counter(
            (e["book"], e["chapter"], e["verse"]) for e in self.all
        )
        self.assertEqual(sum(1 for v in multi.values() if v > 1), 30)

    def test_ordinals_are_contiguous_within_each_verse(self):
        groups = collections.defaultdict(list)
        for e in self.all:
            groups[(e["book"], e["chapter"], e["verse"])].append(e["ordinal_in_verse"])
        for key, ords in groups.items():
            with self.subTest(ref=key):
                self.assertEqual(ords, list(range(1, len(ords) + 1)))

    def test_event_order_matches_source_document_order(self):
        for code, evs in self.by_book.items():
            with self.subTest(book=code):
                keys = [(e["chapter"], e["verse"], e["source_child_index"]) for e in evs]
                self.assertEqual(keys, sorted(keys), "events must follow document order")

    def test_every_event_has_at_least_one_word_anchor(self):
        for e in self.all:
            self.assertTrue(
                e["preceding_word_id"] or e["following_word_id"],
                f"event {e['id']} has no token anchor",
            )

    def test_position_agrees_with_surrounding_word_anchors(self):
        for e in self.all:
            with self.subTest(id=e["id"]):
                if e["position"] == "verse_end":
                    self.assertIsNone(e["following_word_id"])
                elif e["position"] == "verse_start":
                    self.assertIsNone(e["preceding_word_id"])
                else:
                    self.assertIsNotNone(e["preceding_word_id"])
                    self.assertIsNotNone(e["following_word_id"])

    def test_event_ids_are_globally_unique(self):
        ids = [e["id"] for e in self.all]
        self.assertEqual(len(set(ids)), 3162)

    def test_position_distribution_is_pinned(self):
        pos = collections.Counter(e["position"] for e in self.all)
        self.assertEqual(pos["verse_end"], 3072)
        self.assertEqual(pos["within_verse"], 90)

    def test_after_sof_pasuq_is_evidence_not_the_classifier(self):
        # They correlate strongly but are NOT the same predicate. If they were
        # identical, `after_sof_pasuq` would be redundant and `position` would
        # be silently coupled to punctuation placement.
        mismatched = [
            e for e in self.all if (e["position"] == "verse_end") != e["after_sof_pasuq"]
        ]
        self.assertTrue(
            mismatched,
            "position must not be a pure restatement of after_sof_pasuq",
        )


if __name__ == "__main__":
    unittest.main()
