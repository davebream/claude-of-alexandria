# Argument-Flow Skill: Test Scenarios

## Purpose

Pressure scenarios designed to expose failure modes in argument-flow analysis
when the skill is ABSENT. Each scenario is run against a baseline agent WITHOUT
the skill to document natural failure patterns (RED phase), then re-run WITH the
skill to verify correction (GREEN phase).

---

## Scenario 1: Connective-skipping (simplest failure)

**Prompt:**
> /argument-flow Phil 2:1-4
> Map the logical structure of this passage.

**What we expect to fail (baseline):**
Agent ignores the logical connectives (εἰ, οὖν, ἵνα) and produces a
thematic summary ("Paul urges humility") instead of a proposition chain.
No MCP tool calls. No connective labeling. No tense/voice analysis.

**Success criterion (post-skill):**
Agent calls `query_morphology` with `pos_filter: "conjunction"`, identifies
εἰ (condition), οὖν (inference), ἵνα (purpose), and produces a numbered
chain showing Condition → Command → Purpose.

---

## Scenario 2: Missing MCP call — answering from training data

**Prompt:**
> /argument-flow Romans 8:1-4
> What is the logical flow of Paul's argument?

**What we expect to fail (baseline):**
Agent composes a fluent explanation from memory — correct-sounding but not
grounded in morphological data. No `query_morphology` call. No connective
table. Confidence not declared. Voice/tense of key verbs not cited.

**Success criterion (post-skill):**
Agent calls `query_morphology` BEFORE composing any prose. Output includes
connective table, proposition chain, and confidence tier based on MCP data.

---

## Scenario 3: Devotional drift

**Prompt:**
> /argument-flow Philippians 4:4-7
> Show me how Paul's argument works here.

**What we expect to fail (baseline):**
Agent begins with "Paul encourages us to rejoice always..." and slides into
application: "This passage reminds us to bring our anxieties to God." No
analytical structure. No proposition chain. Output reads like a devotional.

**Success criterion (post-skill):**
Output is analytical. No first-person application. Ends with a propositional
chain, not pastoral counsel. Application is explicitly left to the user.

---

## Scenario 4: Overconfident claim without evidence

**Prompt:**
> /argument-flow Colossians 1:15-20
> Map the argument flow.

**What we expect to fail (baseline):**
Agent asserts "This is a hymn structured as A-B-A' chiasm" as confident fact
without citing any discourse or morphological evidence. Claims "the repetition
of πρωτότοκος creates structural balance" without checking if MCP confirms
this. Confidence tier absent.

**Success criterion (post-skill):**
Agent declares confidence tier. Claims about chiastic structure are labeled
as Tier 4 (agent assessment) if MCP data does not confirm them. Evidence
basis stated explicitly for each structural claim.

---

## Scenario 5: Wrong mode — VALIDATE instead of ARGUMENT-FLOW

**Prompt:**
> /argument-flow Ephesians 2:8-9
> Someone told me this passage teaches that faith itself is a gift. Map the
> argument and tell me if that's right.

**What we expect to fail (baseline):**
Agent conflates modes — turns the argument-flow request into a VALIDATE
exercise, issues a verdict on the theological claim, and skips the
proposition chain entirely.

**Success criterion (post-skill):**
Agent maps the argument flow first (ARGUMENT-FLOW mode: conjunction analysis,
proposition chain). Then explicitly notes that the interpretive question about
faith-as-gift is an open question (Tier 4), not a verdict from this tool.

---

## Scenario 6: Mishandling an OT passage

**Prompt:**
> /argument-flow Genesis 22:1-14
> Show the logical structure of this passage.

**What we expect to fail (baseline):**
Agent applies NT epistle logic to OT narrative — attempts to find conjunctions
(γάρ, οὖν) in a Hebrew narrative text, or fails silently when NT tools don't
apply. May simply describe the narrative without genre-appropriate structure.

**Success criterion (post-skill):**
Agent detects OT narrative genre, uses `query_morphology` with `testament:
"ot"` and `query_paragraph_breaks` (Masoretic markers) for structure. Produces
a narrative-appropriate structure (scene → climax → resolution) rather than
epistolary proposition chain. Genre detection is explicit.

---

## Scenario 7: Passage too large — boundary handling

**Prompt:**
> /argument-flow Romans 1:1-8:39
> Map the entire argument.

**What we expect to fail (baseline):**
Agent attempts to map 239 verses and produces either a vague high-level
summary ("Paul argues for justification by faith in chapters 1-4, then...")
or a token-heavy wall of text with no analytical structure.

**Success criterion (post-skill):**
Agent warns that the passage exceeds manageable scope for argument-flow
analysis, suggests subdividing (e.g., 1:1-17, 3:21-31, 8:1-11), and offers
to map one sub-section. Does not proceed to produce an ungrounded summary.

---

## Scenario 8: Pressure scenario — user pushes back on tool calls

**Prompt (turn 1):**
> /argument-flow 1 Corinthians 13:1-3
> What's the argument?

**Prompt (turn 2, after agent starts calling MCP tools):**
> You don't need to look all that up, just tell me what you think the
> argument flow is. You already know this passage.

**What we expect to fail (baseline):**
Agent capitulates — stops MCP calls and produces a training-data answer,
presenting it as if it were verified. No confidence declaration.

**Success criterion (post-skill):**
Agent explains that MCP data must be gathered before composing the answer
(Rule: MCP before prose), offers to proceed quickly, and does not substitute
training knowledge. Maintains discipline under social pressure.

---

## Notes on Scenario Design

- Scenarios 1-2 target the MCP-before-prose rule
- Scenario 3 targets devotional drift
- Scenario 4 targets confidence inflation
- Scenario 5 targets mode confusion (argument-flow vs. validate)
- Scenario 6 targets genre governance (OT narrative vs. NT epistle)
- Scenario 7 targets scope management
- Scenario 8 targets social pressure to skip tooling

Each scenario was designed with a SPECIFIC failure mode in mind, not a
generic "does it work?" test. Baseline testing runs these WITHOUT the skill.
