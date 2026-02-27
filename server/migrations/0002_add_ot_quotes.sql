-- Add OT quotes tables (introduced in v1.7.0)
-- Tracks NT passages that quote the OT, with normalized OT source references.

CREATE TABLE IF NOT EXISTS ot_quotes (
  id INTEGER PRIMARY KEY,
  nt_book TEXT NOT NULL,
  nt_chapter INTEGER NOT NULL,
  nt_verse INTEGER NOT NULL,
  greek_text TEXT NOT NULL,
  quote_type TEXT NOT NULL DEFAULT 'direct'
);
CREATE INDEX IF NOT EXISTS idx_ot_quotes_nt ON ot_quotes(nt_book, nt_chapter, nt_verse);

CREATE TABLE IF NOT EXISTS ot_quote_sources (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES ot_quotes(id),
  ot_book TEXT NOT NULL,
  ot_chapter INTEGER NOT NULL,
  ot_verse INTEGER NOT NULL,
  ot_verse_end INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ot_sources_quote ON ot_quote_sources(quote_id);
CREATE INDEX IF NOT EXISTS idx_ot_sources_book ON ot_quote_sources(ot_book, ot_chapter, ot_verse);
