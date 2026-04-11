#!/usr/bin/env bash
# validate-readme-counts.sh
#
# Ensures README.md tool/agent/skill counts match actual counts.
# Exit 1 if any mismatch is found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "=== README Count Validation ==="

ERRORS=0

# Count agent files (exclude README.md and underscore-prefixed internal files)
ACTUAL_AGENTS=$(find "$REPO_ROOT/plugins/claude-of-alexandria/agents" -name '*.md' ! -name 'README.md' ! -name '_*' -print 2>/dev/null | wc -l | tr -d ' ')

# Count skill directories with SKILL.md (exclude smoke-test)
ACTUAL_SKILLS=$(find "$REPO_ROOT/plugins/claude-of-alexandria/skills" -name 'SKILL.md' ! -path '*/smoke-test/*' -print 2>/dev/null | wc -l | tr -d ' ')

# Extract counts from README
# Badge format: skills-N %2B M agents (URL-encoded +)
# Text format: "N skills + M sub-agents" or "**N skills + M sub-agents**"
README_SKILLS=$(grep -oE '[0-9]+ skills' "$REPO_ROOT/README.md" | head -1 | grep -oE '[0-9]+') || true
README_AGENTS=$(grep -oE '[0-9]+ (sub-)?agents' "$REPO_ROOT/README.md" | head -1 | grep -oE '[0-9]+') || true

# Also check badge (shields.io format: skills-N%20%2B%20M%20agents)
BADGE_SKILLS=$(grep -oE 'skills-[0-9]+' "$REPO_ROOT/README.md" | head -1 | grep -oE '[0-9]+') || true
BADGE_AGENTS=$(grep -oE '%2B%20[0-9]+%20agents' "$REPO_ROOT/README.md" | head -1 | sed 's/%2B%20\([0-9]*\)%20agents/\1/') || true

if [ -z "$BADGE_SKILLS" ] || [ -z "$BADGE_AGENTS" ]; then
  echo -e "${YELLOW}WARNING: Could not parse badge counts from README.md — skipping badge check${NC}"
fi

if [ -z "$README_SKILLS" ] && [ -z "$BADGE_SKILLS" ]; then
  echo -e "${RED}ERROR: Could not parse any skill count from README.md — check README format${NC}"
  ERRORS=$((ERRORS + 1))
fi
if [ -z "$README_AGENTS" ] && [ -z "$BADGE_AGENTS" ]; then
  echo -e "${RED}ERROR: Could not parse any agent count from README.md — check README format${NC}"
  ERRORS=$((ERRORS + 1))
fi

echo "  Skills:    README=${README_SKILLS:-?}, badge=${BADGE_SKILLS:-?}, actual=${ACTUAL_SKILLS}"
echo "  Agents:    README=${README_AGENTS:-?}, badge=${BADGE_AGENTS:-?}, actual=${ACTUAL_AGENTS}"

if [ -n "$README_SKILLS" ] && [ "$README_SKILLS" != "$ACTUAL_SKILLS" ]; then
  echo -e "${RED}✗ README says ${README_SKILLS} skills but ${ACTUAL_SKILLS} exist${NC}"
  ERRORS=$((ERRORS + 1))
fi

if [ -n "$README_AGENTS" ] && [ "$README_AGENTS" != "$ACTUAL_AGENTS" ]; then
  echo -e "${RED}✗ README says ${README_AGENTS} agents but ${ACTUAL_AGENTS} exist${NC}"
  ERRORS=$((ERRORS + 1))
fi

if [ -n "$BADGE_SKILLS" ] && [ "$BADGE_SKILLS" != "$ACTUAL_SKILLS" ]; then
  echo -e "${RED}✗ Badge says ${BADGE_SKILLS} skills but ${ACTUAL_SKILLS} exist${NC}"
  ERRORS=$((ERRORS + 1))
fi

if [ -n "$BADGE_AGENTS" ] && [ "$BADGE_AGENTS" != "$ACTUAL_AGENTS" ]; then
  echo -e "${RED}✗ Badge says ${BADGE_AGENTS} agents but ${ACTUAL_AGENTS} exist${NC}"
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}${ERRORS} count mismatch(es). Update README.md to match actual counts.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All README counts are accurate${NC}"
