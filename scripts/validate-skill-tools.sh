#!/usr/bin/env bash
# validate-skill-tools.sh
#
# Validates that MCP tools referenced by skills and agents
# are actually registered in the MCP server.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/plugins/claude-of-alexandria/skills"
AGENTS_DIR="$REPO_ROOT/plugins/claude-of-alexandria/agents"
SERVER_SRC="$REPO_ROOT/server/src"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "=== Skill-Tool Wiring Validation ==="
echo ""

# Extract tool names from MCP server registration
echo "Scanning registered tools in ${SERVER_SRC}..."
REGISTERED_TOOLS=$(grep -rh "server\.registerTool(" "$SERVER_SRC" --include='*.ts' --exclude='*.test.ts' | \
  grep -oE "'[a-z_]+'" | \
  tr -d "'" | \
  sort -u)

if [ -z "$REGISTERED_TOOLS" ]; then
  echo -e "${RED}ERROR: No registered tools found in ${SERVER_SRC}.${NC}"
  exit 1
fi

TOOL_COUNT=$(echo "$REGISTERED_TOOLS" | wc -l | tr -d ' ')
echo "Found ${TOOL_COUNT} registered tools."
echo ""

WARNINGS=0
MCP_PREFIX="mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__"

# Check skills
for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_file="${skill_dir}SKILL.md"
  [ -f "$skill_file" ] || continue

  skill_name=$(basename "$skill_dir")
  echo "Checking skill: ${skill_name}"

  # Primary: extract tool names from allowed-tools: frontmatter
  # Format: mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_morphology
  FRONTMATTER_TOOLS=$(grep '^allowed-tools:' "$skill_file" | \
    grep -oE "${MCP_PREFIX}[a-z_]+" | \
    sed "s/${MCP_PREFIX}//" | \
    sort -u) || true

  # Secondary: backtick-quoted tool names in prose
  PROSE_TOOLS=$(grep -oE '`(query_|list_|check_|bible_|commentary_|parallel_)[a-z_]+`' "$skill_file" | \
    tr -d '`' | \
    sort -u) || true

  # Merge both sources, deduplicate
  REFERENCED_TOOLS=$(printf "%s\n%s" "$FRONTMATTER_TOOLS" "$PROSE_TOOLS" | \
    grep -v '^$' | sort -u) || true

  if [ -z "$REFERENCED_TOOLS" ]; then
    echo "  (no tool references found)"
    echo ""
    continue
  fi

  for tool in $REFERENCED_TOOLS; do
    if echo "$REGISTERED_TOOLS" | grep -qx "$tool"; then
      echo -e "  ${GREEN}✓${NC} $tool"
    else
      echo -e "  ${YELLOW}?${NC} $tool (not registered in server)"
      WARNINGS=$((WARNINGS + 1))
    fi
  done
  echo ""
done

# Check agents
# Note: agents don't use allowed-tools: frontmatter (unlike skills),
# so only prose backtick references are extracted here.
for agent_file in "$AGENTS_DIR"/*.md; do
  [ -f "$agent_file" ] || continue
  agent_name=$(basename "$agent_file" .md)
  [ "$agent_name" = "README" ] && continue

  echo "Checking agent: ${agent_name}"

  REFERENCED_TOOLS=$(grep -oE '`(query_|list_|check_|bible_|commentary_|parallel_)[a-z_]+`' "$agent_file" | \
    tr -d '`' | \
    sort -u) || true

  if [ -z "$REFERENCED_TOOLS" ]; then
    echo "  (no tool references found)"
    echo ""
    continue
  fi

  for tool in $REFERENCED_TOOLS; do
    if echo "$REGISTERED_TOOLS" | grep -qx "$tool"; then
      echo -e "  ${GREEN}✓${NC} $tool"
    else
      echo -e "  ${YELLOW}?${NC} $tool (not registered in server)"
      WARNINGS=$((WARNINGS + 1))
    fi
  done
  echo ""
done

# Summary
echo "=== Summary ==="
if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}${WARNINGS} warning(s) — review references above${NC}"
  if [ "${1:-}" = "--strict" ]; then
    echo "Strict mode: treating warnings as errors"
    exit 1
  fi
  exit 0
else
  echo -e "${GREEN}All skill/agent tool references validated successfully${NC}"
  exit 0
fi
