-- 0012_drop_old_lexicon.sql
-- Drops the old single-source lexicon table.
-- ONLY apply after verifying the new multi-source tables are seeded and the Worker is stable.
DROP TABLE IF EXISTS lexicon;
