# Repository Structure Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix structural debris from marketplace conversion — duplicate data, stale paths in docs, wrong structure diagrams.

**Architecture:** Editorial cleanup only. No skill content changes. No TDD required (per CLAUDE.md: "Typo fixes, grammar corrections, clarifying existing instructions, formatting improvements, broken link repairs, README and metadata updates").

**Tech Stack:** Git, markdown editing.

---

## Task 1: Remove duplicate reference/vocabulary/ from git

**Files:**
- Remove: `reference/vocabulary/nt/*.json` (27 files)
- Remove: `reference/vocabulary/ot/*.json` (39 files)
- Remove: `reference/` directory entirely

**Why:** Identical data exists at `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/`. Root copy is stale from pre-marketplace structure.

**Step 1: Verify data is identical**

```bash
diff <(ls reference/vocabulary/nt/) <(ls plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt/)
diff <(ls reference/vocabulary/ot/) <(ls plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot/)
```

Expected: No output (identical file lists).

**Step 2: Remove from git tracking and disk**

```bash
git rm -r reference/
```

Expected: `rm 'reference/vocabulary/nt/1_corinthians.json'` ... (66 files removed)

**Step 3: Verify removal**

```bash
git ls-files reference/
ls reference/ 2>/dev/null || echo "directory removed"
```

Expected: No output from first command. "directory removed" from second.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove duplicate reference/vocabulary/ from root

Identical data exists at plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/.
Root copy was leftover from pre-marketplace structure."
```

---

## Task 2: Update CLAUDE.md structure diagram and path references (root)

**Files:**
- Modify: `CLAUDE.md` (lines 124, 144-160, 206)

**Step 1: Update "What Gets Committed" section (line 124)**

Find:
```markdown
- All files in `skills/` directory
```

Replace with:
```markdown
- All files in `plugins/claude-of-alexandria/skills/` directory
```

**Step 2: Update "Repository Structure" diagram (lines 144-160)**

Find:
```
claude-of-alexandria/
├── .claude-plugin/               # Plugin configuration
│   └── manifest.json            # Plugin metadata
├── skills/                       # The skill collection
│   └── skill-name/
│       ├── SKILL.md             # Main skill file (YAML frontmatter + content)
│       └── README.md            # Development notes and context
├── tests/                        # All test evidence
│   └── skills/
│       └── skill-name/
│           ├── scenarios.md     # Pressure test cases
│           ├── baseline.md      # RED phase evidence
│           └── verification.md  # GREEN phase proof
├── CLAUDE.md                     # You are here
└── README.md                     # Public documentation
```

Replace with:
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
├── docs/                         # Plans, reviews, roadmaps
├── CLAUDE.md                     # You are here
└── README.md                     # Public documentation
```

**Step 3: Update "Before You Submit" checklist (line 206)**

Find:
```markdown
- [ ] `skills/skill-name/SKILL.md` exists with YAML frontmatter
- [ ] `skills/skill-name/README.md` exists with development notes
```

Replace with:
```markdown
- [ ] `plugins/claude-of-alexandria/skills/skill-name/SKILL.md` exists with YAML frontmatter
- [ ] `plugins/claude-of-alexandria/skills/skill-name/README.md` exists with development notes
```

**Step 4: Verify no remaining stale `skills/` references**

Search CLAUDE.md for bare `skills/` references that should now say `plugins/claude-of-alexandria/skills/`:

```bash
grep -n 'skills/' CLAUDE.md
```

Expected: Only `tests/skills/` references remain (those are correct — tests stay at root).

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md structure diagram and paths for marketplace layout"
```

---

## Task 3: Update CLAUDE.md (plugin copy)

**Files:**
- Modify: `plugins/claude-of-alexandria/CLAUDE.md` (same 3 sections as Task 2)

**Step 1: Apply identical changes to plugin copy**

Apply the same three edits from Task 2 to `plugins/claude-of-alexandria/CLAUDE.md`:
1. Line with `All files in \`skills/\` directory` → `plugins/claude-of-alexandria/skills/`
2. Repository Structure diagram → same replacement as Task 2
3. `skills/skill-name/SKILL.md` → `plugins/claude-of-alexandria/skills/skill-name/SKILL.md`

**Step 2: Verify both copies match**

```bash
diff CLAUDE.md plugins/claude-of-alexandria/CLAUDE.md
```

Expected: No output (identical files).

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/CLAUDE.md
git commit -m "docs: sync plugin CLAUDE.md with root copy"
```

---

## Task 4: Update technical debt roadmap with path note

**Files:**
- Modify: `docs/technical-debt-roadmap.md` (add note after line 6)

**Step 1: Add path mapping note**

After the "Last Updated" line (line 6), add:

```markdown

> **Note (2026-02-18):** This roadmap was written before the marketplace conversion. All paths referencing `skills/biblical-segmentation/...` now live at `plugins/claude-of-alexandria/skills/biblical-segmentation/...`. The item descriptions remain accurate; only the path prefix changed.
```

**Step 2: Update the "Last Updated" date (line 6)**

Find:
```markdown
**Last Updated:** 2026-01-19
```

Replace with:
```markdown
**Last Updated:** 2026-02-18
```

**Step 3: Commit**

```bash
git add docs/technical-debt-roadmap.md
git commit -m "docs: add path mapping note to technical debt roadmap

Paths changed from skills/biblical-segmentation/ to
plugins/claude-of-alexandria/skills/biblical-segmentation/
after marketplace conversion."
```

---

## Task 5: Fix README skill count and add new skill entries

**Files:**
- Modify: `README.md` (lines 28, 66-79, 172)

**Step 1: Update line 28 (intro paragraph)**

Find:
```markdown
Our collection is smaller — one skill, at present — but each scroll has been rigorously tested
```

Replace with:
```markdown
Our collection is smaller — three skills, at present — but each scroll has been rigorously tested
```

**Step 2: Update "Current Collection" section (lines 66-79)**

Find:
```markdown
## Current Collection

The library presently contains **one skill**. Rome was not catalogued in a day.

### [biblical-segmentation](plugins/claude-of-alexandria/skills/biblical-segmentation/)

Divides biblical books into coherent teaching units — sermon series, small groups, devotional reading — with integrity safeguards that would make a Masoretic scribe nod approvingly:

- **Refuses impossible divisions.** You cannot divide Philemon into 12 sessions. We will not pretend otherwise.
- **Presents multiple scholarly-grounded options.** Because interpretation is not a dictatorship.
- **Validates against ancient manuscript markers.** Masoretic פ/ס divisions, Levinsohn discourse features. The scribes marked these boundaries for a reason.
- **Handles contested books with multiple frameworks.** Isaiah's unity debate gets frameworks, not a false consensus.

Coverage: all 66 canonical books. We are nothing if not thorough.
```

Replace with:
```markdown
## Current Collection

The library presently contains **three skills**. Rome was not catalogued in a day, but we are making progress.

### [biblical-segmentation](plugins/claude-of-alexandria/skills/biblical-segmentation/) — Production

Divides biblical books into coherent teaching units — sermon series, small groups, devotional reading — with integrity safeguards that would make a Masoretic scribe nod approvingly:

- **Refuses impossible divisions.** You cannot divide Philemon into 12 sessions. We will not pretend otherwise.
- **Presents multiple scholarly-grounded options.** Because interpretation is not a dictatorship.
- **Validates against ancient manuscript markers.** Masoretic פ/ס divisions, Levinsohn discourse features. The scribes marked these boundaries for a reason.
- **Handles contested books with multiple frameworks.** Isaiah's unity debate gets frameworks, not a false consensus.

Coverage: all 66 canonical books. 33 test scenarios. Full RED/GREEN verification.

### [pericope-delimitation](plugins/claude-of-alexandria/skills/pericope-delimitation/) — In Development

Assesses whether a proposed passage constitutes a coherent discourse unit for preaching or teaching:

- **Data-grounded boundary checks.** Levinsohn discourse features (NT) and Masoretic paragraph markers (OT), not intuition.
- **Structured verdicts.** VALID, EXTEND, CONTRACT, or ADJUST — with specific evidence for each.
- **Minimum viable pericope.** If the passage is too short, suggests the smallest coherent unit.

Status: SKILL.md complete. RED phase baselines documented. GREEN verification pending.

### [exegetical-notes](plugins/claude-of-alexandria/skills/exegetical-notes/) — In Development

Produces structured, data-grounded exegetical analysis of a biblical passage for sermon or teaching preparation:

- **10-section schema.** Literary context through verification — no ad-hoc structure.
- **Parser-verified lexical data.** Morphological parsing and vocabulary counts from data, not training memory.
- **4-tier interpretive guardrails.** Linguistic, discourse, scholarly, and agent assessment — each labeled.

Status: SKILL.md complete. RED phase baselines documented. GREEN verification pending.
```

**Step 3: Update footer (line 172)**

Find:
```markdown
  <sub>Production-ready. Currently contains 1 skill supporting all 66 biblical books.<br>More scrolls forthcoming. The cataloguing continues.</sub>
```

Replace with:
```markdown
  <sub>Contains 3 skills (1 production, 2 in development) supporting all 66 biblical books.<br>The cataloguing continues.</sub>
```

**Step 4: Verify no remaining "one skill" or "1 skill" references**

```bash
grep -in "one skill\|1 skill" README.md
```

Expected: No output.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README to reflect 3 skills with development status

- biblical-segmentation: production (33 test scenarios, full verification)
- pericope-delimitation: in development (SKILL.md + RED baselines)
- exegetical-notes: in development (SKILL.md + RED baselines)"
```

---

## Success Criteria

After all tasks complete:

- [ ] `reference/` directory no longer exists at root
- [ ] `git ls-files reference/` returns nothing
- [ ] Both CLAUDE.md copies show correct marketplace structure diagram
- [ ] Both CLAUDE.md copies reference `plugins/claude-of-alexandria/skills/` not bare `skills/`
- [ ] Tech debt roadmap has path mapping note
- [ ] README mentions all 3 skills with accurate development status
- [ ] No stale "one skill" or "1 skill" references in README
- [ ] All commits follow conventional commit format
- [ ] `git status` is clean
