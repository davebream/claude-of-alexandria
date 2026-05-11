# Design: Deploy confessional_lookup and bump MCP server version

**Requirements:** skipped
**Pipeline depth:** lightweight (autopilot-generated)
**Source issue:** #39

## Approach
Run migration 0011 against production D1, seed confessional data, deploy updated Cloudflare Worker with confessional_lookup tool, bump MCP server version in createServer(), and update README tool table. Straightforward deployment checklist following existing patterns.

## Components
### C1: Implementation
**Effort:** S
