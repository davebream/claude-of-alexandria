#!/usr/bin/env bash
# Run promptfoo evaluations using Claude Max subscription (no API key required).
#
# Usage:
#   ./eval.sh                                    # runs all skills
#   ./eval.sh -c skills/exegetical-notes/...     # specific skill
#   ./eval.sh --no-cache -c skills/...           # bypass cache
#
# Auth: Uses CLAUDE_CODE_OAUTH_TOKEN from fish shell + CLAUDE_CODE_USE_BEDROCK
# to bypass the ANTHROPIC_API_KEY validation gate in the promptfoo provider.
# See: docs/plans/2026-02-27-spike-findings.md for explanation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OAUTH_TOKEN=$(fish -c 'echo $CLAUDE_CODE_OAUTH_TOKEN' 2>/dev/null || echo "")

if [ -z "$OAUTH_TOKEN" ]; then
  echo "ERROR: CLAUDE_CODE_OAUTH_TOKEN not found in fish shell."
  echo "If using bash/zsh, set it directly: export CLAUDE_CODE_OAUTH_TOKEN=<token>"
  exit 1
fi

exec env \
  CLAUDE_CODE_OAUTH_TOKEN="$OAUTH_TOKEN" \
  CLAUDE_CODE_USE_BEDROCK=bypass-validation \
  -u CLAUDECODE \
  -u ANTHROPIC_API_KEY \
  npx promptfoo eval "$@"
