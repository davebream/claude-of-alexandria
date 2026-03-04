-- Migration 0003: Bible text and commentary tables
CREATE TABLE IF NOT EXISTS bible_verses (
  id INTEGER PRIMARY KEY,
  translation TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bible_verses_lookup
  ON bible_verses(translation, book, chapter, verse);

CREATE TABLE IF NOT EXISTS commentary_entries (
  id INTEGER PRIMARY KEY,
  commentary TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commentary_lookup
  ON commentary_entries(commentary, book, chapter, verse_start);

-- Index for unfiltered queries (all commentaries for a book+range)
-- idx_commentary_lookup has commentary as leftmost column, unusable when commentary is omitted
CREATE INDEX IF NOT EXISTS idx_commentary_book_range
  ON commentary_entries(book, chapter, verse_start, verse_end);
