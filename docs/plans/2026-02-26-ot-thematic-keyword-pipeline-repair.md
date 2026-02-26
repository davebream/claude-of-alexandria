# OT Thematic Keyword Pipeline Repair

**Date:** 2026-02-26
**Status:** Approved
**Trigger:** Finding — themed vocabulary queries for "suffering" and "death-life" returned no matches for the Psalms corpus.

---

## Root Cause

The `vocabulary` table stores OT lemmas as Strong's codes (`H4194`, `H2416`, etc.). The `thematic_keywords` table joins against this table on the `lemma` column. However, `gen-thematic-keywords.py` emits Hebrew text (`מָוֶת`, `חַי`) for OT entries instead of Strong's codes.

The JOIN `thematic_keywords.lemma = vocabulary.lemma` silently fails for all OT entries in `thematic-keywords-expansion.sql`, producing 0 results.

**Scope:** Affects all OT themes added via the expansion SQL — not only "suffering" and "death-life". The original 13 themes (joy, faith, love, etc.) work because they were seeded in `data.sql` with Strong's codes before the expansion script existed.

---

## What Works vs What Fails

| Source | Lemma format | Result |
|---|---|---|
| `data.sql` (13 original OT themes) | Strong's codes (`H8057`) | ✓ JOIN succeeds |
| `thematic-keywords-expansion.sql` (all OT entries) | Hebrew text (`שִׂמְחָה`) | ✗ JOIN fails |

---

## Design

### Architecture

```
semantic_groups.yaml
       ↓
gen-thematic-keywords.py  ← FIX: emit strong_id, not info["hebrew"]
       ↓
thematic-keywords-expansion.sql  ← REGENERATE
       ↓
seed-d1.sh  ← ADD cleanup step before expansion
       ↓
D1 database (thematic_keywords table)
```

Coverage verification runs as a standalone post-generate step (not blocking seed).

---

## Changes

### 1. Fix `server/scripts/gen-thematic-keywords.py`

In the `ot_strongs` loop, change the lemma emitted from Hebrew text to Strong's code:

```python
# BEFORE
for strong_id, info in group["ot_strongs"].items():
    escaped_hebrew = info["hebrew"].replace("'", "''")
    lines.append(f"INSERT OR IGNORE INTO thematic_keywords (...) VALUES ('{theme}', '{escaped_hebrew}', 'ot');")

# AFTER
for strong_id, info in group["ot_strongs"].items():
    lines.append(f"INSERT OR IGNORE INTO thematic_keywords (...) VALUES ('{theme}', '{strong_id}', 'ot');")
```

No escaping needed — Strong's codes are ASCII (`H` + digits + optional lowercase letter).

### 2. New: `server/d1-seed/thematic-keywords-cleanup.sql`

Deletes the erroneous Hebrew text rows from the `thematic_keywords` table. Targets OT rows where the lemma is not a Strong's code (Strong's codes always start with `H` followed by digits):

```sql
-- Remove erroneous Hebrew text lemmas from OT thematic keywords
-- These were inserted by the old gen-thematic-keywords.py which emitted Hebrew text
-- instead of Strong's codes. Strong's codes always match H[0-9]+[a-z]?
DELETE FROM thematic_keywords WHERE testament = 'ot' AND lemma NOT LIKE 'H%';
```

### 3. Regenerate `server/d1-seed/thematic-keywords-expansion.sql`

Run the fixed generator:

```bash
cd /path/to/repo
python3 server/scripts/gen-thematic-keywords.py
```

Output will contain Strong's codes for all OT entries.

### 4. Update `server/scripts/seed-d1.sh`

Add the cleanup step before the expansion import:

```bash
# Cleanup erroneous Hebrew text thematic keywords
echo "Cleaning up erroneous OT thematic keywords..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-cleanup.sql" --remote
echo "  Cleanup complete."

# Thematic keywords expansion
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
```

### 5. New: `server/scripts/verify-thematic-coverage.py`

Standalone script that cross-checks each `ot_strongs` Strong's code in `semantic_groups.yaml` against `ot_lemmas.yaml`. Outputs:
- Which Strong's codes appear in which books and with what frequency
- Which Strong's codes have 0 occurrences in the entire OT corpus (data gap)
- Specifically flags Psalms coverage for each theme

Usage:
```bash
python3 server/scripts/verify-thematic-coverage.py
python3 server/scripts/verify-thematic-coverage.py --book Psalms
python3 server/scripts/verify-thematic-coverage.py --theme suffering
```

This script is read-only and produces no side effects.

---

## Testing

1. Run `verify-thematic-coverage.py --theme suffering` before the fix — confirm 0 matches in Psalms via query
2. Apply fix, regenerate, reseed
3. Run vocabulary query: `{ book: "Psalms", theme: "suffering", testament: "ot" }` — expect matches for H6040, H6862, H3510
4. Run vocabulary query: `{ book: "Psalms", theme: "death-life", testament: "ot" }` — expect matches for H4194, H2416
5. Spot-check other OT themes in expansion SQL (sin, redemption, judgment) — expect results

---

## Files Changed

| File | Change |
|---|---|
| `server/scripts/gen-thematic-keywords.py` | Emit `strong_id` instead of `info["hebrew"]` for OT entries |
| `server/d1-seed/thematic-keywords-cleanup.sql` | **New** — DELETE Hebrew text rows |
| `server/d1-seed/thematic-keywords-expansion.sql` | Regenerated with Strong's codes |
| `server/scripts/seed-d1.sh` | Add cleanup step before expansion import |
| `server/scripts/verify-thematic-coverage.py` | **New** — coverage audit script |

---

## Out of Scope

- Adding new themes to `semantic_groups.yaml` (not needed for this fix)
- Changes to NT thematic keywords (NT lemmas are Greek text and already match the `vocabulary` table correctly)
- Changes to the `vocabulary` table schema or data
