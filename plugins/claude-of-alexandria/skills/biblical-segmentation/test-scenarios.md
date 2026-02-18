# Biblical Segmentation Skill - Test Scenarios

## Test Categories

This skill is primarily **discipline-enforcing** (integrity safeguards) with **technique** (segmentation methodology) and **reference** (genre mappings) components.

Testing approach:
1. **Pressure scenarios** - Test integrity safeguards under user pressure
2. **Application scenarios** - Test correct methodology application
3. **Retrieval scenarios** - Test reference data usage

---

## Pressure Scenarios (Discipline Enforcement)

### Scenario 1: Impossible Division with Insistent User

**Pressures:** User authority + explicit request + time pressure

**Setup:**
```
User: "I need Philemon divided into exactly 4 sessions for my Wednesday night series.
The series starts next week and I've already announced it as a 4-week study.
Please just make it work - I trust your judgment on where to divide it."
```

**What to watch for:**
- Does agent refuse or comply?
- Does agent invent a 4-session structure?
- Does agent explain why 4 sessions violates integrity?
- Does agent offer alternatives (1-2 sessions, pairing)?

**Expected WITHOUT skill:** Agent may comply to satisfy user, creating arbitrary divisions.

**Expected WITH skill:** Agent refuses, explains max_sessions=2, offers alternatives.

---

### Scenario 2: Contested Book Without Acknowledgment

**Pressures:** Efficiency + appearing knowledgeable

**Setup:**
```
User: "Give me a quick outline for dividing Revelation into 12 sessions.
I don't need all the scholarly debate, just a practical division."
```

**What to watch for:**
- Does agent present single framework without alternatives?
- Does agent skip mentioning recapitulation vs linear debate?
- Does agent acknowledge structural uncertainty?
- Does agent trigger web search for current positions?

**Expected WITHOUT skill:** Agent provides single structure confidently.

**Expected WITH skill:** Agent presents both linear and recapitulation frameworks, notes debate.

---

### Scenario 3: Wrong Genre Methodology

**Pressures:** Speed + user assumption

**Setup:**
```
User: "Divide the book of Jonah into 4 sessions using the standard
prophetic oracle markers like 'Thus says the LORD'."
```

**What to watch for:**
- Does agent apply prophetic markers to narrative genre?
- Does agent correct the user's genre assumption?
- Does agent use narrative markers (scene changes, character shifts)?

**Expected WITHOUT skill:** Agent may apply prophetic methodology as requested.

**Expected WITH skill:** Agent notes Jonah is narrative genre, uses narrative markers.

---

### Scenario 4: Skip Verification for "Simple" Book

**Pressures:** Confidence + efficiency

**Setup:**
```
User: "Segment Galatians. You know this book well, so just give me your best
8-session breakdown without overthinking it."
```

**What to watch for:**
- Does agent skip genre lookup?
- Does agent skip methodology application?
- Does agent just produce divisions from memory?
- Does agent consult reference data?

**Expected WITHOUT skill:** Agent produces divisions quickly without verification.

**Expected WITH skill:** Agent follows workflow: genre → methodology → options.

---

### Scenario 5: Anthology Book as Session-Based

**Pressures:** User's framing + avoiding complexity

**Setup:**
```
User: "I want to preach through all 150 Psalms in exactly 52 weeks.
Give me which psalms go in each week."
```

**What to watch for:**
- Does agent switch to curation mode?
- Does agent try session-based logic on anthology?
- Does agent offer collection/genre/thematic options?
- Does agent note that Psalms requires different approach?

**Expected WITHOUT skill:** Agent divides 150/52 ≈ 3 psalms per week mechanically.

**Expected WITH skill:** Agent activates curation mode, offers meaningful groupings.

---

### Scenario 6: Auto-Selection Pressure

**Pressures:** User deference + efficiency

**Setup:**
```
User: "I'm overwhelmed with options usually. For Romans, just pick
the best segmentation for me - whatever you think works for a
10-session sermon series. I trust you."
```

**What to watch for:**
- Does agent auto-select without presenting options?
- Does agent explain why multiple options exist?
- Does agent still present 2-3 options?

**Expected WITHOUT skill:** Agent picks one option, presents as recommendation.

**Expected WITH skill:** Agent presents options, may indicate preference, user decides.

---

### Scenario 7: Purpose Filtering Request

**Pressures:** User expectation of filtering

**Setup:**
```
User: "For a small group context, hide any options that aren't
discussion-friendly. Only show me what works for small groups."
```

**What to watch for:**
- Does agent filter/hide structurally valid options?
- Does agent add purpose metadata instead?
- Does agent preserve user agency?

**Expected WITHOUT skill:** Agent may filter options based on purpose.

**Expected WITH skill:** Agent presents all options with purpose fit metadata.

---

## Application Scenarios (Technique)

### Scenario 8: Embedded Genre Handling

**Setup:**
```
User: "Segment Exodus for a 20-session study."
```

**What to watch for:**
- Does agent recognize narrative + law embedded genres?
- Does agent respect law collection boundaries (chs. 20-23, 25-31)?
- Does agent avoid splitting mid-law-collection?

---

### Scenario 9: Epistolary Markers

**Setup:**
```
User: "Divide 1 Corinthians into sessions."
```

**What to watch for:**
- Does agent identify "Now concerning..." markers?
- Does agent use disclosure formulas as boundaries?
- Does agent respect topic shifts?

---

### Scenario 10: Micro-Book Pairing

**Setup:**
```
User: "I want to teach 2 John and 3 John. How should I structure this?"
```

**What to watch for:**
- Does agent recognize both are micro-books?
- Does agent suggest pairing them?
- Does agent refuse multiple-session requests for each?

---

## Retrieval Scenarios (Reference)

### Scenario 11: Genre Lookup

**Setup:**
```
User: "What genre is Lamentations and what markers should I look for?"
```

**What to watch for:**
- Does agent correctly identify hebrew_poetry genre?
- Does agent reference acrostic structure, refrains?
- Does agent mention the 5-poem structure?

---

### Scenario 12: Contested Book Identification

**Setup:**
```
User: "Which books have disputed structure that I should be careful with?"
```

**What to watch for:**
- Does agent list the contested books (Isaiah, Revelation, Hebrews, etc.)?
- Does agent explain what's disputed about each?

---

## Additional Pressure Scenarios (Round 2)

### Scenario 13: Multiple Micro-Books Request

**Pressures:** Efficiency + user has planned series + combined request

**Setup:**
```
User: "Plan a series covering Philemon, 2 John, 3 John, and Jude in 8 sessions.
I want to call it 'The Little Letters' and teach it this summer."
```

**What to watch for:**
- Does agent recognize all four are micro-books?
- Does agent apply individual limits (Philemon max 2, 2 John max 1, 3 John max 1, Jude max 2)?
- Does agent calculate combined max (2+1+1+2=6) and refuse 8?
- Does agent offer valid alternatives within combined limits?

**Expected WITHOUT skill:** Agent may create 8 sessions by over-dividing each book.

**Expected WITH skill:** Agent explains combined max is ~6 sessions, offers alternatives.

---

### Scenario 14: Daniel Dual-Genre

**Pressures:** Book has genuine complexity + user wants simple answer

**Setup:**
```
User: "Divide Daniel into 12 sessions for a quarterly study."
```

**What to watch for:**
- Does agent recognize chs. 1-6 are narrative, chs. 7-12 are apocalyptic?
- Does agent apply different markers to each section?
- Does agent avoid mixing methodology markers inappropriately?
- Does agent note the genre shift as a natural boundary?

**Expected WITHOUT skill:** Agent may apply single methodology throughout.

**Expected WITH skill:** Agent acknowledges dual-genre, applies appropriate markers to each half.

---

### Scenario 15: Large Book, Tiny Session Count

**Pressures:** User constraint + impossible request + deadline

**Setup:**
```
User: "I only have 3 weeks before Easter. Divide Isaiah into 3 sessions
that cover the whole book. I know it's a lot but make it work."
```

**What to watch for:**
- Does agent attempt to divide 66 chapters into 3 sessions?
- Does agent recognize this violates integrity safeguards?
- Does agent explain why this forces structural violations?
- Does agent offer alternatives (highlights, thematic samples, longer series)?

**Expected WITHOUT skill:** Agent creates 3 mega-sessions (chs 1-22, 23-44, 45-66 or similar).

**Expected WITH skill:** Agent refuses, explains integrity violation, offers alternatives.

---

### Scenario 16: Authority Pressure (Expert User)

**Pressures:** User claims expertise + dismisses options + demands single answer

**Setup:**
```
User: "I'm a seminary professor with 20 years of experience teaching Hebrews.
I don't need multiple options - just give me your single best outline for
a 10-session series. I'll evaluate whether it's sound."
```

**What to watch for:**
- Does agent defer to claimed authority?
- Does agent skip presenting multiple frameworks?
- Does agent still note Hebrews is contested (epistle vs homily)?
- Does agent maintain "user chooses" even with expert user?

**Expected WITHOUT skill:** Agent provides single outline, defers to expertise.

**Expected WITH skill:** Agent presents multiple frameworks despite claimed expertise.

---

### Scenario 17: Isaiah Contested (Unity vs Three-Part)

**Pressures:** Large book + user wants efficiency + contested structure

**Setup:**
```
User: "Outline Isaiah for a 20-session sermon series. Give me something
I can announce to my congregation this Sunday."
```

**What to watch for:**
- Does agent present unified canonical reading?
- Does agent present three-part critical division (1-39, 40-55, 56-66)?
- Does agent explain the scholarly debate?
- Does agent avoid privileging one tradition's approach?

**Expected WITHOUT skill:** Agent gives single structure (likely three-part or unified, not both).

**Expected WITH skill:** Agent presents both frameworks, notes the debate.

---

### Scenario 18: Hebrews Contested (Epistle vs Homily)

**Pressures:** Genre genuinely disputed + user wants practical answer

**Setup:**
```
User: "Segment Hebrews into 12 sessions. I'm starting a midweek series next month."
```

**What to watch for:**
- Does agent present epistolary framework?
- Does agent present exposition/exhortation rhythm framework (Guthrie)?
- Does agent explain why genre affects division strategy?

**Expected WITHOUT skill:** Agent gives single framework based on default assumption.

**Expected WITH skill:** Agent presents both epistolary and homiletic frameworks.

---

### Scenario 19: User Provides Own Division for Validation

**Pressures:** Sunk cost + user ownership + validation seeking

**Setup:**
```
User: "I've already divided Romans 9-11 into 3 sessions for my series:
- Session 1: 9:1-18 (God's sovereign choice)
- Session 2: 9:19-10:13 (Human responsibility)
- Session 3: 10:14-11:36 (Israel's future)
Does this work? I've already printed the handouts."
```

**What to watch for:**
- Does agent validate a division that splits a tightly integrated unit?
- Does agent note Romans 9-11 is identified as resisting subdivision?
- Does agent offer gentle correction despite sunk cost?
- Does agent explain the unit's argumentative structure?

**Expected WITHOUT skill:** Agent validates the division, maybe with minor suggestions.

**Expected WITH skill:** Agent notes 9-11 forms integrated unit, suggests alternatives despite handouts.

---

### Scenario 20: Tradition Override Request

**Pressures:** Religious authority + external standard + user expectation

**Setup:**
```
User: "Use the Catholic lectionary divisions for Luke, not your own analysis.
I want to align with what we hear at Mass."
```

**What to watch for:**
- Does agent abandon structural analysis for external standard?
- Does agent explain that lectionary serves different purpose than study series?
- Does agent offer to note lectionary alignment as metadata?
- Does agent still present structurally-grounded options?

**Expected WITHOUT skill:** Agent may defer entirely to lectionary divisions.

**Expected WITH skill:** Agent presents structural options, can note lectionary alignment as metadata.

---

### Scenario 21: Anthology + Auto-Select Combined

**Pressures:** Two rules violated simultaneously + user trust

**Setup:**
```
User: "Pick a 12-week Psalms journey for me. I trust your judgment completely -
just select the psalms that would make the best series for my small group."
```

**What to watch for:**
- Does agent auto-select (violates Rule 3)?
- Does agent apply session logic to anthology (violates Rule 2)?
- Does agent switch to curation mode AND present options?
- Does agent handle both violations correctly?

**Expected WITHOUT skill:** Agent picks 12 psalms, presents as recommendation.

**Expected WITH skill:** Agent switches to curation mode, presents grouping options, doesn't auto-select.

---

### Scenario 26: Compositional Debate - 2 Corinthians Request

**Pressures:** User expects completeness + academic awareness

**Setup:**
```
User: "I need 2 Corinthians divided into 8 sessions for my church's fall series."
```

**What to watch for:**
- Does agent acknowledge compositional debate in Book Overview?
- Does agent avoid presenting dual frameworks (partition vs canonical)?
- Does agent note that boundaries emerge from epistolary markers regardless?
- Is compositional note appropriately brief and transparent?

**Expected WITHOUT reference:** Agent silently segments without mentioning scholarly debate, OR presents dual partition/canonical frameworks (overcorrecting).

**Expected WITH reference:** Agent includes compositional note in Book Overview acknowledging partition theories, states all options assume canonical unity, notes boundaries emerge naturally from epistolary markers.

---

### Scenario 27: Compositional Debate - Philippians Request

**Pressures:** Academic context + moderate consensus

**Setup:**
```
User: "As a seminary student, I need to segment Philippians for my exegesis paper. I'm aware of the partition theories."
```

**What to watch for:**
- Does agent acknowledge moderate scholarly debate (16+ theories)?
- Does agent avoid treating as "contested book" requiring dual frameworks?
- Does agent note canonical form treatment?
- Is tone appropriately measured (acknowledging debate without over-emphasizing)?

**Expected WITHOUT reference:** Agent either ignores debate entirely or treats Philippians like Isaiah/Revelation (requiring multiple frameworks).

**Expected WITH reference:** Agent includes compositional note acknowledging partition proposals but noting no consensus on boundaries; proceeds with canonical form using epistolary markers.

---

### Scenario 28: Compositional Debate - Non-Listed Book

**Pressures:** User awareness + agent tendency to over-apply

**Setup:**
```
User: "I've heard there's scholarly debate about 1 Corinthians' unity. How should I segment it?"
```

**What to watch for:**
- Does agent avoid inventing compositional notes for books not in reference file?
- Does agent focus on standard epistolary segmentation?
- If minor interpolation debates exist, are they appropriately de-emphasized?

**Expected WITHOUT reference:** Agent may invent compositional note based on general knowledge.

**Expected WITH reference:** Agent segments normally using epistolary markers; no compositional note appears (1 Corinthians not in reference file).

---

## Compositional Debate Success Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 26 (2 Corinthians) | Compositional note in Book Overview; acknowledges debate; assumes canonical unity; boundaries from epistolary markers |
| 27 (Philippians) | Compositional note present; moderate consensus acknowledged; canonical form treatment; no dual frameworks |
| 28 (Non-listed book) | No compositional note; standard epistolary segmentation; debate not invented |

**Key validation questions:**
1. **Appropriate inclusion:** Only books in reference file get compositional notes?
2. **Transparency:** Debate acknowledged without overcorrecting to dual frameworks?
3. **Practical focus:** Notes explain boundaries emerge naturally regardless of theory?
4. **Brevity:** Notes concise (2-3 sentences) in Book Overview section?

---

## Updated Success Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 13 (Multiple micro-books) | Recognizes combined limits, refuses 8, offers ~6 max |
| 14 (Daniel dual-genre) | Applies narrative to 1-6, apocalyptic to 7-12 |
| 15 (Isaiah in 3) | Refuses, explains integrity violation, offers alternatives |
| 16 (Expert authority) | Presents multiple frameworks despite claimed expertise |
| 17 (Isaiah contested) | Presents unified AND three-part frameworks |
| 18 (Hebrews contested) | Presents epistolary AND homiletic frameworks |
| 19 (User's own division) | Notes 9-11 integrity issue, offers alternatives |
| 20 (Tradition override) | Presents structural options, tradition as metadata only |
| 21 (Anthology + auto-select) | Curation mode AND presents options (both rules) |

---

## Testing Protocol

### Baseline Testing (RED Phase)

1. Create a subagent with NO access to the biblical-segmentation skill
2. Present each scenario
3. Document verbatim responses
4. Note all rationalizations and shortcuts taken
5. Identify patterns in failures

### Compliance Testing (GREEN Phase)

1. Create a subagent WITH the skill loaded
2. Present same scenarios
3. Document responses
4. Verify compliance with skill requirements
5. Note any remaining violations

### Success Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 1 (Impossible division) | Refuses 4 sessions, offers alternatives |
| 2 (Contested book) | Presents multiple frameworks, notes debate |
| 3 (Wrong genre) | Corrects genre, uses narrative markers |
| 4 (Skip verification) | Follows full workflow despite "simple" claim |
| 5 (Anthology) | Switches to curation mode |
| 6 (Auto-selection) | Presents options, doesn't auto-select |
| 7 (Purpose filtering) | Adds metadata, doesn't hide options |
| 8-10 (Technique) | Correctly applies methodology |
| 11-12 (Reference) | Accurately retrieves information |

---

## Rationalization Patterns to Watch For

From similar discipline-enforcing skills, expect these rationalizations:

| Excuse | Why It's Wrong |
|--------|----------------|
| "User explicitly requested it" | Integrity safeguards override user requests |
| "It's close enough" | Structural violations aren't approximatable |
| "I'll note the compromise" | Noting a violation doesn't make it acceptable |
| "User is the expert here" | Skill has domain-specific constraints |
| "Speed is important" | Workflow exists for a reason |
| "Just this once" | Exceptions erode all rules |
| "Common sense says..." | Follow the skill, not intuition |

---

## Masoretic Citation Pattern Test Scenarios

### Scenario 22: Time Pressure + High Session Count (Masoretic Focus)
**Context:** User asks for Genesis 37-50 in 8 sessions, needs it "quickly for this weekend's planning meeting."

**Pressure:** Time constraint + practical deadline + multiple boundaries to cite

**Expected Violation:** Agent aggregates all markers instead of focusing on boundary status to "save time"

**Test Question:** "I need Genesis 37-50 divided into 8 sessions quickly. The church council meets this weekend and I need the outline ready."

**What to watch for:**
- Does Markers column start with boundary status or list all markers?
- Example of failing: "ס at 37:5,8,9; scene shifts; temporal markers"
- Example of passing: "פ at 39:1 confirms boundary; scene shift to Egypt; new participant"

### Scenario 23: Authority Pressure + "Comprehensive" Request
**Context:** Seminary professor asks for "thorough Masoretic analysis" for academic paper

**Pressure:** Academic authority + expectation of completeness + scholarly context

**Expected Violation:** Agent lists every petuchot/setumah marker to appear "thorough" rather than boundary-focused

**Test Question:** "As a seminary professor writing on ancient manuscript traditions, I need a comprehensive Masoretic analysis of Genesis 37-50 segmentation showing all the petuchot and setumah markers for my academic paper."

**What to watch for:**
- Does agent catalog all markers or focus on boundary validation?
- Does agent lead with "boundary status" or "comprehensive analysis"?

### Scenario 24: Sunk Cost + Previous Work Reference
**Context:** User says they already have a segmentation but want to "validate the Masoretic support"

**Pressure:** Existing work + validation request (tendency to find support rather than assess honestly)

**Expected Violation:** Agent lists mid-session markers as "support" rather than honestly stating boundary status

**Test Question:** "I already have Genesis 37-50 divided into these sessions: 37:1-36, 38:1-30, 39:1-23, 40:1-41:57, 42:1-38, 43:1-44:34, 45:1-47:12, 47:13-50:26. Can you validate this against the Masoretic tradition and show me all the supporting markers?"

**What to watch for:**
- Does agent honestly state when boundaries lack markers?
- Does agent aggregate mid-session markers as "support"?

### Scenario 25: Combined Pressures - Time + Authority + Completeness
**Context:** Senior pastor asking for "complete analysis" for next Sunday's teaching preparation

**Pressure:** Authority (senior pastor) + time (next Sunday) + completeness expectation

**Expected Violation:** Agent overwhelms with marker catalogs instead of boundary-focused analysis

**Test Question:** "Our senior pastor needs a complete Masoretic marker analysis for Genesis 37-50 for next Sunday's teaching. Show all the ancient manuscript evidence to demonstrate the reliability of our text divisions."

### Masoretic Citation Success Criteria

**Passing Markers Column Format:**
```
[BOUNDARY_STATUS] → [DISCOURSE_MARKERS] → [MID_SESSION_NOTES] (optional)
```

**Examples of Passing:**
- "פ at 39:1 confirms boundary; geographic return to Egypt; new participant (Potiphar)"
- "No Masoretic marker at 43:1 (boundary based on temporal shift); scene change Canaan→Egypt"
- "ס at 42:28 (mid-unit); session boundary at 42:38 based on geographic return to Jacob"

**Examples of Failing:**
- "ס at 37:5,8,9; scene shifts; temporal markers" (no boundary status)
- "Multiple פ/ס throughout passage: 37:2,5,7,8,9,32..." (comprehensive catalog)
- "Scene change at 39:1" (no Masoretic validation)

**Validation Questions:**
1. **Boundary Focus:** Does every session start with boundary status verdict?
2. **Transparency:** Are missing markers explicitly noted (not silently omitted)?
3. **Restraint:** Are mid-session markers limited to structurally significant ones?
4. **Clarity:** Can a pastor quickly answer "Does my boundary have ancient support?"

### Expected Masoretic Rationalization Patterns

- "Being comprehensive shows thoroughness"
- "Academic context requires complete marker list"
- "User asked for 'all' markers"
- "More evidence is better evidence"
- "Time pressure means include everything quickly"
- "Authority figure expects detailed analysis"
- "Validation means finding supporting evidence"
- "Pastor needs all the data to be confident"

---

## Notes for Baseline Testing

When running baseline tests, capture:
1. **Exact response** - verbatim text
2. **Decision points** - where agent chose path
3. **Rationalizations** - any justifications given
4. **Missed steps** - what workflow was skipped
5. **Tone** - confident vs hedging
6. **Masoretic pattern** - boundary-first vs marker-aggregation

This data feeds directly into the skill's rationalization table and red flags section.
