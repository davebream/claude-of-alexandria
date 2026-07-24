#!/usr/bin/env bash
# Shared safety checks for manually operated bulk D1 changes.
set -euo pipefail

DB_NAME="claude-of-alexandria"

require_apply_confirmation() {
  local expected="$1"
  shift
  local apply=false confirmation=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --apply) apply=true ;;
      --confirm) shift; confirmation="${1:-}" ;;
      *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
  done
  if [ "$apply" != true ] || [ "$confirmation" != "$expected" ]; then
    echo "Dry run complete. To write production D1, re-run with: --apply --confirm ${expected}" >&2
    return 1
  fi
}

require_clean_main() {
  local root
  root=$(git rev-parse --show-toplevel)
  [ "$(git -C "$root" branch --show-current)" = "main" ] || { echo "Refusing production write: checkout main first." >&2; exit 1; }
  git -C "$root" diff --quiet && git -C "$root" diff --cached --quiet || { echo "Refusing production write: worktree is dirty." >&2; exit 1; }
  git -C "$root" fetch origin main --quiet
  [ "$(git -C "$root" rev-parse HEAD)" = "$(git -C "$root" rev-parse origin/main)" ] || { echo "Refusing production write: local main is not origin/main." >&2; exit 1; }
}

d1() { npx wrangler@4.113.0 d1 execute "$DB_NAME" --remote "$@"; }
d1_json() { npx wrangler@4.113.0 d1 execute "$DB_NAME" --remote --json "$@"; }
