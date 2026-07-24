#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd); SERVER_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
source "$SCRIPT_DIR/d1-bulk-lib.sh"; cd "$SERVER_DIR"
out=$(mktemp -d "${TMPDIR:-/tmp}/coa-theographic.XXXXXX"); trap 'rm -rf "$out"' EXIT
python3 scripts/etl-theographic.py --emit place-redirect --out-dir "$out"
python3 scripts/test_etl_theographic.py --corpus -v
[ "$(jq -r '.duplicate_mapping_count' "$out/theographic-place-redirect-manifest.json")" = "27" ] || { echo "Unexpected redirect mapping count." >&2; exit 1; }
if ! require_apply_confirmation BACKFILL-THEOGRAPHIC-PLACES "$@"; then exit 0; fi
require_clean_main
cleanup() { d1 --command 'DROP TABLE IF EXISTS theographic_place_redirect' || true; }
trap cleanup EXIT
d1 --file="$out/theographic-place-redirect-head.sql"
d1 --file="$out/theographic-place-redirect-apply.sql"
d1 --file="$out/theographic-place-redirect-tail.sql"
trap - EXIT
