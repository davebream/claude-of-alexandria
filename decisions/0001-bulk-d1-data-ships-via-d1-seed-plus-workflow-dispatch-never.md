---
id: "0001"
status: superseded
scope:
  - server
topic: data-migration
affects:
  - server/migrations/**
  - server/d1-seed/**
  - .github/workflows/**
decided: 2026-07-17
last-verified: 2026-07-17
decided-by: agent:designer
decided-in: extraction
model: null
source: .kombajn/plans/2026-07-17-mcp-extract-upstream-sbl-transliteration-design.md
source-session: T1
supersedes: null
depends-on: []
rejected-approaches:
  - chunked-update-migrations
  - staging-table-in-migrations
  - seed-d1.sh-full-reseed
prov-inputs: []
prov-activity: null
delegated-by: null
---

`wrangler d1 migrations apply` POSTs to the synchronous `/query` endpoint; `wrangler d1 execute --file` uses the etag-based `/import` (R2-backed, 5GiB) path. Verified distinct in wrangler 4.108.0.

Bulk corpus data MUST NOT ship through migrations. `deploy-worker.yml` runs `migrations apply` BEFORE `npm run deploy`, so a `/query` 504 on a large migration permanently blocks every future deploy — CLAUDE.md forbids mutating a shipped migration, and clearing `d1_migrations` by hand is exactly the "never hand-edit the deployed database" rule. There is no legal recovery.

Measured: per-row UPDATEs ~79.7MB; staging-table encoding ~21.5MB; the repo's largest-ever migration is 48K.

Two-tier model: `server/migrations/` carries schema + small seeds; `server/d1-seed/` carries bulk corpus, applied by a `workflow_dispatch` runner. The 82MB of OT seed that works today rides `/import` via seed-d1.sh — that headroom does not transfer to migrations.
