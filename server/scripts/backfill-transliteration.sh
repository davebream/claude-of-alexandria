#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd); SERVER_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/d1-bulk-lib.sh"; cd "$SERVER_DIR"
out=$(mktemp -d "${TMPDIR:-/tmp}/coa-translit.XXXXXX"); trap 'rm -rf "$out"' EXIT
python3 scripts/extract-opengnt.py --emit translit-staging --out-dir "$out"
python3 scripts/extract-macula-hebrew.py --emit translit-staging --out-dir "$out"
python3 scripts/test_translit_generator.py --corpus -v
nt=$(jq -r '.nt' "$out/morphology-translit-counts.json")
ot=$(jq -r '.ot' "$out/morphology-translit-counts.json")
[ "$nt" = "138013" ] && [ "$ot" = "378952" ] || { echo "Unexpected transliteration counts." >&2; exit 1; }
if ! require_apply_confirmation BACKFILL-TRANSLITERATION "$@"; then exit 0; fi
require_clean_main
for file in "$out"/morphology-translit-*.sql; do [ -f "$file" ] && d1 --file="$file"; done
result=$(d1_json --command "SELECT testament, COUNT(*) AS n FROM morphology WHERE transliteration IS NOT NULL GROUP BY testament")
actual_nt=$(echo "$result" | jq -r '[.[0].results[]? | select(.testament == "nt") | .n][0] // 0')
actual_ot=$(echo "$result" | jq -r '[.[0].results[]? | select(.testament == "ot") | .n][0] // 0')
[ "$actual_nt" = "$nt" ] && [ "$actual_ot" = "$ot" ] || { echo "Production transliteration coverage mismatch." >&2; exit 1; }
