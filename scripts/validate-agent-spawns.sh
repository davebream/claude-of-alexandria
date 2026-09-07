#!/usr/bin/env bash
# Validate documented Agent-tool calls according to their execution mode.
#
# Context wrappers are unnamed and synchronous because their caller needs the returned
# content. The explicit study-team skill uses named, addressable teammates and must run only
# under its separately guarded in-process team mode.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/claude-of-alexandria"

if [ "${1:-}" = "--plugin-dir" ]; then
  if [ -z "${2:-}" ] || [ "${3:-}" != "" ]; then
    echo "Usage: $0 [--plugin-dir ABSOLUTE_PATH]"
    exit 2
  fi
  PLUGIN_DIR="$2"
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--plugin-dir ABSOLUTE_PATH]"
  exit 2
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Agent Spawn Validation ==="
echo ""

if [ ! -d "$PLUGIN_DIR" ]; then
  echo -e "${RED}ERROR: plugin directory not found at ${PLUGIN_DIR}${NC}"
  exit 1
fi

# Emit one record for each fenced block that documents an Agent spawn:
#   relative file|subagent line|background false|name|deprecated team_name
findings=$(find "$PLUGIN_DIR" -name '*.md' -type f | sort | while read -r file; do
  rel="${file#"$PLUGIN_DIR"/}"
  awk -v file="$rel" '
    function emit() {
      if (has_subagent)
        printf "%s|%d|%d|%d|%d\n", file, subagent_line, has_bg, has_name, has_team
    }
    /^[[:space:]]*```/ {
      if (in_block) {
        emit()
        in_block = 0
      } else {
        in_block = 1
        has_subagent = 0; has_bg = 0; has_name = 0; has_team = 0; subagent_line = 0
      }
      next
    }
    in_block && /^[[:space:]]*subagent_type[[:space:]]*:/ {
      has_subagent = 1
      if (subagent_line == 0) subagent_line = NR
    }
    in_block && /^[[:space:]]*run_in_background[[:space:]]*:[[:space:]]*false[[:space:]]*$/ { has_bg = 1 }
    in_block && /^[[:space:]]*name[[:space:]]*:/ { has_name = 1 }
    in_block && /^[[:space:]]*team_name[[:space:]]*:/ { has_team = 1 }
    END { if (in_block) emit() }
  ' "$file"
done)

if [ -z "$findings" ]; then
  echo -e "${RED}ERROR: no Agent-tool spawn blocks found under ${PLUGIN_DIR}.${NC}"
  echo "The scanner found nothing to check; failing rather than reporting a false pass."
  exit 1
fi

TOTAL=0
FAILURES=0

while IFS='|' read -r rel line has_bg has_name has_team; do
  [ -n "$rel" ] || continue
  TOTAL=$((TOTAL + 1))
  problems=""
  mode="context wrapper"

  if [ "$rel" = "skills/study-team/SKILL.md" ]; then
    mode="team teammate"
    if [ "$has_name" != "1" ]; then
      problems="${problems}      team mode requires 'name:' so each teammate is addressable\n"
    fi
    if [ "$has_team" = "1" ]; then
      problems="${problems}      'team_name:' is ignored at the supported Claude Code baseline\n"
    fi
    if [ "$has_bg" = "1" ]; then
      problems="${problems}      team mode must not set 'run_in_background: false'; lifecycle is managed by the team\n"
    fi
  else
    if [ "$has_bg" != "1" ]; then
      problems="${problems}      missing 'run_in_background: false' — context wrapper would return only a launch acknowledgment\n"
    fi
    if [ "$has_name" = "1" ] || [ "$has_team" = "1" ]; then
      problems="${problems}      named spawn is only permitted in skills/study-team/SKILL.md\n"
    fi
  fi

  if [ -n "$problems" ]; then
    echo -e "  ${RED}✗${NC} ${rel}:${line} (${mode})"
    printf "%b" "$problems"
    FAILURES=$((FAILURES + 1))
  else
    echo -e "  ${GREEN}✓${NC} ${rel}:${line} (${mode})"
  fi
done <<< "$findings"

echo ""
echo "=== Summary ==="
echo "Spawn blocks checked: ${TOTAL}"

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}${FAILURES} spawn block(s) failed validation${NC}"
  exit 1
fi

echo -e "${GREEN}All context wrappers and team teammate spawns match their mode${NC}"
