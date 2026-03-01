-- 0007_add_entities.sql
-- Theographic Entity Layer: people, places, events, relationships, groups
-- Data: Theographic Bible Metadata (CC BY-SA 4.0) / TIPNR by Tyndale House (CC BY 4.0)

-- People (3,067 records)
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  display_title TEXT,
  gender TEXT,
  slug TEXT NOT NULL UNIQUE,
  person_lookup TEXT NOT NULL UNIQUE,
  aliases TEXT,
  appearance_count INTEGER NOT NULL DEFAULT 0,
  disputed INTEGER NOT NULL DEFAULT 0,
  dispute_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);

-- Places (1,274 records)
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  display_title TEXT,
  latitude REAL,
  longitude REAL,
  feature_type TEXT,
  feature_subtype TEXT,
  slug TEXT NOT NULL UNIQUE,
  place_lookup TEXT NOT NULL UNIQUE,
  aliases TEXT,
  appearance_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_places_name ON places(name);
CREATE INDEX IF NOT EXISTS idx_places_feature ON places(feature_type);

-- Events (450 records)
-- NOTE: start_date and sort_key follow Ussher/Masoretic-derived chronology.
-- Alternative traditions (LXX, Samaritan Pentateuch, critical scholarship) yield different dates.
-- Tool responses MUST include this caveat.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT,
  duration TEXT,
  sort_key REAL,
  predecessor_id INTEGER,
  range_flag INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_sort ON events(sort_key);
CREATE INDEX IF NOT EXISTS idx_events_predecessor ON events(predecessor_id);

-- Verse-to-People (~100K rows)
CREATE TABLE IF NOT EXISTS verse_people (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  UNIQUE(book, chapter, verse, person_id)
);
CREATE INDEX IF NOT EXISTS idx_vp_ref ON verse_people(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_vp_person ON verse_people(person_id);
CREATE INDEX IF NOT EXISTS idx_vp_person_book ON verse_people(person_id, book);

-- Verse-to-Places (~80K rows)
CREATE TABLE IF NOT EXISTS verse_places (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  UNIQUE(book, chapter, verse, place_id)
);
CREATE INDEX IF NOT EXISTS idx_vpl_ref ON verse_places(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_vpl_place ON verse_places(place_id);

-- Verse-to-Events (~10K rows)
CREATE TABLE IF NOT EXISTS verse_events (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  UNIQUE(book, chapter, verse, event_id)
);
CREATE INDEX IF NOT EXISTS idx_ve_ref ON verse_events(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_ve_event ON verse_events(event_id);

-- Event participants
CREATE TABLE IF NOT EXISTS event_participants (
  event_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  UNIQUE(event_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_ep_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_ep_person ON event_participants(person_id);

-- Event locations
CREATE TABLE IF NOT EXISTS event_locations (
  event_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  UNIQUE(event_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_el_event ON event_locations(event_id);
CREATE INDEX IF NOT EXISTS idx_el_place ON event_locations(place_id);

-- Person relationships (~10K bidirectional rows)
-- Convention: person_id IS relationship_type OF related_person_id
-- e.g., (abraham_id, isaac_id, 'father') = "Abraham is father of Isaac"
CREATE TABLE IF NOT EXISTS person_relationships (
  person_id INTEGER NOT NULL,
  related_person_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  UNIQUE(person_id, related_person_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_pr_person ON person_relationships(person_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_pr_related ON person_relationships(related_person_id, relationship_type);

-- People groups (23 groups, ~3K memberships)
CREATE TABLE IF NOT EXISTS people_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS person_group_membership (
  person_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  UNIQUE(person_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_pgm_person ON person_group_membership(person_id);
CREATE INDEX IF NOT EXISTS idx_pgm_group ON person_group_membership(group_id);
