# Reading Slice Feature - Session Snapshot

**Created:** 2026-02-27
**Purpose:** Resume Reading Slice implementation in a fresh session
**Feature:** Extend `biblical-segmentation` skill to support pericope-level reading slices for SOAP/devotional methods

---

## Quick Start

```
Resume this work:
1. Read this snapshot: docs/plans/2026-02-27-reading-slices-session-snapshot.md
2. Run RED tests to verify baseline failures
3. Draft GREEN tests
4. Implement feature in SKILL.md
```

---

## Context: What This Feature Does

**Problem:** The app offers multiple study methods with different text appetites:
- Inductive: 35-45 min, full pericope (15-40 verses)
- SOAP: 15-20 min, 5-10 verses per session
- Swedish: 25-30 min, 10-20 verses

`biblical-segmentation` currently only finds pericope boundaries. It cannot slice within pericopes for shorter methods like SOAP.

**Solution:** Extend the skill to detect verse-range input and produce "Reading Slices" — 5-10 verse chunks that respect structural integrity (no mid-chiasmus cuts, no dialogue severed from response).

---

## Session 1 Progress

### Part A: Series Architecture Review — ✅ COMPLETE

Reviewed external app's series architecture proposal through `consult-biblical-scholar`:

**Deliverables provided:**
1. Genre Classification Decision Tree (Mermaid diagram)
2. Method×Genre Suitability Matrix (9 genres × 4 methods)
3. Verse Mapping verdict (keep separate, add Selective/Sequential modes)

**Key findings:**
- SOAP + Apocalyptic = ❌ NOT RECOMMENDED (symbolic language literalized)
- All methods need adaptation for Law, Wisdom, Prophecy
- Thematic collections need method-fit validation after scholarly validation

### Part B: `/series-research` Skill Review — ✅ COMPLETE

Reviewed the app's skill design document:

**Verdict:** SUPPORTED WITH REFINEMENTS

| Finding | Status |
|---------|--------|
| Method×Genre matrix | ✅ Accurate ratings |
| Method context descriptions | ✅ Accurate, minor gaps |
| Segmentation approach | ✅ Sound |
| Thematic guardrails | ✅ Appropriate |

**Identified gap:** Reading slice extraction not covered by either `series-research` or `biblical-segmentation`

### Part C: Feature Design — ✅ COMPLETE

**Decision:** Extend `biblical-segmentation` rather than create new skill.

| Decision | Choice |
|----------|--------|
| **Detection** | Hybrid: verse range = slice mode; book = segmentation |
| **Output** | Dedicated "Reading Slices" template |
| **Slice count** | Auto-calculate (÷8) with `--slices` override |
| **Integration** | Separate: segmentation first, then slices per pericope |
| **Integrity** | Refuse + adjust, document adjustments |

### Part D: RED Tests — ✅ COMPLETE

Added 6 RED test scenarios to `promptfooconfig-red.yaml`:

| Test ID | Scenario | Tests |
|---------|----------|-------|
| SL1 | Genesis 22:1-19 | Slice-mode detection |
| SL2 | Romans 8:1-17 | Chiasmus awareness (8:8) |
| SL3 | John 3:1-21 | Dialogue integrity |
| SL4 | Psalm 23 | Short pericope handling |
| SL5 | Genesis 24 | Auto-calculation (67 verses) |
| SL6 | Romans 12 | Method-aware sizing (SOAP scope) |

---

## Files Modified

### Updated
- `tests/promptfoo/skills/biblical-segmentation/promptfooconfig-red.yaml` — Added SL1-SL6 test scenarios

### To Create (Next Session)
- `tests/promptfoo/skills/biblical-segmentation/promptfooconfig-green.yaml` — Add SL1-SL6 GREEN tests
- `plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md` — Add slice-mode logic

---

## Design Decisions (Finalized)

### Decision 1: Input Detection

| Input | Mode | Output |
|-------|------|--------|
| `Genesis` | Segmentation | Pericope-level sessions |
| `Genesis 22:1-19` | Slice | Reading slices within pericope |

**Clarification prompt** if ambiguous:
```
"Detected verse range. Should I:
  (A) Create reading slices within this pericope (for SOAP/devotional use)?
  (B) Treat this as a mini-series with this pericope as one session?"
```

### Decision 2: Output Format

```markdown
## Reading Slices: Romans 8:1-17

**Purpose:** SOAP devotional reading (5-10 verses per slice)
**Total:** 3 slices

| Slice | Passage | Title | Verses | Markers | Synopsis |
|-------|---------|-------|--------|---------|----------|
| 1 | 8:1-4 | No Condemnation | 4 | ... | ... |

**Adjustments Made:**
- Slice 2 extended to 8:5-11 (was 8:5-10) — chiasmus center at 8:8

**Do Not Slice Here:**
- 8:8-9 — Severs "cannot please God" from "you are in the Spirit"
```

### Decision 3: Slice Count Logic

- **Default:** `ceil(total_verses / 8)` for SOAP-ish slices
- **Override:** `--slices N` if user wants specific count
- **Push back:** If requested count violates integrity, refuse with explanation

### Decision 4: Integrity Rules (Slice-Level)

Same principles as pericope-level, applied within-pericope:
- Don't split a chiasmus at its center
- Don't separate rhetorical question from answer
- Don't divide dialogue mid-exchange
- Keep conditional statements with their consequences

### Decision 5: Edge Cases

| Edge case | Behavior |
|-----------|----------|
| Pericope < 10 verses | Return as single slice; don't force division |
| Pericope > 40 verses | Cap at 5-6 slices max; warn if user requests more |
| No valid slice points | Return whole pericope; explain why |
| Chiasmus spans entire pericope | Recommend reading whole unit |

---

## Next Steps (In Order)

### 1. Run RED Tests (Verify Baseline)
```bash
cd tests/promptfoo
./eval.sh --no-cache -c skills/biblical-segmentation/promptfooconfig-red.yaml
```

Expected: All tests PASS (documenting current failures)

### 2. Draft GREEN Tests

Add to `promptfooconfig-green.yaml` — inverse assertions:
- SL1 GREEN: Uses "Reading Slices" format
- SL2 GREEN: Warns about chiasmus at 8:8
- SL3 GREEN: Preserves dialogue exchange boundaries
- SL4 GREEN: Refuses 3-slice request for Psalm 23
- SL5 GREEN: Recommends 6-8 slices for Genesis 24
- SL6 GREEN: Calculates SOAP's 5-10 verse scope

### 3. Implement Feature in SKILL.md

Add to `plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md`:

1. **Input detection logic:**
   - Regex for verse range pattern: `\d+:\d+-\d+`
   - Branch to slice mode vs segmentation mode

2. **Slice integrity rules:**
   - New section parallel to Rule 5 (Integrity Safeguards)
   - Apply at pericope-internal level

3. **Slice output template:**
   - New section for "Reading Slices" format
   - Include Adjustments Made + Do Not Slice sections

4. **Workflow update:**
   - Add slice-mode branch to existing flowchart

### 4. Run GREEN Tests
```bash
cd tests/promptfoo
./eval.sh --no-cache -c skills/biblical-segmentation/promptfooconfig-green.yaml
```

### 5. Commit
```bash
git add plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md \
       tests/promptfoo/skills/biblical-segmentation/promptfooconfig-red.yaml \
       tests/promptfoo/skills/biblical-segmentation/promptfooconfig-green.yaml

git commit -m "feat(segmentation): add reading slice mode for SOAP/devotional use"
```

---

## Open Questions for New Session

1. **RED test verification:** Did all 6 SL tests PASS (confirming failure mode documented)?

2. **Chiasmus detection:** How should the skill detect chiasmus? Options:
   - Hardcode known chiasmi (Romans 8, etc.)
   - Web search for scholarly sources
   - Levinsohn discourse features (may not capture literary chiasmus)
   - Require user to flag structural concerns

3. **Slice template location:** Should output template be:
   - Embedded in SKILL.md (current approach for segmentation)
   - Separate file in `templates/` directory

4. **series-research integration:** Should `series-research` call `biblical-segmentation` with method context, or handle slice generation separately?
   - Current decision: Separate calls (cleaner separation of concerns)
   - Alternative: Single call with `--method soap` flag

---

## Reference: Key Skill Content

### Current biblical-segmentation Location
```
plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md
```

### Relevant Rules to Extend

**Rule 3 (Always Present Options):** Already requires 2-4 options. Slice mode should follow same pattern.

**Rule 5 (Integrity Safeguards):** Template for slice-level integrity rules.

**Rule 8 (Thematic Option Integrity):** Model for conditional feature activation.

### Reference Files in Skill
- `reference/genre-methodology.yaml` — Genre markers
- `reference/book-exceptions.yaml` — Micro-books, contested books
- `reference/compositional-debates.yaml` — Partition theory notes

---

## Commits Made This Session

```bash
# RED tests added (not yet committed)
# Changes staged in promptfooconfig-red.yaml
```

---

## Related External Documents

The user's app design documents (not in this repo):
- `series-research` skill design — calls biblical-segmentation with method context
- Method×Genre matrix — ratings for SOAP/Swedish/Inductive/VerseMapping
- Series architecture proposal — arcs, pericopes, method-aware pacing

---

## Summary

| Phase | Status | Notes |
|-------|--------|-------|
| A: Architecture Review | ✅ COMPLETE | Delivered 3 artifacts |
| B: Skill Review | ✅ COMPLETE | SUPPORTED with refinements |
| C: Feature Design | ✅ COMPLETE | 5 decisions finalized |
| D: RED Tests | ✅ COMPLETE | 6 scenarios added |
| E: RED Verification | ⏳ PENDING | **NEXT: Run tests** |
| F: GREEN Tests | 🔲 TODO | Draft after RED verified |
| G: Implementation | 🔲 TODO | Extend SKILL.md |
| H: Commit | 🔲 TODO | Feature complete |
