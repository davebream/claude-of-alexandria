-- 0017_add_controversies.sql
-- Adds the controversy_topics and controversy_passages tables for the disputed-historicity metadata layer.
-- Each topic represents one scholarly controversy about a biblical text (authorship, dating, historicity, etc.).
-- Passages are stored as canonical book + chapter/verse bounds with pre-computed
-- start_enc/end_enc integer sort keys (chapter*1000+verse) for indexed overlap queries.

CREATE TABLE IF NOT EXISTS controversy_topics (
  id         INTEGER PRIMARY KEY,
  topic      TEXT NOT NULL,                           -- display name, e.g. 'Date of the Exodus'
  slug       TEXT NOT NULL,                           -- slugify(topic), e.g. 'date-of-the-exodus'
  category   TEXT NOT NULL,                           -- 'dating' | 'authorship' | 'composition' | 'historicity' | 'harmonization'
  rating     TEXT NOT NULL,                           -- scholarly dispute intensity: 'low' | 'medium' | 'high'
  summary    TEXT NOT NULL,                           -- neutral description of what is disputed
  positions  TEXT NOT NULL DEFAULT '[]',              -- JSON array of {label, view, evidence, scholars: string[]}
  keywords   TEXT NOT NULL DEFAULT '[]',              -- JSON array of keyword strings
  sources    TEXT NOT NULL DEFAULT '[]',              -- JSON array of {citation, tier: 'A'|'B'|'C'}
  note       TEXT,                                    -- optional curatorial note
  source     TEXT NOT NULL DEFAULT 'curated-in-house'
);

CREATE TABLE IF NOT EXISTS controversy_passages (
  id                INTEGER PRIMARY KEY,
  controversy_id    INTEGER NOT NULL,                 -- FK → controversy_topics.id
  book              TEXT NOT NULL,                    -- canonical book name (matches lookupBook canonical)
  start_chapter     INTEGER NOT NULL,
  start_verse       INTEGER NOT NULL,
  end_chapter       INTEGER NOT NULL,
  end_verse         INTEGER NOT NULL,
  start_enc         INTEGER NOT NULL,                 -- start_chapter*1000 + start_verse (sort/overlap key)
  end_enc           INTEGER NOT NULL,                 -- end_chapter*1000 + end_verse
  reference_display TEXT NOT NULL                     -- human-readable, e.g. 'Exodus 12:40-41'
);

CREATE INDEX IF NOT EXISTS idx_controversy_slug
  ON controversy_topics(slug);

CREATE INDEX IF NOT EXISTS idx_controversy_rating
  ON controversy_topics(rating);

CREATE INDEX IF NOT EXISTS idx_controversy_passage
  ON controversy_passages(book, start_enc, end_enc);
