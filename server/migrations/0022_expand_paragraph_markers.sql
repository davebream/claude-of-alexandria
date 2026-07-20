-- 0022_expand_paragraph_markers.sql
-- Widens paragraph_markers to carry in-verse marker position (design C1,
-- plan #119) and adds graphic_signs for scribal annotations that are not
-- paragraph divisions. Additive only — does not rebuild or drop the table.
--
-- The ADD COLUMN statements below are plain ALTERs (house style: 0014, 0020,
-- 0021), idempotent-by-`d1_migrations`-tracker like every other migration in
-- this repo, NOT by an `IF NOT EXISTS` clause — SQLite's ALTER TABLE ADD
-- COLUMN has no such clause, and this repo's idempotency guarantee comes
-- from the migration only ever running once per environment (tracked in
-- `d1_migrations`), not from the SQL itself being safe to re-run standalone.

ALTER TABLE paragraph_markers ADD COLUMN ordinal_in_verse INTEGER;
ALTER TABLE paragraph_markers ADD COLUMN position TEXT;
ALTER TABLE paragraph_markers ADD COLUMN lexical_position TEXT;
ALTER TABLE paragraph_markers ADD COLUMN preceding_word_id TEXT;
ALTER TABLE paragraph_markers ADD COLUMN following_word_id TEXT;

CREATE TABLE IF NOT EXISTS graphic_signs (
  id TEXT PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subtype TEXT NOT NULL,
  interpretive_status TEXT NOT NULL,
  is_paragraph_separation INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_graphic_signs_book ON graphic_signs(book, chapter, verse);
