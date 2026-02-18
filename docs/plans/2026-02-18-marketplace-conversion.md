# Marketplace Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert claude-of-alexandria repository to a Claude Code marketplace for one-command installation, auto-updates, and better discoverability.

**Architecture:** Restructure repo with marketplace.json at root and plugin contents in plugins/claude-of-alexandria/ subdirectory. Optimize metadata with rich keywords for discovery. Preserve TDD infrastructure at root level.

**Tech Stack:** Claude Code marketplace system, JSON manifests, Git tagging for releases.

---

## Task 1: Create Marketplace Manifest

**Files:**
- Create: `.claude-plugin/marketplace.json`

**Step 1: Create .claude-plugin directory**

```bash
mkdir -p .claude-plugin
```

**Step 2: Create marketplace.json**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-of-alexandria",
  "owner": {
    "name": "@davebream",
    "email": "davebream@example.com"
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
      "author": {
        "name": "@davebream"
      },
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

**Step 3: Validate JSON syntax**

```bash
python3 -m json.tool .claude-plugin/marketplace.json > /dev/null
```

Expected: No output (valid JSON)

**Step 4: Commit marketplace manifest**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat: Add marketplace manifest with optimized keywords"
```

---

## Task 2: Create Plugin Directory Structure

**Files:**
- Create: `plugins/claude-of-alexandria/.claude-plugin/`

**Step 1: Create plugin directory structure**

```bash
mkdir -p plugins/claude-of-alexandria/.claude-plugin
```

**Step 2: Verify structure**

```bash
ls -la plugins/claude-of-alexandria/
```

Expected: Should show .claude-plugin directory

**Step 3: Commit directory structure**

```bash
git add plugins/
git commit -m "chore: Create plugin directory structure"
```

---

## Task 3: Move Plugin Manifest

**Files:**
- Move: `.claude-plugin/manifest.json` → `plugins/claude-of-alexandria/.claude-plugin/manifest.json`

**Step 1: Move manifest to plugin directory**

```bash
mv .claude-plugin/manifest.json plugins/claude-of-alexandria/.claude-plugin/manifest.json
```

**Step 2: Verify manifest moved**

```bash
cat plugins/claude-of-alexandria/.claude-plugin/manifest.json
```

Expected: Should show plugin manifest with skills array

**Step 3: Commit moved manifest**

```bash
git add -A
git commit -m "refactor: Move plugin manifest to plugin directory"
```

---

## Task 4: Move Skills Directory

**Files:**
- Move: `skills/` → `plugins/claude-of-alexandria/skills/`

**Step 1: Move skills directory**

```bash
mv skills plugins/claude-of-alexandria/
```

**Step 2: Verify skills moved**

```bash
ls -la plugins/claude-of-alexandria/skills/
```

Expected: Should show biblical-segmentation directory

**Step 3: Update manifest paths if needed**

Check if `manifest.json` has relative paths that need updating:

```bash
cat plugins/claude-of-alexandria/.claude-plugin/manifest.json
```

The paths in manifest.json should be relative to the plugin directory (e.g., "skills/biblical-segmentation"), which they already are.

**Step 4: Commit moved skills**

```bash
git add -A
git commit -m "refactor: Move skills to plugin directory"
```

---

## Task 5: Create Plugin README

**Files:**
- Create: `plugins/claude-of-alexandria/README.md`

**Step 1: Create plugin README**

Create `plugins/claude-of-alexandria/README.md`:

```markdown
# Claude of Alexandria Plugin

**Rigorous analytical skills for biblical study and teaching preparation.**

## Available Skills

### biblical-segmentation

Divides biblical books into coherent teaching units with integrity safeguards:

- **Refuses impossible divisions** - Won't pretend Philemon can be 12 sessions
- **Presents multiple frameworks** - Because interpretation isn't a dictatorship
- **Validates against ancient markers** - Masoretic פ/ס divisions, Levinsohn discourse features
- **Handles contested books** - Isaiah's unity debate gets frameworks, not false consensus

**Coverage:** All 66 canonical books

**Usage:**
```
Use biblical-segmentation to divide Romans into 12 sessions for a sermon series.
```

## Development

This plugin is built using Test-Driven Development. Every skill has documented failure cases and verification evidence in the `tests/` directory at the repository root.

See [CLAUDE.md](CLAUDE.md) for development guidelines and the Librarian's instructions.

## Hermeneutical Framework

All skills follow historical-grammatical method with theological guardrails:

- **Anti-moralism mandate** - No "try harder" applications without gospel
- **Christ-centeredness** - Traces redemptive-historical arc
- **Context primacy** - Respects discourse units, pericopes, books
- **Genre governance** - Right method for the text type
- **Covenantal awareness** - Attends to progressive revelation

## License

MIT License - See repository root for details
```

**Step 2: Commit plugin README**

```bash
git add plugins/claude-of-alexandria/README.md
git commit -m "docs: Add plugin-level README with skill documentation"
```

---

## Task 6: Copy CLAUDE.md to Plugin

**Files:**
- Copy: `CLAUDE.md` → `plugins/claude-of-alexandria/CLAUDE.md`

**Step 1: Copy CLAUDE.md to plugin directory**

```bash
cp CLAUDE.md plugins/claude-of-alexandria/CLAUDE.md
```

**Step 2: Verify copy**

```bash
ls -la plugins/claude-of-alexandria/ | grep CLAUDE.md
```

Expected: Should show CLAUDE.md in plugin directory

**Step 3: Commit copied CLAUDE.md**

```bash
git add plugins/claude-of-alexandria/CLAUDE.md
git commit -m "docs: Copy CLAUDE.md to plugin directory for contributor access"
```

---

## Task 7: Update Root README for Marketplace

**Files:**
- Modify: `README.md` (Installation section)

**Step 1: Read current README**

```bash
head -n 120 README.md
```

**Step 2: Update Installation section**

Find the Installation section (around line 81-119) and replace it with:

```markdown
## Installation

### From Claude Code Marketplace

```bash
claude-code marketplace install davebream/claude-of-alexandria
```

That's it. The scrolls are now on your shelf.

### Manual Installation (Advanced)

If you prefer manual installation or want to contribute:

```bash
# Clone the repository
git clone https://github.com/davebream/claude-of-alexandria.git
cd claude-of-alexandria

# Symlink the plugin
ln -s $(pwd)/plugins/claude-of-alexandria ~/.claude/plugins/claude-of-alexandria
```

### Verifying Your Library Card

Restart Claude Code, then:

```bash
# In a Claude Code session
/skills
```

You should see `biblical-segmentation` listed. If you do not, the shelving went poorly. Try again.

### Usage

In any Claude Code session:

```
Use biblical-segmentation to divide Romans into 12 sessions for a sermon series.
```

Consult the [plugin README](plugins/claude-of-alexandria/README.md) for detailed skill documentation.
```

**Step 3: Commit updated README**

```bash
git add README.md
git commit -m "docs: Update README with marketplace installation instructions"
```

---

## Task 8: Add Marketplace Badge to README

**Files:**
- Modify: `README.md` (badges section)

**Step 1: Update badges section**

Find the badges section (around line 10-13) and update to:

```markdown
<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/install-marketplace-brightgreen" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="#current-collection"><img src="https://img.shields.io/badge/skills-1%20(biblical--segmentation)-orange" alt="Skills"></a>
  <a href="#hermeneutical-framework"><img src="https://img.shields.io/badge/theology-peer--reviewed-purple" alt="Theology"></a>
</p>
```

Changed:
- First badge: "status-production-ready" → "install-marketplace" (highlights new installation method)
- Third badge: Updated skill count to use hyphen (biblical-segmentation)

**Step 2: Commit badge updates**

```bash
git add README.md
git commit -m "docs: Add marketplace badge to README"
```

---

## Task 9: Validate Local Structure

**Files:**
- Test: Repository structure

**Step 1: Verify marketplace.json exists**

```bash
test -f .claude-plugin/marketplace.json && echo "✓ marketplace.json exists" || echo "✗ marketplace.json missing"
```

Expected: ✓ marketplace.json exists

**Step 2: Verify plugin directory structure**

```bash
test -d plugins/claude-of-alexandria && echo "✓ Plugin directory exists" || echo "✗ Plugin directory missing"
test -f plugins/claude-of-alexandria/.claude-plugin/manifest.json && echo "✓ Plugin manifest exists" || echo "✗ Plugin manifest missing"
test -d plugins/claude-of-alexandria/skills && echo "✓ Skills directory exists" || echo "✗ Skills directory missing"
```

Expected: All ✓

**Step 3: Verify root-level files preserved**

```bash
test -d tests && echo "✓ tests/ preserved" || echo "✗ tests/ missing"
test -d docs && echo "✓ docs/ preserved" || echo "✗ docs/ missing"
test -f CLAUDE.md && echo "✓ CLAUDE.md preserved" || echo "✗ CLAUDE.md missing"
test -d assets && echo "✓ assets/ preserved" || echo "✗ assets/ missing"
```

Expected: All ✓

**Step 4: Validate JSON files**

```bash
python3 -m json.tool .claude-plugin/marketplace.json > /dev/null && echo "✓ marketplace.json valid" || echo "✗ marketplace.json invalid"
python3 -m json.tool plugins/claude-of-alexandria/.claude-plugin/manifest.json > /dev/null && echo "✓ manifest.json valid" || echo "✗ manifest.json invalid"
```

Expected: All ✓

---

## Task 10: Tag Release Version

**Files:**
- Git: Tag v0.1.0

**Step 1: Verify all changes committed**

```bash
git status
```

Expected: "nothing to commit, working tree clean"

**Step 2: Create annotated tag**

```bash
git tag -a v0.1.0 -m "Release v0.1.0: Marketplace conversion with optimized discoverability"
```

**Step 3: Verify tag created**

```bash
git tag -l
```

Expected: Should show v0.1.0

**Step 4: Push commits and tags**

```bash
git push origin main --tags
```

Expected: Should push all commits and v0.1.0 tag

---

## Task 11: Test Marketplace Installation

**Files:**
- Test: Marketplace installation flow

**Step 1: Remove any existing manual installation**

```bash
rm -rf ~/.claude/plugins/claude-of-alexandria
```

**Step 2: Install from marketplace**

```bash
claude-code marketplace install davebream/claude-of-alexandria
```

Expected: Should download and install successfully

**Step 3: Verify installation location**

```bash
ls -la ~/.claude/plugins/marketplaces/ | grep claude-of-alexandria
```

Expected: Should show claude-of-alexandria directory in marketplaces/

**Step 4: Verify skills registered**

Launch Claude Code session and run:
```
/skills
```

Expected: Should show "biblical-segmentation" in the list

---

## Task 12: Test Skill Functionality

**Files:**
- Test: Skill execution

**Step 1: Test basic skill invocation**

In Claude Code session, test:
```
Use biblical-segmentation to divide Philemon into 8 sessions.
```

Expected: Should REFUSE with explanation that Philemon is too short

**Step 2: Test valid division**

In Claude Code session, test:
```
Use biblical-segmentation to divide Romans into 8 sessions for a sermon series.
```

Expected: Should provide multiple framework options with Masoretic markers

**Step 3: Test contested book handling**

In Claude Code session, test:
```
Use biblical-segmentation to analyze Isaiah structure options.
```

Expected: Should present multiple scholarly frameworks (unity vs. multiple authors)

**Step 4: Verify TDD guardrails enforced**

Check that the skill:
- ✅ Refuses impossible divisions
- ✅ Presents multiple frameworks
- ✅ Validates against ancient markers
- ✅ Handles contested books appropriately

---

## Task 13: Test Auto-Update

**Files:**
- Test: Auto-update functionality

**Step 1: Make minor version bump**

Update `.claude-plugin/marketplace.json`:
```json
"version": "0.1.1"
```

And `plugins/claude-of-alexandria/.claude-plugin/manifest.json`:
```json
"version": "0.1.1"
```

**Step 2: Commit and push**

```bash
git add .claude-plugin/marketplace.json plugins/claude-of-alexandria/.claude-plugin/manifest.json
git commit -m "chore: Bump version to 0.1.1 for update test"
git push origin main
```

**Step 3: Run marketplace update**

```bash
claude-code marketplace update claude-of-alexandria
```

Expected: Should pull latest changes and show version 0.1.1

**Step 4: Revert version bump (cleanup)**

```bash
git revert HEAD
git push origin main
```

---

## Task 14: Test Discoverability

**Files:**
- Test: Marketplace search

**Step 1: Search for "biblical"**

```bash
claude-code marketplace search biblical
```

Expected: claude-of-alexandria should appear in results

**Step 2: Search for "theology"**

```bash
claude-code marketplace search theology
```

Expected: claude-of-alexandria should appear in results

**Step 3: Search for "sermon"**

```bash
claude-code marketplace search sermon
```

Expected: claude-of-alexandria should appear in results

**Step 4: Test category filter**

```bash
claude-code marketplace search --category education
```

Expected: claude-of-alexandria should appear in education category

---

## Success Criteria Checklist

After completing all tasks, verify:

- ✅ One-command installation works: `claude-code marketplace install davebream/claude-of-alexandria`
- ✅ Skills function identically to manual installation
- ✅ Shows up in marketplace search for "biblical", "theology", "sermon", "exegesis"
- ✅ Auto-updates work correctly
- ✅ TDD test infrastructure remains at root level and accessible
- ✅ Documentation flow makes sense (GitHub → Install, Claude Code → Use, Contributors → Develop)
- ✅ Repository structure clean and logical
- ✅ All JSON files valid
- ✅ Git history clean with semantic commits

---

## Rollback Plan

If anything goes wrong during testing:

```bash
# Revert to pre-marketplace state
git log --oneline  # Find commit before marketplace conversion
git reset --hard <commit-hash>
git push origin main --force

# Remove marketplace installation
rm -rf ~/.claude/plugins/marketplaces/claude-of-alexandria
```

---

## Notes

- The TDD methodology remains unchanged - all new skills must have scenarios.md, baseline.md, and verification.md
- The librarian's strictness about TDD is preserved in CLAUDE.md at both root and plugin levels
- The Library of Alexandria theme and scholarly rigor are maintained throughout
- Version 0.1.0 signals: early stage (0.x) + first marketplace release (.1.0) + production-ready skills (.x.0)
