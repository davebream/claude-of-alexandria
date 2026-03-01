-- 0004_add_lexicon.sql
CREATE TABLE IF NOT EXISTS lexicon (
  strongs_id TEXT PRIMARY KEY,
  disambiguated TEXT NOT NULL,
  testament TEXT NOT NULL,
  original_word TEXT NOT NULL,
  original_word_nfc TEXT NOT NULL,
  original_word_stripped TEXT NOT NULL,
  transliteration TEXT,
  morphology TEXT,
  gloss TEXT NOT NULL,
  meaning TEXT
);

CREATE INDEX IF NOT EXISTS idx_lexicon_testament ON lexicon(testament);
CREATE INDEX IF NOT EXISTS idx_lexicon_gloss ON lexicon(gloss);
CREATE INDEX IF NOT EXISTS idx_lexicon_disambiguated ON lexicon(disambiguated);
CREATE INDEX IF NOT EXISTS idx_lexicon_original_word_nfc ON lexicon(original_word_nfc);
CREATE INDEX IF NOT EXISTS idx_lexicon_original_word_stripped ON lexicon(original_word_stripped);
CREATE INDEX IF NOT EXISTS idx_lexicon_transliteration ON lexicon(transliteration);
