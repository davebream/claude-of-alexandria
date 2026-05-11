-- 0013_add_confessional.sql
-- Adds three tables for confessional documents sourced from Creeds.json (Unlicense).
-- Confession sections use chapter_number/section_number/content fields.
-- Catechism sections use question_number/question/answer fields.
-- Columns not applicable to a format are NULL.

CREATE TABLE IF NOT EXISTS confessional_documents (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL,
  year      INTEGER,
  tradition TEXT NOT NULL,
  format    TEXT NOT NULL CHECK(format IN ('confession', 'catechism')),
  authors   TEXT,
  source    TEXT NOT NULL DEFAULT 'Creeds.json'
);

CREATE TABLE IF NOT EXISTS confessional_sections (
  id                   INTEGER PRIMARY KEY,
  document_id          INTEGER NOT NULL REFERENCES confessional_documents(id),
  -- Confession fields (NULL for catechisms)
  chapter_number       INTEGER,
  chapter_title        TEXT,
  section_number       INTEGER,
  content              TEXT,
  content_with_proofs  TEXT,
  -- Catechism fields (NULL for confessions)
  question_number      INTEGER,
  question             TEXT,
  answer               TEXT,
  answer_with_proofs   TEXT
);

CREATE INDEX IF NOT EXISTS idx_conf_sections_document
  ON confessional_sections(document_id);

CREATE INDEX IF NOT EXISTS idx_conf_sections_chapter
  ON confessional_sections(document_id, chapter_number, section_number);

CREATE INDEX IF NOT EXISTS idx_conf_sections_question
  ON confessional_sections(document_id, question_number);

CREATE TABLE IF NOT EXISTS confessional_proof_texts (
  id          INTEGER PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES confessional_sections(id),
  proof_group INTEGER NOT NULL,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conf_proof_scripture
  ON confessional_proof_texts(book, chapter, verse);

CREATE INDEX IF NOT EXISTS idx_conf_proof_section
  ON confessional_proof_texts(section_id, proof_group);
