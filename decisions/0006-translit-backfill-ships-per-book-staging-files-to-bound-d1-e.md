---
id: "0006"
status: accepted
scope:
  - server
topic: data-migration
affects:
  - server/scripts/**
  - server/d1-seed/**
  - .github/workflows/**
decided: 2026-07-17
last-verified: 2026-07-17
decided-by: agent:builder
decided-in: review
model: null
source: .kombajn/plans/2026-07-17-mcp-extract-upstream-sbl-transliteration-plan.md
source-session: T1
supersedes: null
depends-on: []
rejected-approaches:
  - wrangler-d1-import-unavailable
  - per-testament-single-file-30s-batch-risk
prov-inputs: []
prov-activity: null
delegated-by: null
---

Cloudflare-platform-expert review of the Phase-2 translit staging-SQL generator surfaced two D1-specific risks that local SQLite verification cannot reach (Needs Revision):

- **C1:** `wrangler d1 execute --file --remote` atomicity is version-dependent — modern wrangler routes through the atomic R2 bulk-import path; older paths split on `;` and send non-atomic batches of ≤10,000 statements. The installed wrangler's path is not determinable from docs.
- **C2:** D1's 30-second cap applies to "entire batch calls" (D1 platform limits). The generator originally emitted ONE file per testament, so on the batch path the whole OT corpus (~378k inserts + the Psalms correlated UPDATE) would run under a single 30s budget.

**Decision: emit one self-contained staging file PER BOOK** (27 NT + 39 OT), mirroring the primary OT seed (`morphology-ot-<book>.sql`, 39 files) that `seed-d1.sh` already applies this exact corpus with today. Each file is drop→create→insert-one-book→per-book-UPDATE→drop. This bounds every `execute --file` call to a single book — the proven-safe granularity — so C2 is removed regardless of which atomicity path C1 resolves to.

**Rejected:** `wrangler d1 import` (the expert's first choice, unambiguously atomic bulk) — NOT available in the installed wrangler (subcommands are create/info/list/delete/execute/export/time-travel/migrations/insights; no `import`).

**Also:** pin the wrangler version in the Phase-7 backfill runner so a silent upgrade can't flip atomicity/timeout behavior on the single production D1; never emit BEGIN/COMMIT (a bulk importer wraps its own transaction). Verified: `--remote` `--command` demonstrably hits `/query`; `execute --file` is the file primitive; there is no staging D1 to dry-run against, which is exactly why the proven per-book granularity is chosen over an untested per-testament batch.
