#!/usr/bin/env bash
# Ralph Wiggum Loop for claude-of-alexandria
# Runs Claude Code in a fresh-context loop, one phase per iteration.
# State persists in docs/PROGRESS.md and git history.
#
# Usage:
#   ./scripts/loop.sh              # Run until all phases complete
#   ./scripts/loop.sh --dry-run    # Show what would happen without executing
#
# Requirements:
#   - claude CLI installed and authenticated
#   - Running from repo root
#
# How it works:
#   1. Each iteration spawns a fresh Claude Code session (fresh context window)
#   2. The session reads PROGRESS.md to know where to resume
#   3. It executes tasks until the current phase gate completes
#   4. It updates PROGRESS.md and exits
#   5. The loop checks PROGRESS.md — if ALL_COMPLETE, stop; otherwise, next iteration
#
# Claude Code hourly windows (Max plan): each session is independent.
# If a session times out mid-phase, the next iteration picks up from PROGRESS.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROGRESS_FILE="$REPO_ROOT/docs/PROGRESS.md"
MAX_ITERATIONS=20  # Safety valve — 7 phases should need ~7-14 iterations
ITERATION=0

cd "$REPO_ROOT"

if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "ERROR: $PROGRESS_FILE not found. Create it first."
  exit 1
fi

echo "=== Ralph Wiggum Loop: claude-of-alexandria ==="
echo "Progress file: $PROGRESS_FILE"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))

  # Check completion
  if grep -q "Status: ALL_COMPLETE" "$PROGRESS_FILE"; then
    echo "=== ALL PHASES COMPLETE (iteration $ITERATION) ==="
    exit 0
  fi

  # Extract current state for logging
  CURRENT_PHASE=$(grep "^- \*\*Phase:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Phase:\*\* //')
  CURRENT_TASK=$(grep "^- \*\*Task:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Task:\*\* //')
  echo "--- Iteration $ITERATION: Phase $CURRENT_PHASE, Task $CURRENT_TASK ---"

  if [[ "${1:-}" == "--dry-run" ]]; then
    echo "[DRY RUN] Would invoke claude with plan execution prompt"
    echo "[DRY RUN] Parsing OK. Exiting after first iteration."
    exit 0
  fi

  # Invoke Claude Code with fresh context
  # --print: non-interactive, output to stdout
  # The prompt tells Claude to read PROGRESS.md, execute tasks, and stop at the gate
  claude --print --dangerously-skip-permissions \
    "You are executing the unified data integration plan autonomously.

1. Read docs/PROGRESS.md to determine your current phase and task.
2. Read the corresponding phase section from docs/plans/2026-03-01-unified-data-integration-plan.md
3. If entering a new phase, read the relevant design document referenced in the plan.
4. Execute tasks sequentially. After each task:
   - Update PROGRESS.md (mark complete, record commit hash)
5. When you reach a GATE task:
   - Run the gate protocol (tool checks, regression smoke, agent review team)
   - Fix any issues autonomously (max 3 attempts per issue)
   - Log unresolved issues in Recovery Log
   - After gate: complete the release task (CHANGELOG, version bump, git tag)
   - Update PROGRESS.md with phase completion and eval IDs
   - STOP. Exit after completing the release task. The next iteration handles the next phase.

If Status in PROGRESS.md is ALL_COMPLETE, output 'ALL_COMPLETE' and exit.

IMPORTANT: Do not ask for confirmation. Do not stop for human review. Fix issues yourself or document them and move on. You have full permissions." \
    2>&1 | tee "$REPO_ROOT/docs/logs/iteration-${ITERATION}.log" || true

  echo "--- Iteration $ITERATION complete ---"
  echo ""

  # Brief pause between iterations (rate limiting courtesy)
  sleep 5
done

echo "=== MAX ITERATIONS REACHED ($MAX_ITERATIONS) ==="
echo "Check $PROGRESS_FILE for current state."
exit 1
