---
status: accepted
supersedes: [0001, 0004, 0005, 0006]
---

# Bulk D1 operations are manual local maintainer actions

Schema migrations remain part of the Worker deployment workflow. Bulk corpus imports and derived-data backfills do not: GitHub Actions must not write bulk data to production D1.

Each bulk operation is generated from committed, pinned inputs on a maintainer machine, validated before any write, and applied only after both `--apply` and a target-specific typed confirmation. Generated SQL remains untracked. This supersedes only the prior decisions' automatic bulk-write mechanism; their data-model and pinning rules remain in force.
