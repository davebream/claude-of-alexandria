#!/usr/bin/env bash
# run-phase-tests.sh — run eval suites only for skills touched in this story
#
# Called by loop.sh after each STORY_RESULT: PASS.
# Env: LOOP_PRE_HEAD — git SHA before the story ran (exported by loop.sh)
#
# Skill → suite mapping:
#   tests/promptfoo/skills/<skill>/**        → eval:<skill>
#   plugins/.../skills/<skill>/**            → eval:<skill>
#   plugins/.../agents/<agent>.md            → eval:<agent>  (if suite exists)
#
# .mcp.json, sdk-with-skill.mjs, and other provider/config changes
# are skipped here — those stories run their own targeted evals inline.

set -euo pipefail

PRE_HEAD="${LOOP_PRE_HEAD:-}"

if [ -z "$PRE_HEAD" ]; then
    echo "[run-phase-tests] No LOOP_PRE_HEAD set. Skipping."
    exit 0
fi

CHANGED=$(git diff "$PRE_HEAD"..HEAD --name-only 2>/dev/null || echo "")

if [ -z "$CHANGED" ]; then
    echo "[run-phase-tests] No file changes since story start. Skipping."
    exit 0
fi

echo "[run-phase-tests] Changed files:"
echo "$CHANGED" | sed 's/^/  /'

# Build list of suites to run based on changed paths
SUITES=""

for skill in argument-flow exegetical-notes pericope-delimitation consult-biblical-scholar biblical-segmentation; do
    if echo "$CHANGED" | grep -q "$skill"; then
        SUITES="$SUITES eval:$skill"
    fi
done

# Strip whitespace and check if anything to run
SUITES=$(echo "$SUITES" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ' | xargs)

if [ -z "$SUITES" ]; then
    echo "[run-phase-tests] No skill files changed. Skipping (story handled its own verification)."
    exit 0
fi

echo "[run-phase-tests] Suites to run: $SUITES"

FAILED=0
for suite in $SUITES; do
    echo ""
    echo "[run-phase-tests] === $suite ==="
    npm run "$suite" --prefix tests/promptfoo || FAILED=1
done

exit $FAILED
