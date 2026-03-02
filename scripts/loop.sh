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
LOG_DIR="$REPO_ROOT/docs/logs"
MAX_ITERATIONS=20  # Safety valve — 7 phases should need ~7-14 iterations
MAX_RETRIES=3      # Retries per iteration on infra failures
STALL_LIMIT=3      # Consecutive no-progress iterations before long backoff
ITERATION=0
STALL_COUNT=0

cd "$REPO_ROOT"

ts() { date "+%Y-%m-%d %H:%M:%S"; }

cleanup() {
  echo ""
  echo "[$(ts)] Interrupted — killing child processes"
  # Kill all child processes, not the shell itself
  pkill -P $$ 2>/dev/null
  wait 2>/dev/null
  exit 130
}
trap cleanup INT TERM

if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "[$(ts)] ERROR: $PROGRESS_FILE not found. Create it first."
  exit 1
fi

mkdir -p "$LOG_DIR"

# Snapshot PROGRESS.md before the run for diffing
cp "$PROGRESS_FILE" "$LOG_DIR/.progress-before-run"

echo "=============================================="
echo "  Ralph Wiggum Loop: claude-of-alexandria"
echo "=============================================="
echo "[$(ts)] Progress file: $PROGRESS_FILE"
echo "[$(ts)] Log directory: $LOG_DIR"
echo "[$(ts)] Max iterations: $MAX_ITERATIONS"
echo ""

# Show starting state
echo "[$(ts)] Starting state:"
grep "^- \*\*" "$PROGRESS_FILE" | head -3 | sed 's/^/  /'
echo ""

while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))

  # Check completion
  if grep -q "Status: ALL_COMPLETE" "$PROGRESS_FILE"; then
    echo "[$(ts)] ==> ALL PHASES COMPLETE after $((ITERATION - 1)) iterations"
    echo ""
    echo "[$(ts)] Final diff from start of run:"
    diff "$LOG_DIR/.progress-before-run" "$PROGRESS_FILE" || true
    exit 0
  fi

  # Snapshot PROGRESS.md before this iteration
  cp "$PROGRESS_FILE" "$LOG_DIR/.progress-before-iter"

  # Extract current state for logging
  CURRENT_PHASE=$(grep "^- \*\*Phase:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Phase:\*\* //')
  CURRENT_TASK=$(grep "^- \*\*Task:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Task:\*\* //')
  CURRENT_STATUS=$(grep "^- \*\*Status:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Status:\*\* //')

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$(ts)] ITERATION $ITERATION / $MAX_ITERATIONS"
  echo "[$(ts)]   Phase:  $CURRENT_PHASE"
  echo "[$(ts)]   Task:   $CURRENT_TASK"
  echo "[$(ts)]   Status: $CURRENT_STATUS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ "${1:-}" == "--dry-run" ]]; then
    echo "[$(ts)] [DRY RUN] Would invoke claude with plan execution prompt"
    echo "[$(ts)] [DRY RUN] Parsing OK. Exiting after first iteration."
    exit 0
  fi

  # Auto-advance: if status is COMPLETE/DONE but not ALL_COMPLETE, find the next phase
  if [[ "$CURRENT_STATUS" == "COMPLETE" || "$CURRENT_STATUS" == "DONE" ]]; then
    # Find next unchecked task in PROGRESS.md
    NEXT_TASK=$(grep "^- \[ \] Task" "$PROGRESS_FILE" | head -1 | sed 's/.*Task \([^ :]*\).*/\1/')
    if [[ -n "$NEXT_TASK" ]]; then
      NEXT_PHASE=$(echo "$NEXT_TASK" | sed 's/\..*//')
      echo "[$(ts)] Auto-advancing: Phase $CURRENT_PHASE ($CURRENT_STATUS) → Phase $NEXT_PHASE, Task $NEXT_TASK"
      sed -i '' "s/\*\*Phase:\*\* .*/\*\*Phase:\*\* $NEXT_PHASE/" "$PROGRESS_FILE"
      sed -i '' "s/\*\*Task:\*\* .*/\*\*Task:\*\* $NEXT_TASK/" "$PROGRESS_FILE"
      sed -i '' "s/\*\*Status:\*\* .*/\*\*Status:\*\* IN_PROGRESS/" "$PROGRESS_FILE"
      CURRENT_PHASE="$NEXT_PHASE"
      CURRENT_TASK="$NEXT_TASK"
      CURRENT_STATUS="IN_PROGRESS"
    else
      echo "[$(ts)] No remaining tasks — marking ALL_COMPLETE"
      sed -i '' "s/\*\*Status:\*\* .*/\*\*Status:\*\* ALL_COMPLETE/" "$PROGRESS_FILE"
      continue  # Re-enter loop to hit the ALL_COMPLETE check
    fi
  fi

  ITER_START=$(date +%s)

  # Invoke Claude Code with fresh context, with retry on infra failures
  RETRY=0
  EXIT_CODE=0
  while [[ $RETRY -lt $MAX_RETRIES ]]; do
    EXIT_CODE=0
    # Disable pipefail for this pipeline — python filter closing is not an error
    set +o pipefail
    claude --print --verbose --output-format stream-json --dangerously-skip-permissions \
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
   - STOP after gate checks. Keep Task as GATE in PROGRESS.md. The loop runs the full eval suite after you exit.
   - Next iteration: read eval results from docs/logs/gate-eval-phase{N}.txt, record in Eval History, then do the release task (CHANGELOG, version bump, git tag).

If Status in PROGRESS.md is ALL_COMPLETE, output 'ALL_COMPLETE' and exit.

IMPORTANT: Do not ask for confirmation. Do not stop for human review. Fix issues yourself or document them and move on. You have full permissions.
IMPORTANT: When running promptfoo, prefer MCP tools (run_evaluation, list_evaluations, get_evaluation_details). Config paths are relative to the project root (e.g., tests/promptfoo/smoke/promptfooconfig-regression.yaml). If MCP is unavailable, fall back to Bash with CLAUDECODE= prefix (e.g., CLAUDECODE= npm run eval:regression).
IMPORTANT: Do NOT run the full promptfoo suite (eval:all) yourself — it takes hours and will timeout. Only run eval:regression (smoke test) during gates. The loop runs eval:all AFTER your iteration and saves results to docs/logs/gate-eval-phase{N}.txt.
GATE WORKFLOW: (1) First GATE iteration: do tool checks + regression smoke + agent reviews, then STOP. Keep Task as GATE. (2) Loop runs full eval suite. (3) Next iteration: read docs/logs/gate-eval-phase{N}.txt for eval ID and pass/fail. Record in Eval History. Mark GATE done. Do the release task (CHANGELOG, version bump, git tag)." \
      2>&1 | tee "$LOG_DIR/iteration-${ITERATION}.jsonl" \
      | python3 -u -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except:
        continue
    # tool_use events are inside assistant messages
    if msg.get('type') == 'assistant':
        for block in msg.get('message', {}).get('content', []):
            if block.get('type') == 'tool_use':
                name = block.get('name', '?')
                inp = block.get('input', {})
                detail = inp.get('file_path', inp.get('pattern', inp.get('command', '')))
                if isinstance(detail, str):
                    # show just filename or first 60 chars
                    detail = detail.split('/')[-1][:60] if '/' in detail else detail[:60]
                print(f'  → {name}: {detail}' if detail else f'  → {name}', flush=True)
    # tool results with errors
    elif msg.get('type') == 'result':
        if msg.get('is_error'):
            print(f'  ✗ ERROR: {str(msg.get(\"result\",\"\"))[:80]}', flush=True)
" || EXIT_CODE=$?
    set -o pipefail

    # Exit code 0 = clean exit, move on
    if [[ $EXIT_CODE -eq 0 ]]; then
      break
    fi

    RETRY=$((RETRY + 1))

    # Check if PROGRESS.md changed despite the error — partial progress is still progress
    if ! diff -q "$LOG_DIR/.progress-before-iter" "$PROGRESS_FILE" >/dev/null 2>&1; then
      echo "[$(ts)] Claude exited with code $EXIT_CODE but PROGRESS.md was updated — accepting partial progress"
      break
    fi

    if [[ $RETRY -lt $MAX_RETRIES ]]; then
      BACKOFF=$(( RETRY * 30 ))
      echo "[$(ts)] RETRY: Claude exited with code $EXIT_CODE (attempt $RETRY/$MAX_RETRIES) — waiting ${BACKOFF}s before retry"
      sleep "$BACKOFF"
    else
      echo "[$(ts)] FAILED: Claude exited with code $EXIT_CODE after $MAX_RETRIES attempts"
    fi
  done

  ITER_END=$(date +%s)
  ITER_DURATION=$(( ITER_END - ITER_START ))
  ITER_MINUTES=$(( ITER_DURATION / 60 ))
  ITER_SECONDS=$(( ITER_DURATION % 60 ))

  echo ""
  echo "[$(ts)] Iteration $ITERATION finished (exit code: $EXIT_CODE, duration: ${ITER_MINUTES}m ${ITER_SECONDS}s)"

  # ─── GATE EVAL: Run promptfoo from loop for GATE phases ───
  # Claude can't run the full suite (too slow for Bash tool timeout).
  # Loop runs it here with no timeout, captures eval ID reliably.
  # Detection: diff before/after PROGRESS.md for newly completed GATE lines,
  # because Claude often ignores "STOP at GATE" and does the release too.
  COMPLETED_GATE_LINE=$(diff "$LOG_DIR/.progress-before-iter" "$PROGRESS_FILE" 2>/dev/null \
    | grep "^>" | grep "\[x\].*GATE" | head -1 || true)

  if [[ -n "$COMPLETED_GATE_LINE" ]]; then
    # Extract phase from the gate line (e.g., "Phase 4" or "Phase 3a")
    GATE_PHASE=$(echo "$COMPLETED_GATE_LINE" | grep -oE "Phase [0-9]+[a-z]?" | head -1 | sed 's/Phase //')
    GATE_EVAL_FILE="$LOG_DIR/gate-eval-phase${GATE_PHASE}.txt"

    if [[ -n "$GATE_PHASE" ]] && [[ ! -f "$GATE_EVAL_FILE" ]]; then
      echo ""
      echo "[$(ts)] ┌─────────────────────────────────────────────┐"
      echo "[$(ts)] │  GATE EVAL: Running promptfoo from loop     │"
      echo "[$(ts)] └─────────────────────────────────────────────┘"

      EVAL_START=$(date +%s)

      # Phase 4 and 6 get full suite; others get regression only
      case "$GATE_PHASE" in
        4|6)
          EVAL_CMD="npm run eval:all"
          EVAL_DESC="full suite (eval:all)"
          ;;
        *)
          EVAL_CMD="npm run eval:regression"
          EVAL_DESC="regression smoke"
          ;;
      esac

      echo "[$(ts)] Phase $GATE_PHASE — running $EVAL_DESC"
      echo "[$(ts)] Command: cd tests/promptfoo && CLAUDECODE= $EVAL_CMD"
      echo "[$(ts)] This may take a while (full suite = 1-2 hours)..."
      echo ""

      # Run promptfoo from loop level — no CLAUDECODE, no timeout
      set +o pipefail
      (cd "$REPO_ROOT/tests/promptfoo" && CLAUDECODE= $EVAL_CMD 2>&1) | tee "$GATE_EVAL_FILE"
      EVAL_EXIT=${PIPESTATUS[0]}
      set -o pipefail

      EVAL_END=$(date +%s)
      EVAL_DURATION=$(( EVAL_END - EVAL_START ))
      EVAL_MINUTES=$(( EVAL_DURATION / 60 ))

      # Extract eval ID and pass/fail counts from output
      EVAL_ID=$(grep -o "eval-[a-zA-Z0-9_-]*" "$GATE_EVAL_FILE" | tail -1 || echo "unknown")
      PASS_COUNT=$(grep -oE "[0-9]+ passed" "$GATE_EVAL_FILE" | tail -1 || echo "? passed")
      FAIL_COUNT=$(grep -oE "[0-9]+ failed" "$GATE_EVAL_FILE" | tail -1 || echo "0 failed")

      echo ""
      echo "[$(ts)] ┌─────────────────────────────────────────────┐"
      echo "[$(ts)] │  GATE EVAL COMPLETE                         │"
      echo "[$(ts)] │  Exit code: $EVAL_EXIT"
      echo "[$(ts)] │  Duration:  ${EVAL_MINUTES}m"
      echo "[$(ts)] │  Results:   $PASS_COUNT, $FAIL_COUNT"
      echo "[$(ts)] │  Eval ID:   $EVAL_ID"
      echo "[$(ts)] │  Log:       $GATE_EVAL_FILE"
      echo "[$(ts)] └─────────────────────────────────────────────┘"
      echo ""

      # Append summary to the eval file for Claude to read
      {
        echo ""
        echo "=== LOOP EVAL SUMMARY ==="
        echo "Phase: $GATE_PHASE"
        echo "Suite: $EVAL_DESC"
        echo "Exit code: $EVAL_EXIT"
        echo "Duration: ${EVAL_MINUTES}m"
        echo "Eval ID: $EVAL_ID"
        echo "Results: $PASS_COUNT, $FAIL_COUNT"
        echo "Timestamp: $(ts)"
      } >> "$GATE_EVAL_FILE"
    fi
  fi
  # ─── END GATE EVAL ───

  # Show what changed in PROGRESS.md
  AFTER_PHASE=$(grep "^- \*\*Phase:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Phase:\*\* //')
  AFTER_TASK=$(grep "^- \*\*Task:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Task:\*\* //')
  AFTER_STATUS=$(grep "^- \*\*Status:\*\*" "$PROGRESS_FILE" | head -1 | sed 's/.*\*\*Status:\*\* //')

  if [[ "$CURRENT_PHASE" != "$AFTER_PHASE" || "$CURRENT_TASK" != "$AFTER_TASK" || "$CURRENT_STATUS" != "$AFTER_STATUS" ]]; then
    echo "[$(ts)] Progress:"
    echo "  Before: Phase $CURRENT_PHASE, Task $CURRENT_TASK ($CURRENT_STATUS)"
    echo "  After:  Phase $AFTER_PHASE, Task $AFTER_TASK ($AFTER_STATUS)"
    STALL_COUNT=0
  else
    STALL_COUNT=$((STALL_COUNT + 1))
    echo "[$(ts)] WARNING: No progress detected — PROGRESS.md unchanged (stall $STALL_COUNT/$STALL_LIMIT)"

    if [[ $STALL_COUNT -ge $STALL_LIMIT ]]; then
      echo "[$(ts)] STALL: $STALL_COUNT consecutive iterations with no progress"
      echo "[$(ts)] Waiting 120s before continuing (possible rate limit or hourly window)"
      sleep 120
      STALL_COUNT=0  # Reset after long backoff — give it another chance
    fi
  fi

  # Show task completion count
  COMPLETED=$(grep -c "^\- \[x\]" "$PROGRESS_FILE" 2>/dev/null || echo "0")
  TOTAL=$(grep -c "^\- \[" "$PROGRESS_FILE" 2>/dev/null || echo "0")
  echo "[$(ts)] Tasks: $COMPLETED / $TOTAL completed"

  # Log size
  LOG_SIZE=$(wc -c < "$LOG_DIR/iteration-${ITERATION}.jsonl" | tr -d ' ')
  echo "[$(ts)] Log: $LOG_DIR/iteration-${ITERATION}.jsonl ($(( LOG_SIZE / 1024 ))KB)"

  # Show git commits made during this iteration
  NEW_COMMITS=$(git log --oneline --since="@$ITER_START" 2>/dev/null | head -5)
  if [[ -n "$NEW_COMMITS" ]]; then
    echo "[$(ts)] Commits this iteration:"
    echo "$NEW_COMMITS" | sed 's/^/  /'
  fi

  echo ""

  # Brief pause between iterations (rate limiting courtesy)
  sleep 5
done

echo "[$(ts)] ==> MAX ITERATIONS REACHED ($MAX_ITERATIONS)"
echo "[$(ts)] Final state:"
grep "^- \*\*" "$PROGRESS_FILE" | head -3 | sed 's/^/  /'
echo ""
echo "[$(ts)] Final diff from start of run:"
diff "$LOG_DIR/.progress-before-run" "$PROGRESS_FILE" || true
echo ""
echo "[$(ts)] Check $PROGRESS_FILE for current state."
exit 1
