# CLAUDE.md Restructure Design

**Date**: 2026-01-19
**Status**: Approved

## Problem Statement

### CLAUDE.md Issues

Current CLAUDE.md has four critical issues:
1. **Too verbose** - ~400 lines, agents struggle to find critical info quickly
2. **Missing patterns** - lacks plugin configuration guidance seen in best practices
3. **Poor organization** - information buried, hard to scan
4. **Conceptual mismatch** - doesn't match how agents actually use it

### README.md Issues

Current README is titled "Biblical Segmentation" and focuses entirely on that single skill:
- Should be about "Claude of Alexandria" as a plugin suite
- Should introduce the project, then list current skills
- Installation should be for the plugin, not individual skill
- Keep skill-specific details (data sources, Iron Rules) in skill docs

## Research Findings

Analysis of 2026 CLAUDE.md best practices reveals:
- **Target length**: <300 lines (ideally <100 lines)
- **Instruction limit**: LLMs can follow ~150-200 instructions; Claude Code uses ~50, leaving ~100-150 for project files
- **Progressive disclosure**: Keep CLAUDE.md minimal, use `@path/to/file.md` imports for details
- **WHAT/WHY/HOW structure**: Tech stack, purpose, workflows

Sources:
- [Writing a good CLAUDE.md | HumanLayer Blog](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Notes on CLAUDE.md Structure and Best Practices](https://callmephilip.com/posts/notes-on-claude-md-structure-and-best-practices/)
- [The Complete Guide to CLAUDE.md](https://www.builder.io/blog/claude-md-guide)

## Design Decision

**Approach**: "Constraint-Driven" structure (Option C)

Emphasizes constraints first (prevents violations), balances brevity with context, uses imports for depth.

## New Structure

```markdown
# CRITICAL: Always Use Writing-Skills
# Project Overview (one-liner + core principle)
# Non-Negotiables (TDD required, version control)
# Essential Commands (testing, git)
# Project Structure (with test files in ./tests/)
# Quick Reference (checklist, help links)
```

**Target**: ~130 lines (67% reduction from current ~400 lines)

## Key Changes

### Structure Changes
- **Tests relocated**: `skills/skill-name/tests/` → `tests/skills/skill-name/`
- **File imports added**: Reference `@docs/tdd-methodology.md`, `@docs/tdd-exceptions.md`, `@docs/skill-structure.md`
- **Removed sections**: Theological constraints, CI/CD references, validation scripts, skill structure details

### Content Principles
- Lead with critical workflow constraint (`superpowers:writing-skills`)
- No mission/values content (purely technical)
- Scannable sections with clear headers
- Let writing-skills skill handle skill-specific details

## Complete New CLAUDE.md

```markdown
# Claude of Alexandria - AI Agent Development Guide

**CRITICAL: Always Use `superpowers:writing-skills`**

When working on this repository, you MUST use the `superpowers:writing-skills` skill for:
- Creating new skills
- Editing existing skills
- Verifying skills work correctly

DO NOT create or modify skills without invoking this skill first. It guides you through the complete TDD cycle (RED-GREEN-REFACTOR) which is mandatory for all skill development.

## Project Overview

**Purpose**: Suite of analytical skills for rigorous biblical study, developed using Test-Driven Development.

**Core Principle**: Skills are process documentation that prevents agent failure patterns through systematic frameworks. Every skill MUST have test evidence proving it works.

**Key Constraint**: TDD is non-negotiable. All skills require:
- `tests/skills/skill-name/scenarios.md` - Reusable test cases
- `tests/skills/skill-name/baseline.md` - RED phase evidence
- `tests/skills/skill-name/verification.md` - GREEN phase proof

See `@docs/tdd-methodology.md` for complete RED-GREEN-REFACTOR process.
See `@docs/tdd-exceptions.md` for when editorial changes don't require TDD.

## Non-Negotiables

### TDD Methodology

**Framework changes always require TDD:**
- Adding/modifying framework steps
- Changing Red Flags or Common Rationalizations
- Adding validation criteria or skill structure changes

**Editorial changes do not require TDD:**
- Typo fixes, grammar corrections
- Clarifying existing instructions (without changing them)
- Formatting improvements, broken link fixes
- README/metadata updates

When uncertain, do TDD. See `@docs/tdd-exceptions.md` for decision framework.

### Version Control

**✅ COMMIT to Git:**
- All files in `skills/` directory
- All test files in `tests/skills/` directory
  - `scenarios.md` - Test cases (committed)
  - `baseline.md` - RED phase results (committed)
  - `verification.md` - GREEN phase results (committed)
- All files in `docs/` directory
- README.md and CLAUDE.md

**❌ DO NOT COMMIT:**
- Temporary agent output files
- Personal exploration notes

## Essential Commands

### Testing

```bash
# Verify test files exist
ls -la tests/skills/skill-name/
```

**Expected structure:**
```
tests/skills/skill-name/
  scenarios.md      # Test cases
  baseline.md       # RED phase
  verification.md   # GREEN phase
```

### Git Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages.

## Project Structure

```
claude-of-alexandria/
├── .claude-plugin/               # Plugin configuration
│   └── manifest.json            # Plugin metadata
├── skills/                       # Skill definitions
│   └── skill-name/
│       ├── SKILL.md             # Main skill file (YAML + content)
│       └── README.md            # Development notes
├── tests/                        # All test files
│   └── skills/
│       └── skill-name/
│           ├── scenarios.md     # Test cases (committed)
│           ├── baseline.md      # RED phase results (committed)
│           └── verification.md  # GREEN phase results (committed)
├── CLAUDE.md                     # This file
└── README.md                     # Public documentation
```

## Quick Reference

### Before Committing

**Every skill must have:**
- ✅ `tests/skills/skill-name/scenarios.md` - Test scenarios
- ✅ `tests/skills/skill-name/baseline.md` - RED phase evidence
- ✅ `tests/skills/skill-name/verification.md` - GREEN phase proof
- ✅ `skills/skill-name/SKILL.md` - Main skill file with YAML frontmatter
- ✅ `skills/skill-name/README.md` - Development notes

### Getting Help

**For skill development:** Use `superpowers:writing-skills` skill
```

## README.md Restructure

### New Structure

```markdown
# Claude of Alexandria

AI agent skills for rigorous biblical study and preparation, built on faithful exegetical and homiletical principles.

## What is this?

**Claude of Alexandria** is a Claude Code plugin providing analytical skills for biblical study and teaching preparation. The system prioritizes:

- **Rigorous biblical scholarship** - Linguistic analysis, historical context, and theological integration
- **Theological integrity** - Anti-moralism mandate, Christ-centeredness, and gospel focus
- **Zero recurring costs** - Leverages the internal knowledge and training of frontier models
- **Skill-based architecture** - Modular, composable, stateless skills instead of monolithic tools

Named after the ancient Library of Alexandria, this project provides systematic frameworks for faithful biblical study.

## Do I Really Need This?

**Yes.** Even sophisticated frontier AI models make predictable errors under pressure—prioritizing felt needs over textual diagnosis, psychologizing passages, and defaulting to therapeutic frameworks.

[Include shortened version of Matthew 11:28-30 example or use biblical-segmentation example]

The skills in this project **prevent these failures** through Test-Driven Development—each skill is built by first documenting baseline failures, then creating minimal frameworks that eliminate them.

## Current Skills

- **[biblical-segmentation](skills/biblical-segmentation/)** - Divides biblical books into coherent teaching units (sermon series, small groups, devotional reading) with integrity safeguards: refuses impossible divisions, presents multiple scholarly-grounded options, validates against ancient manuscript markers (Masoretic פ/ס, Levinsohn discourse features), and handles contested books with multiple frameworks

## Installation

[Plugin installation instructions - TBD based on .claude-plugin setup]

## License

MIT License

## Acknowledgments

[Keep data sources, linguistic foundations, hermeneutical framework]

## Disclaimer

This project is independent and not affiliated with Anthropic PBC.
```

### Key Changes

- **Title**: "Biblical Segmentation" → "Claude of Alexandria"
- **Scope**: Single skill focus → Plugin suite (currently 1 skill)
- **Installation**: Skill-specific → Plugin-level
- **Details**: Move skill-specific content (Iron Rules, data sources, examples) to skill's own README

## Implementation Steps

1. Write new CLAUDE.md with approved structure
2. Restructure README.md as plugin introduction
3. Move skill-specific content from README to `skills/biblical-segmentation/README.md`
4. Relocate test files: `skills/*/tests/` → `tests/skills/*/`
5. Update any references to old test paths in documentation
6. Verify no broken links or references
7. Commit changes with conventional commit message

## Success Metrics

### CLAUDE.md
- ✅ File reduced to ~130 lines (67% reduction)
- ✅ Critical constraint appears first
- ✅ Scannable structure with clear sections
- ✅ File imports for deep-dive content
- ✅ No mission/values content
- ✅ Tests relocated to root `./tests/` directory

### README.md
- ✅ Titled "Claude of Alexandria" (plugin name)
- ✅ Brings back compelling "What is this?" overview (4 bullet points)
- ✅ Keeps "Do I Really Need This?" section
- ✅ Lists current skills with detailed, sophisticated descriptions
- ✅ Plugin-level installation instructions
- ✅ Removes Contributing and Development Philosophy sections
- ✅ Skill-specific details moved to skill's own README
