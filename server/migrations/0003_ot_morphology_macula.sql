-- 0003_ot_morphology_macula.sql
-- Phase 1: Replace morphhb with Macula Hebrew as OT source
-- Adds testament index + columns for glosses, Strong's, syntax, semantic roles

-- Index for efficient OT-only DELETE during re-seed
CREATE INDEX IF NOT EXISTS idx_morph_testament ON morphology(testament);

-- Shared columns (OT populated in Phase 1, NT populated in Phase 5)
ALTER TABLE morphology ADD COLUMN gloss TEXT;
ALTER TABLE morphology ADD COLUMN strongs TEXT;
ALTER TABLE morphology ADD COLUMN clause_id TEXT;

-- OT-specific columns from Macula Hebrew
ALTER TABLE morphology ADD COLUMN clause_type TEXT;
ALTER TABLE morphology ADD COLUMN semantic_frame TEXT;
ALTER TABLE morphology ADD COLUMN subject_ref TEXT;
ALTER TABLE morphology ADD COLUMN participant_ref TEXT;

-- Index for Strong's number lookups
CREATE INDEX IF NOT EXISTS idx_morph_strongs ON morphology(strongs);
