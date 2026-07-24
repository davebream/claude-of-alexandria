#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd); SERVER_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/d1-bulk-lib.sh"; cd "$SERVER_DIR"
out=$(mktemp -d "${TMPDIR:-/tmp}/coa-lemma-translit.XXXXXX"); trap 'rm -rf "$out"' EXIT
python3 - <<'PY'
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location('extract_macula_hebrew', 'scripts/extract-macula-hebrew.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); mod.download_tsv(pathlib.Path('.cache'))
PY
d1_json --command "SELECT DISTINCT lemma FROM vocabulary WHERE testament='ot' UNION SELECT DISTINCT lemma FROM thematic_keywords WHERE testament='ot'" > "$out/strongs-keys.json"
d1_json --command "SELECT DISTINCT lemma FROM morphology WHERE testament='ot' AND lemma <> ''" > "$out/lemma-keys.json"
python3 scripts/emit-lemma-strongs.py .cache/macula-hebrew.tsv "$out/emit.tsv"
npx tsx scripts/generate-lemma-translit.ts "$out/emit.tsv" "$out/sql" "$out/strongs-keys.json"
node scripts/verify-lemma-translit-coverage.mjs --sql-dir "$out/sql" --baseline "$out/sql/lemma-translit-baseline.json" --strongs-keys "$out/strongs-keys.json" --lemma-keys "$out/lemma-keys.json"
if ! require_apply_confirmation BACKFILL-LEMMA-TRANSLIT "$@"; then exit 0; fi
require_clean_main
for file in lemma_translit_he.sql lemma_translit_he_strongs.sql; do d1 --file="$out/sql/$file"; done
