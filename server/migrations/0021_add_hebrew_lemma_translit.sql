-- 0021_add_hebrew_lemma_translit.sql
-- Derived SBL transliteration lookups for Hebrew dictionary forms (decisions/0007).
-- Schema only — data ships exclusively via backfill-lemma-translit.yml (two-tier rule).

CREATE TABLE IF NOT EXISTS lemma_translit_he (
  lemma TEXT PRIMARY KEY,          -- pointed lemma, byte-identical to morphology.lemma
  transliteration TEXT NOT NULL    -- SBL Academic w/ spirantization, derived
);

CREATE TABLE IF NOT EXISTS lemma_translit_he_strongs (
  strongs TEXT PRIMARY KEY,        -- BOTH forms present: exact ('H7225a') and base ('H7225')
  transliteration TEXT NOT NULL    -- representative per tie-break (decisions/0007)
);
