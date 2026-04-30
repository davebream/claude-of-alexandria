# Design: Pin all promptfoo model IDs to dated versions

**Requirements:** skipped
**Pipeline depth:** lightweight (autopilot-generated)
**Source issue:** #15

## Approach
Search-and-replace all floating model names (e.g. `claude-sonnet-4-6`) across `tests/promptfoo/` YAML configs and provider files with dated snapshot IDs. Verify with smoke regression run.

## Components
### C1: Implementation
**Effort:** S
