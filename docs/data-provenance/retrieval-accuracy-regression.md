# Retrieval accuracy regression evidence

The retrieval regression covers unsupported conclusions introduced while compressing
otherwise usable biblical tool results. Expectations below were checked against live
MCP responses on 2026-09-30; they are corpus-relative, not claims that every scholarly
edition must count or annotate identically.

| Claim under test | Source query | Observed evidence |
| --- | --- | --- |
| חוט occurs only once in the OT | `query_lemmas(lemmas=["H2339"])` | Seven occurrences distributed across seven books; one is in Ecclesiastes 4. |
| משלש at Ecclesiastes 4:12 is the only Pual participle of this verb | `query_morphology` for Ecclesiastes 4:12 and Genesis 15:9, `fields: full` | Both contain H8027 as masculine singular Pual passive participle; Genesis also has feminine forms. |
| Delitzsch cites Proverbs 11:28 for this passage | `commentary_lookup` for Ecclesiastes 4:7-12, `keil-delitzsch` | Five returned entries contain no such citation. This establishes only what the returned passage supports. |
| No paragraph marker proves continuity at 4:7 | `query_paragraph_breaks` for Ecclesiastes, chapter 4 | Empty marker list; `evidence_scope.absence_does_not_attest` explicitly includes `no_literary_unit_boundary`. |
| אי occurs at 10:10 | `query_morphology` for Ecclesiastes 9:1-10:16 with `word_filter: אי` | H0337 is returned at 10:16. |
| שכר occurs at 9:1 | `query_morphology` for Ecclesiastes 9:1-9:5 with `word_filter: שָׂכָר` | H7939 is returned at 9:5. |

All checked responses had no continuation cursor. Morphology provenance names MACULA
Hebrew (Clear Bible/Groves Center, CC BY 4.0) and MorphHB (Open Scriptures, CC BY 4.0).
Paragraph evidence comes from MorphHB/WLC; commentary is the public-domain
Keil-Delitzsch corpus. Dataset versions were null, so no version pin is claimed.
Full attribution: https://coa.davebream.com/legal/datasets.

The GREEN assertions inspect actual successful tool results, scoped to parent calls
for independent notes verification. A separate rubric checks that the output applies
the evidence correctly, rather than merely mentioning the tools or copying the draft
errors. The missing-source scenario requires an incomplete outcome, not an invented
attribution or a false assertion that an unavailable source has been refuted.

## Validation record — 2026-09-30

The Sonnet RED audit still reproduced unsupported claims: it gave an approximately
eight-occurrence count for H2339 and invented a narrower semantic uniqueness claim
without source access. It did hedge the Delitzsch attribution. This is changed
failure reproduction, not a reason to weaken the GREEN requirements. The requested
`sonnet` alias resolved to `claude-sonnet-5` in this runtime; no version beyond that
was observed or certified by this run.

| Check | Result |
| --- | --- |
| Ordinary retrieval GREEN | Both contract and Ecclesiastes accuracy cases passed |
| Deep-study retrieval GREEN | Both provenance and Ecclesiastes accuracy cases passed |
| Deep-study verification GREEN | Unknown evidence remained unresolved |
| Smoke GREEN | Passed |
| Notes GREEN | Initial run exposed reliance on child morphology results; independent-check instructions were strengthened. Final rerun was cancelled before completion. |
| Workflow GREEN | Initial runner closed after launch; background-session handling was fixed and unit-tested. Final rerun was cancelled before completion. |
| Citation-grounding GREEN | Strengthened against caveat-only corrections; run cancelled before completion |

Further model evaluations were stopped at the maintainer's request. Cancelled runs
are not recorded as passes. Completed final traces above reported only Sonnet;
an earlier background Haiku observation caused a hard failure and led to the
evaluation-child-only model remapping described in ADR 0002. Deterministic checks
cover model rejection/defaults, Opus propagation through repair, source-result
failures, pagination, and independent verification metadata.
