---
name: smoke-test
description: Pipeline smoke test. Use when asked to run a smoke test or pipeline verification.
context: fork
agent: coa:smoke-test
version: 2.1.1
changed: "2026-10-12"
---

# Smoke Test

This self-contained utility runs in the native foreground fork declared in frontmatter.
Return exactly `SMOKE_TEST_AGENT_OK` with no commentary, headers, or formatting.
