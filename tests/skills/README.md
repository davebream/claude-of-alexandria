# Archived: Legacy Markdown TDD Tests

> **Status: ARCHIVED** — Superseded by promptfoo automated tests in `tests/promptfoo/`

These are the original manual TDD test files used during skill development. Each skill has:

- `scenarios.md` — Pressure test cases designed to trigger failure modes
- `baseline.md` — RED phase: documented failures without the skill
- `verification.md` — GREEN phase: proof of correction with the skill

## Why Archived

The promptfoo evaluation suite (`tests/promptfoo/`) provides automated, repeatable execution of these same scenarios against live model runs. The markdown files here served as planning documents during development; the promptfoo configs are the executable equivalent.

## Still Valuable For

- Understanding the *reasoning* behind test scenarios (the markdown has richer commentary)
- Reviewing the historical baseline failures documented before the skill was written
- Reference when adding new promptfoo tests

## Do Not Delete

These files document the TDD history of each skill. They are part of the scholarly record.
