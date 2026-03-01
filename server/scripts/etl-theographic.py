#!/usr/bin/env python3
"""
Theographic Entity ETL — extract people, places, events, relationships, groups.

Downloads Theographic Bible Metadata JSON files from GitHub and transforms them
into chunked SQL seed files for Cloudflare D1.

Usage:
    cd server && python3 scripts/etl-theographic.py

Output:
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

Source:
    Theographic Bible Metadata (CC BY-SA 4.0)
    https://github.com/robertrouse/theographic-bible-metadata
    TIPNR by Tyndale House Cambridge / STEPBible.org (CC BY 4.0)
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL = "https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json"
SEED_DIR = Path(__file__).resolve().parent.parent / "d1-seed"
BATCH_SIZE = 100  # rows per INSERT statement
CHUNK_SIZE = 10_000  # rows per SQL file for large tables

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


def sql_escape(value):
    """Escape single quotes for SQL string literals."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def download_json(filename):
    """Download a JSON file from the Theographic repo."""
    url = f"{BASE_URL}/{filename}"
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/2.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode("utf-8")
        print(f"  Downloaded {len(data):,} bytes")
        return json.loads(data)
    except Exception as e:
        print(f"  ERROR: Failed to download {filename}: {e}", file=sys.stderr)
        sys.exit(1)


def parse_osis_ref(osis_ref):
    """Parse OSIS reference like 'Gen.1.1' into (canonical_book, chapter, verse)."""
    parts = osis_ref.split(".")
    if len(parts) != 3:
        return None
    book_osis, chapter_str, verse_str = parts
    canonical = OSIS_TO_CANONICAL.get(book_osis)
    if not canonical:
        return None
    try:
        chapter = int(chapter_str)
        verse = int(verse_str)
        return (canonical, chapter, verse)
    except ValueError:
        return None


def write_batched_sql(filepath, header, table_name, columns, rows):
    """Write rows as batched INSERT OR IGNORE statements to a SQL file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"-- Auto-generated by etl-theographic.py\n")
        f.write(f"-- {header}\n\n")
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i + BATCH_SIZE]
            cols = ", ".join(columns)
            f.write(f"INSERT OR IGNORE INTO {table_name} ({cols}) VALUES\n")
            f.write(",\n".join(batch))
            f.write(";\n\n")
    print(f"  Wrote {len(rows)} rows to {filepath.name}")


def write_chunked_sql(prefix, header, table_name, columns, rows):
    """Write rows across multiple chunked files for large tables."""
    total_files = 0
    for chunk_start in range(0, len(rows), CHUNK_SIZE):
        chunk_end = min(chunk_start + CHUNK_SIZE, len(rows))
        chunk = rows[chunk_start:chunk_end]
        file_num = (chunk_start // CHUNK_SIZE) + 1
        filepath = SEED_DIR / f"{prefix}-{file_num:03d}.sql"
        write_batched_sql(filepath, header, table_name, columns, chunk)
        total_files += 1
    print(f"  Total: {len(rows)} rows across {total_files} files")


# ─── Main ETL ─────────────────────────────────────────────────────────────────

def main():
    # Download all JSON files
    people_data = download_json("people.json")
    places_data = download_json("places.json")
    events_data = download_json("events.json")
    verses_data = download_json("verses.json")
    groups_data = download_json("peopleGroups.json")

    # ─── Build Airtable ID → local ID lookup maps ─────────────────────────────

    # People: airtable_id → (person_id, slug)
    person_by_airtable = {}
    person_by_id = {}
    for entry in people_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        pid = fields.get("personID")
        slug = fields.get("slug") or fields.get("personLookup", "")
        if pid is not None:
            person_by_airtable[airtable_id] = pid
            person_by_id[pid] = fields

    # Places: airtable_id → place_id
    place_by_airtable = {}
    place_by_id = {}
    for entry in places_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        pid = fields.get("placeID")
        if pid is not None:
            place_by_airtable[airtable_id] = pid
            place_by_id[pid] = fields

    # Events: airtable_id → event_id
    event_by_airtable = {}
    for entry in events_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        eid = fields.get("eventID")
        if eid is not None:
            event_by_airtable[airtable_id] = eid

    # Verses: airtable_id → (book, chapter, verse)
    verse_by_airtable = {}
    for entry in verses_data:
        airtable_id = entry["id"]
        fields = entry["fields"]
        osis = fields.get("osisRef")
        if osis:
            parsed = parse_osis_ref(osis)
            if parsed:
                verse_by_airtable[airtable_id] = parsed

    # Groups: airtable_id → group_id (auto-assigned)
    group_by_airtable = {}
    group_rows = []
    for idx, entry in enumerate(groups_data, 1):
        airtable_id = entry["id"]
        fields = entry["fields"]
        name = fields.get("groupName", "Unknown")
        slug = name.lower().replace(" ", "_").replace("'", "")
        group_by_airtable[airtable_id] = idx
        group_rows.append(f"({idx}, {sql_escape(name)}, {sql_escape(slug)})")

    print(f"\nLookup maps built:")
    print(f"  People: {len(person_by_airtable)}")
    print(f"  Places: {len(place_by_airtable)}")
    print(f"  Events: {len(event_by_airtable)}")
    print(f"  Verses: {len(verse_by_airtable)}")
    print(f"  Groups: {len(group_by_airtable)}")

    # ─── Extract People ───────────────────────────────────────────────────────

    print("\nProcessing people...")
    people_rows = []
    skipped_places_dup = 0

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

        # Disputed flag
        disputed = 1 if slug in DISPUTED_PEOPLE else 0
        dispute_note = DISPUTED_PEOPLE.get(slug)

        people_rows.append(
            f"({pid}, {sql_escape(name)}, {sql_escape(display_title)}, "
            f"{sql_escape(gender)}, {sql_escape(slug)}, {sql_escape(person_lookup)}, "
            f"{sql_escape(aliases)}, {verse_count}, {disputed}, {sql_escape(dispute_note)})"
        )

    write_batched_sql(
        SEED_DIR / "entities-people.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0) / TIPNR (CC BY 4.0)",
        "people",
        ["id", "name", "display_title", "gender", "slug", "person_lookup", "aliases", "appearance_count", "disputed", "dispute_note"],
        people_rows,
    )

    # ─── Extract Places ───────────────────────────────────────────────────────

    print("\nProcessing places...")
    places_rows = []

    for entry in places_data:
        fields = entry["fields"]
        pid = fields.get("placeID")
        if pid is None:
            continue

        # Skip duplicates
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
        verse_count = fields.get("verseCount", 0)

        lat_sql = str(lat) if lat is not None else "NULL"
        lon_sql = str(lon) if lon is not None else "NULL"

        places_rows.append(
            f"({pid}, {sql_escape(name)}, {sql_escape(display_title)}, "
            f"{lat_sql}, {lon_sql}, "
            f"{sql_escape(feature_type)}, {sql_escape(feature_subtype)}, "
            f"{sql_escape(slug)}, {sql_escape(place_lookup)}, "
            f"{sql_escape(aliases)}, {verse_count})"
        )

    if skipped_places_dup:
        print(f"  Skipped {skipped_places_dup} duplicate places")

    write_batched_sql(
        SEED_DIR / "entities-places.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0) / TIPNR (CC BY 4.0)",
        "places",
        ["id", "name", "display_title", "latitude", "longitude", "feature_type", "feature_subtype", "slug", "place_lookup", "aliases", "appearance_count"],
        places_rows,
    )

    # ─── Extract Events ───────────────────────────────────────────────────────

    print("\nProcessing events...")
    events_rows = []
    event_participants_rows = []
    event_locations_rows = []

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

        # Resolve predecessor
        predecessor_refs = fields.get("predecessor", [])
        predecessor_id = None
        if predecessor_refs:
            pred_airtable = predecessor_refs[0] if isinstance(predecessor_refs, list) else predecessor_refs
            predecessor_id = event_by_airtable.get(pred_airtable)

        sort_key_sql = str(sort_key) if sort_key is not None else "NULL"
        pred_sql = str(predecessor_id) if predecessor_id is not None else "NULL"

        events_rows.append(
            f"({eid}, {sql_escape(title)}, {sql_escape(start_date)}, "
            f"{sql_escape(duration)}, {sort_key_sql}, {pred_sql}, {range_flag})"
        )

        # Event participants
        participants = fields.get("participants", [])
        seen_participants = set()
        for p_ref in participants:
            p_id = person_by_airtable.get(p_ref)
            if p_id and p_id not in seen_participants:
                seen_participants.add(p_id)
                event_participants_rows.append(f"({eid}, {p_id})")

        # Event locations
        locations = fields.get("locations", [])
        seen_locations = set()
        for l_ref in locations:
            l_id = place_by_airtable.get(l_ref)
            if l_id and l_id not in seen_locations:
                seen_locations.add(l_id)
                event_locations_rows.append(f"({eid}, {l_id})")

    write_batched_sql(
        SEED_DIR / "entities-events.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "events",
        ["id", "title", "start_date", "duration", "sort_key", "predecessor_id", "range_flag"],
        events_rows,
    )

    write_batched_sql(
        SEED_DIR / "event-participants.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "event_participants",
        ["event_id", "person_id"],
        event_participants_rows,
    )

    write_batched_sql(
        SEED_DIR / "event-locations.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "event_locations",
        ["event_id", "place_id"],
        event_locations_rows,
    )

    # ─── Extract Verse-Entity Associations ────────────────────────────────────

    print("\nProcessing verse-entity associations...")
    verse_people_rows = []
    verse_places_rows = []
    verse_events_rows = []
    unresolved_verses = 0

    for entry in verses_data:
        fields = entry["fields"]
        osis = fields.get("osisRef")
        if not osis:
            continue

        parsed = parse_osis_ref(osis)
        if not parsed:
            unresolved_verses += 1
            continue

        book, chapter, verse = parsed

        # People in this verse
        people_refs = fields.get("people", [])
        seen_people = set()
        for p_ref in people_refs:
            p_id = person_by_airtable.get(p_ref)
            if p_id and p_id not in seen_people:
                seen_people.add(p_id)
                verse_people_rows.append(
                    f"({sql_escape(book)}, {chapter}, {verse}, {p_id})"
                )

        # Places in this verse
        places_refs = fields.get("places", [])
        seen_places = set()
        for pl_ref in places_refs:
            pl_id = place_by_airtable.get(pl_ref)
            if pl_id and pl_id not in seen_places:
                seen_places.add(pl_id)
                verse_places_rows.append(
                    f"({sql_escape(book)}, {chapter}, {verse}, {pl_id})"
                )

        # Events in this verse
        event_refs = fields.get("event", [])
        if isinstance(event_refs, str):
            event_refs = [event_refs]
        seen_events = set()
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
        "verse-people",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_people",
        ["book", "chapter", "verse", "person_id"],
        verse_people_rows,
    )

    write_chunked_sql(
        "verse-places",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_places",
        ["book", "chapter", "verse", "place_id"],
        verse_places_rows,
    )

    write_batched_sql(
        SEED_DIR / "verse-events.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "verse_events",
        ["book", "chapter", "verse", "event_id"],
        verse_events_rows,
    )

    # ─── Extract Relationships ────────────────────────────────────────────────

    print("\nProcessing person relationships...")
    relationship_rows = []
    seen_rels = set()

    for entry in people_data:
        fields = entry["fields"]
        pid = fields.get("personID")
        if pid is None:
            continue

        # Father
        for ref in fields.get("father", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                # pid's father is related_id → pid IS child OF related_id
                key_fwd = (pid, related_id, "child")
                key_inv = (related_id, pid, "father")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    relationship_rows.append(f"({pid}, {related_id}, 'child')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'father')")

        # Mother
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

        # Children
        for ref in fields.get("children", []):
            related_id = person_by_airtable.get(ref)
            if related_id:
                key_fwd = (pid, related_id, "father" if fields.get("gender") == "Male" else "mother")
                key_inv = (related_id, pid, "child")
                if key_fwd not in seen_rels:
                    seen_rels.add(key_fwd)
                    rel_type = "father" if fields.get("gender") == "Male" else "mother"
                    relationship_rows.append(f"({pid}, {related_id}, '{rel_type}')")
                if key_inv not in seen_rels:
                    seen_rels.add(key_inv)
                    relationship_rows.append(f"({related_id}, {pid}, 'child')")

        # Siblings
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

        # Partners (spouse)
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
        SEED_DIR / "entities-relationships.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "person_relationships",
        ["person_id", "related_person_id", "relationship_type"],
        relationship_rows,
    )

    # ─── Extract Groups ───────────────────────────────────────────────────────

    print("\nProcessing people groups...")
    membership_rows = []

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

    # Write groups first, then memberships
    write_batched_sql(
        SEED_DIR / "entities-groups.sql",
        "Source: Theographic Bible Metadata (CC BY-SA 4.0)",
        "people_groups",
        ["id", "group_name", "slug"],
        group_rows,
    )

    write_batched_sql(
        SEED_DIR / "entities-group-membership.sql",
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

    # Spot checks
    print("\n=== Spot Checks ===")

    # Abraham appearance count
    abraham = person_by_id.get(58)  # abraham_58
    if abraham:
        print(f"Abraham verse count: {abraham.get('verseCount', '?')}")
    else:
        print("WARNING: Abraham (ID 58) not found")

    print(f"Disputed people: {len(DISPUTED_PEOPLE)}")

    print("\nDone.")


if __name__ == "__main__":
    main()
