---
name: smoke-test
description: Pipeline smoke test. Use when asked to run a smoke test or pipeline verification.
context: fork
agent: claude-of-alexandria:smoke-test
version: 2.0.0
changed: "2026-09-07"
---

# Smoke Test

This self-contained utility runs in the native foreground fork declared in frontmatter.
Return exactly `SMOKE_TEST_AGENT_OK` with no commentary, headers, or formatting.
