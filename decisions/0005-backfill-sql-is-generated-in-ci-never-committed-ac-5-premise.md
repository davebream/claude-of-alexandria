---
id: "0005"
status: accepted
scope:
  - server
topic: data-migration
affects:
  - server/d1-seed/**
  - .github/workflows/**
  - server/scripts/**
  - .gitignore
decided: 2026-07-17
last-verified: 2026-07-17
decided-by: human
decided-in: interactive
model: null
source: .kombajn/plans/2026-07-17-mcp-extract-upstream-sbl-transliteration-plan.md
source-session: T1
supersedes: "0001"
depends-on: []
rejected-approaches:
  - narrow-un-ignore-commit-21MB-to-public-history
  - release-artifact-r2-digest
prov-inputs: []
prov-activity: null
delegated-by: null
---

AC-5 requires the backfill to land as "generated, **version-controlled** SQL under `server/d1-seed/`". That property is impossible: `.gitignore:74` ignores `server/d1-seed/` with the comment "D1 seed files (generated — do not commit)". Verified four ways — `git ls-files` returns 0 against 961 files on disk; `git check-ignore` hits `:74`; `git add --dry-run` is refused; `git show HEAD:` reports "exists on disk, but not in HEAD". The requirement, design, and plan all inherited this one false premise from the issue's own text.

**Decision (human-adjudicated): Option B — the runner generates instead of reading committed SQL.** The backfill workflow checks out, runs the ETL (self-downloading ~88MB from pinned `COMMIT_SHA`/`LFS_OID`), generates the SQL in-runner, applies it via `wrangler d1 execute --file`. Nothing bulky is committed; the `.gitignore` policy is untouched.

**Why B over A (narrow un-ignore):** A writes ~21.5MB into a public GPL repo's permanent, unrewritable history against an explicit committed policy. Irreversible after release — a history rewrite breaks every clone.

**Why AC-5 is still satisfied:** its two real requirements are "no hand-editing of the deployed database" and automation. B satisfies both. "Version-controlled" attaches to the **generator plus pinned inputs** rather than generated output — stronger than committing output, since the output becomes reproducible by construction rather than trusted.

**Consequence:** Task 15's trigger can no longer be a `paths:` filter on the generated SQL (unpushable files never match a push filter). Tasks 14/15/16 need re-planning, not patching.
