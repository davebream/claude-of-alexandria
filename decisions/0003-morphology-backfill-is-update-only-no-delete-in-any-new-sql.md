---
id: "0003"
status: draft
scope:
  - server
topic: data-migration
affects:
  - server/d1-seed/**
  - server/scripts/**
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
  - per-book-reimport
  - seed-d1.sh-full-reseed
prov-inputs: []
prov-activity: null
delegated-by: null
---

`query_morphology` MUST NEVER return an empty NT result at any point during a data operation.

UPDATE-only satisfies this structurally rather than procedurally: with no DELETE anywhere, no window exists in which rows are absent. This is stronger than careful sequencing, which can still fail midway.

`seed-d1.sh:37-45` batch-deletes all NT morphology then re-imports 28 chunks non-transactionally under `set -e` — between the delete and the last import, the entire New Testament returns empty in production, and a mid-import failure leaves it truncated with no rollback. `wrangler.toml` defines one D1 with no staging, so `--remote` IS production. Never invoke seed-d1.sh; do not touch its NT path.

A partial backfill degrades to exactly today's behavior (null = bare script), which is why it needs neither rollback nor atomicity — and precisely why it does not belong in the migration chain.
