#!/usr/bin/env bash
# validate-agent-spawns.sh
#
# Validates every documented Agent-tool spawn in the plugin.
#
# Two rules, both from issue #187, where biblical-scholar delegated to
# data-retriever and returned "Data gathering is running" instead of its
# analysis while the harness reported it complete:
#
#   1. run_in_background: false is REQUIRED.
#      Omitting it makes the spawn asynchronous. The Agent tool then returns
#      only "Async agent launched successfully" — a launch acknowledgment, not
#      a result — and the caller has nothing to report but a status line. The
#      delegate's real work lands after the parent has returned, so it is
#      discarded rather than delayed.
#
#   2. name: is FORBIDDEN.
#      Naming a spawn can route it down the harness's in_process_teammate path,
#      whose subagent metadata sidecar is written with no toolUseId and with
#      agentType clobbered by the display name. Consumers that walk the
#      subagent transcript family keyed on toolUseId break on those records.
#      Nothing in this plugin sends a follow-up message to a running delegate,
#      so no spawn here needs to be addressable.
#
# The sidecar itself is written by the harness, not by this repository. Rule 2
# is a mitigation that keeps our spawns off the broken path, not a fix for it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/claude-of-alexandria"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Agent Spawn Validation ==="
echo ""

if [ ! -d "$PLUGIN_DIR" ]; then
  echo -e "${RED}ERROR: plugin directory not found at ${PLUGIN_DIR}${NC}"
  exit 1
fi

# Emit one line per fenced code block that declares a spawn:
#   <file>|<line of subagent_type>|<has run_in_background: false>|<has name:>
findings=$(find "$PLUGIN_DIR" -name '*.md' -type f | sort | while read -r file; do
  awk -v file="$file" '
    /^[[:space:]]*```/ {
      if (in_block) {
        if (has_subagent)
          printf "%s|%d|%d|%d\n", file, subagent_line, has_bg, has_name
        in_block = 0
      } else {
        in_block = 1
        has_subagent = 0; has_bg = 0; has_name = 0; subagent_line = 0
      }
      next
    }
    in_block && /^[[:space:]]*subagent_type[[:space:]]*:/ {
      has_subagent = 1
      if (subagent_line == 0) subagent_line = NR
    }
    in_block && /^[[:space:]]*run_in_background[[:space:]]*:[[:space:]]*false[[:space:]]*$/ { has_bg = 1 }
    in_block && /^[[:space:]]*name[[:space:]]*:/ { has_name = 1 }
  ' "$file"
done)

if [ -z "$findings" ]; then
  echo -e "${RED}ERROR: no Agent-tool spawn blocks found under ${PLUGIN_DIR}.${NC}"
  echo "The scanner found nothing to check, which means it is broken or the"
  echo "spawn documentation moved. Failing rather than reporting a false pass."
  exit 1
fi

TOTAL=0
FAILURES=0

while IFS='|' read -r file line has_bg has_name; do
  [ -n "$file" ] || continue
  TOTAL=$((TOTAL + 1))
  rel="${file#"$REPO_ROOT"/}"
  problems=""

  if [ "$has_bg" != "1" ]; then
    problems="${problems}      missing 'run_in_background: false' — spawn would run async and return a launch acknowledgment\n"
  fi
  if [ "$has_name" = "1" ]; then
    problems="${problems}      declares 'name:' — can route the spawn to the in_process_teammate path, whose sidecar has no toolUseId\n"
  fi

  if [ -n "$problems" ]; then
    echo -e "  ${RED}✗${NC} ${rel}:${line}"
    printf "%b" "$problems"
    FAILURES=$((FAILURES + 1))
  else
    echo -e "  ${GREEN}✓${NC} ${rel}:${line}"
  fi
done <<< "$findings"

echo ""
echo "=== Summary ==="
echo "Spawn blocks checked: ${TOTAL}"

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}${FAILURES} spawn block(s) failed validation${NC}"
  exit 1
fi

echo -e "${GREEN}All spawn blocks specify run_in_background: false and omit name${NC}"
exit 0
