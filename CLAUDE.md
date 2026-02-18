# The Librarian's Instructions

You have been granted access to the stacks. This is a privilege, not a right.

Read these instructions completely before touching a single scroll. If you believe you already know what to do — you do not. Read them anyway.

---

## First Commandment: Use `superpowers:writing-skills`

When working in this repository, you **WILL** invoke the `superpowers:writing-skills` skill before:

- Creating new skills
- Editing existing skills
- Verifying skills work correctly

You will not create or modify skills without it. You will not convince yourself that "this small change doesn't need it." You will not decide that your understanding of TDD is sufficient without the methodology guide open in front of you.

**If you have already begun writing a skill without invoking this skill: stop. Delete your work. Begin again correctly.**

The methodology exists because agents who trust their instincts produce moralistic, context-ignoring, therapeutically-flavored interpretive frameworks. You are not the exception.

---

## What This Repository Is

A suite of analytical skills for rigorous biblical study, developed using Test-Driven Development.

**The principle you will internalize**: Skills are structured documentation that prevents agent failure patterns. Every skill MUST have test evidence proving it prevents documented failures.

This is not a suggestion. This is not a "best practice." This is the standard by which all work in this repository is measured.

---

## The Methodology: TDD or Nothing

### What Requires TDD

All framework changes. Without exception:

- Adding or modifying framework steps
- Changing Red Flags or Common Rationalizations
- Adding validation criteria or skill structure changes
- Any change that affects how a skill directs agent behavior

### What Does Not Require TDD

Editorial corrections only:

- Typo fixes, grammar corrections
- Clarifying existing instructions without changing their meaning
- Formatting improvements, broken link repairs
- README and metadata updates

### When You Are Uncertain

Do TDD. The cost of unnecessary rigor is minutes. The cost of insufficient rigor is a skill that fails in production and misleads the people who trusted it.

---

## The Three Test Files

Every skill requires **exactly three** test files. Not two. Not four. Not "a few supporting documents that seemed helpful." Three.

```
tests/skills/{skill-name}/
├── scenarios.md       # The pressure test cases
├── baseline.md        # The RED phase — documented failures
└── verification.md    # The GREEN phase — proof of correction
```

**Do not create additional test files.** No `verification-responses.md`. No `detailed-output.md`. No `edge-cases-i-found-interesting.md`. Everything goes in the three canonical files.

**Rationale**: Consistency across all skills. A known structure. Anyone who opens the test directory knows exactly what they will find. This is a library, not a filing cabinet.

---

## The RED-GREEN-REFACTOR Cycle

You will follow this cycle for every skill. In order. Without shortcuts.

### RED: Document the Failure

Before you write a single line of skill content, you will:

1. Create concrete test scenarios designed to trigger failures
2. Run those scenarios against the model **without** the proposed skill
3. Document exactly what goes wrong — specifically, not vaguely
4. Classify the failure mode

If you cannot demonstrate a failure, the skill is not needed. Put down the quill.

### GREEN: Write the Minimum Fix

Create the simplest skill structure that prevents the documented failures:

1. Address each specific failure from the RED phase
2. Include only what is necessary to prevent observed errors
3. Add concrete examples — both correct and incorrect approaches
4. Resist the urge to add features for problems you have not documented

**"But what about edge case X?"** — Did you document it failing in the RED phase? No? Then it does not belong in the GREEN phase. Come back when you have evidence.

### REFACTOR: Close the Loopholes

Agents are clever. Under pressure, they will find ways around your constraints. You will anticipate this:

1. Test the GREEN-phase skill with scenarios
2. Document every rationalization the agent attempts
3. Add explicit counters for each rationalization
4. Build a rationalization table
5. Test again until the skill is airtight

**The foundational principle**: "Violating the letter of the rules is violating the spirit of the rules."

Any agent that claims to be "following the spirit" of a constraint while circumventing its specifics is in violation. There is no spirit without the letter.

---

## Changelog

`CHANGELOG.md` lives at the repository root. You will maintain it.

### When to Update

Update `CHANGELOG.md` as part of every release commit (`chore(release): bump version`). Do not defer it. Do not update it separately.

### Format

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries go under the new version heading, grouped by type:

- **Added** — new features, skills, commands
- **Changed** — changes to existing behavior
- **Fixed** — bug fixes
- **Removed** — removed features

### Rules

- One entry per user-facing change. Internal refactors and test additions do not need entries.
- Write for users, not for developers. "Added `allowed-tools` to commands so users are not prompted for permissions" — not "feat(commands): allowed-tools".
- Version heading format: `## [X.Y.Z] - YYYY-MM-DD`
- Update the version in `marketplace.json` and tag git in the same release commit.

---

## What Gets Committed

**✅ Commit to Git:**

- All files in `plugins/claude-of-alexandria/skills/` directory
- Exactly 3 test files per skill in `tests/skills/{skill-name}/`
- All files in `docs/` directory
- `README.md`, `CLAUDE.md`, and `CHANGELOG.md`

**❌ Do not commit:**

- Temporary agent output files
- Personal exploration notes
- Additional test files beyond the three-file structure
- Anything you would not want a future scholar to find in the archive

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Your commit messages will be read by others. Write them as if you are adding an entry to a permanent catalogue — because you are.

---

## Repository Structure

```
claude-of-alexandria/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── plugins/
│   └── claude-of-alexandria/     # The plugin
│       ├── .claude-plugin/
│       │   └── manifest.json     # Plugin manifest (skills array)
│       ├── skills/               # The skill collection
│       │   └── skill-name/
│       │       ├── SKILL.md      # Main skill file (YAML frontmatter + content)
│       │       └── README.md     # Development notes and context
│       ├── CLAUDE.md             # Plugin-level copy
│       └── README.md             # Plugin documentation
├── tests/                        # All test evidence (root level)
│   └── skills/
│       └── skill-name/
│           ├── scenarios.md      # Pressure test cases
│           ├── baseline.md       # RED phase evidence
│           └── verification.md   # GREEN phase proof
├── docs/
│   ├── plans/                    # Implementation plans (YYYY-MM-DD-name.md)
│   └── reviews/                  # Code and architecture reviews
├── CLAUDE.md                     # You are here
├── CHANGELOG.md                  # Version history (Keep a Changelog format)
└── README.md                     # Public documentation
```

Every file has a place. Every place has a file. If you find yourself creating a file that does not fit this structure, you are likely doing something wrong.

---

## Where to Put Things

| Artifact | Location |
| --- | --- |
| Implementation plans | `docs/plans/YYYY-MM-DD-descriptive-name.md` |
| Code/architecture reviews | `docs/reviews/YYYY-MM-DD-descriptive-name.md` |
| Skills | `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` |
| Test evidence | `tests/skills/skill-name/{scenarios,baseline,verification}.md` |

---

## Theological Guardrails

You are working with Scripture. The stakes are higher than a broken unit test.

Every skill in this repository must satisfy these non-negotiable guardrails:

| Guardrail                | Violation                                | What You Will Do Instead                                     |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| **Anti-moralism**        | "Try harder" applications without gospel | Ground every application in indicative before imperative     |
| **Christ-centeredness**  | Missing redemptive-historical arc        | Trace the passage's place in the biblical storyline          |
| **Context primacy**      | Verses ripped from literary context      | Respect the discourse unit, the pericope, the book           |
| **Genre governance**     | Wrong method for the text type           | Identify genre before interpreting — always                  |
| **Covenantal awareness** | Flat biblicism across testaments         | Attend to covenant administration and progressive revelation |

If a skill enables moralism, obscures Christ, ignores context, mishandles genre, or flattens covenantal distinctions — it is not ready. Fix it or remove it.

---

## Common Rationalizations You Will Not Use

| What You Will Think                        | Why It Is Wrong                                    | What You Will Do                    |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------- |
| "This change is too small for TDD"         | Small changes introduce small errors that compound | Follow TDD                          |
| "I already know what the skill should say" | Your confidence is not evidence                    | Document the failure first          |
| "I'll write the tests after"               | Deferred testing is skipped testing                | Delete the skill. Write tests first |
| "The existing skill mostly covers this"    | "Mostly" is not "correctly"                        | Test the specific case              |
| "Academic review is sufficient"            | Reading is not using                               | Test with agent execution           |

You have been warned. Do not test the librarian's patience.

---

## Before You Submit Work

Verify every item. No exceptions.

- [ ] `superpowers:writing-skills` was invoked before any skill work began
- [ ] `tests/skills/skill-name/scenarios.md` exists with concrete test cases
- [ ] `tests/skills/skill-name/baseline.md` exists with documented failures
- [ ] `tests/skills/skill-name/verification.md` exists with correction proof
- [ ] `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` exists with YAML frontmatter
- [ ] `plugins/claude-of-alexandria/skills/skill-name/README.md` exists with development notes
- [ ] Theological guardrails satisfied — no moralism, no context violations
- [ ] Commit message follows Conventional Commits

All items checked? You may proceed.

Any item unchecked? You may not.

---

<p align="center"><em>The cataloguing continues. Do your part correctly.</em></p>
