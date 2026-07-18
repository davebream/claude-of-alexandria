---
id: "0004"
status: accepted
scope:
  - repo
topic: release
affects:
  - .claude/branch-policy
  - .kombajn/project.json
  - .github/workflows/**
decided: 2026-07-17
last-verified: 2026-07-17
decided-by: human
decided-in: interactive
model: null
source: .kombajn/implement-mcp-extract-upstream-sbl-transliteration-and-surface-it-in-word-length-tool-responses/reviews/T1-plan-review-r1.md
source-session: T1
supersedes: null
depends-on: []
rejected-approaches:
  - mergeFlow-draft-pr
  - github-environment-approval-gate
prov-inputs: []
prov-activity: null
delegated-by: null
---

`.kombajn/project.json` sets `vcs.mergeFlow: "pr"` + `ci.requiredForDone: true`, which makes the autonomous worker run `gh pr merge --auto --squash` — merging to `main`, firing `deploy-worker.yml`, applying migrations, and deploying to the single production D1 with no human in the loop. There are **zero GitHub environments**, so no approval gate backstops it.

This directly contradicted `~/.claude/hooks/branch_policy.py`, which resolved this repo to `draft-pr` ("never commit to `main`… Never open a non-draft PR").

**Decision (human-adjudicated): the kombajn config is correct; the branch policy was stale.** `.claude/branch-policy` now records `direct-to-main`, so both sources agree and neither silently overrides the other.

**What this authorises for this repo:** autonomous merge to `main`, and the production D1 write that follows from it. This was chosen with those consequences stated explicitly.

**Standing caveat:** `--remote` IS production (`wrangler.toml` defines one D1, no staging). There is nowhere to rehearse. Any future change to `vcs.mergeFlow` or to `.claude/branch-policy` should move both together — the hazard here was not either value, it was the two disagreeing while only one was enforced.
