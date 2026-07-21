#!/usr/bin/env bash
# validate-eval-structure.sh
#
# Model-free structural lint of the promptfoo eval configs. Runs in seconds with
# no Claude subscription, no API key, and no MCP server — this is a Tier-1
# contributor check (see CONTRIBUTING.md). It does NOT execute any eval; it only
# verifies the configs are well-formed and wired to the subscription-only,
# pinned-model providers.
#
# Enforces:
#   1. Every skill has both a RED and a GREEN promptfoo config.
#   2. GREEN configs run the skill provider; RED configs run the bare provider;
#      both grade with the subscription grader.
#   3. No paid-provider or dead-model references anywhere in the eval configs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/tests/promptfoo/skills"
CONFIG_GLOB="$REPO_ROOT/tests/promptfoo/skills $REPO_ROOT/tests/promptfoo/agents $REPO_ROOT/tests/promptfoo/integration $REPO_ROOT/tests/promptfoo/smoke $REPO_ROOT/tests/promptfoo/assertions"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
fail=0
err() { echo -e "${RED}ERROR:${NC} $1"; fail=1; }

echo "=== Eval Structure Validation ==="

# 1 + 2: per-skill RED/GREEN presence and correct provider wiring
for dir in "$SKILLS_DIR"/*/; do
  skill="$(basename "$dir")"
  red="$dir/promptfooconfig-red.yaml"
  green="$dir/promptfooconfig-green.yaml"
  [ -f "$red" ]   || err "$skill: missing promptfooconfig-red.yaml"
  [ -f "$green" ] || err "$skill: missing promptfooconfig-green.yaml"
  if [ -f "$green" ]; then
    grep -q "providers/sdk-with-skill.mjs" "$green" || err "$skill GREEN: subject-under-test is not sdk-with-skill.mjs"
    grep -q "providers/sdk-grader.mjs"     "$green" || err "$skill GREEN: grader is not sdk-grader.mjs"
  fi
  if [ -f "$red" ]; then
    grep -q "providers/sdk-bare.mjs"   "$red" || err "$skill RED: subject-under-test is not sdk-bare.mjs"
    grep -q "providers/sdk-grader.mjs" "$red" || err "$skill RED: grader is not sdk-grader.mjs"
  fi
done

# 3: no paid-provider or dead-model references in any eval config
# shellcheck disable=SC2086
if grep -rn "openai:gpt-4o\|anthropic:messages\|claude-sonnet-4-6-20250514" $CONFIG_GLOB \
     --include=*.yaml 2>/dev/null | grep -v "promptfooconfig-all.yaml"; then
  err "paid-provider or dead-model reference found above — evals must be subscription-only on the pinned model"
fi

if [ "$fail" -eq 0 ]; then
  echo -e "${GREEN}✓ Eval config structure valid (subscription-only, pinned model, RED+GREEN present)${NC}"
else
  echo -e "${RED}✗ Eval structure validation failed${NC}"
fi
exit "$fail"
