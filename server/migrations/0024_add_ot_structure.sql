-- 0024_add_ot_structure.sql
-- Boundary-oriented Old Testament structure features derived from Macula Hebrew
-- lowfat XML plus Clear Bible speaker-quotation spans.
--
-- Bulk rows are generated in-runner by server/scripts/extract-ot-structure.py.
-- This migration is schema-only; do not add corpus INSERTs here.

CREATE TABLE IF NOT EXISTS ot_structure_boundaries (
  book TEXT NOT NULL,
  boundary_ordinal INTEGER NOT NULL,

  before_chapter INTEGER NOT NULL,
  before_verse INTEGER NOT NULL,
  after_chapter INTEGER NOT NULL,
  after_verse INTEGER NOT NULL,
  before_ref_enc INTEGER NOT NULL,
  after_ref_enc INTEGER NOT NULL,

  previous_sentence_ended INTEGER NOT NULL,
  new_sentence_begins INTEGER NOT NULL,
  open_clause_depth INTEGER NOT NULL,
  clause_end_count INTEGER NOT NULL,
  clause_start_count INTEGER NOT NULL,
  clause_endings_json TEXT NOT NULL DEFAULT '[]',
  clause_beginnings_json TEXT NOT NULL DEFAULT '[]',

  participants_before_json TEXT NOT NULL DEFAULT '[]',
  participants_after_json TEXT NOT NULL DEFAULT '[]',
  participants_entered_json TEXT NOT NULL DEFAULT '[]',
  participants_exited_json TEXT NOT NULL DEFAULT '[]',
  participant_set_changed INTEGER NOT NULL,

  speakers_before_json TEXT NOT NULL DEFAULT '[]',
  speakers_after_json TEXT NOT NULL DEFAULT '[]',
  speaker_changed INTEGER NOT NULL,
  quotation_opened INTEGER NOT NULL,
  quotation_closed INTEGER NOT NULL,
  quotations_opened_json TEXT NOT NULL DEFAULT '[]',
  quotations_closed_json TEXT NOT NULL DEFAULT '[]',

  source_macula_commit TEXT NOT NULL,
  source_speaker_commit TEXT NOT NULL,

  PRIMARY KEY (book, boundary_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_ot_structure_before
  ON ot_structure_boundaries(book, before_ref_enc);

CREATE INDEX IF NOT EXISTS idx_ot_structure_after
  ON ot_structure_boundaries(book, after_ref_enc);
