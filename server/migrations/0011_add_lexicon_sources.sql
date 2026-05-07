-- 0011_add_lexicon_sources.sql
-- Adds four new lexicon source tables alongside the existing lexicon table.
-- The old table is not dropped here — see 0012_drop_old_lexicon.sql (post-verification).

-- Greek: Liddell-Scott-Jones (LSJ) — comprehensive classical and NT Greek lexicon
CREATE TABLE IF NOT EXISTS lexicon_lsj (
  strongs_id TEXT PRIMARY KEY,
  original_word TEXT NOT NULL,
  original_word_nfc TEXT NOT NULL,
  original_word_stripped TEXT NOT NULL,
  transliteration TEXT,
  gloss TEXT NOT NULL,
  definition TEXT
);

CREATE INDEX IF NOT EXISTS idx_lsj_original_word ON lexicon_lsj(original_word);
CREATE INDEX IF NOT EXISTS idx_lsj_original_word_nfc ON lexicon_lsj(original_word_nfc);
CREATE INDEX IF NOT EXISTS idx_lsj_original_word_stripped ON lexicon_lsj(original_word_stripped);

-- Greek: Abbott-Smith — manual of Greek lexicon of the NT
CREATE TABLE IF NOT EXISTS lexicon_abbott_smith (
  strongs_id TEXT PRIMARY KEY,
  original_word TEXT NOT NULL,
  original_word_nfc TEXT NOT NULL,
  original_word_stripped TEXT NOT NULL,
  transliteration TEXT,
  gloss TEXT NOT NULL,
  definition TEXT
);

CREATE INDEX IF NOT EXISTS idx_abbott_smith_original_word_nfc ON lexicon_abbott_smith(original_word_nfc);
CREATE INDEX IF NOT EXISTS idx_abbott_smith_original_word_stripped ON lexicon_abbott_smith(original_word_stripped);

-- Hebrew: Brown-Driver-Briggs (BDB) — Hebrew and Chaldee lexicon
CREATE TABLE IF NOT EXISTS lexicon_bdb (
  strongs_id TEXT PRIMARY KEY,
  original_word TEXT NOT NULL,
  original_word_nfc TEXT NOT NULL,
  original_word_stripped TEXT NOT NULL,
  transliteration TEXT,
  gloss TEXT NOT NULL,
  definition TEXT
);

CREATE INDEX IF NOT EXISTS idx_bdb_original_word ON lexicon_bdb(original_word);
CREATE INDEX IF NOT EXISTS idx_bdb_original_word_nfc ON lexicon_bdb(original_word_nfc);
CREATE INDEX IF NOT EXISTS idx_bdb_original_word_stripped ON lexicon_bdb(original_word_stripped);

-- Greek + Hebrew: UBS semantic domains
CREATE TABLE IF NOT EXISTS lexicon_ubs_domains (
  id INTEGER PRIMARY KEY,
  strongs_id TEXT NOT NULL,
  domain_code TEXT NOT NULL,
  domain_name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ubs_domains_strongs_id ON lexicon_ubs_domains(strongs_id);
