#!/usr/bin/env python3
"""Tests for etl-theographic.py place canonicalization.

Structural suite is fixture-driven and network-free.
Corpus suite (`--corpus`) requires the pinned Theographic JSON cache and is
run in the production backfill workflow before D1 is touched.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import List, Optional

SCRIPTS_DIR = Path(__file__).resolve().parent
CORPUS = "--corpus" in sys.argv
if CORPUS:
    sys.argv.remove("--corpus")

SPEC = importlib.util.spec_from_file_location("etl_theographic", SCRIPTS_DIR / "etl-theographic.py")
etl = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = etl
SPEC.loader.exec_module(etl)


def place(
    airtable_id: str,
    place_id: Optional[int],
    *,
    duplicate_of: Optional[List[str]] = None,
    name: str = "Place",
) -> dict:
    fields: dict = {"placeID": place_id, "kjvName": name, "displayTitle": name}
    if duplicate_of is not None:
        fields["duplicate_of"] = duplicate_of
    return {"id": airtable_id, "fields": fields}


class PlaceResolutionTests(unittest.TestCase):
    def test_single_hop_duplicate_resolution(self):
        places = [
            place("recCanon", 100, name="Canonical"),
            place("recDup", 200, duplicate_of=["recCanon"], name="Alias"),
        ]
        resolution = etl.resolve_places(places)
        self.assertEqual(resolution.airtable_to_canonical["recDup"], 100)
        self.assertEqual(resolution.duplicate_to_canonical[200], 100)
        self.assertEqual(resolution.canonical_place_ids, {100})

    def test_two_hop_duplicate_resolution(self):
        places = [
            place("recJerusalem", 636, name="Jerusalem"),
            place("recZion", 1263, duplicate_of=["recJerusalem"], name="Zion"),
            place("recZions", 1264, duplicate_of=["recZion"], name="Zion's"),
        ]
        resolution = etl.resolve_places(places)
        self.assertEqual(resolution.airtable_to_canonical["recZion"], 636)
        self.assertEqual(resolution.airtable_to_canonical["recZions"], 636)
        self.assertEqual(resolution.duplicate_to_canonical[1263], 636)
        self.assertEqual(resolution.duplicate_to_canonical[1264], 636)

    def test_cycle_fails(self):
        places = [
            place("recA", 1, duplicate_of=["recB"]),
            place("recB", 2, duplicate_of=["recA"]),
        ]
        with self.assertRaisesRegex(ValueError, "Cycle"):
            etl.resolve_places(places)

    def test_missing_target_fails(self):
        places = [place("recDup", 1, duplicate_of=["recMissing"])]
        with self.assertRaisesRegex(ValueError, "missing"):
            etl.resolve_places(places)

    def test_multiple_targets_fails(self):
        places = [
            place("recCanon", 100),
            place("recOther", 101),
            place("recDup", 1, duplicate_of=["recCanon", "recOther"]),
        ]
        with self.assertRaisesRegex(ValueError, "multiple duplicate_of"):
            etl.resolve_places(places)

    def test_terminal_without_place_id_fails(self):
        places = [
            {"id": "recCanon", "fields": {"kjvName": "Broken"}},
            place("recDup", 1, duplicate_of=["recCanon"]),
        ]
        with self.assertRaisesRegex(ValueError, "no placeID"):
            etl.resolve_places(places)

    def test_people_and_events_duplicate_of_rejected(self):
        people = [{"id": "p1", "fields": {"personID": 1, "duplicate_of": ["p2"]}}]
        events = [{"id": "e1", "fields": {"eventID": 1}}]
        with self.assertRaisesRegex(ValueError, "people"):
            etl.reject_duplicate_of_on_people_or_events(people, events)

        people = [{"id": "p1", "fields": {"personID": 1}}]
        events = [{"id": "e1", "fields": {"eventID": 1, "duplicate_of": ["e2"]}}]
        with self.assertRaisesRegex(ValueError, "events"):
            etl.reject_duplicate_of_on_people_or_events(people, events)

    def test_unresolved_verse_place_reference_fails(self):
        places = [place("recCanon", 100)]
        resolution = etl.resolve_places(places)
        verses = [
            {
                "id": "v1",
                "fields": {
                    "osisRef": "Ps.126.1",
                    "places": ["recMissing"],
                },
            }
        ]
        with self.assertRaisesRegex(ValueError, "Unresolved verse place"):
            etl.materialize_verse_places(verses, resolution)

    def test_junction_tables_contain_only_canonical_ids(self):
        places = [
            place("recJerusalem", 636, name="Jerusalem"),
            place("recZion", 1263, duplicate_of=["recJerusalem"], name="Zion"),
            place("recZions", 1264, duplicate_of=["recZion"], name="Zion's"),
            place("recOther", 50, name="Other"),
        ]
        resolution = etl.resolve_places(places)
        verses = [
            {
                "id": "v1",
                "fields": {"osisRef": "Ps.126.1", "places": ["recZion"]},
            },
            {
                "id": "v2",
                "fields": {"osisRef": "Ps.2.6", "places": ["recZions", "recJerusalem"]},
            },
            {
                "id": "v3",
                "fields": {"osisRef": "Gen.1.1", "places": ["recOther"]},
            },
        ]
        events = [
            {
                "id": "e1",
                "fields": {
                    "eventID": 9,
                    "locations": ["recZions", "recOther"],
                },
            }
        ]
        verse_rows = etl.materialize_verse_places(verses, resolution)
        event_rows = etl.materialize_event_locations(events, {"e1": 9}, resolution)

        self.assertEqual(
            verse_rows,
            [
                ("genesis", 1, 1, 50),
                ("psalms", 2, 6, 636),
                ("psalms", 126, 1, 636),
            ],
        )
        self.assertEqual(event_rows, [(9, 50), (9, 636)])
        self.assertTrue(all(pid in resolution.canonical_place_ids for *_, pid in verse_rows))
        self.assertTrue(all(pid in resolution.canonical_place_ids for _, pid in event_rows))

        counts = etl.appearance_counts_from_verse_places(verse_rows)
        self.assertEqual(counts[636], 2)
        self.assertEqual(counts[50], 1)

    def test_place_redirect_artifacts_are_deterministic(self):
        places = [
            place("recJerusalem", 636, name="Jerusalem"),
            place("recZion", 1263, duplicate_of=["recJerusalem"], name="Zion"),
            place("recZions", 1264, duplicate_of=["recZion"], name="Zion's"),
        ]
        resolution = etl.resolve_places(places)

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            first = etl.render_place_redirect_artifacts(resolution, out)
            head1 = (out / "theographic-place-redirect-head.sql").read_text(encoding="utf-8")
            apply1 = (out / "theographic-place-redirect-apply.sql").read_text(encoding="utf-8")
            tail1 = (out / "theographic-place-redirect-tail.sql").read_text(encoding="utf-8")

            second = etl.render_place_redirect_artifacts(resolution, out)
            head2 = (out / "theographic-place-redirect-head.sql").read_text(encoding="utf-8")
            apply2 = (out / "theographic-place-redirect-apply.sql").read_text(encoding="utf-8")
            tail2 = (out / "theographic-place-redirect-tail.sql").read_text(encoding="utf-8")

        self.assertEqual(first, second)
        self.assertEqual(head1, head2)
        self.assertEqual(apply1, apply2)
        self.assertEqual(tail1, tail2)
        self.assertEqual(first["duplicate_mapping_count"], 2)
        self.assertIn("INSERT OR IGNORE INTO verse_places", apply1)
        self.assertIn("INSERT OR IGNORE INTO event_locations", apply1)
        self.assertIn("DELETE FROM verse_places", apply1)
        self.assertIn("DELETE FROM event_locations", apply1)
        self.assertIn("UPDATE places", apply1)
        self.assertIn("DROP TABLE IF EXISTS theographic_place_redirect", head1)
        self.assertIn("DROP TABLE IF EXISTS theographic_place_redirect", tail1)
        self.assertIn("(1263, 636)", head1)
        self.assertIn("(1264, 636)", head1)

    def test_checksum_drift_fails(self):
        raw = {name: b"{}" for name in etl.INPUT_FILES}
        manifest = etl.build_checksum_manifest(raw)
        manifest["files"]["places.json"] = "bad"
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            etl.verify_checksums(manifest, raw)


@unittest.skipUnless(CORPUS, "corpus tests require --corpus and pinned cache")
class TheographicCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cache_dir = SCRIPTS_DIR.parent / ".cache" / "theographic"
        raw_files = etl.load_inputs(cache_dir)
        manifest = json.loads(etl.CHECKSUM_FILE.read_text(encoding="utf-8"))
        etl.verify_checksums(manifest, raw_files)
        cls.parsed = etl.parse_json_inputs(raw_files)
        etl.reject_duplicate_of_on_people_or_events(
            cls.parsed["people.json"], cls.parsed["events.json"]
        )
        cls.resolution = etl.resolve_places(cls.parsed["places.json"])
        cls.verse_places = etl.materialize_verse_places(
            cls.parsed["verses.json"], cls.resolution
        )
        event_by_airtable = {
            entry["id"]: entry["fields"]["eventID"]
            for entry in cls.parsed["events.json"]
            if entry["fields"].get("eventID") is not None
        }
        cls.event_locations = etl.materialize_event_locations(
            cls.parsed["events.json"], event_by_airtable, cls.resolution
        )
        cls.counts = etl.appearance_counts_from_verse_places(cls.verse_places)

    def test_duplicate_and_orphan_counts(self):
        self.assertEqual(len(self.resolution.duplicate_to_canonical), 27)
        # Three chained duplicates: Jebusite, Sirion, Zion's
        chained = []
        by_id = {
            e["fields"]["placeID"]: e
            for e in self.parsed["places.json"]
            if e["fields"].get("placeID") is not None
        }
        for source_id in self.resolution.duplicate_to_canonical:
            hops = 0
            current = by_id[source_id]
            while current["fields"].get("duplicate_of"):
                hops += 1
                target = current["fields"]["duplicate_of"][0]
                current = next(e for e in self.parsed["places.json"] if e["id"] == target)
                if hops > 10:
                    break
            if hops >= 2:
                chained.append(source_id)
        self.assertEqual(len(chained), 3)

        # Historical orphan shape under the buggy lookup (duplicate IDs emitted as-is)
        buggy = {}
        canonical = set()
        for entry in self.parsed["places.json"]:
            pid = entry["fields"].get("placeID")
            if pid is None:
                continue
            buggy[entry["id"]] = pid
            if not entry["fields"].get("duplicate_of"):
                canonical.add(pid)

        orphan_ids = set()
        verse_orphan_rows = 0
        for entry in self.parsed["verses.json"]:
            for ref in entry["fields"].get("places") or []:
                pid = buggy.get(ref)
                if pid is not None and pid not in canonical:
                    orphan_ids.add(pid)
                    verse_orphan_rows += 1
        event_orphan_rows = 0
        for entry in self.parsed["events.json"]:
            for ref in entry["fields"].get("locations") or []:
                pid = buggy.get(ref)
                if pid is not None and pid not in canonical:
                    orphan_ids.add(pid)
                    event_orphan_rows += 1

        self.assertEqual(len(orphan_ids), 21)
        self.assertEqual(verse_orphan_rows, 234)
        self.assertEqual(event_orphan_rows, 6)
        self.assertEqual(verse_orphan_rows + event_orphan_rows, 240)

    def test_every_generated_junction_id_is_canonical(self):
        for *_coords, place_id in self.verse_places:
            self.assertIn(place_id, self.resolution.canonical_place_ids)
        for _event_id, place_id in self.event_locations:
            self.assertIn(place_id, self.resolution.canonical_place_ids)

    def test_zion_resolves_to_jerusalem(self):
        self.assertEqual(self.resolution.duplicate_to_canonical[1263], 636)
        self.assertEqual(self.resolution.duplicate_to_canonical[1264], 636)

    def test_psalm_126_place_tags(self):
        psalm_126 = {
            (chapter, verse, place_id)
            for book, chapter, verse, place_id in self.verse_places
            if book == "psalms" and chapter == 126
        }
        self.assertIn((126, 1, 636), psalm_126)
        self.assertFalse(any(verse == 4 for _chapter, verse, _pid in psalm_126))

    def test_jerusalem_appearance_count(self):
        self.assertEqual(self.counts[636], 858)

    def test_redirect_manifest_mapping_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = etl.render_place_redirect_artifacts(self.resolution, Path(tmp))
        self.assertEqual(manifest["duplicate_mapping_count"], 27)
        self.assertEqual(len(manifest["mappings"]), 27)


if __name__ == "__main__":
    unittest.main()
