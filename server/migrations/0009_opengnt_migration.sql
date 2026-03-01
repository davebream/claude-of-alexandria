-- 0009_opengnt_migration.sql
-- Phase 5: NT-specific columns for OpenGNT data
-- These columns already exist from Phase 1 (0003_ot_morphology_macula.sql):
--   gloss, strongs, clause_id, idx_morph_strongs
-- Phase 5 only adds NT-specific columns:
ALTER TABLE morphology ADD COLUMN gloss_tbesg TEXT;
ALTER TABLE morphology ADD COLUMN louw_nida TEXT;
ALTER TABLE morphology ADD COLUMN louw_nida_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_morph_louw_nida_domain ON morphology(louw_nida_domain);

-- New table: OpenText clause-level annotations
CREATE TABLE IF NOT EXISTS syntax_annotations (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  clause_id TEXT,
  clause_type TEXT NOT NULL,
  clause_relation TEXT,
  clause_text TEXT,
  word_groups TEXT,
  parent_clause_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_syntax_range ON syntax_annotations(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_syntax_clause ON syntax_annotations(clause_id);

-- New table: textual variant edition markers
CREATE TABLE IF NOT EXISTS textual_variants (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  word_position INTEGER NOT NULL,
  ognt_text TEXT NOT NULL,
  editions TEXT NOT NULL,
  variant_type TEXT,
  variant_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_variant_word ON textual_variants(book, chapter, verse, word_position);

-- New table: sparse Levinsohn discourse boundary markers
CREATE TABLE IF NOT EXISTS discourse_boundaries (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  word_position INTEGER NOT NULL,
  boundary_type TEXT NOT NULL,
  clause_id TEXT,
  clause_marker TEXT,
  note_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_discourse_boundary_range ON discourse_boundaries(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_discourse_boundary_clause ON discourse_boundaries(clause_id);
