# Technical Debt Roadmap Design

**Date:** 2026-01-19
**Purpose:** Personal roadmap to tackle 11 technical debt items systematically

---

## Problem

After a comprehensive code audit, we identified 11 technical debt items across the biblical-segmentation skill:
- 4 Critical (must fix)
- 4 High priority (should fix)
- 3 Nice-to-have (polish)

**Challenge:** Different working contexts require different approaches:
- Sometimes I have 30 minutes for quick wins
- Sometimes I want to focus on highest-impact items
- Sometimes I want to batch similar work (all docs, all code)
- Sometimes I need to follow dependency order

**Goal:** Create a single roadmap document that supports all four working modes.

---

## Solution: Multi-View Roadmap

### Core Structure

One markdown document (`docs/technical-debt-roadmap.md`) with:

1. **Executive Summary** - Progress dashboard (4/11 complete, last updated, etc.)
2. **Four Views** - Same 11 items, organized differently
3. **Master List** - Full detail for each item (canonical source)

### The Four Views

**View 1: Quick Wins**
- Sort by effort (Quick/Medium/Substantial)
- Time-boxed batches: "Got 30 min? Do these 3 items"
- Maximize momentum with easy completions

**View 2: Impact Priority**
- Original audit grouping (Critical/High/Nice)
- Best for "I have 2 hours, what matters most?"
- Focus on high-impact work

**View 3: Thematic Batches**
- Group by domain (Docs/Code/Repo/Data)
- Stay in same mental context
- Great for focused sessions (e.g., "documentation day")

**View 4: Dependency Graph**
- Shows prerequisites and blockers
- Prevents wasted effort (don't do #9 before #8)
- Systematic completion path

### Per-Item Detail Template

Each of the 11 items includes:

```markdown
### [#N] Item Title (Priority Badge)

**Effort:** Quick/Medium/Substantial
**Domain:** Documentation / Code / Repo / Data
**Priority:** Critical / High / Nice
**Blocks:** [items this unblocks]
**Blocked by:** [prerequisites]

**Context:** Why this exists (audit finding)
**Impact if left unfixed:** What breaks or degrades
**Approach:** 2-3 options with trade-offs (recommended marked)
**Acceptance Criteria:** Checkboxes for completion
**Files Affected:** Specific paths
**Estimated Time:** Range
**Notes:** Gotchas, related issues
```

---

## Design Decisions

### Multi-View Approach

**Why:** No single sort order fits all working contexts. Quick wins build momentum when tired; dependency order ensures correctness when systematic.

**Trade-off:** Some duplication (each item appears in 4 views), but views are lightweight tables with links to master list.

### Inline Progress Tracking

**Why:** Markdown checkboxes are simple, git-friendly, no tooling overhead.

**How:**
- Acceptance criteria have `- [ ]` checkboxes
- Completed items get ✅ prefix in all views
- Manual updates to completion tracker

**Rejected alternative:** Scripts to auto-calculate progress. Too much overhead for 11 items.

### Single Document vs. Multiple Files

**Decision:** Single document with internal navigation.

**Why:**
- Easier to search (Cmd+F finds everything)
- All context in one place
- Simpler to maintain
- Links between views are trivial

**Trade-off:** 400+ line file, but structured with clear sections and navigation.

### Item Numbering: Permanent IDs

**Decision:** Items numbered #1-#11 permanently, even after completion.

**Why:**
- Git commits can reference "#3 from roadmap"
- Dependency graph remains stable
- Completion history preserved

**Alternative considered:** Remove completed items. Rejected because it breaks git commit references.

---

## Integration

### With CLAUDE.md

Added one-liner: "See `docs/technical-debt-roadmap.md` for current maintenance items"

**Relationship:**
- CLAUDE.md = strategic (ongoing development principles)
- Roadmap = tactical (specific fixes for this codebase state)

### With Git Workflow

**Commit messages reference roadmap:**
```bash
git commit -m "fix: add __pycache__/ to .gitignore (#3 from roadmap)"
git commit -m "docs: update roadmap - #3 complete"
```

### Lifecycle

**When all 11 items complete:**
1. Archive to `docs/archive/2026-01-technical-debt.md`
2. Start fresh roadmap only when new audit generates items

**Adding new items:**
- Append to Master List (#12, #13, etc.)
- Add to appropriate views
- Update Executive Summary count

---

## The 11 Items (Summary)

**Critical (🔴):**
1. Create/remove DATA_SOURCES.md reference (20 min)
2. Fix error handling in sefaria_paragraphs.py (45 min)
3. Add `__pycache__/` to .gitignore (5 min)
4. Update template or remove it (45 min)

**High (🟡):**
5. Fix "XML" → "JSON" docs (3 locations) (15 min)
6. Delete/integrate unused purpose-context.yaml (90 min)
7. Add levinsohn/ directory README (45 min)
8. Eliminate code duplication in scripts (120 min)

**Nice (🟢):**
9. Extract BOOK_VARIATIONS to module constant (90 min, or 10 min after #8)
10. Add inline comments to YAML files (90 min)
11. Document templates/ directory purpose (30 min)

**Total effort:** ~10 hours across all items

---

## Dependency Insights

**Foundational (do first):**
- #3 (gitignore) - 5 min, no dependencies
- #5 (XML→JSON) - 15 min, no dependencies
- #1 (DATA_SOURCES) - 20 min, no dependencies

**Unlocks other work:**
- #2 (error handling) → enables #8 (duplication fix includes error handling)
- #8 (duplication fix) → trivializes #9 (BOOK_VARIATIONS extraction)
- #4 (template decision) → clarifies #6 (purpose-context.yaml may be referenced by template)

**Can parallelize:**
- #7 (levinsohn README) and #11 (templates README) - both documentation, no conflicts

---

## Validation

**Success criteria:**

1. ✅ All 11 items have complete detail (Context, Approach, Acceptance Criteria)
2. ✅ Four views provide different useful sort orders
3. ✅ Navigation links work (tested markdown preview)
4. ✅ Effort estimates are realistic (5 min to 120 min range)
5. ✅ Dependencies documented (#2 → #8 → #9 chain)
6. ✅ Integration with CLAUDE.md added
7. ✅ Completion workflow documented

**User feedback:** Roadmap supports flexible working modes based on context (time, energy, focus area).

---

## Next Steps

**If implementing roadmap:**
1. Use View 1 (Quick Wins) to start with #3 (5 min victory)
2. Follow with #5 (15 min) and #1 (20 min) for quick momentum
3. Tackle critical items (#2, #4) when focused
4. Save substantial items (#6, #8, #10) for dedicated sessions

**Future enhancements (deferred):**
- CI validation that referenced files exist
- Automated progress % calculation
- GitHub issue integration

**Rationale for deferral:** 11 items is small enough for manual tracking. Tooling overhead not justified.

---

**Status:** Design complete, roadmap document created
**Next:** Begin implementation (or archive design and defer)
