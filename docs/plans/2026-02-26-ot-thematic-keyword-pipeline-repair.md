# OT Thematic Keyword Pipeline Repair

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Fix OT thematic keyword queries returning zero results for all expansion themes by correcting the lemma format in the generator script, regenerating the SQL, and hardening the seed script.

**Architecture:** The `gen-thematic-keywords.py` script emits Hebrew text (e.g., `מָוֶת`) as lemma values for OT keywords, but the `vocabulary` table stores OT lemmas as Strong's codes (`H4194`). The JOIN silently fails. Fix the generator to emit `strong_id` instead of `info["hebrew"]`, regenerate the SQL, add a `UNIQUE(theme, lemma, testament)` constraint to the schema, and rebuild the table on seed to ensure full idempotency.

**Tech Stack:** Python 3, YAML, Bash, SQL, Cloudflare D1 (via `wrangler`)

---

## Background: What Broke and Why

The `vocabulary` table stores OT lemmas as Strong's codes (`H4194`, `H2416`, etc.).
The `thematic_keywords` table joins on the `lemma` column.

| Source | Lemma format | Result |
|---|---|---|
| `data.sql` (13 original OT themes) | Strong's codes (`H8057`) | ✓ JOIN succeeds |
| `thematic-keywords-expansion.sql` (all OT entries) | Hebrew text (`שִׂמְחָה`) | ✗ JOIN fails silently |

The fix is a one-line change to the generator. Everything else is downstream of that.

---

## Files

| File | Change |
|---|---|
| `server/scripts/gen-thematic-keywords.py` | Line 25: emit `strong_id` instead of `info["hebrew"]` |
| `server/d1-seed/thematic-keywords-expansion.sql` | Regenerated (Strong's codes for all OT entries) |
| `server/d1-seed/schema.sql` | Add `UNIQUE(theme, lemma, testament)` to `thematic_keywords` |
| `server/scripts/seed-d1.sh` | DROP TABLE + CREATE TABLE before `data.sql` import (replaces bare DELETE) |
| `server/scripts/verify-thematic-coverage.py` | **New** — standalone coverage audit script |

---

## Task 1: Confirm the Bug (Read-Only)

**Files:**
- Read: `server/d1-seed/thematic-keywords-expansion.sql` (lines 8-11)
- Read: `server/d1-seed/data.sql` (lines 202134-202137 area)

**Step 1: Look at OT entries in expansion SQL**

Open `server/d1-seed/thematic-keywords-expansion.sql` and find any `'ot'` entry. You will see:

```sql
-- What you see (broken):
INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('joy', 'שִׂמְחָה', 'ot');
```

**Step 2: Look at OT entries in data.sql**

Search `data.sql` for `INSERT INTO thematic_keywords` and find OT entries. You will see:

```sql
-- What data.sql has (correct):
INSERT INTO thematic_keywords (theme, lemma, testament) VALUES ('joy', 'H8057', 'ot');
```

**Step 3: Confirm the mismatch**

The vocabulary table OT lemma format (also in `data.sql`):
```sql
INSERT INTO vocabulary (id, book, testament, chapter, lemma, frequency) VALUES (33273, 'genesis', 'ot', 1, 'H1254a', 5);
```

Hebrew text (`שִׂמְחָה`) never matches `H8057` — that is the bug. The JOIN always returns 0.

✓ Bug confirmed. No code changes in this task.

---

## Task 2: Fix `gen-thematic-keywords.py`

**Files:**
- Modify: `server/scripts/gen-thematic-keywords.py:25`

**Step 1: Read the current broken line**

In `server/scripts/gen-thematic-keywords.py`, lines 23–27 currently read:

```python
    if "ot_strongs" in group:
        for strong_id, info in group["ot_strongs"].items():
            escaped_hebrew = info["hebrew"].replace("'", "''")
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{escaped_hebrew}', 'ot');")
            count += 1
```

**Step 2: Apply the fix**

Replace lines 24–26 (the `escaped_hebrew` variable and the INSERT using it) with a single INSERT using `strong_id`:

```python
    if "ot_strongs" in group:
        for strong_id, info in group["ot_strongs"].items():
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{strong_id}', 'ot');")
            count += 1
```

No escaping is needed — Strong's IDs are ASCII (`H` + digits + optional lowercase suffix, e.g. `H1254a`).

**Step 3: Verify the diff**

Run:
```bash
git diff server/scripts/gen-thematic-keywords.py
```

Expected: only the `escaped_hebrew` assignment line deleted and the INSERT changed from `'{escaped_hebrew}'` to `'{strong_id}'`.

**Step 4: Commit**

```bash
git add server/scripts/gen-thematic-keywords.py
git commit -m "fix(keywords): emit strong_id instead of Hebrew text for OT thematic keywords"
```

---

## Task 3: Regenerate `thematic-keywords-expansion.sql`

**Files:**
- Modify (generated): `server/d1-seed/thematic-keywords-expansion.sql`

**Step 1: Run the fixed generator from the repo root**

```bash
python3 server/scripts/gen-thematic-keywords.py
```

Expected output:
```
Generated 363 INSERT statements for 69 themes → server/d1-seed/thematic-keywords-expansion.sql
```
(Count may vary slightly if the YAML is edited — the important thing is no error and the file is rewritten.)

**Step 2: Verify the output format**

Open `server/d1-seed/thematic-keywords-expansion.sql` and look at the first OT entry. It should now show:

```sql
-- What you should see (fixed):
INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('joy', 'H8057', 'ot');
INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('joy', 'H8055', 'ot');
```

No Hebrew text (`שׂ`, `מ`, etc.) should appear in the `'ot'` rows.

**Step 3: Sanity-check a theme from the expansion (not in data.sql)**

Search for the `suffering` theme — it was added via the expansion SQL, not in `data.sql`:

```bash
grep "suffering.*ot" server/d1-seed/thematic-keywords-expansion.sql | head -5
```

Expected: lines like `VALUES ('suffering', 'H6040', 'ot')` — all Strong's codes.

**Step 4: Verify no Hebrew text appears for OT entries**

Confirm every OT lemma starts with `H` (Strong's code format):
```bash
python3 -c "
import re
with open('server/d1-seed/thematic-keywords-expansion.sql') as f:
    for i, line in enumerate(f, 1):
        if \"'ot'\" in line:
            # Extract lemma value
            m = re.search(r\"VALUES \('[^']+', '([^']+)', 'ot'\)\", line)
            if m:
                lemma = m.group(1)
                if not lemma.startswith('H'):
                    print(f'Line {i}: unexpected OT lemma: {lemma}')
print('Check complete')
"
```

Expected: only `Check complete` — no unexpected OT lemmas.

**Step 5: Commit**

```bash
git add server/d1-seed/thematic-keywords-expansion.sql
git commit -m "chore(seed): regenerate thematic-keywords-expansion.sql with Strong's codes for OT"
```

---

## Task 4: Fix Schema UNIQUE Constraint and Seed Idempotency

**Files:**
- Modify: `server/d1-seed/schema.sql:46-51`
- Modify: `server/scripts/seed-d1.sh:15-18`

**Why this is needed:** `thematic_keywords` has no UNIQUE constraint. `INSERT OR IGNORE` only ignores exact duplicates if a UNIQUE constraint exists — without one, it inserts duplicates. Additionally, `data.sql` contains 59 `thematic_keywords` rows for the original 13 themes. After Task 3 regenerates the expansion SQL with Strong's codes, all 59 of those rows become exact duplicates of expansion SQL rows — producing 59 duplicate rows on every seed run.

**Solution:** Add `UNIQUE(theme, lemma, testament)` to `schema.sql`, and change the seed script to `DROP TABLE IF EXISTS thematic_keywords` + `CREATE TABLE` before importing. This ensures the UNIQUE constraint applies to both new and existing databases, and makes `INSERT OR IGNORE` correctly deduplicate the `data.sql`/expansion SQL overlap.

**Step 1: Update `schema.sql` — add UNIQUE constraint**

In `server/d1-seed/schema.sql`, replace lines 46–51:

```sql
-- Before:
CREATE TABLE IF NOT EXISTS thematic_keywords (
  theme TEXT NOT NULL,
  lemma TEXT NOT NULL,
  testament TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);
```

With:

```sql
-- After:
CREATE TABLE IF NOT EXISTS thematic_keywords (
  theme TEXT NOT NULL,
  lemma TEXT NOT NULL,
  testament TEXT NOT NULL,
  UNIQUE(theme, lemma, testament)
);
CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);
```

**Step 2: Read the current seed script**

Current lines 15–18:
```bash
# Small tables
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote
echo "  Small tables imported."
```

**Step 3: Add the rebuild step before the small tables import**

Insert these lines immediately before the `# Small tables` comment:

```bash
# Rebuild thematic_keywords with UNIQUE constraint (DROP+CREATE ensures constraint applies to existing DBs)
# Split into separate commands to avoid wrangler multi-statement parser issues on remote D1
echo "Rebuilding thematic_keywords table..."
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE thematic_keywords (theme TEXT NOT NULL, lemma TEXT NOT NULL, testament TEXT NOT NULL, UNIQUE(theme, lemma, testament));" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);" --remote
echo "  Rebuilt."

```

The result should be:
```bash
# Rebuild thematic_keywords with UNIQUE constraint (DROP+CREATE ensures constraint applies to existing DBs)
# Split into separate commands to avoid wrangler multi-statement parser issues on remote D1
echo "Rebuilding thematic_keywords table..."
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE thematic_keywords (theme TEXT NOT NULL, lemma TEXT NOT NULL, testament TEXT NOT NULL, UNIQUE(theme, lemma, testament));" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);" --remote
echo "  Rebuilt."

# Small tables
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote
echo "  Small tables imported."
```

**Note:** `DROP TABLE IF EXISTS` on a table that already exists cleanly removes it. On a fresh database where the table doesn't yet exist, it is a no-op. The subsequent `CREATE TABLE` always creates the table fresh with the UNIQUE constraint. The commands are split into separate `--command` calls because wrangler's remote SQL parser has known issues with multi-statement execution (cloudflare/workers-sdk #4713, #3892).

**Step 4: Verify the diffs**

```bash
git diff server/d1-seed/schema.sql
```

Expected: one line added inside the `thematic_keywords` CREATE TABLE — the `UNIQUE(theme, lemma, testament)` line.

```bash
git diff server/scripts/seed-d1.sh
```

Expected: 6 lines added before `# Small tables` (the rebuild block). No other changes.

**Step 5: Commit**

```bash
git add server/d1-seed/schema.sql server/scripts/seed-d1.sh
git commit -m "fix(seed): add UNIQUE constraint to thematic_keywords and rebuild on seed for full idempotency"
```

---

## Task 5: Create `verify-thematic-coverage.py`

**Files:**
- Create: `server/scripts/verify-thematic-coverage.py`

This is a standalone read-only audit script. It loads `semantic_groups.yaml` and `ot_lemmas.yaml` locally — no database access required. It reports which Strong's codes from each theme appear in the OT corpus (and in which books), and flags any codes that have 0 occurrences.

**Scope note:** This script verifies YAML→corpus coverage only. It does not read `thematic-keywords-expansion.sql` and cannot confirm that the SQL file was regenerated correctly. The SQL correctness gate is the Python check in Task 3 Step 4. The live database correctness gate is Task 6.

**Expected [DATA GAP] output:** ~37 Strong's codes will show as `✗ ... [DATA GAP]` — these are codes that fall below the `min_occurrences` frequency threshold in `ot_lemmas.yaml` (e.g., H6862, H3510, H2416). This is expected, pre-existing data. It is not evidence of a bug in the fix.

**Step 1: Write the script**

Create `server/scripts/verify-thematic-coverage.py` with this content:

```python
#!/usr/bin/env python3
"""
Cross-check thematic OT Strong's codes against the ot_lemmas.yaml corpus.

Usage:
  python3 server/scripts/verify-thematic-coverage.py
  python3 server/scripts/verify-thematic-coverage.py --book Psalms
  python3 server/scripts/verify-thematic-coverage.py --theme suffering
"""
import argparse
import yaml
from pathlib import Path

SEMANTIC_GROUPS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
OT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot_lemmas.yaml"


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def build_lemma_index(ot_lemmas):
    """
    Return: {strong_id: {book: count, ...}, ...}
    Only includes books present in ot_lemmas.yaml.
    """
    index = {}
    for book, book_data in ot_lemmas.get("books", {}).items():
        for strong_id, lemma_data in book_data.get("lemmas", {}).items():
            if strong_id not in index:
                index[strong_id] = {}
            index[strong_id][book] = lemma_data.get("total", 0)
    return index


def report_theme(theme, group, lemma_index, filter_book=None):
    ot_strongs = group.get("ot_strongs", {})
    if not ot_strongs:
        print(f"  [no OT entries]")
        return

    for strong_id, info in ot_strongs.items():
        hebrew = info.get("hebrew", "?")
        gloss = info.get("gloss", "?")
        book_counts = lemma_index.get(strong_id, {})

        if filter_book:
            count = book_counts.get(filter_book, 0)
            status = "✓" if count > 0 else "✗"
            print(f"  {status} {strong_id} ({hebrew} — {gloss}): {filter_book}={count}")
        else:
            total = sum(book_counts.values())
            if total == 0:
                print(f"  ✗ {strong_id} ({hebrew} — {gloss}): 0 occurrences in corpus [DATA GAP]")
            else:
                top_books = sorted(book_counts.items(), key=lambda x: -x[1])[:3]
                top_str = ", ".join(f"{b}:{n}" for b, n in top_books)
                print(f"  ✓ {strong_id} ({hebrew} — {gloss}): total={total} (top: {top_str})")


def main():
    parser = argparse.ArgumentParser(description="Verify OT thematic keyword coverage")
    parser.add_argument("--book", help="Filter results to a specific book (e.g. Psalms)")
    parser.add_argument("--theme", help="Show only a specific theme (e.g. suffering)")
    args = parser.parse_args()

    semantic = load_yaml(SEMANTIC_GROUPS_PATH)
    ot_lemmas = load_yaml(OT_LEMMAS_PATH)

    groups = semantic["semantic_groups"]
    lemma_index = build_lemma_index(ot_lemmas)

    themes_to_show = [args.theme] if args.theme else list(groups.keys())

    for theme in themes_to_show:
        if theme not in groups:
            print(f"Theme '{theme}' not found in semantic_groups.yaml")
            continue
        group = groups[theme]
        label = f"Theme: {theme}"
        if args.book:
            label += f" (filtered: {args.book})"
        print(label)
        report_theme(theme, group, lemma_index, filter_book=args.book)
        print()


if __name__ == "__main__":
    main()
```

**Step 2: Make it executable**

```bash
chmod +x server/scripts/verify-thematic-coverage.py
```

**Step 3: Run a quick smoke test (no database needed)**

```bash
python3 server/scripts/verify-thematic-coverage.py --theme suffering
```

Expected output (approximate):
```
Theme: suffering
  ✓ H6040 (עֳנִי — affliction, suffering): total=62 (top: Psalms:14, Isaiah:12, ...)
  ✗ H6862 (צַר — distress, adversary): 0 occurrences in corpus [DATA GAP]
  ✗ H3510 (כָּאַב — pain, grief): 0 occurrences in corpus [DATA GAP]
```

H6862 and H3510 are below the `ot_lemmas.yaml` frequency threshold — `[DATA GAP]` is expected output, not a bug.

**Step 4: Run with --book Psalms for a specific book report**

```bash
python3 server/scripts/verify-thematic-coverage.py --theme suffering --book Psalms
python3 server/scripts/verify-thematic-coverage.py --theme death-life --book Psalms
```

Expected: H6040 shows non-zero count for Psalms (suffering); H4194 shows non-zero count (death-life). H6862, H3510, H2416 show 0 — these are below the corpus frequency threshold and that is expected.

**Step 5: Commit**

```bash
git add server/scripts/verify-thematic-coverage.py
git commit -m "feat(scripts): add verify-thematic-coverage.py for OT thematic keyword audit"
```

---

## Task 6: Post-Seed Verification (Requires D1 Access)

**Prerequisites:** Cloudflare credentials configured, `npx wrangler` available.

This task verifies the fix in the live D1 database. Skip if you don't have remote access.

**Step 1: Run the full seed**

```bash
bash server/scripts/seed-d1.sh
```

Watch for:
- `Rebuilding thematic_keywords table...` — new step, confirms DROP+CREATE ran
- `Importing thematic keywords expansion...` — should complete without error

**Step 2: Run the JOIN smoke test**

```bash
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT COUNT(*) as matches FROM vocabulary v JOIN thematic_keywords tk ON v.lemma = tk.lemma WHERE tk.testament = 'ot';" \
  --remote
```

Expected: `matches` > 0. If `matches = 0`, the JOIN is still broken — stop and investigate.

**Step 3: Test specific themes that were failing**

```bash
# Test: suffering theme in Psalms
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT v.book, v.chapter, tk.lemma FROM vocabulary v JOIN thematic_keywords tk ON v.lemma = tk.lemma WHERE tk.theme = 'suffering' AND tk.testament = 'ot' AND v.book = 'psalms' LIMIT 10;" \
  --remote
```

Expected: rows including `H6040` (affliction, ~10 occurrences in Psalms). **Do not expect H6862 or H3510** — these are defined in the theme YAML but fall below the vocabulary corpus frequency threshold (`ot_lemmas.yaml` only includes lemmas with ≥5 occurrences). They will return 0 rows from the JOIN. This is correct behavior, not a bug.

```bash
# Test: death-life theme in Psalms
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT v.book, v.chapter, tk.lemma FROM vocabulary v JOIN thematic_keywords tk ON v.lemma = tk.lemma WHERE tk.theme = 'death-life' AND tk.testament = 'ot' AND v.book = 'psalms' LIMIT 10;" \
  --remote
```

Expected: rows including `H4194` (death, ~22 occurrences in Psalms). **Do not expect H2416** (life) — it is also below the corpus frequency threshold and returns 0 rows from the JOIN. This is correct behavior, not a bug.

**Step 4: Spot-check other expansion themes**

```bash
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT tk.theme, COUNT(*) as matches FROM vocabulary v JOIN thematic_keywords tk ON v.lemma = tk.lemma WHERE tk.testament = 'ot' GROUP BY tk.theme ORDER BY tk.theme;" \
  --remote
```

Expected: all expansion themes (sin, redemption, judgment, etc.) show non-zero match counts.

**Step 5: Verify idempotency — run seed twice**

```bash
bash server/scripts/seed-d1.sh  # Run a second time
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT COUNT(*) FROM thematic_keywords WHERE testament = 'ot';" \
  --remote
```

Expected: row count is the same as after first seed. If it doubled, the DROP+CREATE step isn't working.

---

## Done Criteria

- [ ] `thematic-keywords-expansion.sql` contains no Hebrew text in `'ot'` rows
- [ ] All OT entries in expansion SQL use `H`-prefixed Strong's codes
- [ ] `schema.sql` `thematic_keywords` table definition includes `UNIQUE(theme, lemma, testament)`
- [ ] `seed-d1.sh` includes DROP TABLE + CREATE TABLE for `thematic_keywords` before `data.sql`
- [ ] `verify-thematic-coverage.py` runs cleanly and reports Psalms coverage for `suffering` (H6040) and `death-life` (H4194)
- [ ] Post-seed JOIN smoke test returns non-zero `matches`
- [ ] Vocabulary query for `{ book: "Psalms", theme: "suffering", testament: "ot" }` returns rows with H6040
- [ ] Vocabulary query for `{ book: "Psalms", theme: "death-life", testament: "ot" }` returns rows with H4194
- [ ] Idempotency test passes: row count after second seed equals row count after first seed
- [ ] All 4 commits present with conventional commit messages
