-- 0020_add_morphology_transliteration.sql
-- Adds the transliteration column so SBL romanization (backfilled separately —
-- see decisions/0005) can be surfaced as text_translit on query_morphology.

ALTER TABLE morphology ADD COLUMN transliteration TEXT;
