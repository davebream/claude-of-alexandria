#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd); SERVER_DIR=$(cd "$SCRIPT_DIR/.." && pwd); ROOT_DIR=$(cd "$SERVER_DIR/.." && pwd)
source "$SCRIPT_DIR/d1-bulk-lib.sh"
SBLGNT_SHA=${SBLGNT_SHA:?Set SBLGNT_SHA to the reviewed immutable commit SHA}
MORPHHB_SHA=${MORPHHB_SHA:?Set MORPHHB_SHA to the reviewed immutable commit SHA}
work=$(mktemp -d "${TMPDIR:-/tmp}/coa-vocabulary.XXXXXX"); trap 'rm -rf "$work"' EXIT
git clone https://github.com/morphgnt/sblgnt.git "$work/sblgnt"; git -C "$work/sblgnt" checkout "$SBLGNT_SHA"
git clone https://github.com/openscriptures/morphhb.git "$work/morphhb"; git -C "$work/morphhb" checkout "$MORPHHB_SHA"
python3 "$ROOT_DIR/plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_nt_vocabulary.py" -m "$work/sblgnt" -o "$work/nt"
python3 "$ROOT_DIR/plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_ot_vocabulary.py" -m "$work/morphhb" -o "$work/ot"
cd "$SERVER_DIR"; python3 scripts/generate-vocabulary-sql.py --nt-dir "$work/nt" --ot-dir "$work/ot" --out-dir "$work/sql" --verify
grep -q 'μεταξύ' "$work/sql/nt-john.sql" && grep -q "'H7225'" "$work/sql/ot-genesis.sql" || { echo "Vocabulary completeness oracle failed." >&2; exit 1; }
if ! require_apply_confirmation REGENERATE-VOCABULARY "$@"; then exit 0; fi
require_clean_main
d1 --file="$work/sql/00-reset.sql"
for file in "$work/sql"/{nt,ot}-*.sql; do [ -f "$file" ] && d1 --file="$file"; done
nt=$(d1_json --command "SELECT COUNT(*) AS n FROM vocabulary WHERE lemma='μεταξύ' AND testament='nt' AND book='john'" | jq -r '[.[0].results[]?.n][0] // 0')
ot=$(d1_json --command "SELECT COUNT(*) AS n FROM vocabulary WHERE lemma='H7225' AND testament='ot' AND book='genesis'" | jq -r '[.[0].results[]?.n][0] // 0')
[ "$nt" = "1" ] && [ "$ot" -ge 1 ] || { echo "Vocabulary coverage gate failed." >&2; exit 1; }
