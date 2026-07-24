#!/usr/bin/env python3
"""
Theographic Entity ETL — extract people, places, events, relationships, groups.

Downloads Theographic Bible Metadata JSON files from a pinned GitHub commit,
verifies SHA-256 checksums, and transforms them into chunked SQL seed files for
Cloudflare D1.

Usage:
    cd server && python3 scripts/etl-theographic.py
    cd server && python3 scripts/etl-theographic.py --emit place-redirect
    cd server && python3 scripts/etl-theographic.py --write-checksums

Output (default full ETL):
    d1-seed/entities-people.sql
    d1-seed/entities-places.sql
    d1-seed/entities-events.sql
    d1-seed/entities-groups.sql
    d1-seed/entities-relationships.sql
    d1-seed/verse-people-NNN.sql
    d1-seed/verse-places-NNN.sql
    d1-seed/verse-events.sql
    d1-seed/event-participants.sql
    d1-seed/event-locations.sql

Output (--emit place-redirect):
    d1-seed/theographic-place-redirect-head.sql
    d1-seed/theographic-place-redirect-apply.sql
    d1-seed/theographic-place-redirect-tail.sql
    d1-seed/theographic-place-redirect-manifest.json

Source:
    Theographic Bible Metadata (CC BY-SA 4.0)
    https://github.com/robertrouse/theographic-bible-metadata
    TIPNR by Tyndale House Cambridge / STEPBible.org (CC BY 4.0)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

# ─── Configuration ────────────────────────────────────────────────────────────

THEOGRAPHIC_COMMIT = "cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc"
BASE_URL = (
    "https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/"
    f"{THEOGRAPHIC_COMMIT}/json"
)
INPUT_FILES = (
    "people.json",
    "places.json",
    "events.json",
    "verses.json",
    "peopleGroups.json",
)
CHECKSUM_FILE = Path(__file__).resolve().parent / "theographic-checksums.json"
SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "theographic"
BATCH_SIZE = 100  # rows per INSERT statement
CHUNK_SIZE = 10_000  # rows per SQL file for large tables
STAGING_TABLE = "theographic_place_redirect"

# ─── OSIS to canonical book name mapping (matches books.ts) ──────────────────

OSIS_TO_CANONICAL = {
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus",
    "Num": "numbers", "Deut": "deuteronomy", "Josh": "joshua",
    "Judg": "judges", "Ruth": "ruth", "1Sam": "1_samuel",
    "2Sam": "2_samuel", "1Kgs": "1_kings", "2Kgs": "2_kings",
    "1Chr": "1_chronicles", "2Chr": "2_chronicles", "Ezra": "ezra",
    "Neh": "nehemiah", "Esth": "esther", "Job": "job",
    "Ps": "psalms", "Prov": "proverbs", "Eccl": "ecclesiastes",
    "Song": "song_of_songs", "Isa": "isaiah", "Jer": "jeremiah",
    "Lam": "lamentations", "Ezek": "ezekiel", "Dan": "daniel",
    "Hos": "hosea", "Joel": "joel", "Amos": "amos",
    "Obad": "obadiah", "Jonah": "jonah", "Mic": "micah",
    "Nah": "nahum", "Hab": "habakkuk", "Zeph": "zephaniah",
    "Hag": "haggai", "Zech": "zechariah", "Mal": "malachi",
    "Matt": "matthew", "Mark": "mark", "Luke": "luke",
    "John": "john", "Acts": "acts", "Rom": "romans",
    "1Cor": "1_corinthians", "2Cor": "2_corinthians", "Gal": "galatians",
    "Eph": "ephesians", "Phil": "philippians", "Col": "colossians",
    "1Thess": "1_thessalonians", "2Thess": "2_thessalonians",
    "1Tim": "1_timothy", "2Tim": "2_timothy", "Titus": "titus",
    "Phlm": "philemon", "Heb": "hebrews", "Jas": "james",
    "1Pet": "1_peter", "2Pet": "2_peter", "1John": "1_john",
    "2John": "2_john", "3John": "3_john", "Jude": "jude",
    "Rev": "revelation",
}

# Disputed identifications — curated list
DISPUTED_PEOPLE = {
    "junia_1764": "Gender debated: Junia (female, majority view) vs Junias (male). Accusative Ἰουνιαν is ambiguous.",
    "james_717": "Multiple individuals named James in the NT. Identification of 'James the brother of the Lord' with 'James son of Alphaeus' is disputed.",
    "james_718": "Identification debated: James son of Alphaeus may or may not be the same as James the Less (Mark 15:40).",
    "john_1676": "Authorship of Gospel, epistles, and Revelation attributed to same 'John' is disputed across traditions.",
    "mary_1938": "Identification of Mary Magdalene with the sinful woman of Luke 7 and Mary of Bethany is debated.",
    "herod_1504": "Multiple Herods in the NT: Herod the Great, Herod Antipas, Herod Agrippa I, Herod Agrippa II.",
}

# Inverse relationship types for bidirectional storage
INVERSE_RELATIONSHIPS = {
    "father": "child",
    "mother": "child",
    "child": "parent",  # generic parent when direction unknown
    "sibling": "sibling",
    "partner": "partner",
}


@dataclass(frozen=True)
class PlaceResolution:
    """Canonical place mappings after walking duplicate_of chains."""

    airtable_to_canonical: Dict[str, int]
    duplicate_to_canonical: Dict[int, int]
    canonical_place_ids: Set[int]


def sql_escape(value: Any) -> str:
    """Escape single quotes for SQL string literals."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_osis_ref(osis_ref: str) -> Optional[Tuple[str, int, int]]:
    """Parse OSIS reference like 'Gen.1.1' into (canonical_book, chapter, verse)."""
    parts = osis_ref.split(".")
    if len(parts) != 3:
        return None
    book_osis, chapter_str, verse_str = parts
    canonical = OSIS_TO_CANONICAL.get(book_osis)
    if not canonical:
        return None
    try:
        return (canonical, int(chapter_str), int(verse_str))
    except ValueError:
        return None


def write_batched_sql(
    filepath: Path,
    header: str,
    table_name: str,
    columns: Sequence[str],
    rows: Sequence[str],
) -> None:
    """Write rows as batched INSERT OR IGNORE statements to a SQL file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated by etl-theographic.py\n")
        f.write(f"-- {header}\n\n")
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            cols = ", ".join(columns)
            f.write(f"INSERT OR IGNORE INTO {table_name} ({cols}) VALUES\n")
            f.write(",\n".join(batch))
            f.write(";\n\n")
    print(f"  Wrote {len(rows)} rows to {filepath.name}")


def write_chunked_sql(
    seed_dir: Path,
    prefix: str,
    header: str,
    table_name: str,
    columns: Sequence[str],
    rows: Sequence[str],
) -> None:
    """Write rows across multiple chunked files for large tables."""
    total_files = 0
    for chunk_start in range(0, len(rows), CHUNK_SIZE):
        chunk_end = min(chunk_start + CHUNK_SIZE, len(rows))
        chunk = rows[chunk_start:chunk_end]
        file_num = (chunk_start // CHUNK_SIZE) + 1
        filepath = seed_dir / f"{prefix}-{file_num:03d}.sql"
        write_batched_sql(filepath, header, table_name, columns, chunk)
        total_files += 1
    print(f"  Total: {len(rows)} rows across {total_files} files")


def download_bytes(filename: str, cache_dir: Path) -> bytes:
    """Download a pinned JSON file, preferring a local cache."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / filename
    if cache_path.exists():
        data = cache_path.read_bytes()
        print(f"Using cached {filename} ({len(data):,} bytes)")
        return data

    url = f"{BASE_URL}/{filename}"
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/2.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001 — surface download failures loudly
        print(f"  ERROR: Failed to download {filename}: {exc}", file=sys.stderr)
        sys.exit(1)

    cache_path.write_bytes(data)
    print(f"  Downloaded {len(data):,} bytes")
    return data


def load_inputs(cache_dir: Path) -> Dict[str, bytes]:
    return {filename: download_bytes(filename, cache_dir) for filename in INPUT_FILES}


def build_checksum_manifest(raw_files: Dict[str, bytes]) -> dict:
    return {
        "commit": THEOGRAPHIC_COMMIT,
        "files": {name: sha256_bytes(raw_files[name]) for name in sorted(INPUT_FILES)},
    }


def verify_checksums(manifest: dict, raw_files: Dict[str, bytes]) -> None:
    if manifest.get("commit") != THEOGRAPHIC_COMMIT:
        raise ValueError(
            f"Checksum manifest commit {manifest.get('commit')!r} does not match "
            f"extractor pin {THEOGRAPHIC_COMMIT!r}"
        )
    expected = manifest.get("files", {})
    actual = {name: sha256_bytes(data) for name, data in raw_files.items()}
    if expected != actual:
        missing = sorted(set(expected) - set(actual))[:5]
        extra = sorted(set(actual) - set(expected))[:5]
        changed = sorted(
            name for name in set(expected) & set(actual) if expected[name] != actual[name]
        )[:5]
        raise ValueError(
            f"Theographic checksum mismatch. missing={missing} extra={extra} changed={changed}"
        )


def parse_json_inputs(raw_files: Dict[str, bytes]) -> Dict[str, Any]:
    return {name: json.loads(data.decode("utf-8")) for name, data in raw_files.items()}


def reject_duplicate_of_on_people_or_events(
    people_data: Sequence[dict],
    events_data: Sequence[dict],
) -> None:
    """People/events must not carry duplicate_of; that field is places-only."""
    for entry in people_data:
        if entry.get("fields", {}).get("duplicate_of"):
            raise ValueError(
                f"Unexpected duplicate_of on people record {entry.get('id')!r}; "
                "place canonicalization is places-only"
            )
    for entry in events_data:
        if entry.get("fields", {}).get("duplicate_of"):
            raise ValueError(
                f"Unexpected duplicate_of on events record {entry.get('id')!r}; "
                "place canonicalization is places-only"
            )


def _immediate_duplicate_target(fields: dict, airtable_id: str) -> Optional[str]:
    duplicate_of = fields.get("duplicate_of")
    if not duplicate_of:
        return None
    if not isinstance(duplicate_of, list):
        raise ValueError(
            f"Place {airtable_id!r} has non-list duplicate_of: {duplicate_of!r}"
        )
    if len(duplicate_of) != 1:
        raise ValueError(
            f"Place {airtable_id!r} has multiple duplicate_of targets: {duplicate_of!r}"
        )
    target = duplicate_of[0]
    if not isinstance(target, str) or not target:
        raise ValueError(
            f"Place {airtable_id!r} has invalid duplicate_of target: {target!r}"
        )
    return target


def resolve_places(places_data: Sequence[dict]) -> PlaceResolution:
    """Walk duplicate_of chains and return Airtable→canonical and placeID→canonical maps.

    Raises ValueError for cycles, missing targets, terminal records without placeID,
    or multiple duplicate_of targets.
    """
    by_airtable: Dict[str, dict] = {}
    for entry in places_data:
        airtable_id = entry.get("id")
        if not isinstance(airtable_id, str) or not airtable_id:
            raise ValueError(f"Place entry missing Airtable id: {entry!r}")
        by_airtable[airtable_id] = entry.get("fields") or {}

    airtable_to_canonical: Dict[str, int] = {}
    duplicate_to_canonical: Dict[int, int] = {}
    canonical_place_ids: Set[int] = set()

    def resolve_airtable(airtable_id: str, stack: Optional[List[str]] = None) -> int:
        if airtable_id in airtable_to_canonical:
            return airtable_to_canonical[airtable_id]

        if airtable_id not in by_airtable:
            raise ValueError(f"Missing place target for Airtable id {airtable_id!r}")

        stack = list(stack or [])
        if airtable_id in stack:
            cycle = " -> ".join(stack + [airtable_id])
            raise ValueError(f"Cycle in place duplicate_of chain: {cycle}")
        stack.append(airtable_id)

        fields = by_airtable[airtable_id]
        target = _immediate_duplicate_target(fields, airtable_id)
        if target is None:
            place_id = fields.get("placeID")
            if place_id is None:
                raise ValueError(
                    f"Terminal place record {airtable_id!r} has no placeID"
                )
            canonical = int(place_id)
            airtable_to_canonical[airtable_id] = canonical
            canonical_place_ids.add(canonical)
            return canonical

        if target not in by_airtable:
            raise ValueError(
                f"Place {airtable_id!r} duplicate_of target {target!r} is missing"
            )

        canonical = resolve_airtable(target, stack)
        airtable_to_canonical[airtable_id] = canonical

        source_place_id = fields.get("placeID")
        if source_place_id is not None:
            duplicate_to_canonical[int(source_place_id)] = canonical
        return canonical

    for airtable_id in by_airtable:
        resolve_airtable(airtable_id)

    return PlaceResolution(
        airtable_to_canonical=airtable_to_canonical,
        duplicate_to_canonical=dict(sorted(duplicate_to_canonical.items())),
        canonical_place_ids=canonical_place_ids,
    )


def materialize_verse_places(
    verses_data: Sequence[dict],
    place_resolution: PlaceResolution,
) -> List[Tuple[str, int, int, int]]:
    """Return unique canonical (book, chapter, verse, place_id) tuples."""
    rows: Set[Tuple[str, int, int, int]] = set()
    for entry in verses_data:
        fields = entry.get("fields") or {}
        osis = fields.get("osisRef")
        if not osis:
            continue
        parsed = parse_osis_ref(osis)
        if not parsed:
            continue
        book, chapter, verse = parsed
        for place_ref in fields.get("places") or []:
            place_id = place_resolution.airtable_to_canonical.get(place_ref)
            if place_id is None:
                raise ValueError(
                    f"Unresolved verse place reference {place_ref!r} in {osis}"
                )
            rows.add((book, chapter, verse, place_id))
    return sorted(rows)


def materialize_event_locations(
    events_data: Sequence[dict],
    event_by_airtable: Dict[str, int],
    place_resolution: PlaceResolution,
) -> List[Tuple[int, int]]:
    """Return unique canonical (event_id, place_id) tuples."""
    rows: Set[Tuple[int, int]] = set()
    for entry in events_data:
        fields = entry.get("fields") or {}
        event_id = fields.get("eventID")
        if event_id is None:
            continue
        for place_ref in fields.get("locations") or []:
            place_id = place_resolution.airtable_to_canonical.get(place_ref)
            if place_id is None:
                raise ValueError(
                    f"Unresolved event location reference {place_ref!r} "
                    f"for eventID {event_id}"
                )
            rows.add((int(event_id), place_id))
    return sorted(rows)


def appearance_counts_from_verse_places(
    verse_places: Iterable[Tuple[str, int, int, int]],
) -> Counter:
    """Count unique verses per canonical place_id from materialized tuples."""
    return Counter(place_id for _book, _chapter, _verse, place_id in verse_places)


def render_place_redirect_artifacts(
    place_resolution: PlaceResolution,
    output_dir: Path,
) -> dict:
    """Emit staging/apply/tail SQL plus a JSON manifest for production backfill."""
    output_dir.mkdir(parents=True, exist_ok=True)
    mappings = sorted(place_resolution.duplicate_to_canonical.items())
    if not mappings:
        raise ValueError("No duplicate→canonical mappings to emit")

    values_sql = ",\n".join(
        f"({source_id}, {canonical_id})" for source_id, canonical_id in mappings
    )

    head_path = output_dir / "theographic-place-redirect-head.sql"
    apply_path = output_dir / "theographic-place-redirect-apply.sql"
    tail_path = output_dir / "theographic-place-redirect-tail.sql"
    manifest_path = output_dir / "theographic-place-redirect-manifest.json"

    head_sql = (
        "-- Auto-generated by etl-theographic.py --emit place-redirect\n"
        "-- Staging table of duplicate→canonical place IDs (never committed)\n\n"
        f"DROP TABLE IF EXISTS {STAGING_TABLE};\n\n"
        f"CREATE TABLE {STAGING_TABLE} (\n"
        "  source_place_id INTEGER NOT NULL PRIMARY KEY,\n"
        "  canonical_place_id INTEGER NOT NULL\n"
        ");\n\n"
        f"INSERT INTO {STAGING_TABLE} (source_place_id, canonical_place_id) VALUES\n"
        f"{values_sql};\n"
    )

    apply_sql = f"""-- Auto-generated by etl-theographic.py --emit place-redirect
-- Idempotent redirect of orphan duplicate place IDs to canonical places.
-- Correctness does not depend on SQL-file transaction atomicity.

-- 1. Insert missing canonical verse_places rows
INSERT OR IGNORE INTO verse_places (book, chapter, verse, place_id)
SELECT vp.book, vp.chapter, vp.verse, r.canonical_place_id
FROM verse_places vp
JOIN {STAGING_TABLE} r ON r.source_place_id = vp.place_id
WHERE EXISTS (SELECT 1 FROM places WHERE id = r.canonical_place_id);

-- 2. Insert missing canonical event_locations rows
INSERT OR IGNORE INTO event_locations (event_id, place_id)
SELECT el.event_id, r.canonical_place_id
FROM event_locations el
JOIN {STAGING_TABLE} r ON r.source_place_id = el.place_id
WHERE EXISTS (SELECT 1 FROM places WHERE id = r.canonical_place_id);

-- 3. Delete source rows only when staging maps them, the canonical target
--    exists in places, and the source ID remains absent from places.
DELETE FROM verse_places
WHERE EXISTS (
  SELECT 1 FROM {STAGING_TABLE} r
  WHERE r.source_place_id = verse_places.place_id
    AND EXISTS (SELECT 1 FROM places WHERE id = r.canonical_place_id)
    AND NOT EXISTS (SELECT 1 FROM places WHERE id = r.source_place_id)
);

DELETE FROM event_locations
WHERE EXISTS (
  SELECT 1 FROM {STAGING_TABLE} r
  WHERE r.source_place_id = event_locations.place_id
    AND EXISTS (SELECT 1 FROM places WHERE id = r.canonical_place_id)
    AND NOT EXISTS (SELECT 1 FROM places WHERE id = r.source_place_id)
);

-- 4. Recompute appearance_count for affected canonical targets
UPDATE places
SET appearance_count = (
  SELECT COUNT(*) FROM verse_places WHERE place_id = places.id
)
WHERE id IN (SELECT DISTINCT canonical_place_id FROM {STAGING_TABLE});
"""

    tail_sql = (
        "-- Auto-generated by etl-theographic.py --emit place-redirect\n"
        f"DROP TABLE IF EXISTS {STAGING_TABLE};\n"
    )

    manifest = {
        "commit": THEOGRAPHIC_COMMIT,
        "staging_table": STAGING_TABLE,
        "duplicate_mapping_count": len(mappings),
        "mappings": [
            {"source_place_id": source_id, "canonical_place_id": canonical_id}
            for source_id, canonical_id in mappings
        ],
    }

    head_path.write_text(head_sql, encoding="utf-8")
    apply_path.write_text(apply_sql, encoding="utf-8")
    tail_path.write_text(tail_sql, encoding="utf-8")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"  Wrote {head_path.name}")
    print(f"  Wrote {apply_path.name}")
    print(f"  Wrote {tail_path.name}")
    print(f"  Wrote {manifest_path.name} ({len(mappings)} mappings)")
    return manifest


def run_full_etl(
    parsed: Dict[str, Any],
    place_resolution: PlaceResolution,
    seed_dir: Path,
) -> None:
    people_data = parsed["people.json"]
    places_data = parsed["places.json"]
    events_data = parsed["events.json"]
    verses_data = parsed["verses.json"]
    groups_data = parsed["peopleGroups.json"]

    # ─── Build Airtable ID → local ID lookup maps ─────────────────────────────

    person_by_airtable: Dict[str, int] = {}
    person_by_id: Dict[int, dict] = {}
    for entry in people_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        pid = fields.get("personID")
        if pid is not None:
            person_by_airtable[airtable_id] = pid
            person_by_id[pid] = fields

    event_by_airtable: Dict[str, int] = {}
    for entry in events_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        eid = fields.get("eventID")
        if eid is not None:
            event_by_airtable[airtable_id] = eid

    verse_by_airtable: Dict[str, Tuple[str, int, int]] = {}
    for entry in verses_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        osis = fields.get("osisRef")
        if osis:
            parsed_osis = parse_osis_ref(osis)
            if parsed_osis:
                verse_by_airtable[airtable_id] = parsed_osis

    group_by_airtable: Dict[str, int] = {}
    group_rows: List[str] = []
    for idx, entry in enumerate(groups_data, 1):
        airtable_id = entry["id"]
        fields = entry["fields"]
        name = fields.get("groupName", "Unknown")
        slug = name.lower().replace(" ", "_").replace("'", "")
        group_by_airtable[airtable_id] = idx
        group_rows.append(f"({idx}, {sql_escape(name)}, {sql_escape(slug)})")

    print("\nLookup maps built:")
    print(f"  People: {len(person_by_airtable)}")
    print(f"  Places (canonical): {len(place_resolution.canonical_place_ids)}")
    print(f"  Place duplicates: {len(place_resolution.duplicate_to_canonical)}")
    print(f"  Events: {len(event_by_airtable)}")
    print(f"  Verses: {len(verse_by_airtable)}")
    print(f"  Groups: {len(group_by_airtable)}")

    # ─── Extract People ───────────────────────────────────────────────────────

    print("\nProcessing people...")
    people_rows: List[str] = []

    for entry in people_data:
        fields = entry["fields"]
        pid = fields.get("personID")
        if pid is None:
            continue

        name = fields.get("name", "")
        display_title = fields.get("displayTitle", name)
        gender = fields.get("gender")
        slug = fields.get("slug") or fields.get("personLookup", "")
        person_lookup = fields.get("personLookup", slug)
        aliases_list = fields.get("aliases")
        aliases = ", ".join(aliases_list) if isinstance(aliases_list, list) else aliases_list
        verse_count = fields.get("verseCount", 0)

        disputed = 1 if slug in DISPUTED_PEOPLE else 0
        dispute_note = DISPUTED_PEOPLE.get(slug)

        people_rows.append(
            f"({pid}, {sql_escape(name)}, {sql_escape(display_title)}, "
            f"{sql_escape(gender)}, {sql_escape(slug)}, {sql_escape(person_lookup)}, "
            f"{sql_escape(aliases)}, {verse_count}, {disputed}, {sql_escape(dispute_note)})"
        )

    write_batched_sql(
        seed_dir / "entities-people.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0) / TIPNR (CC BY 4.0)",
        "people",
        [
            "id",
            "name",
            "display_title",
            "gender",
            "slug",
            "person_lookup",
            "aliases",
            "appearance_count",
            "disputed",
            "dispute_note",
        ],
        people_rows,
    )

    # ─── Extract Places ───────────────────────────────────────────────────────

    print("\nProcessing places...")
    verse_place_tuples = materialize_verse_places(verses_data, place_resolution)
    place_appearance_counts = appearance_counts_from_verse_places(verse_place_tuples)
    places_rows: List[str] = []
    skipped_places_dup = 0

    for entry in places_data:
        fields = entry["fields"]
        pid = fields.get("placeID")
        if pid is None:
            continue

        if fields.get("duplicate_of"):
            skipped_places_dup += 1
            continue

        name = fields.get("kjvName") or fields.get("esvName", "")
        display_title = fields.get("displayTitle", name)
        lat = fields.get("latitude")
        lon = fields.get("longitude")
        feature_type = fields.get("featureType")
        feature_subtype = fields.get("featureSubType")
        slug = fields.get("slug") or fields.get("placeLookup", "")
        place_lookup = fields.get("placeLookup", slug)
        aliases_list = fields.get("aliases")
        aliases = ", ".join(aliases_list) if isinstance(aliases_list, list) else aliases_list
        appearance_count = place_appearance_counts.get(int(pid), 0)

        lat_sql = str(lat) if lat is not None else "NULL"
        lon_sql = str(lon) if lon is not None else "NULL"

        places_rows.append(
            f"({pid}, {sql_escape(name)}, {sql_escape(display_title)}, "
            f"{lat_sql}, {lon_sql}, "
            f"{sql_escape(feature_type)}, {sql_escape(feature_subtype)}, "
            f"{sql_escape(slug)}, {sql_escape(place_lookup)}, "
            f"{sql_escape(aliases)}, {appearance_count})"
        )

    if skipped_places_dup:
        print(f"  Skipped {skipped_places_dup} duplicate places")

    write_batched_sql(
        seed_dir / "entities-places.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0) / TIPNR (CC BY 4.0)",
        "places",
        [
            "id",
            "name",
            "display_title",
            "latitude",
            "longitude",
            "feature_type",
            "feature_subtype",
            "slug",
            "place_lookup",
            "aliases",
            "appearance_count",
        ],
        places_rows,
    )

    # ─── Extract Events ───────────────────────────────────────────────────────

    print("\nProcessing events...")
    events_rows: List[str] = []
    event_participants_rows: List[str] = []
    event_location_tuples = materialize_event_locations(
        events_data, event_by_airtable, place_resolution
    )
    event_locations_rows = [f"({eid}, {pid})" for eid, pid in event_location_tuples]

    for entry in events_data:
        fields = entry["fields"]
        eid = fields.get("eventID")
        if eid is None:
            continue

        title = fields.get("title", "")
        start_date = fields.get("startDate")
        if start_date is not None:
            start_date = str(start_date)
        duration = fields.get("duration")
        sort_key = fields.get("sortKey")
        range_flag = fields.get("rangeFlag", 0)

        predecessor_refs = fields.get("predecessor", [])
        predecessor_id = None
        if predecessor_refs:
            pred_airtable = (
                predecessor_refs[0]
                if isinstance(predecessor_refs, list)
                else predecessor_refs
            )
            predecessor_id = event_by_airtable.get(pred_airtable)

        sort_key_sql = str(sort_key) if sort_key is not None else "NULL"
        pred_sql = str(predecessor_id) if predecessor_id is not None else "NULL"

        events_rows.append(
            f"({eid}, {sql_escape(title)}, {sql_escape(start_date)}, "
            f"{sql_escape(duration)}, {sort_key_sql}, {pred_sql}, {range_flag})"
        )

        participants = fields.get("participants", [])
        seen_participants: Set[int] = set()
        for p_ref in participants:
            p_id = person_by_airtable.get(p_ref)
            if p_id and p_id not in seen_participants:
                seen_participants.add(p_id)
                event_participants_rows.append(f"({eid}, {p_id})")

    write_batched_sql(
        seed_dir / "entities-events.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "events",
        ["id", "title", "start_date", "duration", "sort_key", "predecessor_id", "range_flag"],
        events_rows,
    )

    write_batched_sql(
        seed_dir / "event-participants.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "event_participants",
        ["event_id", "person_id"],
        event_participants_rows,
    )

    write_batched_sql(
        seed_dir / "event-locations.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "event_locations",
        ["event_id", "place_id"],
        event_locations_rows,
    )

    # ─── Extract Verse-Entity Associations ────────────────────────────────────

    print("\nProcessing verse-entity associations...")
    verse_people_rows: List[str] = []
    verse_places_rows = [
        f"({sql_escape(book)}, {chapter}, {verse}, {place_id})"
        for book, chapter, verse, place_id in verse_place_tuples
    ]
    verse_events_rows: List[str] = []
    unresolved_verses = 0

    for entry in verses_data:
        fields = entry["fields"]
        osis = fields.get("osisRef")
        if not osis:
            continue

        parsed_osis = parse_osis_ref(osis)
        if not parsed_osis:
            unresolved_verses += 1
            continue

        book, chapter, verse = parsed_osis

        people_refs = fields.get("people", [])
        seen_people: Set[int] = set()
        for p_ref in people_refs:
            p_id = person_by_airtable.get(p_ref)
            if p_id and p_id not in seen_people:
                seen_people.add(p_id)
                verse_people_rows.append(
                    f"({sql_escape(book)}, {chapter}, {verse}, {p_id})"
                )

        event_refs = fields.get("event", [])
        if isinstance(event_refs, str):
            event_refs = [event_refs]
        seen_events: Set[int] = set()
        for e_ref in event_refs:
            e_id = event_by_airtable.get(e_ref)
            if e_id and e_id not in seen_events:
                seen_events.add(e_id)
                verse_events_rows.append(
                    f"({sql_escape(book)}, {chapter}, {verse}, {e_id})"
                )

    if unresolved_verses:
        print(f"  WARNING: {unresolved_verses} verses with unresolvable OSIS refs")

    write_chunked_sql(
        seed_dir,
        "verse-people",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_people",
        ["book", "chapter", "verse", "person_id"],
        verse_people_rows,
    )

    write_chunked_sql(
        seed_dir,
        "verse-places",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_places",
        ["book", "chapter", "verse", "place_id"],
        verse_places_rows,
    )

    write_batched_sql(
        seed_dir / "verse-events.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_events",
        ["book", "chapter", "verse", "event_id"],
        verse_events_rows,
    )

    # ─── Extract Relationships ────────────────────────────────────────────────

    print("\nProcessing person relationships...")
    relationship_rows: List[str] = []
    seen_rels: Set[Tuple[int, int, str]] = set()

    for entry in people_data:
        fields = entry["fields"]
        pid = fields.get("personID")
        if pid is None:
            continue

        for ref in fields.get("father", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                key_fwd = (pid, related_id, "child")
                key_inv = (related_id, pid, "father")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, 'child')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'father')")

        for ref in fields.get("mother", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                key_fwd = (pid, related_id, "child")
                key_inv = (related_id, pid, "mother")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, 'child')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'mother')")

        for ref in fields.get("children", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                rel_type = "father" if fields.get("gender") == "Male" else "mother"
                key_fwd = (pid, related_id, rel_type)
                key_inv = (related_id, pid, "child")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, '{rel_type}')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'child')")

        for ref in fields.get("siblings", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                key_fwd = (pid, related_id, "sibling")
                key_inv = (related_id, pid, "sibling")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, 'sibling')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'sibling')")

        for ref in fields.get("partners", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                key_fwd = (pid, related_id, "spouse")
                key_inv = (related_id, pid, "spouse")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, 'spouse')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'spouse')")

    write_batched_sql(
        seed_dir / "entities-relationships.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "person_relationships",
        ["person_id", "related_person_id", "relationship_type"],
        relationship_rows,
    )

    # ─── Extract Groups ───────────────────────────────────────────────────────

    print("\nProcessing people groups...")
    membership_rows: List[str] = []

    for entry in groups_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        group_id = group_by_airtable.get(airtable_id)
        if group_id is None:
            continue

        members = fields.get("members", [])
        for m_ref in members:
            p_id = person_by_airtable.get(m_ref)
            if p_id:
                membership_rows.append(f"({p_id}, {group_id})")

    write_batched_sql(
        seed_dir / "entities-groups.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "people_groups",
        ["id", "group_name", "slug"],
        group_rows,
    )

    write_batched_sql(
        seed_dir / "entities-group-membership.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "person_group_membership",
        ["person_id", "group_id"],
        membership_rows,
    )

    # ─── Summary ──────────────────────────────────────────────────────────────

    print("\n=== ETL Summary ===")
    print(f"People:            {len(people_rows)}")
    print(f"Places:            {len(places_rows)} (skipped {skipped_places_dup} duplicates)")
    print(f"Events:            {len(events_rows)}")
    print(f"Event participants: {len(event_participants_rows)}")
    print(f"Event locations:    {len(event_locations_rows)}")
    print(f"Verse-people:      {len(verse_people_rows)}")
    print(f"Verse-places:      {len(verse_places_rows)}")
    print(f"Verse-events:      {len(verse_events_rows)}")
    print(f"Relationships:     {len(relationship_rows)}")
    print(f"Groups:            {len(group_rows)}")
    print(f"Group memberships: {len(membership_rows)}")
    print(f"Jerusalem appearance_count: {place_appearance_counts.get(636, 0)}")

    print("\n=== Spot Checks ===")
    abraham = person_by_id.get(58)
    if abraham:
        print(f"Abraham verse count: {abraham.get('verseCount', '?')}")
    else:
        print("WARNING: Abraham (ID 58) not found")
    print(f"Disputed people: {len(DISPUTED_PEOPLE)}")
    print("\nDone.")


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Theographic entity ETL")
    parser.add_argument(
        "--emit",
        choices=("all", "place-redirect"),
        default="all",
        help=(
            "'all' (default) runs the full ETL. "
            "'place-redirect' emits only the production redirect staging SQL."
        ),
    )
    parser.add_argument(
        "--cache-dir",
        default=str(CACHE_DIR),
        help="Directory for cached pinned Theographic JSON inputs",
    )
    parser.add_argument(
        "--out-dir",
        default=str(SEED_DIR),
        help="Output directory for generated SQL (gitignored)",
    )
    parser.add_argument(
        "--checksums",
        default=str(CHECKSUM_FILE),
        help="Path to the committed checksum manifest",
    )
    parser.add_argument(
        "--write-checksums",
        action="store_true",
        help="Write checksum manifest for the pinned upstream inputs and exit",
    )
    args = parser.parse_args(argv)
    seed_dir = Path(args.out_dir)

    raw_files = load_inputs(Path(args.cache_dir))
    manifest = build_checksum_manifest(raw_files)
    checksum_path = Path(args.checksums)

    if args.write_checksums:
        checksum_path.write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {checksum_path}")
        return

    if not checksum_path.exists():
        print(f"ERROR: checksum manifest not found: {checksum_path}", file=sys.stderr)
        print(
            "Run with --write-checksums after intentionally changing upstream pins.",
            file=sys.stderr,
        )
        sys.exit(1)

    verify_checksums(json.loads(checksum_path.read_text(encoding="utf-8")), raw_files)
    parsed = parse_json_inputs(raw_files)
    reject_duplicate_of_on_people_or_events(parsed["people.json"], parsed["events.json"])
    place_resolution = resolve_places(parsed["places.json"])

    if args.emit == "place-redirect":
        print("\nEmitting place-redirect staging SQL...")
        render_place_redirect_artifacts(place_resolution, seed_dir)
        print("Done.")
        return

    run_full_etl(parsed, place_resolution, seed_dir)


if __name__ == "__main__":
    main()
