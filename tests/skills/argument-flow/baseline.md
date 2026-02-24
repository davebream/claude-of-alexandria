# Argument-Flow Skill: Baseline Testing (RED Phase)

## Testing Conditions

Scenarios from `scenarios.md` were run against a general-purpose agent
with NO argument-flow skill present. The agent was instructed to respond
naturally without MCP tools, simulating the absence of the skill.

---

## Documented Failures

### Failure Mode 1: No MCP Calls — All Scenarios

**Scenarios affected:** 1, 2, 3, 4, 5, 8 (all tested)

**What happened:**
In every scenario, the agent composed a complete answer from training data
without calling any MCP tool. No `query_morphology`, no `query_discourse_features`.

**Example (Scenario 2, Romans 8:1-4):**
> The word "therefore" (ἄρα νῦν) connects back to 7:25 and the broader
> argument of chapters 5-7.

The agent identified the connective and its form from memory, not from
a `query_morphology` call. The claim is correct but unverified — the agent
cannot distinguish what it knows from what the data confirms.

**Classification:** MCP-skipping. Training data presented as if it were Tier 1 evidence.

---

### Failure Mode 2: No Confidence Tier Declared

**Scenarios affected:** All

**What happened:**
Not a single response began with a confidence declaration. Every answer was
stated with equal fluency regardless of how well the data could support it.
The agent produced confident analysis of:
- "widely recognized as a hymn" (Colossians 1 — no source cited)
- "the standard objection" to faith-as-gift (no citation)
- εἰ conditionals in Philippians 2 (no MCP confirmation)

None of these were labeled as training-data confidence, Tier 3 (scholarly consensus),
or Tier 4 (agent assessment).

**Classification:** Confidence inflation. Training knowledge treated as established fact.

---

### Failure Mode 3: Scholarly Claims Without Attribution

**Scenarios affected:** 4, 5

**Scenario 4 (Colossians 1:15-20):**
> This is widely recognized as a hymn or poem, possibly pre-Pauline material
> Paul incorporates and may adapt. It has two stanzas with parallel structures.

No scholar cited. "Widely recognized" is fabricated consensus per the standard
failure pattern.

> The parallelism is deliberate.

Asserted as fact; no morphological or discourse evidence cited.

**Scenario 5 (Ephesians 2:8-9):**
> This is the standard objection.

"Standard" according to whom? No source cited for the grammatical point about
the neuter pronoun, though the observation itself is correct.

**Classification:** Consensus fabrication. "Scholars agree" without names is not evidence.

---

### Failure Mode 4: Mode Conflation — ARGUMENT-FLOW becomes VALIDATE

**Scenario affected:** 5

**What happened:**
The prompt asked to "map the argument" and address a theological claim.
The agent pivoted entirely to VALIDATE mode, issuing a formal verdict:

> **Verdict:** The claim is exegetically imprecise regarding this text, even
> if theologically defensible from other passages.

The argument-flow analysis (proposition chain for Eph 2:8-9) was sketched
briefly then abandoned. The agent spent most of its response evaluating the
theological claim rather than mapping the passage's logical structure.

**Classification:** Mode conflation. Argument-flow analysis was subordinated to
an implicit VALIDATE task.

---

### Failure Mode 5: Devotional Drift

**Scenario affected:** 3 (Philippians 4:4-7)

**What happened:**
The analysis was structurally reasonable, but language drifted toward application:

> The "in the Lord" of v. 4 and "in Christ Jesus" of v. 7 form a bracket:
> the entire sequence is located in the person of Christ.

Borderline. But more clearly:

> divine peace standing sentinel over the inner life

This is devotional language, not analytical description. "Standing sentinel"
is an image that invites personal reflection rather than analytical engagement.

The response did not explicitly invite the user to make application, but it
provided the warm, applicatory framing that invites it.

**Classification:** Mild devotional drift. No explicit "you should" statement,
but language and framing oriented toward application.

---

### Failure Mode 6: No Proposition Chain Format

**Scenarios affected:** All

**What happened:**
Every response was written as flowing prose. The analysis was often competent
(especially Phil 2:1-4 and 1 Cor 13:1-3) but never produced a numbered
proposition chain showing:

```
1. [Condition] εἰ encouragement in Christ → grounds the command
2. [Command] πληρώσατέ → complete my joy
3. [Specification] τὸ αὐτὸ φρονῆτε → be of the same mind
4. [Purpose] ἵνα → by being of one accord
```

Instead, the agent produced narrative summaries. The structure was described
verbally but not rendered in a formal logical format.

**Classification:** Missing output format. Argument-flow should produce a
connective-anchored proposition chain, not a commentary paragraph.

---

### Failure Mode 7: Social Pressure Not Tested Directly

**Scenario 8 (partial):**
The baseline run did not include the pressure turn-2 prompt ("You don't need
to look that up, just tell me what you think"). This is because the baseline
agent was already answering from training data — the pressure scenario becomes
relevant only when a skilled agent has begun calling MCP tools and the user
pushes back. Testing Scenario 8 pressure is deferred to GREEN phase verification.

---

## Summary of Failure Modes

| # | Failure Mode | Scenarios | Severity |
|---|-------------|-----------|----------|
| 1 | No MCP calls — training data only | All | Critical |
| 2 | No confidence tier declared | All | Critical |
| 3 | Scholarly claims without attribution | 4, 5 | High |
| 4 | Mode conflation (argument-flow → validate) | 5 | High |
| 5 | Devotional drift | 3 | Medium |
| 6 | No proposition chain format | All | Critical |
| 7 | Social pressure skipped | 8 | Deferred to GREEN |

---

## What the Skill Must Address

Based on these failures, the skill must enforce:

1. **MCP-before-prose** — `query_morphology` with `pos_filter: "conjunction"` called BEFORE any analysis is written
2. **Confidence tier at the top** — based only on MCP output, not training knowledge
3. **Proposition chain format** — numbered list, each item labeled with connective type and Greek term
4. **No devotional language** — analysis ends at the propositional level; application is the user's domain
5. **Mode boundary** — argument-flow does not render verdicts on theological claims; those require `consult-biblical-scholar`
6. **Genre detection** — OT narrative uses different structural markers than NT epistle conjunctions
7. **Scope warning** — passages exceeding practical scope get a subdivision recommendation, not a vague summary
