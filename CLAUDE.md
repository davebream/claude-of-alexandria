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

## The Three Test Configs

Every skill has **exactly two required** promptfoo config files, and one optional extended config.

```
tests/promptfoo/skills/{skill-name}/
├── promptfooconfig-red.yaml       # RED phase — bare model failures (required)
├── promptfooconfig-green.yaml     # GREEN phase — failure-mode corrections (required)
└── promptfooconfig-extended.yaml  # EXTENDED phase — quality/ADV/STRESS scenarios (optional)
```

**RED** runs prompts against the bare model (no skills, no MCP). It documents what goes wrong.
**GREEN** runs the same prompts with skills and MCP enabled. It proves the skill corrects each failure. Each scenario has one targeted assertion per failure mode — deterministic checks (icontains, javascript) plus one llm-rubric targeting that specific failure.
**EXTENDED** runs quality, adversarial (ADV), and stress (STRESS) scenarios that have no corresponding RED failure. These run on-demand during skill development, not in CI.

**Do not create additional test files** beyond these three canonical configs. No `promptfooconfig-edge-cases.yaml`. No `extra-scenarios.yaml`. If it does not fit RED, GREEN, or EXTENDED, reconsider whether it belongs.

**Rationale**: Consistency across all skills. A known structure. GREEN stays cheap enough for CI (one llm-rubric per failure mode). EXTENDED runs on-demand for advanced validation.

### Integration Tests

Integration tests verify multi-skill pipeline composition — that one skill's output is valid input for the next.

```
tests/promptfoo/integration/
└── promptfooconfig.yaml    # All integration scenarios (no RED/GREEN split)
```

**When to add a scenario:** When a new skill consumes another skill's output (via `--context`, agent delegation, or user-mediated handoff).

**Structure:** Each scenario issues a multi-step prompt that invokes skills sequentially within one eval call. Assertions verify: (1) downstream skill accepted upstream output, (2) downstream skill referenced upstream data, (3) pipeline coherence via llm-rubric.

**Running:** `npm run eval:integration` from `tests/promptfoo/`.

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

## Running Promptfoo Evaluations

There are three ways to run evaluations, depending on context:

### 1. MCP tools (preferred in agent sessions)

A promptfoo MCP server is configured in `.mcp.json`. Use MCP tools (`run_evaluation`, `list_evaluations`, `get_evaluation_details`) within Claude Code agent sessions. No `CLAUDECODE=` workaround needed — MCP runs as a separate process.

Config paths are **relative to the project root**:

```
run_evaluation({ configPath: "tests/promptfoo/skills/exegetical-notes/promptfooconfig-green.yaml" })
run_evaluation({ configPath: "tests/promptfoo/smoke/promptfooconfig-regression.yaml" })
```

### 2. npm scripts (terminal or Claude Code fallback)

Run from **repo root**. Root `package.json` delegates to `tests/promptfoo` via `--prefix`.

```bash
# Terminal — works directly
npm run eval:exegetical-notes:green
npm run eval:regression

# Claude Code session (if MCP unavailable) — prefix with CLAUDECODE=
CLAUDECODE= npm run eval:regression
CLAUDECODE= npm run eval:all
```

The `CLAUDECODE=` prefix unsets the environment variable to prevent nested session crashes.

### 3. Direct npx (terminal only)

Run from `tests/promptfoo`. Config paths are relative to that directory.

```bash
cd tests/promptfoo
npx promptfoo eval --no-cache -c skills/exegetical-notes/promptfooconfig-green.yaml
```

### After running

Capture the eval ID from the output line `Eval complete (ID: eval-XXX-...)` and record it in the Eval History table of `docs/PROGRESS.md`.

---

## Coverage Matrix

See `docs/coverage-matrix.md` for the RED scenario coverage audit: scenario inventory mapped against biblical books, genres, and MCP tools.

---

## What Gets Committed

**✅ Commit to Git:**

- All files in `plugins/claude-of-alexandria/skills/` directory
- All files in `plugins/claude-of-alexandria/agents/` directory
- Promptfoo test configs in `tests/promptfoo/skills/` and `tests/promptfoo/agents/`
- `README.md`, `CLAUDE.md`, and `CHANGELOG.md`

**❌ Do not commit:**

- Temporary agent output files
- Personal exploration notes
- Additional test files beyond the three-config structure (red/green/extended)
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
│       ├── agents/               # Sub-agent collection
│       │   └── agent-name.md     # Agent file (YAML frontmatter + prompt)
│       ├── skills/               # The skill collection
│       │   └── skill-name/
│       │       ├── SKILL.md      # Main skill file (YAML frontmatter + content)
│       │       └── README.md     # Development notes and context
│       ├── CLAUDE.md             # Plugin-level copy
│       └── README.md             # Plugin documentation
├── tests/
│   ├── promptfoo/                # Automated agent & skill testing
│   │   ├── providers/            # Agent SDK configs (with/without skill)
│   │   ├── assertions/           # Shared helpers and rubrics
│   │   ├── skills/               # Per-skill RED/GREEN/EXTENDED configs
│   │   │   └── skill-name/
│   │   │       ├── promptfooconfig-red.yaml
│   │   │       ├── promptfooconfig-green.yaml
│   │   │       └── promptfooconfig-extended.yaml  # optional
│   │   ├── agents/               # Per-agent RED/GREEN/EXTENDED configs
│   │   │   └── agent-name/
│   │   │       ├── promptfooconfig-red.yaml
│   │   │       ├── promptfooconfig-green.yaml
│   │   │       └── promptfooconfig-extended.yaml  # optional
│   │   └── package.json
├── docs/                         # Implementation plans, reviews
├── CLAUDE.md                     # You are here
├── CHANGELOG.md                  # Version history (Keep a Changelog format)
└── README.md                     # Public documentation
```

Every file has a place. Every place has a file. If you find yourself creating a file that does not fit this structure, you are likely doing something wrong.

---

## Where to Put Things

| Artifact | Location |
| --- | --- |
| Implementation plans | `docs/plans/YYYY-MM-DD-descriptive-name.md` (local only, gitignored) |
| Code/architecture reviews | `docs/reviews/YYYY-MM-DD-descriptive-name.md` (local only, gitignored) |
| Skills | `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` |
| Agents | `plugins/claude-of-alexandria/agents/agent-name.md` |
| Skill test configs | `tests/promptfoo/skills/skill-name/{promptfooconfig-red,promptfooconfig-green,promptfooconfig-extended}.yaml` |
| Agent test configs | `tests/promptfoo/agents/agent-name/{promptfooconfig-red,promptfooconfig-green,promptfooconfig-extended}.yaml` |

### Skill Versioning

Every SKILL.md tracks `version` and `changed` in its YAML frontmatter:

```yaml
version: 1.0.0      # semver
changed: "2026-04-30"  # ISO date of last modification
```

**When to bump:**
- **Patch** (`1.0.0` -> `1.0.1`): content edits, typo fixes, clarification within existing structure
- **Minor** (`1.0.0` -> `1.1.0`): structural changes, new sections, changes to how the skill directs agent behavior
- **Major** (`1.0.0` -> `2.0.0`): fundamental rework of skill purpose or methodology

Always update `changed` to the current date on any modification.

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
- [ ] `tests/promptfoo/skills/skill-name/promptfooconfig-red.yaml` exists with bare-model failure scenarios
- [ ] `tests/promptfoo/skills/skill-name/promptfooconfig-green.yaml` exists with skill-corrected assertions
- [ ] RED tests pass (bare model fails as expected)
- [ ] GREEN tests pass (skill corrects documented failures)
- [ ] `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` exists with YAML frontmatter
- [ ] `plugins/claude-of-alexandria/skills/skill-name/README.md` exists with development notes
- [ ] Theological guardrails satisfied — no moralism, no context violations
- [ ] Commit message follows Conventional Commits

All items checked? You may proceed.

Any item unchecked? You may not.

---

<p align="center"><em>The cataloguing continues. Do your part correctly.</em></p>
