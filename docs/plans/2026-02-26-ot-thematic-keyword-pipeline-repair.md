# OT Thematic Keyword Pipeline Repair

**Date:** 2026-02-26
**Status:** Revised (post-review)
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
seed-d1.sh  ← TRUNCATE thematic_keywords, then reload from data.sql + expansion
       ↓
D1 database (thematic_keywords table)
```

**Idempotency note:** The seed script uses a truncate-and-reload pattern for `thematic_keywords`. `DELETE FROM thematic_keywords` runs before `data.sql`, making the seed safe to run multiple times without accumulating duplicate rows. The `thematic_keywords` table has no UNIQUE constraint, so `INSERT OR IGNORE` alone cannot prevent duplicates.

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

### 2. Regenerate `server/d1-seed/thematic-keywords-expansion.sql`

Run the fixed generator:

```bash
cd /path/to/repo
python3 server/scripts/gen-thematic-keywords.py
```

Output will contain Strong's codes for all OT entries.

### 3. Update `server/scripts/seed-d1.sh`

Add a truncation step before the small-tables import. This makes the seed idempotent for `thematic_keywords` by clearing all rows before reloading from `data.sql` and the expansion SQL:

```bash
# Truncate thematic_keywords before reload (no UNIQUE constraint — must truncate for idempotency)
echo "Truncating thematic_keywords..."
npx wrangler d1 execute "$DB_NAME" --command="DELETE FROM thematic_keywords;" --remote
echo "  Truncated."

# Small tables (includes thematic_keywords data for original 13 themes)
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote

# Thematic keywords expansion (all 69 themes with Strong's codes for OT)
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
```

**Note:** The truncation step is safe on a fresh (empty) database — `DELETE` on an empty table is a no-op.

### 4. New: `server/scripts/verify-thematic-coverage.py`

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

1. Run `verify-thematic-coverage.py --theme suffering` — confirm which Strong's codes appear in Psalms
2. Apply fix, regenerate expansion SQL, reseed
3. Post-seed smoke test — confirm the JOIN produces non-zero results:
   ```sql
   SELECT COUNT(*) FROM vocabulary v
   JOIN thematic_keywords tk ON v.lemma = tk.lemma
   WHERE tk.testament = 'ot';
   ```
   Zero means the JOIN is still broken.
4. Run vocabulary query: `{ book: "Psalms", theme: "suffering", testament: "ot" }` — expect matches for H6040, H6862, H3510
5. Run vocabulary query: `{ book: "Psalms", theme: "death-life", testament: "ot" }` — expect matches for H4194, H2416
6. Spot-check other OT themes added in expansion SQL (sin, redemption, judgment) — expect results

---

## Files Changed

| File | Change |
|---|---|
| `server/scripts/gen-thematic-keywords.py` | Emit `strong_id` instead of `info["hebrew"]` for OT entries |
| `server/d1-seed/thematic-keywords-expansion.sql` | Regenerated with Strong's codes |
| `server/scripts/seed-d1.sh` | Add `DELETE FROM thematic_keywords` truncation before `data.sql` |
| `server/scripts/verify-thematic-coverage.py` | **New** — coverage audit script |

---

## Out of Scope

- Adding new themes to `semantic_groups.yaml` (not needed for this fix)
- Changes to NT thematic keywords (NT lemmas are Greek text and already match the `vocabulary` table correctly)
- Changes to the `vocabulary` table schema or data
