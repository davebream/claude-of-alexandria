# Promptfoo Skill Evaluation Tests

Automated RED/GREEN testing for Claude of Alexandria skills using [promptfoo](https://promptfoo.dev) with the `anthropic:claude-agent-sdk` provider.

## What This Tests

Each skill has two test phases:

| Phase | Purpose | Provider |
|-------|---------|----------|
| **RED** | Confirms the bare model (no skill, no MCP) exhibits the documented failure modes | `without-skill.yaml` |
| **GREEN** | Confirms the skill + MCP tools correct those failures | `with-skill.yaml` |

A RED test that *passes* means the failure mode was successfully reproduced. A GREEN test that *passes* means the skill prevents the failure.

## Running Tests

### Prerequisites

- Claude Max subscription (OAuth token)
- Fish shell (for token retrieval) OR manually set `CLAUDE_CODE_OAUTH_TOKEN`

### Run via npm scripts

```bash
cd tests/promptfoo

# Single skill — both phases
npm run eval:exegetical-notes
npm run eval:pericope-delimitation
npm run eval:argument-flow
npm run eval:consult-biblical-scholar
npm run eval:biblical-segmentation

# Single phase
npm run eval:exegetical-notes:red
npm run eval:exegetical-notes:green

# With cache bypass (always fresh)
npm run eval:exegetical-notes:green
# (all scripts already include --no-cache)
```

### Run via eval.sh (alternative)

```bash
cd tests/promptfoo

# Specific skill
./eval.sh -c skills/exegetical-notes/promptfooconfig-green.yaml

# All skills (runs sequentially)
for skill in exegetical-notes pericope-delimitation argument-flow consult-biblical-scholar biblical-segmentation; do
  ./eval.sh -c skills/$skill/promptfooconfig-red.yaml
  ./eval.sh -c skills/$skill/promptfooconfig-green.yaml
done
```

## Directory Structure

```
tests/promptfoo/
├── providers/
│   ├── with-skill.yaml      # GREEN provider: skills + MCP enabled
│   └── without-skill.yaml   # RED provider: bare model, no skills
├── skills/
│   └── {skill-name}/
│       ├── promptfooconfig-red.yaml    # RED phase tests
│       └── promptfooconfig-green.yaml  # GREEN phase tests
├── agents/
│   └── {agent-name}/
│       ├── promptfooconfig-red.yaml
│       └── promptfooconfig-green.yaml
├── assertions/              # Shared assertion helpers (future)
├── eval.sh                  # Auth wrapper (OAuth token from fish shell)
└── package.json             # npm scripts
```

## Known Failure Modes

These failures are **genuine skill gaps** correctly documented by the tests — not rubric errors:

| Skill | Test | Failure | Status |
|-------|------|---------|--------|
| argument-flow | S4 GREEN | Col 1:15-20 structural claims labeled HIGH without evidence tier | Documented gap |
| argument-flow | ADV1 GREEN | Agent explains Iron Rule constraint but doesn't proceed to gather MCP data | Documented gap |
| consult-biblical-scholar | S6 GREEN | monogenes debate resolved definitively instead of presenting both sides | Documented gap |
| pericope-delimitation | S10 GREEN | Non-deterministic: EXTEND vs ADJUST for Rom 1:16-17 both valid | Non-deterministic |

## Authentication

The tests use Claude Max OAuth token via the Claude Agent SDK:

```bash
# eval.sh and npm scripts both handle this automatically
CLAUDE_CODE_OAUTH_TOKEN=<token>
CLAUDE_CODE_USE_BEDROCK=bypass-validation  # bypasses promptfoo API key validation
CLAUDECODE=  # prevents nested session detection error
```

For CI with `ANTHROPIC_API_KEY`, see `.github/workflows/promptfoo-eval.yml`.

## Adding New Tests

1. Create `tests/promptfoo/skills/{skill-name}/promptfooconfig-red.yaml`
2. Create `tests/promptfoo/skills/{skill-name}/promptfooconfig-green.yaml`
3. Add npm scripts to `package.json`
4. Follow existing configs as templates — see `exegetical-notes/` as the reference implementation
