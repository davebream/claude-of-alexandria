# Repository Structure Cleanup - Design

**Date:** 2026-02-18
**Goal:** Fix structural issues remaining from marketplace conversion: duplicate data, stale paths, wrong diagrams, tracked cache files.

---

## Context

The repository converted from a flat `skills/` structure to a marketplace layout (`plugins/claude-of-alexandria/skills/`). The conversion left behind:

1. Duplicate reference data at root
2. `__pycache__` tracked in git
3. CLAUDE.md structure diagrams showing old layout (both copies)
4. Technical debt roadmap referencing old paths
5. README skill count inconsistencies (badge says 3, text says 1)
6. Orphan text file at root

## Changes

### 1. Remove duplicate `reference/vocabulary/` at root

**What:** Delete `reference/` directory at root (~15MB of JSON).
**Why:** Identical data exists at `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/`. Root copy is stale from pre-marketplace structure.
**Risk:** Low. Confirmed identical via `diff`.

### 2. Remove `__pycache__` from git tracking

**What:** `git rm -r --cached` the tracked `__pycache__/` directory inside plugins scripts.
**Why:** Python bytecode shouldn't be in git. `.gitignore` already has the rule but files were committed before it was added.

### 3. Update CLAUDE.md structure diagram (both copies)

**What:** Update the "Repository Structure" section in both root `CLAUDE.md` and `plugins/claude-of-alexandria/CLAUDE.md` to reflect actual layout:

```
claude-of-alexandria/
├── .claude-plugin/
│   └── marketplace.json         # Marketplace configuration
├── plugins/
│   └── claude-of-alexandria/    # The plugin
│       ├── .claude-plugin/
│       │   └── manifest.json    # Plugin manifest
│       ├── skills/              # Skill collection
│       │   ├── biblical-segmentation/
│       │   ├── exegetical-notes/
│       │   └── pericope-delimitation/
│       ├── CLAUDE.md
│       └── README.md
├── tests/                       # TDD test evidence (root level)
│   └── skills/
│       └── skill-name/
│           ├── scenarios.md
│           ├── baseline.md
│           └── verification.md
├── docs/                        # Plans, reviews, roadmaps
├── CLAUDE.md                    # Development instructions
└── README.md                    # Public documentation
```

### 4. Update technical debt roadmap paths

**What:** Add a note at top of `docs/technical-debt-roadmap.md` explaining paths have changed from `skills/biblical-segmentation/...` to `plugins/claude-of-alexandria/skills/biblical-segmentation/...`. Don't rewrite all 11 items — just add the path mapping note.

### 5. Fix README skill count inconsistencies

**What:** Update text references from "one skill" to reflect 3 skills:
- Line 28: "one skill, at present"
- Line 68: "one skill"
- Line 172: "Currently contains 1 skill"

Note: biblical-segmentation is production-tested (33 scenarios). Pericope-delimitation and exegetical-notes have SKILL.md files and RED phase baselines but haven't completed GREEN verification yet. README should acknowledge this.

### 6. Remove orphan text file

**What:** Delete `2026-02-18-100130-use-sequential-thinking-analyze-this-project-and.txt` from root.

## Out of Scope

- Rewriting or moving SKILL.md files
- Executing the technical debt roadmap items themselves
- GREEN phase verification for pericope-delimitation or exegetical-notes
- Any changes to skill content
