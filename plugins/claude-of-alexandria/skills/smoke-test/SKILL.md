---
name: smoke-test
description: Pipeline smoke test. Use when asked to run a smoke test or pipeline verification.
allowed-tools: Agent
version: 1.1.0
changed: "2026-09-05"
---

# Smoke Test

Invoke the **smoke-test** agent via the Agent tool and return its output verbatim.

```yaml
subagent_type: "claude-of-alexandria:smoke-test"
run_in_background: false
```

Do not add any commentary, headers, or formatting. Return exactly what the agent returns.
