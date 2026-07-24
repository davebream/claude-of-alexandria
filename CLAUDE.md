# The Librarian's Instructions

You have been granted access to the stacks. This is a privilege, not a right.

Read these instructions completely before touching a single scroll. If you believe you already know what to do — you do not. Read them anyway.

---

## What This Repository Is

Claude of Alexandria is a public, GPL-3.0 project with two halves that ship together:

1. **The plugin** (`plugins/claude-of-alexandria/`) — skills and agents for rigorous biblical study, developed with Test-Driven Development and validated with promptfoo evals.
2. **The MCP server** (`server/`) — a Cloudflare Worker backed by a D1 database, serving the biblical data the skills query (text, lexicon, morphology, cross-references, confessions, and more). Deployed at `https://coa.davebream.com/mcp`.

**The principle you will internalize**: Skills are structured documentation that prevents agent failure patterns. Every skill MUST have test evidence proving it prevents documented failures.

This is not a suggestion. This is not a "best practice." This is the standard by which all work in this repository is measured.

### This Repository Is Open Source

Anyone may clone it, and they will not have your local setup. That has consequences you will respect:

- **Assume no private tooling.** Do not add instructions that depend on plugins, marketplaces, skills, or CLIs outside this repository. Everything a contributor needs to do the work is in this file, the `README.md`, and the `scripts/` directory.
- **Assume no private paths.** No `/Users/...`, no machine-specific configuration, no personal directories in committed files.
- **Assume no secrets.** Credentials live in `.env` (gitignored) and Cloudflare secrets. Betterleaks scans every commit and every PR — do not fight it, do not add exceptions to get a commit through.
- **Write for a stranger.** Commit messages, issue templates, and docs are read by people with none of your context.

---

## The Methodology: TDD or Nothing

The methodology exists because agents who trust their instincts produce moralistic, context-ignoring, therapeutically-flavored interpretive frameworks. You are not the exception. Read the cycle below before writing skill content — not after.

> **Amended by [ADR 0002](docs/adr/0002-red-green-reframe-green-is-the-gate.md) — read it before running or changing evals.** The RED→GREEN cycle below is still how you *author* a skill. But as a standing test suite the two phases play different roles and must never be read as a matched before/after pair:
> - **GREEN is the gate** — an *absolute* check that the skill's output honours its contract (the MCP tools were actually called, per `metadata.toolCalls`; required sections present; guardrails hold). It runs on a **pinned** model, `claude-sonnet-5`, and moves only when *our* code moves. This is what "the skill works" means.
> - **RED is authoring evidence and a periodic audit**, not a per-change gate. It runs bare on the **cheapest supported model**, `claude-haiku-4-5`, where documented failures reliably reproduce. Re-run it on deliberate model bumps only. A RED scenario that stops failing is *expected* — it means the base model outgrew the need, a signal to re-scope the skill, not a build break.
> - **Skill value is never computed as "GREEN minus RED."** They run on different models on purpose; GREEN's absolute assertions have no bare baseline to confound.
> - **Contributors do not run the agentic suite.** They pass the fast, model-free checks (see `CONTRIBUTING.md` and `scripts/validate-eval-structure.sh`). The full sweep is maintainer-run at release and on model bumps.

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

## The Three Test Configs

Every skill and every agent has **exactly two required** promptfoo config files, and one optional extended config.

```
tests/promptfoo/skills/{skill-name}/
├── promptfooconfig-red.yaml       # RED phase — bare model failures (required)
├── promptfooconfig-green.yaml     # GREEN phase — failure-mode corrections (required)
└── promptfooconfig-extended.yaml  # EXTENDED phase — quality/ADV/STRESS scenarios (optional)
```

Agents follow the same structure under `tests/promptfoo/agents/{agent-name}/`.

**RED** runs prompts against the bare model (no skills, no MCP) on the cheapest supported model (`claude-haiku-4-5`). It documents what goes wrong — authoring evidence and a periodic audit, not a per-change gate (see ADR 0002).
**GREEN** runs the skill with MCP enabled on the pinned gate model (`claude-sonnet-5`) and asserts, absolutely, that the output honours its contract. Each scenario has one targeted assertion per failure mode — deterministic checks (icontains, javascript on `metadata.toolCalls`) plus one llm-rubric targeting that specific failure. GREEN is the regression gate; it does not reference the RED baseline.
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

**Running:** `npm run eval:integration`.

---

## Running Promptfoo Evaluations

### npm scripts (the normal path)

Run from the **repo root**. The root `package.json` delegates to `tests/promptfoo` via `--prefix`.

```bash
npm run eval:exegetical-notes:green   # one skill, one phase
npm run eval:regression               # regression suite
npm run eval:all                      # everything
```

Inside a Claude Code session, prefix with `CLAUDECODE=` to unset the variable and prevent nested-session crashes:

```bash
CLAUDECODE= npm run eval:regression
```

Run `npm run` with no arguments to list every available eval target — one per skill, per agent, per phase, plus `eval:smoke`, `eval:integration`, `eval:calibration`, and `eval:gate`.

### promptfoo MCP tools (preferred in agent sessions)

A promptfoo MCP server is configured in `.mcp.json`. `run_evaluation`, `list_evaluations`, and `get_evaluation_details` run as a separate process, so no `CLAUDECODE=` workaround is needed. Config paths are **relative to the repo root**:

```
run_evaluation({ configPath: "tests/promptfoo/skills/exegetical-notes/promptfooconfig-green.yaml" })
```

### Direct npx (terminal only)

Run from `tests/promptfoo`. Config paths are relative to that directory.

```bash
cd tests/promptfoo
npx promptfoo eval --no-cache -c skills/exegetical-notes/promptfooconfig-green.yaml
```

---

## Working on the MCP Server

The server is a TypeScript Cloudflare Worker (`server/src/index.ts`) with tool handlers in `server/src/tools/` and D1 access in `server/src/db/`. It has real tests — use them.

```bash
cd server
npm run dev          # local Worker via wrangler
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run deploy       # wrangler deploy (maintainers only)
```

**Database changes go through migrations.** Add a numbered file to `server/migrations/` — never mutate a shipped migration, never hand-edit the deployed database. Migrations must be idempotent so a reseed is safe.

### Two-Tier Data Model: Schema vs. Bulk Corpus Data

This project has two, clearly separated paths for getting data into D1. Which one you use depends on the *size* of what you're shipping — get this wrong and you either break every future deploy, or you bloat the repository's permanent history.

**Tier 1 — `server/migrations/`: schema + small seeds.** Numbered, version-controlled SQL files. The largest one committed to date is ~48K. These auto-apply on merge to `main` via `deploy-worker.yml`, and they run **before** the Worker deploy.

**Tier 2 — bulk corpus data.** Generated data remains gitignored and is never committed. A maintainer runs the committed, target-specific operator script in `server/scripts/` locally; it validates pinned inputs and requires both `--apply` and a typed confirmation before it writes production D1. CI may deploy the Worker and migrations, but it does not apply bulk corpus data. See `decisions/0010`.

**The invariant that makes this non-negotiable:** a failed migration blocks all future deploys, and it cannot be legally repaired — this file already forbids mutating a shipped migration, and hand-clearing the `d1_migrations` tracking table counts as the same kind of prohibited hand-editing. There is no safe way to "fix" a bad migration after the fact. Consequently, **bulk data must never go into a migration file.** If a change touches more than a small seed's worth of rows, it belongs in the generate-in-runner path (Tier 2), not Tier 1.

**Each bulk backfill has its own local operator command.** Never replace it with a broad reseed or an unreviewed generic ETL command.

**A reseed can silently wipe a backfill.** Do not run `seed-d1.sh` against production. Use the target-specific manual backfill command after any recovery operation.

**A new tool is not done until it is wired.** `scripts/validate-skill-tools.sh` checks that the tools a skill declares actually exist on the server, and CI runs it on every PR.

---

## CI and Local Gates

Every PR runs `.github/workflows/ci.yml`:

| Job | What it enforces |
| --- | --- |
| `typecheck` | `server && npm run typecheck` |
| `test` | `server && npm test` (vitest) |
| `audit` | server production dependency audit |
| `validate-plugin` | version consistency, skill-tool wiring, README counts, LICENSE and CHANGELOG present |
| `secret-scan` | Betterleaks over the PR diff (full history on push) |

Lefthook runs a subset before each commit (`lefthook.yml`): version sync and Betterleaks. If a gate fails, fix the cause. Do not bypass the hook.

The validation scripts live in `scripts/` and run standalone — `./scripts/validate-versions.sh`, `./scripts/validate-skill-tools.sh`, `./scripts/validate-readme-counts.sh`. Run them before you push rather than discovering the failure in CI.

---

## Changelog

`CHANGELOG.md` lives at the repository root. You will maintain it.

### When to Update

Add an entry under `## [Unreleased]` as part of the feature or fix commit that merges the change — do not defer it to a later cleanup pass. The **release** commit (`chore(release): bump version`) then promotes `[Unreleased]` to a dated version heading and bumps both version manifests; it does not introduce new entries.

### Format

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries go under the new version heading, grouped by type:

- **Added** — new features, skills, agents, MCP tools
- **Changed** — changes to existing behavior
- **Fixed** — bug fixes
- **Removed** — removed features

### Rules

- One entry per user-facing change. Internal refactors and test additions do not need entries.
- Write for users, not for developers. "Added a liturgical calendar lookup so skills can resolve a date to its lectionary readings" — not "feat(mcp): liturgical_lookup".
- Version heading format: `## [X.Y.Z] - YYYY-MM-DD`
- The version appears in `.claude-plugin/marketplace.json` and `plugins/claude-of-alexandria/.claude-plugin/plugin.json`. Both must match, and `validate-versions.sh` will tell you when they do not. Bump both and tag git in the same release commit.

---

## Repository Structure

```
claude-of-alexandria/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── .github/
│   ├── ISSUE_TEMPLATE/           # bug, feature, data-gap, theological-feedback
│   └── workflows/                # ci.yml, deploy-worker.yml, dependabot
├── plugins/
│   └── claude-of-alexandria/     # The plugin (the distributed artifact)
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin manifest
│       ├── .mcp.json             # Points the plugin at the hosted MCP server
│       ├── agents/               # Sub-agent collection
│       │   └── agent-name.md     # Agent file (YAML frontmatter + prompt)
│       ├── servers/              # MCP server packaging for the plugin
│       ├── skills/               # The skill collection
│       │   └── skill-name/
│       │       ├── SKILL.md      # Main skill file (YAML frontmatter + content)
│       │       └── README.md     # Development notes and context
│       └── README.md             # Plugin documentation
├── server/                       # Cloudflare Worker MCP server
│   ├── src/
│   │   ├── index.ts              # Worker entry point + tool registration
│   │   ├── tools/                # Tool handlers
│   │   └── db/                   # D1 queries
│   ├── migrations/               # Numbered, idempotent D1 migrations
│   ├── scripts/                  # Seeding and export utilities
│   └── wrangler.toml
├── scripts/                      # Repo validation + secret scanning
├── tests/
│   └── promptfoo/                # Automated agent & skill testing
│       ├── providers/            # Agent SDK configs (with/without skill)
│       ├── assertions/           # Shared helpers and rubrics
│       ├── skills/               # Per-skill RED/GREEN/EXTENDED configs
│       ├── agents/               # Per-agent RED/GREEN/EXTENDED configs
│       ├── integration/          # Cross-skill pipeline scenarios
│       └── smoke/                # Smoke + regression configs
├── docs/                         # Local plans/reviews plus committed ADRs, incidents, provenance
├── CLAUDE.md                     # You are here
├── CHANGELOG.md                  # Version history (Keep a Changelog format)
├── LICENSE                       # GPL-3.0
└── README.md                     # Public documentation
```

Every file has a place. Every place has a file. If you find yourself creating a file that does not fit this structure, you are likely doing something wrong.

---

## Where to Put Things

| Artifact | Location |
| --- | --- |
| Implementation plans | `docs/plans/YYYY-MM-DD-descriptive-name.md` (local only, gitignored) |
| Code/architecture reviews | `docs/reviews/YYYY-MM-DD-descriptive-name.md` (local only, gitignored) |
| Architecture decisions | `docs/adr/` |
| Incident reports | `docs/incidents/` |
| Data provenance records | `docs/data-provenance/` |
| Skills | `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` |
| Agents | `plugins/claude-of-alexandria/agents/agent-name.md` |
| MCP tool handlers | `server/src/tools/` |
| Database migrations | `server/migrations/` (numbered, idempotent) |
| Skill test configs | `tests/promptfoo/skills/skill-name/{promptfooconfig-red,promptfooconfig-green,promptfooconfig-extended}.yaml` |
| Agent test configs | `tests/promptfoo/agents/agent-name/{promptfooconfig-red,promptfooconfig-green,promptfooconfig-extended}.yaml` |

### Skill Versioning

Every SKILL.md tracks `version` and `changed` in its YAML frontmatter:

```yaml
version: 1.0.0         # semver
changed: "2026-04-30"  # ISO date of last modification
```

**When to bump:**
- **Patch** (`1.0.0` -> `1.0.1`): content edits, typo fixes, clarification within existing structure
- **Minor** (`1.0.0` -> `1.1.0`): structural changes, new sections, changes to how the skill directs agent behavior
- **Major** (`1.0.0` -> `2.0.0`): fundamental rework of skill purpose or methodology

Always update `changed` to the current date on any modification.

---

## What Gets Committed

**✅ Commit to Git:**

- Everything under `plugins/claude-of-alexandria/` — skills, agents, manifests
- Everything under `server/` except build output and local state
- Promptfoo configs in `tests/promptfoo/skills/`, `tests/promptfoo/agents/`, and `tests/promptfoo/integration/`
- Durable docs under `docs/adr/`, `docs/incidents/`, and `docs/data-provenance/`
- `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`

**❌ Do not commit:**

- Secrets, `.env` files, API keys, database dumps with credentials
- Temporary agent output files, eval result dumps
- Personal exploration notes; `docs/plans/` and `docs/reviews/` are gitignored
- Additional test files beyond the three-config structure (red/green/extended)
- Anything you would not want a future scholar to find in the archive

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Your commit messages will be read by strangers. Write them as if you are adding an entry to a permanent catalogue — because you are.

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
| "I'll wire the MCP tool up later"          | A skill citing a tool that does not exist is a lie | Ship the handler and the skill together |

You have been warned. Do not test the librarian's patience.

---

## Before You Submit Work

Verify every item. No exceptions.

- [ ] `tests/promptfoo/skills/skill-name/promptfooconfig-red.yaml` exists with bare-model failure scenarios
- [ ] `tests/promptfoo/skills/skill-name/promptfooconfig-green.yaml` exists with skill-corrected assertions
- [ ] GREEN tests pass on the pinned model (skill output honours its contract) — this is the gate
- [ ] RED evidence recorded (bare model on the cheapest supported model exhibits the failure); re-run only on model bumps, drift is expected (ADR 0002)
- [ ] `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` exists with YAML frontmatter, `version`, and `changed`
- [ ] `plugins/claude-of-alexandria/skills/skill-name/README.md` exists with development notes
- [ ] Server changes pass `npm run typecheck` and `npm test` in `server/`
- [ ] `./scripts/validate-versions.sh`, `./scripts/validate-skill-tools.sh`, and `./scripts/validate-readme-counts.sh` pass
- [ ] Theological guardrails satisfied — no moralism, no context violations
- [ ] No secrets, no private paths, no dependency on tooling outside this repository
- [ ] Commit message follows Conventional Commits

All items checked? You may proceed.

Any item unchecked? You may not.

---

<p align="center"><em>The cataloguing continues. Do your part correctly.</em></p>
