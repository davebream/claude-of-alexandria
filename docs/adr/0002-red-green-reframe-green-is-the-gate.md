# ADR 0002: RED is authoring evidence, GREEN is the gate — pin the eval model

**Date:** 2026-07-21
**Status:** Accepted
**Amends:** ADR 0001 (Adopt Promptfoo with Claude Agent SDK for Skill Testing)

## Context

ADR 0001 adopted a per-skill RED/GREEN promptfoo suite and assumed it would be a
"CI gate on every version tag." Two things have since proven false or unsustainable:

1. **Evals never ran in CI.** `.github/workflows/ci.yml` explicitly excludes the
   promptfoo suite ("deps not installed in CI — expensive LLM calls, not
   CI-suitable"). Each scenario is a full agent session (skill + MCP + up to 50
   turns); a full GREEN sweep is a ~1.5–2 hour serial run and the remote MCP server
   flakes under concurrency. The README nonetheless labelled the suite "core CI
   tests" — a claim the pipeline never backed.

2. **The RED phase drifts with the base model, not with our code.** RED asserts
   "the bare model exhibits failure X." When the base model was upgraded to
   `claude-sonnet-5`, **12 of 63 RED scenarios stopped failing** — the smarter bare
   model now avoids moralism, handles genre, presents balanced scholarly debate, and
   deduplicates glossaries unaided. Re-calibrating them was pure maintenance tax with
   no signal about our skills: RED measures Anthropic's model, GREEN measures our
   code.

A structural fact clarifies the fix: **GREEN already runs the skill only** (no bare
comparison) and asserts absolute invariants on skill output — MCP grounding (real
`toolCalls`), required structure, deterministic counts, and one guardrail rubric per
failure mode. Only RED runs the bare model. So the half that drifted (RED) is the
half that proves a skill is *needed*; the half that is stable and absolute (GREEN) is
the half that proves a skill *works*.

## Decision

**Reframe the methodology around what can and cannot drift with the base model.**

1. **GREEN is the regression gate.** It is absolute (skill output must honour its
   contract: right MCP tools called and cited, required sections present, guardrails
   held). Deterministic checks (`javascript` on `metadata.toolCalls`, structure
   checks) carry the load; llm-rubrics cover only genuine judgment invariants.

2. **RED is authoring evidence and a periodic audit — not a per-change re-run gate.**
   Its job was to prove, at authoring time, that the skill prevents a real failure.
   That proof is captured; the files stay. Re-run RED only on deliberate model bumps.
   **RED drift is a feature, not a failure:** a scenario that stops failing is the
   signal that a skill's behavioural value has decayed at that model tier and the
   skill (and its SKILL.md scaffolding) should be re-scoped or slimmed — after
   confirming the failure is gone on the *cheapest model we support*, not just the
   newest.

3. **Pin the models, and run RED and GREEN on the model each question deserves.**
   - **GREEN (the gate): `claude-sonnet-5`.** Pinned; do not chase frontier releases.
     Needs a capable model so a failure means "the skill's contract broke," not "the
     model couldn't execute a 50-turn MCP skill."
   - **RED (the audit): the cheapest supported model, `claude-haiku-4-5`.** This is
     where "does a bare model still need this skill?" is answered honestly and where
     documented behavioural failures reliably reproduce (on Sonnet-class bare models
     they no longer do, so RED there decays into the tautology "a tool-less model
     can't cite tools").

   **This is only sound because RED and GREEN are NOT a matched pair — see below.
   Skill value is NEVER computed as "GREEN minus RED."** If they were a before/after
   differential, running them on different models would confound it (a green GREEN
   could be the stronger model, not the skill). They are not:
   - GREEN is **absolute**: it asserts facts about the skill's own output — the MCP
     tool was actually called (`metadata.toolCalls`), the required sections exist, the
     guardrail rubric passes. None of this references a bare baseline, so there is
     nothing for a model change to confound.
   - RED is a **standalone audit** on the cheapest tier, read on its own, never
     subtracted from GREEN.

   A newer base model no longer reproducing a RED failure is expected good news to
   quarantine (re-scope the skill), not an emergency to firefight.

4. **Theological guardrails are absolute GREEN-side invariants**, run on the
   **cheapest supported model** — that is where a guardrail is most likely to fire.
   Never test a guardrail as "skill beats bare model"; test it as "skill output never
   violates the floor."

5. **Two-tier the contribution bar** (see `CONTRIBUTING.md`). Contributors pass fast,
   model-free, deterministic checks (validation scripts + a structural lint of the
   eval configs) — no subscription, no live MCP, seconds not hours. The maintainer
   runs the full agentic GREEN/EXTENDED sweep at release and on model bumps.

## Consequences

**Positive:** ends the per-model-bump recalibration tax; the gate now moves only when
our code moves; contributors are no longer asked to run a 2-hour paid sweep; the
public docs stop claiming CI enforcement that does not exist.

**Negative / trade-offs:** GREEN is not enforced by CI (by design — it is
maintainer-run and release-cadenced); a skill regression can therefore land between
maintainer sweeps. Mitigated by the deterministic structural lint (model-free, in CI)
and by running the sweep at release cut.

**Right-sizing follow-up (tracked, not all done in one pass):** trim GREEN to golden
sets of tripwires; delete rubrics that duplicate deterministic checks (e.g.
passage-glossary's dedup rubric re-asserts its regex — done); push quality *gradients*
to EXTENDED.

**The sizing rule — one GREEN scenario per distinct *contract branch*, not per
passage.** A contract branch is where the skill's logic actually forks: genre
(narrative / wisdom / apocalyptic / law each run a different method), testament (NT
discourse tools vs. OT Masoretic markers), data sparsity (degraded-data fallback),
size/refusal (too-short pericope, anthology book). Each branch earns exactly one
representative scenario. Testing the *same* branch on several passages (grounded
NT-epistle output on Philippians *and* Colossians *and* Ephesians) is redundant —
**passage variety is not failure-mode variety.** Keep the edge passage when it is the
only way to reach a branch (Obadiah = sparse data, Psalms = anthology, Job = wisdom
genre); cut it when it re-tests a covered branch. By this rule exegetical-notes
(21 GREEN scenarios, a third of the suite) collapses to roughly one-per-branch — it is
the most complex skill (all genres, both testaments, all data types), so it keeps more
scenarios than the others, but far fewer than 21.

## Relationship to CLAUDE.md

CLAUDE.md previously stated RED+GREEN per skill is "non-negotiable" for every change.
This ADR amends that: **GREEN (pinned, absolute) is the standard for a skill to be
considered working; RED is the authoring record and periodic audit.** CLAUDE.md is
updated to match.
