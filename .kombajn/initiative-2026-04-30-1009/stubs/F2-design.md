# Design: Add version + changed metadata to every SKILL.md frontmatter

**Requirements:** skipped
**Pipeline depth:** lightweight (autopilot-generated)
**Source issue:** #16

## Approach
Add `version` and `changed` YAML fields to every SKILL.md frontmatter under `plugins/claude-of-alexandria/skills/`. Update CLAUDE.md to document the bumping convention. Optionally add a CI check that validates version bumps on content changes.

## Components
### C1: Implementation
**Effort:** S
