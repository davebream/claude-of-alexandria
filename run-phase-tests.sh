#!/usr/bin/env bash
# run-phase-tests.sh — run eval suites only for skills touched in this story
#
# Called by loop.sh after each STORY_RESULT: PASS.
# Env: LOOP_PRE_HEAD — git SHA before the story ran (exported by loop.sh)
#
# Only runs red when only red config changed, green when only green changed,
# full skill suite when both or when skill/agent source changed.
#
# .mcp.json, sdk-with-skill.mjs, and other provider/config changes
# are skipped — those stories run their own targeted evals inline.

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
        # Determine if red-only, green-only, or full suite needed (scoped to THIS skill)
        skill_files=$(echo "$CHANGED" | grep "$skill")
        has_red=$(echo "$skill_files" | grep -c "promptfooconfig-red" || true)
        has_green=$(echo "$skill_files" | grep -c "promptfooconfig-green" || true)
        has_source=$(echo "$skill_files" | grep -cE "plugins/.*$skill" || true)

        if [ "$has_source" -gt 0 ] || { [ "$has_red" -gt 0 ] && [ "$has_green" -gt 0 ]; }; then
            SUITES="$SUITES eval:$skill"
        elif [ "$has_red" -gt 0 ]; then
            SUITES="$SUITES eval:${skill}:red"
        elif [ "$has_green" -gt 0 ]; then
            SUITES="$SUITES eval:${skill}:green"
        else
            # Agent or other file changed — run full suite
            SUITES="$SUITES eval:$skill"
        fi
    fi
done

# Deduplicate (safe for empty — no grep in pipeline)
if [ -n "$SUITES" ]; then
    SUITES=$(echo "$SUITES" | xargs -n1 | sort -u | xargs)
fi

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
