-- 0008_add_speakers_quotations.sql
-- Speaker metadata
CREATE TABLE IF NOT EXISTS speakers (
  character_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  age TEXT,
  divinity TEXT NOT NULL DEFAULT 'N',
  max_speakers INTEGER,
  fcbh_character TEXT
);

-- Quotation spans
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  speaker_id TEXT NOT NULL REFERENCES speakers(character_id),
  speaker_label TEXT,
  alt_speaker_id TEXT,
  quote_type TEXT,
  quote_delivery TEXT,
  speech_key TEXT
);

-- Range queries: "who speaks in Genesis 22:1-19?"
CREATE INDEX IF NOT EXISTS idx_quot_book_range
  ON quotations(book, chapter, verse_start, verse_end);

-- Speaker-specific queries: "where does Moses speak?"
CREATE INDEX IF NOT EXISTS idx_quot_speaker
  ON quotations(speaker_id);

-- Divine speech queries: partial index for efficiency
CREATE INDEX IF NOT EXISTS idx_quot_divine
  ON quotations(book, chapter, verse_start)
  WHERE speaker_id IN (SELECT character_id FROM speakers WHERE divinity = 'Y');
