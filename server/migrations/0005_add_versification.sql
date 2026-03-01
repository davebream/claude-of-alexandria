-- 0005_add_versification.sql
CREATE TABLE IF NOT EXISTS versification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book TEXT NOT NULL,
  english_chapter INTEGER NOT NULL,
  english_verse_start INTEGER NOT NULL,
  english_verse_end INTEGER,
  hebrew_chapter INTEGER NOT NULL,
  hebrew_verse_start INTEGER NOT NULL,
  hebrew_verse_end INTEGER,
  mapping_type TEXT DEFAULT 'offset'
);

CREATE INDEX IF NOT EXISTS idx_vers_book ON versification(book);
CREATE INDEX IF NOT EXISTS idx_vers_english ON versification(book, english_chapter, english_verse_start);
CREATE INDEX IF NOT EXISTS idx_vers_hebrew ON versification(book, hebrew_chapter, hebrew_verse_start);
