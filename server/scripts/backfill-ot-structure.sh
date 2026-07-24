#!/usr/bin/env bash
# Generate and validate OT structure SQL locally. Writes require explicit intent.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SERVER_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/d1-bulk-lib.sh"
cd "$SERVER_DIR"

out=$(mktemp -d "${TMPDIR:-/tmp}/coa-ot-structure.XXXXXX")
trap 'rm -rf "$out"' EXIT
python3 scripts/extract-ot-structure.py --out-dir "$out"
python3 scripts/test_extract_ot_structure.py --corpus -v
expected=$(jq -r '.total_boundaries' "$out/ot-structure-counts.json")
[ "$expected" = "23174" ] || { echo "Unexpected generated boundary count: $expected" >&2; exit 1; }

if ! require_apply_confirmation APPLY-OT-STRUCTURE "$@"; then exit 0; fi
require_clean_main
shopt -s nullglob
files=("$out"/ot-structure-*.sql)
[ ${#files[@]} -gt 0 ] || { echo "No generated OT structure SQL files." >&2; exit 1; }
for file in "${files[@]}"; do d1 --file="$file"; done
actual=$(d1_json --command "SELECT COUNT(*) AS n FROM ot_structure_boundaries" | jq -r '.[0].results[0].n // 0')
[ "$actual" = "$expected" ] || { echo "OT structure count mismatch: $actual != $expected" >&2; exit 1; }
echo "OT structure backfill complete: $actual rows."
