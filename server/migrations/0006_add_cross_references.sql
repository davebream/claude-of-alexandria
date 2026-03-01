-- 0006_add_cross_references.sql
CREATE TABLE IF NOT EXISTS cross_references (
  id INTEGER PRIMARY KEY,
  from_book TEXT NOT NULL,
  from_chapter INTEGER NOT NULL,
  from_verse INTEGER NOT NULL,
  to_book TEXT NOT NULL,
  to_chapter INTEGER NOT NULL,
  to_verse_start INTEGER NOT NULL,
  to_verse_end INTEGER NOT NULL,
  votes INTEGER NOT NULL DEFAULT 1,
  UNIQUE(from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start)
);

CREATE INDEX IF NOT EXISTS idx_xref_from ON cross_references(from_book, from_chapter, from_verse, votes DESC);
CREATE INDEX IF NOT EXISTS idx_xref_to ON cross_references(to_book, to_chapter, to_verse_start, votes DESC);
