-- 0014_add_xref_review_status.sql
-- Adds provenance columns to cross_references for flagging unresolved endpoints.
-- review_status tracks whether both endpoints resolved ('ok') or which failed.
-- from_raw/to_raw preserve the original unparsed reference text for unresolved endpoints.
-- Additive only — does not rebuild or drop the table.

ALTER TABLE cross_references ADD COLUMN review_status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE cross_references ADD COLUMN from_raw TEXT;
ALTER TABLE cross_references ADD COLUMN to_raw TEXT;
CREATE INDEX IF NOT EXISTS idx_xref_review_status ON cross_references(review_status);
