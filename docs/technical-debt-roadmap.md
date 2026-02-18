# Technical Debt Roadmap

**Repository:** claude-of-alexandria (biblical-segmentation skill)
**Total Items:** 11 (4 Critical, 4 High, 3 Nice-to-Have)
**Completion:** `[----------] 0/11 complete`
**Last Updated:** 2026-02-18

> **Note (2026-02-18):** This roadmap was written before the marketplace conversion. All paths referencing `skills/biblical-segmentation/...` now live at `plugins/claude-of-alexandria/skills/biblical-segmentation/...`. The item descriptions remain accurate; only the path prefix changed.

---

## Quick Navigation

**Jump to:**
- [View 1: Quick Wins](#view-1-quick-wins-)
- [View 2: Impact Priority](#view-2-impact-priority-)
- [View 3: Thematic Batches](#view-3-thematic-batches-)
- [View 4: Dependency Graph](#view-4-dependency-graph-)
- [Master List](#master-list)

---

## View 1: Quick Wins 🟢

Sort by effort to maximize momentum. Pick based on available time.

### Ready Now (<30 min)

| # | Item | Domain | Priority | Time |
|---|------|--------|----------|------|
| [#3](#item-3) | Add `__pycache__/` to .gitignore | Repo | 🔴 Critical | 5 min |
| [#5](#item-5) | Fix "XML" → "JSON" docs (3 locations) | Docs | 🟡 High | 15 min |
| [#1](#item-1) | Create/remove DATA_SOURCES.md reference | Data | 🔴 Critical | 20 min |

**Time-boxed batch:** Got 30 minutes? Complete all three ↑

### Medium Effort (30-60 min)

| # | Item | Domain | Priority | Time |
|---|------|--------|----------|------|
| [#11](#item-11) | Document templates/ directory purpose | Docs | 🟢 Nice | 30 min |
| [#7](#item-7) | Add levinsohn/ directory README | Docs | 🟡 High | 45 min |
| [#4](#item-4) | Update template or remove it | Code | 🔴 Critical | 45 min |
| [#2](#item-2) | Fix error handling in sefaria_paragraphs.py | Code | 🔴 Critical | 45 min |

### Substantial (>60 min)

| # | Item | Domain | Priority | Time |
|---|------|--------|----------|------|
| [#10](#item-10) | Add inline comments to YAML files | Docs | 🟢 Nice | 90 min |
| [#6](#item-6) | Delete/integrate unused purpose-context.yaml | Code | 🟡 High | 90 min |
| [#9](#item-9) | Extract BOOK_VARIATIONS to module constant | Code | 🟢 Nice | 90 min |
| [#8](#item-8) | Eliminate code duplication in scripts | Code | 🟡 High | 120 min |

---

## View 2: Impact Priority 🎯

Original audit prioritization. Best for "I have 2 hours, what matters most?"

### 🔴 Critical (Must Fix)

| # | Item | Effort | Domain |
|---|------|--------|--------|
| [#1](#item-1) | Create/remove DATA_SOURCES.md reference | 🟢 Quick | Data |
| [#2](#item-2) | Fix error handling in sefaria_paragraphs.py | 🟡 Medium | Code |
| [#3](#item-3) | Add `__pycache__/` to .gitignore | 🟢 Quick | Repo |
| [#4](#item-4) | Update template or remove it | 🟡 Medium | Code |

**All 4 critical items:** ~2 hours total

### 🟡 High (Should Fix)

| # | Item | Effort | Domain |
|---|------|--------|--------|
| [#5](#item-5) | Fix "XML" → "JSON" docs (3 locations) | 🟢 Quick | Docs |
| [#6](#item-6) | Delete/integrate unused purpose-context.yaml | 🔴 Substantial | Code |
| [#7](#item-7) | Add levinsohn/ directory README | 🟡 Medium | Docs |
| [#8](#item-8) | Eliminate code duplication in scripts | 🔴 Substantial | Code |

**All 4 high items:** ~5.5 hours total

### 🟢 Nice to Have

| # | Item | Effort | Domain |
|---|------|--------|--------|
| [#9](#item-9) | Extract BOOK_VARIATIONS to module constant | 🔴 Substantial | Code |
| [#10](#item-10) | Add inline comments to YAML files | 🔴 Substantial | Docs |
| [#11](#item-11) | Document templates/ directory purpose | 🟡 Medium | Docs |

**All 3 nice-to-have items:** ~3.5 hours total

---

## View 3: Thematic Batches 🎨

Group related work to stay in the same mental context.

### Documentation Fixes

| # | Item | Priority | Time |
|---|------|----------|------|
| [#5](#item-5) | Fix "XML" → "JSON" docs (3 locations) | 🟡 High | 15 min |
| [#7](#item-7) | Add levinsohn/ directory README | 🟡 High | 45 min |
| [#10](#item-10) | Add inline comments to YAML files | 🟢 Nice | 90 min |
| [#11](#item-11) | Document templates/ directory purpose | 🟢 Nice | 30 min |

**Docs batch total:** ~3 hours. Great for writing-focused sessions.

### Code Quality

| # | Item | Priority | Time |
|---|------|----------|------|
| [#2](#item-2) | Fix error handling in sefaria_paragraphs.py | 🔴 Critical | 45 min |
| [#4](#item-4) | Update template or remove it | 🔴 Critical | 45 min |
| [#6](#item-6) | Delete/integrate unused purpose-context.yaml | 🟡 High | 90 min |
| [#8](#item-8) | Eliminate code duplication in scripts | 🟡 High | 120 min |
| [#9](#item-9) | Extract BOOK_VARIATIONS to module constant | 🟢 Nice | 90 min |

**Code quality batch total:** ~6.5 hours. Requires focus on Python files.

### Repository Hygiene

| # | Item | Priority | Time |
|---|------|----------|------|
| [#3](#item-3) | Add `__pycache__/` to .gitignore | 🔴 Critical | 5 min |

**Repo hygiene batch total:** 5 minutes. Trivial standalone fix.

### Data Integrity

| # | Item | Priority | Time |
|---|------|----------|------|
| [#1](#item-1) | Create/remove DATA_SOURCES.md reference | 🔴 Critical | 20 min |

**Data integrity batch total:** 20 minutes. Quick decision + execution.

---

## View 4: Dependency Graph 📊

Shows what unlocks what. Follow dependency order for systematic progress.

```
Foundational (no dependencies):
  #3 → Add __pycache__/ to .gitignore
  #5 → Fix "XML" → "JSON" docs
  #1 → Create/remove DATA_SOURCES.md reference

Tier 2 (can run in parallel after foundational):
  #2 → Fix error handling (needed before #8)
  #7 → Add levinsohn/ directory README
  #11 → Document templates/ directory purpose
  #4 → Update template or remove it

Tier 3 (depends on code fixes):
  #8 → Eliminate code duplication (do after #2)
  #9 → Extract BOOK_VARIATIONS (do after #8)

Tier 4 (final polish):
  #6 → Delete/integrate purpose-context.yaml (do after #4)
  #10 → Add inline comments to YAML files (anytime)
```

**Recommended sequence for dependency-order workflow:**
1. #3 (5 min) → #5 (15 min) → #1 (20 min)
2. #2 (45 min) → #7 (45 min) → #11 (30 min)
3. #4 (45 min) → #8 (120 min) → #9 (90 min)
4. #6 (90 min) → #10 (90 min)

**Total sequential time:** ~10 hours across 4 work sessions

---

## Master List

[Back to top](#quick-navigation)

---

### [#1] Create or Remove DATA_SOURCES.md Reference 🔴

**Effort:** 🟢 Quick (20 min)
**Domain:** Data Integrity
**Priority:** Critical
**Blocks:** None
**Blocked by:** None

**Context:**
SKILL.md references `reference/masoretic/DATA_SOURCES.md` at line 221, but this file doesn't exist. The reference appears in the section explaining how to validate Masoretic paragraph markers.

```markdown
See `reference/masoretic/DATA_SOURCES.md` for provenance details
```

**Impact if left unfixed:**
- Broken documentation link confuses users
- No provenance information for Masoretic data source
- Violates "single source of truth" principle

**Approach:**

**Option A (Recommended):** Create the missing file
1. Create `skills/biblical-segmentation/reference/masoretic/DATA_SOURCES.md`
2. Document Sefaria-Export provenance (Leningrad Codex, WLC)
3. Include data extraction methodology
4. Add last-updated timestamp

**Option B:** Remove the reference
1. Delete the reference from SKILL.md:221
2. Move provenance information inline to SKILL.md or README.md
3. Update documentation to point to new location

**Recommendation:** Option A. Separate data provenance file is cleaner and follows existing pattern (`reference/levinsohn/` also needs similar docs per #7).

**Acceptance Criteria:**
- [ ] Either `reference/masoretic/DATA_SOURCES.md` exists with provenance OR
- [ ] Reference removed from SKILL.md:221
- [ ] README.md "Data Sources" section updated if needed
- [ ] Grep confirms no other broken references to DATA_SOURCES.md

**Files Affected:**
- `skills/biblical-segmentation/SKILL.md` (line 221)
- `skills/biblical-segmentation/reference/masoretic/DATA_SOURCES.md` (create new)
- Possibly: `README.md`

**Estimated Time:** 20 minutes

**Notes:**
If creating the file, model it after README.md lines 131-143 (existing data source documentation). Include:
- Source name and URL
- Text basis (Leningrad Codex)
- What data we extracted (פ/ס paragraph markers)
- File format (JSON)
- Validation methodology

[Back to top](#quick-navigation)

---

### [#2] Fix Error Handling in sefaria_paragraphs.py 🔴

**Effort:** 🟡 Medium (45 min)
**Domain:** Code Quality
**Priority:** Critical
**Blocks:** #8 (code duplication fix should include improved error handling)
**Blocked by:** None

**Context:**
`sefaria_paragraphs.py` currently handles some errors (file not found, JSON parse errors) but may crash on malformed data. Line 74 does `chapter, verse = verse_ref.split(':')` which will crash if verse_ref doesn't contain exactly one colon.

**Impact if left unfixed:**
- Script crashes on malformed JSON data
- Ungraceful failures confuse users
- No recovery mechanism for partial data corruption

**Approach:**

**Option A (Recommended):** Add defensive parsing with validation
1. Wrap `split(':')` operations in try-except (lines 74, 84)
2. Validate that chapter/verse are numeric before `int()` conversion
3. Log warnings for skipped malformed entries
4. Continue processing valid entries even if some are malformed
5. Add summary at end: "Processed X entries, skipped Y malformed"

**Option B:** Fail fast with clear error messages
1. Add validation after JSON load
2. Check all entries before processing
3. Exit with clear error if any entry is malformed
4. Include example of correct format in error message

**Recommendation:** Option A. Graceful degradation is better than all-or-nothing failure for data files.

**Acceptance Criteria:**
- [ ] Script doesn't crash on malformed verse references
- [ ] Malformed entries logged to stderr with warning
- [ ] Valid entries still processed successfully
- [ ] Test with intentionally malformed JSON (add test case to validation)
- [ ] Run script on all 39 existing JSON files without crashes

**Files Affected:**
- `skills/biblical-segmentation/scripts/sefaria_paragraphs.py` (lines 56-95)

**Estimated Time:** 45 minutes (including testing with malformed data)

**Notes:**
Consider adding a `--validate` flag that runs stricter checks and reports all issues without processing. This would help catch data corruption early.

**Example malformed data test:**
```json
{
  "petuchot": ["1:1", "2:5", "invalid", "3:10"],
  "setumot": ["1:3", "2:8"]
}
```

Expected behavior: Skip "invalid", process 5 valid entries, log warning.

[Back to top](#quick-navigation)

---

### [#3] Add `__pycache__/` to .gitignore 🔴

**Effort:** 🟢 Quick (5 min)
**Domain:** Repository Hygiene
**Priority:** Critical
**Blocks:** None
**Blocked by:** None

**Context:**
`.gitignore` already includes `__pycache__/` on line 19, but `__pycache__/` directory exists in `skills/biblical-segmentation/scripts/`. This means either:
1. The directory was committed before .gitignore rule was added
2. Git is tracking it because it was added explicitly

**Impact if left unfixed:**
- Python bytecode files (.pyc) get committed
- Clutters repository with generated files
- Different Python versions create different bytecode (merge conflicts)

**Approach:**

**Option A (Recommended):** Remove from git tracking
```bash
git rm -r --cached skills/biblical-segmentation/scripts/__pycache__/
git commit -m "fix: remove Python bytecode cache from git tracking"
```

**Option B:** Verify .gitignore is working, then clean
```bash
# Check if __pycache__/ is tracked
git ls-files | grep __pycache__

# If tracked, remove it
git rm -r --cached skills/biblical-segmentation/scripts/__pycache__/

# Verify .gitignore covers it
git status  # Should not show __pycache__/ anymore
```

**Recommendation:** Option B (verify first). The .gitignore rule is already present, so this is just cleanup.

**Acceptance Criteria:**
- [ ] `git ls-files | grep __pycache__` returns no results
- [ ] `git status` doesn't show `__pycache__/` directories
- [ ] `.gitignore` includes `__pycache__/` (already present on line 19)
- [ ] Can run Python scripts without `__pycache__/` appearing in `git status`

**Files Affected:**
- `skills/biblical-segmentation/scripts/__pycache__/` (remove from tracking)
- `.gitignore` (already correct, no changes needed)

**Estimated Time:** 5 minutes

**Notes:**
This is the easiest quick win. Do this first to build momentum.

[Back to top](#quick-navigation)

---

### [#4] Update Template or Remove It 🔴

**Effort:** 🟡 Medium (45 min)
**Domain:** Code Quality
**Priority:** Critical
**Blocks:** #6 (template uses purpose-context data)
**Blocked by:** None

**Context:**
`templates/segmentation-output.md` is a Handlebars-style template with placeholders like `{book}`, `{#each option}`, etc. However:
1. No rendering code exists in the repository
2. No usage documentation
3. Unclear if this is aspirational or deprecated

**Impact if left unfixed:**
- Confusion about how segmentation output is generated
- Template may be outdated vs. actual skill output format
- Dead code clutters repository

**Approach:**

**Option A:** Remove the template
1. Delete `templates/segmentation-output.md`
2. Document actual output format in SKILL.md or README
3. Commit with message explaining template was aspirational/deprecated

**Option B (Recommended):** Document template as reference
1. Add `templates/README.md` explaining:
   - This is a **reference template**, not executable code
   - Shows the expected structure for skill output
   - Agents should generate output matching this structure
2. Update template to match current SKILL.md output requirements
3. Add "Last validated" date

**Option C:** Implement template rendering
1. Add Python script to render template
2. Integrate with skill execution
3. Add tests for template rendering
4. Update SKILL.md to use template

**Recommendation:** Option B. Template serves as useful documentation of expected output structure, but implementing rendering (#C) is overkill.

**Acceptance Criteria:**
- [ ] Template either removed OR documented with README
- [ ] If kept: Template matches current SKILL.md output spec
- [ ] If kept: `templates/README.md` explains purpose and usage
- [ ] If removed: No references to template in other docs
- [ ] Decision documented in git commit message

**Files Affected:**
- `skills/biblical-segmentation/templates/segmentation-output.md`
- `skills/biblical-segmentation/templates/README.md` (create new if Option B)

**Estimated Time:** 45 minutes (including validation against SKILL.md spec)

**Notes:**
Check if template includes fields from `purpose-context.yaml` (#6). If so, update template when resolving #6.

Template uses these variables from purpose-context.yaml:
- `{purpose}` (line 5, 60-68)
- `{purpose_specific_notes}` (line 62)

[Back to top](#quick-navigation)

---

### [#5] Fix "XML" → "JSON" Documentation (3 Locations) 🟡

**Effort:** 🟢 Quick (15 min)
**Domain:** Documentation
**Priority:** High
**Blocks:** None
**Blocked by:** None

**Context:**
Three files incorrectly refer to Levinsohn data as "XML" when it's actually stored as JSON:

1. **SKILL.md:604** - "34 XML files with NT discourse features"
2. **README.md:118** - "34 NT books with discourse features (XML)"
3. **levinsohn_parser.py:193** - "Download XML files from https://..."

The Levinsohn data in `reference/levinsohn/` is JSON format (.json files).

**Impact if left unfixed:**
- Users confused about file format
- Instructions reference wrong format
- Misleading download instructions

**Approach:**

**Option A (Recommended):** Simple find-replace
1. SKILL.md:604 → "34 JSON files with NT discourse features"
2. README.md:118 → "34 NT books with discourse features (JSON)"
3. levinsohn_parser.py:193 → "Download JSON files from https://..." (keep URL as-is, source repo may have both formats)

**Acceptance Criteria:**
- [ ] `grep -n "XML\|xml" SKILL.md` shows no Levinsohn references
- [ ] `grep -n "XML\|xml" README.md` shows no Levinsohn references
- [ ] `grep -n "XML\|xml" scripts/levinsohn_parser.py` shows no misleading references
- [ ] All three locations now say "JSON"
- [ ] Verify `reference/levinsohn/*.json` files are indeed JSON format

**Files Affected:**
- `skills/biblical-segmentation/SKILL.md` (line 604)
- `README.md` (line 118)
- `skills/biblical-segmentation/scripts/levinsohn_parser.py` (line 193)

**Estimated Time:** 15 minutes

**Notes:**
This is a documentation accuracy fix, not a functional change. Easy quick win.

**Verification command:**
```bash
ls -la skills/biblical-segmentation/reference/levinsohn/*.json | wc -l
# Should return 34
```

[Back to top](#quick-navigation)

---

### [#6] Delete/Integrate Unused purpose-context.yaml 🟡

**Effort:** 🔴 Substantial (90 min)
**Domain:** Code Quality
**Priority:** High
**Blocks:** None
**Blocked by:** #4 (template may reference this file)

**Context:**
`reference/purpose-context.yaml` (2KB, 65 lines) contains metadata for sermon/small-group/devotional/academic contexts, but:
1. No Python code loads or uses this file
2. SKILL.md doesn't reference it
3. Appears to be aspirational design documentation

**Impact if left unfixed:**
- Dead code confuses contributors
- Unclear whether feature is implemented or planned
- 2KB of unused data

**Approach:**

**Option A (Recommended):** Delete as unused
1. Verify no code references `purpose-context.yaml`
2. Check if SKILL.md has equivalent logic inline
3. Archive useful concepts to design notes
4. Delete file
5. Update README.md structure diagram (line 116)

**Option B:** Document as design reference
1. Add `# DESIGN REFERENCE ONLY - NOT IMPLEMENTED` header
2. Move to `docs/design/purpose-context-spec.yaml`
3. Add note explaining it's aspirational

**Option C:** Implement the feature
1. Add Python loader in scripts/
2. Update SKILL.md to use purpose-context metadata
3. Add validation for purpose-based recommendations
4. Test with different purpose contexts

**Recommendation:** Option A unless you plan to implement purpose-based recommendations soon. The SKILL.md already handles purpose distinctions inline (sermon vs. study vs. devotional), so this file is redundant.

**Acceptance Criteria:**
- [ ] File either deleted OR moved to `docs/design/` with disclaimer
- [ ] `grep -r "purpose-context" .` shows no references (except git history)
- [ ] README.md structure diagram updated if file deleted
- [ ] Git commit explains decision (dead code removal OR deferral to future work)

**Files Affected:**
- `skills/biblical-segmentation/reference/purpose-context.yaml` (delete or move)
- `README.md` (line 116 - remove from structure diagram)

**Estimated Time:** 90 minutes (includes verification, decision documentation, checking template #4)

**Notes:**
Check template (#4) before deleting. Template uses `{purpose}` variable which may have been intended to come from this file. If template references it, update template first.

Useful content to preserve in docs if deleting:
- Verse count ranges per context (sermon: 15-40, small group: 12-30, devotional: 8-20)
- Flag messages for too-short/too-long sessions

[Back to top](#quick-navigation)

---

### [#7] Add levinsohn/ Directory README 🟡

**Effort:** 🟡 Medium (45 min)
**Domain:** Documentation
**Priority:** High
**Blocks:** None
**Blocked by:** None

**Context:**
`reference/levinsohn/` contains 34 JSON files (6MB total) with no README explaining:
- What Levinsohn discourse features are
- Data source and citation
- File format structure
- Which features are used for segmentation vs. reference

README.md mentions Levinsohn at line 138-143, but no README in the directory itself.

**Impact if left unfixed:**
- Contributors don't understand data provenance
- No citation for Levinsohn's work
- Unclear which features are segmentation-relevant
- No guidance on data format

**Approach:**

**Option A (Recommended):** Create comprehensive README
Create `reference/levinsohn/README.md` with:

1. **Overview** - What is Levinsohn GNT Discourse Features?
2. **Citation** - Levinsohn, Stephen H. (2016). Full citation from README:138-143
3. **Data Source** - URL, text basis (NA28/UBS5)
4. **File Format** - JSON structure, example entry
5. **Feature Categories**:
   - Segmentation features (6 types per levinsohn_parser.py:27-34)
   - Reference features (remaining 28 types)
6. **Usage** - How skill uses these features, pointer to levinsohn_parser.py
7. **Last Updated** - Timestamp

**Acceptance Criteria:**
- [ ] `reference/levinsohn/README.md` exists
- [ ] Includes proper academic citation for Levinsohn (2016)
- [ ] Lists segmentation features vs. reference features
- [ ] Documents JSON file structure with example
- [ ] Explains relationship to `scripts/levinsohn_parser.py`
- [ ] Under 500 words (data documentation, not tutorial)

**Files Affected:**
- `skills/biblical-segmentation/reference/levinsohn/README.md` (create new)

**Estimated Time:** 45 minutes

**Notes:**
Model this after the DATA_SOURCES.md pattern from #1. Both are data provenance documentation.

**Example JSON entry to include:**
```json
{
  "verse": "Mark 1:9",
  "word": "ἐβαπτίσθη",
  "type": "historical_present"
}
```

**Segmentation features (from levinsohn_parser.py:27-34):**
- historical_present
- left_dislocation
- referential_pod
- situational_pod
- reported_speech
- tail_head_linkage

[Back to top](#quick-navigation)

---

### [#8] Eliminate Code Duplication in Scripts 🟡

**Effort:** 🔴 Substantial (120 min)
**Domain:** Code Quality
**Priority:** High
**Blocks:** #9 (BOOK_VARIATIONS extraction benefits from shared utilities)
**Blocked by:** #2 (error handling should be in shared code)

**Context:**
Both scripts have similar patterns:
1. **Book name normalization** - Both handle book name variations
2. **JSON file loading** - Similar error handling for reading JSON
3. **Argument parsing** - Both use argparse with similar structure
4. **Output formatting** - Both support text vs. JSON output

Duplication found:
- `sefaria_paragraphs.py` has `book_name_to_slug()` (line 24)
- `levinsohn_parser.py` has `book_variations` dict (lines 108-154) and `filter_by_book()` (line 96)
- Both have similar JSON loading with try-except

**Impact if left unfixed:**
- Bug fixes must be applied twice
- Inconsistent error handling between scripts
- Harder to maintain and test
- Violates DRY principle

**Approach:**

**Option A (Recommended):** Create shared utilities module
1. Create `scripts/bible_utils.py` with:
   - `normalize_book_name(book: str) -> str`
   - `load_json_file(path: Path) -> Optional[dict]` (with error handling from #2)
   - `BOOK_VARIATIONS` constant (extracted from levinsohn_parser.py)
2. Refactor both scripts to import from `bible_utils`
3. Add docstrings and type hints
4. Test both scripts still work

**Option B:** Merge scripts into single unified tool
1. Create `scripts/bible_data.py`
2. Subcommands: `bible_data masoretic Genesis`, `bible_data levinsohn Mark`
3. Shared infrastructure, specialized parsers
4. More complex, but cleaner long-term

**Recommendation:** Option A. Less disruptive, easier to test incrementally.

**Acceptance Criteria:**
- [ ] `scripts/bible_utils.py` exists with shared functions
- [ ] Both scripts import and use shared code
- [ ] No duplicated book name normalization logic
- [ ] Consistent error handling (using #2 improvements)
- [ ] Both scripts pass existing test cases
- [ ] Reduced total lines of code (measure before/after)

**Files Affected:**
- `skills/biblical-segmentation/scripts/bible_utils.py` (create new)
- `skills/biblical-segmentation/scripts/sefaria_paragraphs.py` (refactor)
- `skills/biblical-segmentation/scripts/levinsohn_parser.py` (refactor)

**Estimated Time:** 120 minutes (includes testing both scripts)

**Notes:**
Do this AFTER #2 (error handling fix) so that improved error handling goes into shared code.

**Shared functions to create:**
```python
# bible_utils.py
def normalize_book_name(book: str) -> str:
    """Convert book name variations to canonical form."""

def load_json_file(path: Path) -> Optional[dict]:
    """Load JSON with consistent error handling."""

BOOK_VARIATIONS: dict[str, list[str]] = {
    # Extracted from levinsohn_parser.py lines 108-154
}
```

[Back to top](#quick-navigation)

---

### [#9] Extract BOOK_VARIATIONS to Module Constant 🟢

**Effort:** 🔴 Substantial (90 min)
**Domain:** Code Quality
**Priority:** Nice to Have
**Blocks:** None
**Blocked by:** #8 (code duplication fix makes this trivial)

**Context:**
`levinsohn_parser.py` defines `book_variations` dict (lines 108-154, 47 lines) inside the `filter_by_book()` function. This dictionary is recreated on every function call, which is inefficient.

**Impact if left unfixed:**
- Minor performance hit (rebuilding dict on each call)
- Harder to reuse in other code
- Not a critical issue (function likely called once per run)

**Approach:**

**Option A:** Extract to module constant
```python
BOOK_VARIATIONS: dict[str, list[str]] = {
    'matthew': ['Matt', 'Matthew'],
    # ... rest of dict
}

def filter_by_book(references: List[Dict], book: str) -> List[Dict]:
    book_lower = book.lower()
    valid_prefixes = BOOK_VARIATIONS.get(book_lower, [book])
    # ... rest of function
```

**Option B (Recommended if doing #8):** Move to shared utilities
This becomes trivial if you do #8 first - just put the constant in `bible_utils.py`.

**Recommendation:** Do #8 first, then this is a 10-minute task instead of 90 minutes.

**Acceptance Criteria:**
- [ ] `book_variations` dict is a module-level constant
- [ ] Named `BOOK_VARIATIONS` (uppercase per PEP 8)
- [ ] Type annotated: `dict[str, list[str]]`
- [ ] `filter_by_book()` uses the constant
- [ ] Script still works correctly
- [ ] Performance test shows dict is not recreated on each call

**Files Affected:**
- `skills/biblical-segmentation/scripts/levinsohn_parser.py` (lines 96-167)
- OR `skills/biblical-segmentation/scripts/bible_utils.py` (if #8 done first)

**Estimated Time:** 90 minutes standalone, OR 10 minutes if #8 completed first

**Notes:**
This is low priority because:
1. Script typically processes one book per invocation
2. Performance impact is negligible (~microseconds)
3. Becomes trivial after #8

**Suggested sequence:** Do #8 first, then this is just moving a constant to the new shared module.

[Back to top](#quick-navigation)

---

### [#10] Add Inline Comments to YAML Files 🟢

**Effort:** 🔴 Substantial (90 min)
**Domain:** Documentation
**Priority:** Nice to Have
**Blocks:** None
**Blocked by:** None

**Context:**
Four YAML files in `reference/` lack inline comments:
1. `book-exceptions.yaml` (4868 bytes) - Micro-books, anthologies, contested books
2. `book-genres.yaml` (2513 bytes) - 66 books mapped to genres
3. `genre-methodology.yaml` (5300 bytes) - Segmentation markers per genre
4. `compositional-debates.yaml` (1884 bytes) - Partition theory notes

**Impact if left unfixed:**
- Contributors need to reverse-engineer YAML structure
- No inline explanation of design decisions
- Harder to validate correctness
- Not critical (files are fairly self-documenting)

**Approach:**

**Option A (Recommended):** Add strategic inline comments
For each file, add:
1. **Header comment** - File purpose, date, how it's used
2. **Section comments** - Explain each major section
3. **Field comments** - Clarify non-obvious fields
4. **Example entries** - Show complete entry structure

**Target comment density:** ~10-15% of file (5-10 comment lines per file)

**Example (book-exceptions.yaml):**
```yaml
# Book Exceptions - Special handling for micro-books, anthologies, contested books
# Used by SKILL.md Iron Rules to enforce integrity safeguards
# Last updated: 2026-01-19

micro_books:
  # Books too short to divide into many sessions
  # Max sessions enforced by Rule 1
  philemon:
    max_sessions: 2
    recommended: 1
    suggestion: "Pair with Colossians"  # Same author, related themes
```

**Acceptance Criteria:**
- [ ] All 4 YAML files have header comments
- [ ] Non-obvious fields have inline explanations
- [ ] Each major section has a comment
- [ ] Comments explain "why" not just "what"
- [ ] YAML syntax still valid after adding comments
- [ ] Total comment lines: 20-40 across all files

**Files Affected:**
- `skills/biblical-segmentation/reference/book-exceptions.yaml`
- `skills/biblical-segmentation/reference/book-genres.yaml`
- `skills/biblical-segmentation/reference/genre-methodology.yaml`
- `skills/biblical-segmentation/reference/compositional-debates.yaml`

**Estimated Time:** 90 minutes (20-25 min per file)

**Notes:**
This is polish work, not critical path. Do this when you have time for documentation improvements.

**Validation:**
```bash
# Ensure YAML is still valid after adding comments
python3 -c "import yaml; yaml.safe_load(open('file.yaml'))"
```

[Back to top](#quick-navigation)

---

### [#11] Document templates/ Directory Purpose 🟢

**Effort:** 🟡 Medium (30 min)
**Domain:** Documentation
**Priority:** Nice to Have
**Blocks:** None
**Blocked by:** None

**Context:**
`templates/` directory contains only `segmentation-output.md` with no README explaining:
- Is this directory for Jinja/Handlebars templates?
- Are templates executable or reference documentation?
- How do templates relate to skill execution?

**Impact if left unfixed:**
- Contributors confused about template purpose
- Unclear whether to add more templates
- Mystery directory without documentation

**Approach:**

**Option A (Recommended):** Create templates/README.md
Create brief README explaining:
1. **Purpose** - Reference templates showing expected output structure
2. **Status** - Not executable, no rendering engine implemented
3. **Usage** - Agents should match this structure in generated output
4. **Maintenance** - Keep in sync with SKILL.md output requirements

**Content:**
```markdown
# Output Templates

This directory contains **reference templates** that define the expected structure of skill output.

## Status

These are **documentation templates**, not executable code. There is no template rendering engine.

## Purpose

Templates show the expected format for skill-generated output:
- Field names and structure
- Required vs. optional sections
- Formatting conventions

## Usage

When the biblical-segmentation skill generates output, it should match the structure defined in these templates.

## Maintenance

Keep templates synchronized with SKILL.md output requirements. Last validated: YYYY-MM-DD
```

**Acceptance Criteria:**
- [ ] `templates/README.md` exists
- [ ] Explains templates are reference docs, not executable
- [ ] Under 200 words (brief orientation)
- [ ] Clarifies relationship to SKILL.md
- [ ] Addresses common questions (Can I add templates? How to use them?)

**Files Affected:**
- `skills/biblical-segmentation/templates/README.md` (create new)

**Estimated Time:** 30 minutes

**Notes:**
This is a quick documentation win. Do this after #4 (template update/removal decision) to ensure README matches reality.

[Back to top](#quick-navigation)

---

## Completion Workflow

When you finish an item:

1. **Check all acceptance criteria** - Ensure every checkbox is satisfied
2. **Update item number** - Add ✅ prefix everywhere it appears:
   - Master List: `### ✅ [#3] Add __pycache__/ to .gitignore`
   - All four views: Change `[#3]` to `✅ [#3]`
3. **Update completion tracker** - Increment Executive Summary:
   - `[===-------] 3/11 complete`
4. **Update timestamp** - Change "Last Updated" date at top
5. **Commit changes** - Use conventional commits:
   ```bash
   git commit -m "fix: add __pycache__/ to .gitignore (#3 from roadmap)"
   git commit -m "docs: update roadmap - #3 complete"
   ```

## Roadmap Lifecycle

### Adding New Items

If a new audit generates more technical debt:

1. Append to Master List with next number (#12, #13, etc.)
2. Assign priority (🔴/🟡/🟢), effort (Quick/Medium/Substantial), domain
3. Add to all four views in appropriate sections
4. Update Executive Summary total count
5. Check for new dependencies, update View 4

### Archiving This Roadmap

When all 11 items complete:

```bash
mkdir -p docs/archive
mv docs/technical-debt-roadmap.md docs/archive/2026-01-technical-debt.md
git commit -m "docs: archive completed technical debt roadmap"
```

Start a fresh roadmap only when new audit generates items.

---

**Quick Navigation:** [View 1: Quick Wins](#view-1-quick-wins-) | [View 2: Impact Priority](#view-2-impact-priority-) | [View 3: Thematic Batches](#view-3-thematic-batches-) | [View 4: Dependency Graph](#view-4-dependency-graph-) | [Back to top](#technical-debt-roadmap)
