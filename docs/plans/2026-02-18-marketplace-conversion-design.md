# Marketplace Conversion Design

**Date:** 2026-02-18
**Status:** Approved
**Approach:** Full Marketplace Optimization (Approach 2)

## Overview

Convert the `davebream/claude-of-alexandria` repository from a manual-install plugin to a Claude Code marketplace for easier installation, auto-updates, and better discoverability.

## Goals

1. **Easy installation** - One-command install instead of manual clone + symlink
2. **Auto-updates** - Users get new skills and improvements automatically
3. **Maximum discoverability** - Shows up in searches for biblical/theology terms with compelling description

## Constraints

- Single plugin architecture (all biblical study skills under one plugin)
- No existing users to maintain backward compatibility for
- Preserve TDD methodology and test infrastructure
- Maintain "Library of Alexandria" theme and rigorous scholarship standards

## Success Criteria

- ✅ One-command installation: `claude-code marketplace install davebream/claude-of-alexandria`
- ✅ Skills function identically to manual installation
- ✅ Shows up in marketplace search for "biblical", "theology", "sermon", "exegesis"
- ✅ Auto-updates work correctly
- ✅ TDD test infrastructure remains accessible to contributors

---

## Section 1: Repository Structure

### Current Structure
```
claude-of-alexandria/
├── .claude-plugin/
│   └── manifest.json          # Plugin manifest
├── skills/
│   └── biblical-segmentation/
├── tests/
├── docs/
├── CLAUDE.md
└── README.md
```

### New Marketplace Structure
```
claude-of-alexandria/
├── .claude-plugin/
│   └── marketplace.json       # NEW: Marketplace manifest
├── plugins/
│   └── claude-of-alexandria/  # NEW: Plugin subdirectory
│       ├── .claude-plugin/
│       │   └── manifest.json  # MOVED: Plugin manifest
│       ├── skills/            # MOVED: All skills
│       ├── README.md          # MOVED: Plugin-specific docs
│       └── CLAUDE.md          # MOVED: Plugin dev instructions
├── tests/                      # STAYS: TDD infrastructure
├── docs/                       # STAYS: Design docs
├── assets/                     # STAYS: Images
├── README.md                   # UPDATED: Marketplace-level README
└── LICENSE                     # STAYS: Root level
```

### Key Architectural Decisions

**What stays at root:**
- `tests/` - TDD infrastructure tests the plugin, not the marketplace
- `docs/` - Design/planning documents are repo-level
- `assets/` - Shared images (banner)
- `LICENSE` - Root-level license
- `CLAUDE.md` - Librarian's instructions for contributors

**What moves to plugin directory:**
- `skills/` - Plugin implementation
- `.claude-plugin/manifest.json` - Plugin metadata
- New `README.md` - Plugin-specific skill documentation
- Copy of `CLAUDE.md` - Development instructions available in plugin context

**Documentation flow:**
- GitHub visitors → Root README → Install via marketplace
- Installed users → Plugin README (via Claude Code) → Skill details
- Contributors → CLAUDE.md → TDD methodology

---

## Section 2: Metadata & Discoverability Optimization

### marketplace.json Structure

```json
{
  "name": "claude-of-alexandria",
  "owner": {
    "name": "@davebream",
    "email": "your-email@example.com"
  },
  "metadata": {
    "description": "AI agent skills for rigorous biblical study built on faithful exegetical principles",
    "version": "0.1.0",
    "pluginRoot": "./plugins"
  },
  "plugins": [
    {
      "name": "claude-of-alexandria",
      "source": "./plugins/claude-of-alexandria",
      "description": "Rigorous analytical skills for biblical study, exegetical analysis, and faithful application. Built with TDD methodology to prevent AI exegetical malpractice.",
      "version": "0.1.0",
      "author": { "name": "@davebream" },
      "keywords": [
        "biblical-scholarship",
        "exegesis",
        "hermeneutics",
        "theology",
        "sermon-preparation",
        "bible-study",
        "teaching-preparation",
        "biblical-interpretation",
        "genre-analysis",
        "historical-grammatical",
        "scripture",
        "preaching"
      ],
      "category": "education"
    }
  ]
}
```

### Keyword Strategy

**Academic terms:** biblical-scholarship, exegesis, hermeneutics, theology
**Practical use cases:** sermon-preparation, bible-study, teaching-preparation, preaching
**Methods:** genre-analysis, historical-grammatical, biblical-interpretation
**General:** scripture, theology

**Category:** "education" - fits better than "research" or "productivity" for learning and teaching Scripture.

### Description Strategy

**Marketplace-level description (short):**
"AI agent skills for rigorous biblical study built on faithful exegetical principles"

**Plugin-level description (detailed):**
"Rigorous analytical skills for biblical study, exegetical analysis, and faithful application. Built with TDD methodology to prevent AI exegetical malpractice."

Both descriptions emphasize rigor and faithfulness while being immediately understandable.

---

## Section 3: Installation & Documentation Updates

### New Installation Method

**What users will do:**
```bash
claude-code marketplace install davebream/claude-of-alexandria
```

**Auto-update:**
```bash
claude-code marketplace update claude-of-alexandria
```

### Root README.md Changes

1. **Hero section** - Keep papyrus scroll image and Library of Alexandria theme
2. **Installation section** - Replace manual clone/symlink with marketplace command:
   ```markdown
   ## Installation

   ```bash
   claude-code marketplace install davebream/claude-of-alexandria
   ```

   That's it. The scrolls are now on your shelf.
   ```
3. **Add marketplace badge** - Visual indicator it's installable via marketplace
4. **Quick start** - Show example of using a skill immediately after install

### Plugin-Level README

**New file:** `plugins/claude-of-alexandria/README.md`

**Contents:**
- Detailed skill documentation
- Individual skill usage examples
- Development guidelines for contributors
- Links back to root README for installation

### Files Kept at Root

- `CLAUDE.md` - Librarian's instructions for contributors (stays authoritative)
- `tests/` - TDD methodology and test evidence
- `docs/` - Design documents and plans

---

## Section 4: Migration Plan

### Step-by-Step Conversion Process

**1. Create new structure:**
```bash
mkdir -p plugins/claude-of-alexandria
mkdir -p .claude-plugin
```

**2. Move plugin files:**
```bash
# Move skills
mv skills plugins/claude-of-alexandria/

# Move plugin manifest
mv .claude-plugin/manifest.json plugins/claude-of-alexandria/.claude-plugin/manifest.json

# Copy CLAUDE.md to plugin (keep original at root)
cp CLAUDE.md plugins/claude-of-alexandria/CLAUDE.md
```

**3. Create marketplace files:**
- Create `.claude-plugin/marketplace.json` with optimized metadata
- Create `plugins/claude-of-alexandria/README.md` with skill documentation
- Update root `README.md` with marketplace installation instructions
- Add marketplace installation badge

**4. Files that stay at root:**
- `tests/` - TDD infrastructure
- `docs/` - Design documents
- `assets/` - Images (banner)
- `LICENSE` - Root license
- `CLAUDE.md` - Original librarian's instructions
- `.git/` - Version control

**5. Update git and publish:**
```bash
git add .
git commit -m "feat: Convert to marketplace structure with optimized discoverability"
git tag v0.1.0
git push origin main --tags
```

**6. Test installation:**
```bash
claude-code marketplace install davebream/claude-of-alexandria
```

### Rollback Plan

Since there are no existing users, rollback is simple:
```bash
git revert HEAD
git push origin main
```

We'll test installation thoroughly before announcing the marketplace publicly.

---

## Section 5: Testing & Validation

### Pre-Conversion Verification

- ✅ Current plugin structure works (skills load correctly)
- ✅ TDD tests pass (verify existing functionality)
- ✅ Git working tree is clean (no uncommitted changes)

### Post-Conversion Testing

**1. Local structure validation:**
```bash
# Verify marketplace.json is valid JSON
cat .claude-plugin/marketplace.json | python3 -m json.tool

# Verify plugin directory contains all required files
ls -la plugins/claude-of-alexandria/

# Check that no files were accidentally deleted
git status
```

**2. Installation testing:**
```bash
# Remove old manual installation if it exists
rm -rf ~/.claude/plugins/claude-of-alexandria

# Install from GitHub marketplace
claude-code marketplace install davebream/claude-of-alexandria

# Verify installation
claude-code /skills  # Should show biblical-segmentation
```

**3. Functionality testing:**
- Launch Claude Code session
- Test: "Use biblical-segmentation to divide Romans into 8 sessions"
- Verify skill loads and executes correctly
- Check that TDD guardrails are still enforced (refuses impossible divisions, presents multiple frameworks, etc.)

**4. Auto-update testing:**
```bash
# Make a small change (e.g., update version to 0.1.1)
# Push to GitHub
# Run update command
claude-code marketplace update claude-of-alexandria

# Verify update pulls latest changes
```

**5. Discoverability testing:**
- Search marketplace for "biblical" - should appear in results
- Search marketplace for "theology" - should appear in results
- Search marketplace for "sermon" - should appear in results
- Check category filter for "education" - should be listed

### Success Criteria Validation

- ✅ One-command installation works
- ✅ Skills function identically to manual installation
- ✅ Shows up in marketplace search for "biblical", "theology", "sermon", "exegesis"
- ✅ Auto-updates work correctly
- ✅ TDD test infrastructure remains accessible to contributors
- ✅ Documentation flow makes sense (GitHub → Install, Claude Code → Use, Contributors → Develop)

---

## Implementation Notes

### Version Strategy

Start with `v0.1.0` for the marketplace release. This signals:
- Early stage (0.x.x) - breaking changes possible
- First marketplace version (.1.0) - fresh start with new distribution method
- Production-ready (.x.0) - the plugin itself is stable (has TDD tests)

### Future Expansion Path

While this is a single-plugin marketplace today, the structure allows adding more plugins later if needed:
```
plugins/
├── claude-of-alexandria/     # Main plugin (all 66 books)
└── claude-of-antioch/        # Hypothetical future plugin (different tradition)
```

But this is not planned and probably won't be needed. Single plugin = simpler maintenance.

### TDD Methodology Preservation

The TDD infrastructure (`tests/`, `CLAUDE.md` instructions) stays at root level because:
1. It documents the development methodology for the entire project
2. Contributors need to see it before touching plugin code
3. It's part of the project's scholarly rigor, not just implementation details

New skills added to the plugin will continue to require:
- `tests/skills/{skill-name}/scenarios.md`
- `tests/skills/{skill-name}/baseline.md`
- `tests/skills/{skill-name}/verification.md`

The librarian remains strict about TDD. Marketplace conversion doesn't change that.

---

## Conclusion

This design converts `claude-of-alexandria` from a manual-install plugin to a discoverable, auto-updating marketplace while preserving its scholarly rigor, TDD methodology, and Library of Alexandria theme.

**Next step:** Create implementation plan using `writing-plans` skill.
