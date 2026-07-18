# Regenerating the `vocabulary` table (completeness / min_occurrences=1)

## Why this exists

`query_lemmas` (OT path) and `query_vocabulary` read the precomputed
`vocabulary` table. That table was built **per book** with a `min_occurrences`
significance threshold (NT 3, OT 5), which silently dropped every lemma
occurring fewer than N times *within a book* — e.g. μεταξύ in John 4:31 (1×),
רֵאשִׁית in Genesis. See `decisions/0009`.

Two fixes shipped in code:

1. **NT `query_lemmas` now reads the complete `morphology` table** — already
   live, no data regeneration needed.
2. **The extractors' `min_occurrences` default is now 1** — so the *next*
   regeneration of the `vocabulary` table is complete.

This runbook is step 2's delivery: it regenerates the `vocabulary` table so the
OT `query_lemmas` path and `query_vocabulary` stop under-reporting.

## What was blocking a plain regeneration

The historical path exported `d1-seed/data.sql` from a local sibling SQLite DB
(`../claude-of-alexandria-mcp/data/biblical.sqlite`). That machine/DB is gone,
so `export-d1.ts` cannot reproduce the vocabulary rows. `generate-vocabulary-sql.py`
removes that dependency: it goes straight from the extractor JSONs to the
`vocabulary` table SQL, so a regeneration needs only the two pinned upstream
corpora and the scripts in this repo.

## Procedure (maintainer)

Follows the generate-in-runner doctrine (`decisions/0005`, `0006`): nothing is
committed to `server/d1-seed/`, and SQL is applied per-book to bound each D1
request.

### 1. Fetch the pinned corpora

```bash
git clone https://github.com/morphgnt/sblgnt.git          # NT — MorphGNT/SBLGNT
git clone https://github.com/openscriptures/morphhb.git    # OT — WLC
# Pin each to the reviewed commit before regenerating (record the SHAs alongside
# the run — the reference JSON metadata previously baked in an extraction_date).
```

### 2. Regenerate the reference JSONs at the complete threshold (min=1 default)

```bash
cd plugins/claude-of-alexandria/skills/biblical-segmentation/scripts
python3 extract_nt_vocabulary.py -m /path/to/sblgnt  -o ../reference/vocabulary/nt
python3 extract_ot_vocabulary.py -m /path/to/morphhb -o ../reference/vocabulary/ot
# Default --min-occurrences is now 1; do NOT pass a higher value.
```

### 3. Convert JSONs → per-book `vocabulary` SQL

```bash
cd server
python3 scripts/generate-vocabulary-sql.py \
  --nt-dir ../plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt \
  --ot-dir ../plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot \
  --out-dir d1-seed/vocabulary-staging
# Sanity-check first: --verify prints μεταξύ Acts=3, and (min=1 input) John 4:1.
```

Output: `00-reset.sql` (`DELETE FROM vocabulary;`) plus one `nt-*.sql` / `ot-*.sql`
per book. Full-table replace: reset applied first, then every book re-inserted.

### 4. Apply to production D1 (destructive full-table replace)

`wrangler d1 execute --file=` takes exactly ONE file per invocation and does not
glob-expand — loop explicitly (precedent: `seed-d1.sh`'s per-book loop). **Never
run `seed-d1.sh` for this** — its NT path batch-deletes all NT morphology.

```bash
cd server
# Reset first, then every per-book file.
npx wrangler d1 execute claude-of-alexandria --remote --file=d1-seed/vocabulary-staging/00-reset.sql
for f in d1-seed/vocabulary-staging/{nt,ot}-*.sql; do
  echo "Applying ${f}"
  npx wrangler d1 execute claude-of-alexandria --remote --file="${f}"
done
```

### 5. Verify (the only correctness oracle)

```bash
# μεταξύ must now be present in John (the headline regression):
npx wrangler d1 execute claude-of-alexandria --remote --json \
  --command "SELECT book, chapter, frequency FROM vocabulary WHERE lemma='μεταξύ' AND testament='nt' ORDER BY book, chapter"
# Expect John 4 among the rows (Matthew, Luke, Acts, Romans too).
```

## ⚠️ Clobber caveat

The `vocabulary` table also ships in the committed-workflow seed path
(`d1-seed/data.sql`, generated from the now-absent sibling DB). Running
`seed-d1.sh` re-applies that **stale, thresholded** `data.sql`, silently
reverting this regeneration — the same footgun documented for the
transliteration backfill (a reseed does not auto-re-fire the completeness
regeneration). After this regeneration, treat `data.sql`'s vocabulary rows as
vestigial; a future reseed must be followed by re-running this procedure.

## Automation (proposed — not yet wired)

A dedicated `workflow_dispatch` GitHub Actions workflow can run steps 1–5
in-runner and apply to production, mirroring `.github/workflows/backfill-transliteration.yml`
(clone pinned corpora → extractors at min=1 → `generate-vocabulary-sql.py` →
per-file `wrangler d1 execute` loop → coverage-gate on μεταξύ-in-John). It is a
**destructive full-table replace on production D1 with no human in the loop
(`decisions/0004`)**, so it is intentionally left for a maintainer to review and
commit rather than being stood up automatically. Ask the repo owner before
wiring it.
