# Contributing to Claude of Alexandria

Thank you for helping catalogue the stacks. This project has a **two-tier bar** so
that fixing a typo does not require the same effort as shipping a new skill.

## Tier 1 — what every contributor runs (fast, free, deterministic)

These checks are model-free: no Claude subscription, no API key, no MCP server. They
run in seconds and are what CI enforces on your PR.

```bash
# from the repo root
./scripts/validate-versions.sh          # version manifests agree
./scripts/validate-skill-tools.sh       # skills only cite MCP tools that exist
./scripts/validate-readme-counts.sh     # README/badge counts match reality
./scripts/validate-eval-structure.sh    # eval configs are well-formed (see below)

cd server && npm run typecheck && npm test   # the server has real unit tests
```

If those pass, your change is ready for review. **You do not need to run the agentic
eval suite.** Most valuable contributions — a data-gap fix, a lexicon correction, a
new confession, a doc fix, a typo — never touch skill behaviour and never need it.

## Tier 2 — the agentic eval suite (maintainer-run)

The promptfoo suite under `tests/promptfoo/` runs full Claude Code agent sessions
(skill + MCP + up to 50 turns each). A complete GREEN sweep is a ~1.5–2 hour serial
run, needs a Claude subscription (`CLAUDE_CODE_OAUTH_TOKEN`), and needs the hosted MCP
server reachable. **It is not run in CI and is not expected of contributors.** The
maintainer runs it at release cut and on deliberate base-model bumps.

If your PR *does* change a skill's behaviour (SKILL.md logic, agent prompts, the MCP
output contract), say so in the PR description and, if you can, run the relevant
skill's GREEN config locally:

```bash
cd tests/promptfoo
# GREEN is the gate: does the skill honour its output contract on the pinned model?
node_modules/.bin/promptfoo eval --no-cache -j 1 -c skills/<skill>/promptfooconfig-green.yaml
```

Run at low concurrency (`-j 1`). The maintainer will run the full sweep before release.

## How the evals are organised (and why)

See [`docs/adr/0002`](docs/adr/0002-red-green-reframe-green-is-the-gate.md) for the
full rationale. In short:

- **GREEN is the gate.** It asserts that a skill's output honours its contract —
  the right MCP tools were actually called and cited, the required sections are
  present, the theological guardrails hold. It runs against a **pinned** base model
  and only changes when *our* code changes.
- **RED is authoring evidence, not a per-change gate.** It captured, at authoring
  time, the failure each skill was built to prevent. It is re-run only on model bumps.
  A RED scenario that stops failing is expected — it means a smarter base model no
  longer needs the skill for that behaviour, which is a signal to re-scope the skill,
  not a build break.

## Changing a skill

Skill and agent behaviour is governed by the theological guardrails and TDD discipline
described in [`CLAUDE.md`](CLAUDE.md). Read it before proposing changes to a `SKILL.md`
or an agent definition. New skills still ship with RED authoring evidence and a GREEN
gate; the maintainer validates the full suite before release.

## Reporting data gaps and issues

Use the issue templates under `.github/ISSUE_TEMPLATE/` (bug, feature, data-gap,
theological-feedback). Data-gap and correction reports are especially welcome and need
no eval run at all.
