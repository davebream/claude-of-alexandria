-- 0015_add_liturgical.sql
-- Adds the liturgical_readings table for the liturgical calendar / lectionary lookup tool.
-- Each row is one curated passage reading assigned to a liturgical season.
-- Passages are stored as canonical book + chapter/verse bounds with pre-computed
-- start_enc/end_enc integer sort keys (chapter*1000+verse) for indexed overlap queries.

CREATE TABLE IF NOT EXISTS liturgical_readings (
  id                INTEGER PRIMARY KEY,
  season            TEXT NOT NULL,                           -- display name, e.g. 'Advent'
  season_slug       TEXT NOT NULL,                           -- slugifySeason(season), e.g. 'advent'
  season_order      INTEGER NOT NULL,                        -- position in the church year (1..N)
  tradition         TEXT NOT NULL DEFAULT 'western',         -- 'western' | 'reformed' | ... (stored lowercase)
  book              TEXT NOT NULL,                           -- canonical book name (matches lookupBook canonical)
  start_chapter     INTEGER NOT NULL,
  start_verse       INTEGER NOT NULL,
  end_chapter       INTEGER NOT NULL,
  end_verse         INTEGER NOT NULL,
  start_enc         INTEGER NOT NULL,                        -- start_chapter*1000 + start_verse (sort/overlap key)
  end_enc           INTEGER NOT NULL,                        -- end_chapter*1000 + end_verse
  reference_display TEXT NOT NULL,                           -- human-readable, e.g. 'Isaiah 9:2-7'
  themes            TEXT NOT NULL DEFAULT '[]',              -- JSON array string of English theme strings
  note              TEXT,                                    -- optional curatorial note
  source            TEXT NOT NULL DEFAULT 'curated-in-house'
);

CREATE INDEX IF NOT EXISTS idx_liturgical_season
  ON liturgical_readings(season_slug, season_order);

CREATE INDEX IF NOT EXISTS idx_liturgical_passage
  ON liturgical_readings(book, start_enc, end_enc);

CREATE INDEX IF NOT EXISTS idx_liturgical_tradition
  ON liturgical_readings(tradition);
