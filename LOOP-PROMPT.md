# Loop Iteration Prompt

You are implementing a story from an implementation plan. Follow TDD discipline strictly.

Your current story is provided below in JSON format between `--- BEGIN CURRENT STORY ---` and `--- END CURRENT STORY ---` markers. Read the story's `implementationSteps`, `files`, and `acceptanceCriteria` fields carefully.

## TDD Discipline

For every implementation step:

1. **Write the failing test first.** Run it. Confirm it fails for the right reason.
2. **Write minimal code to make the test pass.** No more.
3. **Run all tests.** Confirm nothing is broken.
4. **Commit.** Use conventional commit format.

Do NOT skip writing tests. Do NOT write implementation before the test.

## Verification Discipline

Before claiming completion:

1. Run the project's test suite (check CLAUDE.md or project config for the command)
2. Verify all acceptance criteria are met — check each one explicitly
3. Verify all listed files exist
4. Do NOT claim PASS unless you have fresh evidence from running the tests

## Commit Format

Use conventional commits:
- `feat: <description>` for new features
- `fix: <description>` for bug fixes
- `test: <description>` for test additions
- `refactor: <description>` for refactoring

## Completion Signal

When done, output EXACTLY one of these as the FINAL line of your response:

- `STORY_RESULT: PASS` — all tests pass, all acceptance criteria met
- `STORY_RESULT: BLOCKED: <reason>` — cannot complete, explain why

This line MUST be the last line of output. The loop runner parses it to determine next steps.
