# RED Scenario Coverage Matrix

**Last updated:** 2026-05-04
**Total RED scenarios:** 53 (skills) + 11 (agents) = 64 (includes 7 new pairs added by coverage audit)

## Genre Taxonomy

| Genre | Representative Books | Interpretive Method |
|-------|---------------------|-------------------|
| Narrative | Genesis, Exodus (narrative), Joshua–Esther, Jonah, Acts | Scene structure, character analysis, plot arc, discourse markers |
| Law | Exodus 20–40, Leviticus, Numbers (legal), Deuteronomy | Covenantal context, typological fulfillment, redemptive-historical placement |
| Poetry/Wisdom | Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Lamentations | Parallelism, genre-graduated redemptive-historical (indirect for wisdom), poetic structure |
| Prophecy | Isaiah, Jeremiah, Ezekiel, Daniel (prose), Minor Prophets | Oracle structure, historical context, fulfillment mapping, covenant lawsuit |
| Apocalyptic | Daniel 7–12, Revelation | Symbol-referent mapping, OT prophetic backgrounds, visionary report conventions |
| Epistle | Romans–Jude (excluding Revelation) | Argument flow, discourse connectives, occasion/audience, indicative-imperative structure |
| Gospel | Matthew, Mark, Luke, John | Narrative + discourse, pericope boundaries, Christological focus, synoptic comparison |

## Scenario Inventory

| ID | Skill | Passage | Book | Genre | Failure Mode | MCP Tools (GREEN) |
|----|-------|---------|------|-------|-------------|-------------------|
| exeg-S1 | exegetical-notes | Phil 1:1-11 | Philippians | Epistle | Fabricated verification | query_morphology, query_vocabulary, bible_lookup, commentary_lookup |
| exeg-S2 | exegetical-notes | Phil 1:1-11 | Philippians | Epistle | Lexical data-grounding errors | query_morphology, query_vocabulary |
| exeg-S3 | exegetical-notes | Phil 1:1-11 | Philippians | Epistle | Uniform confidence, no tier framework | query_morphology, query_vocabulary |
| exeg-S4 | exegetical-notes | Phil 1:3-8 | Philippians | Epistle | Uncritical pericope acceptance | bible_lookup |
| exeg-S5 | exegetical-notes | Gen 37:2-11 | Genesis | Narrative | Unverified Hebrew claims | query_morphology, query_vocabulary |
| exeg-S7 | exegetical-notes | Rom 3:21-26 | Romans | Epistle | Unverified scholarly attribution | commentary_lookup |
| exeg-S8 | exegetical-notes | Rom 8:28-30 | Romans | Epistle | Unlabeled cross-references | query_cross_references |
| exeg-S9 | exegetical-notes | Gen 22:1-4 | Genesis | Narrative | Entity data ignored | query_people |
| exeg-S10 | exegetical-notes | Gen 3:1-7 | Genesis | Narrative | Speaker data ignored | query_speakers |
| exeg-S11 | exegetical-notes | Gen 1:1-5 | Genesis | Narrative | Cherith gloss authority | query_vocabulary |
| exeg-S12 | exegetical-notes | John 7:53-8:11 | John | Gospel | Textual variants ignored | query_variants |
| exeg-S13 | exegetical-notes | Rom 3:21-26 | Romans | Epistle | NT gloss tiering absent | query_vocabulary |
| exeg-S14 | exegetical-notes | Rev 1:9-20 | Revelation | Apocalyptic | Apocalyptic genre mishandled | query_ot_quotes |
| exeg-S15 | exegetical-notes | Gal 3:10-14 | Galatians | Epistle | Ungrounded citation | commentary_lookup |
| exeg-S16 | exegetical-notes | Col 3:1-11 | Colossians | Epistle | Moralistic without indicative ground | query_morphology |
| exeg-S17 | exegetical-notes | Eph 2:1-10 | Ephesians | Epistle | Missing redemptive-historical link | query_cross_references |
| exeg-S18 | exegetical-notes | Job 38:1-11 | Job | Poetry/Wisdom | Forced narrative arc on wisdom | query_morphology, query_vocabulary |
| exeg-S19 | exegetical-notes | Ecc 1:1-11 | Ecclesiastes | Poetry/Wisdom | Missing genre-graduated method | query_morphology, query_vocabulary |
| exeg-S20 | exegetical-notes | Obadiah 1-4 | Obadiah | Prophecy | No degraded-data fallback | query_places, query_cross_references |
| exeg-S21 | exegetical-notes | Lev 16:1-10 | Leviticus | Law | No covenantal-fulfillment framework | query_ot_quotes, query_morphology |
| arg-S1 | argument-flow | Phil 2:1-4 | Philippians | Epistle | Connective-skipping | query_morphology, query_discourse_features |
| arg-S3 | argument-flow | Phil 4:4-7 | Philippians | Epistle | Devotional drift | query_morphology, query_discourse_features |
| arg-S4 | argument-flow | Col 1:15-20 | Colossians | Epistle | Overconfident structural claims | query_morphology, query_discourse_features |
| arg-S5 | argument-flow | Eph 2:8-9 | Ephesians | Epistle | Mode confusion | query_morphology, query_discourse_features |
| arg-ADV1 | argument-flow | 1 Cor 13:1-3 | 1 Corinthians | Epistle | User pressure compliance | query_morphology, query_discourse_features |
| arg-S6 | argument-flow | Gen 18:23-29 | Genesis | Narrative | Speaker-unaware dialogue | query_speakers |
| arg-S8 | argument-flow | Rom 8:28-30 | Romans | Epistle | Clause annotations absent | query_syntax |
| arg-S9 | argument-flow | Dan 7:9-14 | Daniel | Apocalyptic | Narrative treatment of apocalyptic | query_ot_quotes, query_syntax |
| seg-S1 | biblical-segmentation | Philemon | Philemon | Epistle | Impossible division compliance | query_paragraph_breaks |
| seg-S2 | biblical-segmentation | Revelation | Revelation | Apocalyptic | Single contested framework | query_paragraph_breaks |
| seg-S5 | biblical-segmentation | Psalms 150 | Psalms | Poetry/Wisdom | Mechanical anthology division | query_paragraph_breaks |
| seg-S22 | biblical-segmentation | Gen 37-50 | Genesis | Narrative | Masoretic validation missing | query_paragraph_breaks |
| seg-SL1 | biblical-segmentation | Gen 22:1-13 | Genesis | Narrative | Session framing for slice | query_paragraph_breaks |
| seg-SL2 | biblical-segmentation | Rom 8:1-17 | Romans | Epistle | Mechanical verse-count division | query_discourse_features |
| seg-SL3 | biblical-segmentation | John 3:1-21 | John | Gospel | Dialogue-unaware division | query_speakers |
| seg-SL4 | biblical-segmentation | Psalm 23 | Psalms | Poetry/Wisdom | Short pericope compliance | query_paragraph_breaks |
| seg-SL5 | biblical-segmentation | Gen 24:1-67 | Genesis | Narrative | User-count deference | query_paragraph_breaks |
| seg-SL6 | biblical-segmentation | Rom 12:1-21 | Romans | Epistle | Method-unaware slicing | query_discourse_features |
| seg-S23 | biblical-segmentation | Gen 12-25 | Genesis | Narrative | Entity-unaware segmentation | query_people |
| seg-S24 | biblical-segmentation | Job 1:1-5 | Job | Poetry/Wisdom | Pure narrative segmentation | query_paragraph_breaks |
| peri-S1 | pericope-delimitation | Eph 4:1-6 | Ephesians | Epistle | Truncated pericope accepted | query_discourse_features |
| peri-S4 | pericope-delimitation | Gen 37:2-11 | Genesis | Narrative | Narrative-only OT reasoning | query_discourse_features |
| peri-S7 | pericope-delimitation | Gal 2:20 | Galatians | Epistle | Fame-based leniency | query_discourse_features |
| peri-S10 | pericope-delimitation | Rom 1:16-17 | Romans | Epistle | Authority-bias validation | query_discourse_features |
| peri-S11 | pericope-delimitation | Gen 3:14-19 | Genesis | Narrative | Speaker-unaware boundary | query_speakers |
| peri-S12 | pericope-delimitation | Ecc 3:1-8 | Ecclesiastes | Poetry/Wisdom | Chapter divisions as boundary | query_discourse_features |
| cbs-S1 | consult-biblical-scholar | Phil 1:1-11 | Philippians | Epistle | Multiple failure modes | query_morphology, query_vocabulary, commentary_lookup |
| cbs-S2 | consult-biblical-scholar | Phil 1:1-11 | Philippians | Epistle | Lexical accuracy | query_morphology, query_vocabulary |
| cbs-S3 | consult-biblical-scholar | Phil 1:1-11 | Philippians | Epistle | Confidence tiers absent | query_morphology, query_vocabulary |
| cbs-S4 | consult-biblical-scholar | Phil 1:3-8 | Philippians | Epistle | Pericope unchecked | query_discourse_features |
| cbs-S5 | consult-biblical-scholar | Gen 37:2-11 | Genesis | Narrative | OT Hebrew unverified | query_morphology, query_vocabulary |
| cbs-S6 | consult-biblical-scholar | Rom 3:21-26 | Romans | Epistle | Verification absent | commentary_lookup |
| cbs-S7 | consult-biblical-scholar | Rom 3:21-26 | Romans | Epistle | Scholarly attribution unverified | commentary_lookup |
| cbs-S8 | consult-biblical-scholar | Rom 8:28-30 | Romans | Epistle | Cross-reference unlabeled | query_cross_references |
| bs-S1 | biblical-scholar (agent) | Phil 1:1-11 | Philippians | Epistle | Agent dispatch without skill | query_morphology, query_vocabulary |
| bs-S2 | biblical-scholar (agent) | Gen 37:2-11 | Genesis | Narrative | OT analysis without skill | query_morphology, query_vocabulary |
| bs-S3 | biblical-scholar (agent) | Rev 1:9-20 | Revelation | Apocalyptic | Apocalyptic without genre governance | query_ot_quotes |
| dr-S1 | data-retriever (agent) | Phil 1:1-11 | Philippians | Epistle | Data retrieval without structure | query_morphology, query_vocabulary |
| dr-S2 | data-retriever (agent) | Gen 37:2-11 | Genesis | Narrative | OT data retrieval | query_morphology, query_vocabulary |
| se-S1 | study-evaluator (agent) | Phil 1:1-11 | Philippians | Epistle | Evaluation without criteria | query_morphology, query_vocabulary |
| se-S2 | study-evaluator (agent) | Gen 37:2-11 | Genesis | Narrative | OT evaluation without criteria | query_morphology, query_vocabulary |

## Genre × Skill Heatmap

| Genre | exegetical-notes | argument-flow | biblical-segmentation | pericope-delimitation | consult-biblical-scholar |
|-------|-----------------|---------------|----------------------|----------------------|-------------------------|
| Narrative | 3 (Gen) | 1 (Gen) | 7 (Gen, Ps) | 2 (Gen) | 1 (Gen) |
| Law | 1 (Lev) ★ | 0 | 0 | 0 | 0 |
| Poetry/Wisdom | 2 (Job, Ecc) ★ | 0 | 3 (Ps, Job) ★ | 1 (Ecc) ★ | 0 |
| Prophecy | 1 (Obadiah) ★ | 0 | 0 | 0 | 0 |
| Apocalyptic | 1 (Rev) | 1 (Dan) ★ | 1 (Rev) | 0 | 0 |
| Epistle | 9 | 6 | 4 | 4 | 8 |
| Gospel | 1 (John) | 0 | 1 (John) | 0 | 0 |

_Cells showing 0 are coverage gaps. ★ = added by coverage audit._

## MCP Tool Coverage

| Tool | GREEN Scenarios Using It | Status |
|------|------------------------|--------|
| query_morphology | exeg-S1/S2/S3/S5/S7/S16, arg-S1/S3/S4/S5/ADV1/S6, cbs-S1/S2/S3/S5, bs-S1/S2, dr-S1/S2, se-S1/S2 | ✓ Covered |
| query_vocabulary | exeg-S1/S2/S3/S5/S11/S13, cbs-S1/S2/S3/S5, bs-S1/S2, dr-S1/S2, se-S1/S2 | ✓ Covered |
| bible_lookup | exeg-S1/S4 | ✓ Covered |
| commentary_lookup | exeg-S1/S7/S15, cbs-S1/S6/S7 | ✓ Covered |
| query_cross_references | exeg-S8/S17 | ✓ Covered |
| query_people | exeg-S9, seg-S23 | ✓ Covered |
| query_speakers | exeg-S10, arg-S6, peri-S11, seg-SL3 | ✓ Covered |
| query_variants | exeg-S12 | ✓ Covered |
| query_syntax | arg-S8 | ✓ Covered |
| query_discourse_features | arg-S1/S3/S4/S5/ADV1, seg-SL2/SL6, peri-S1/S4/S7/S10/S11 | ✓ Covered |
| query_paragraph_breaks | seg-S1/S2/S22/SL1/SL4/SL5 | ✓ Covered |
| query_ot_quotes | exeg-S14, bs-S3 | ✓ Covered |
| query_places | exeg-S20 (Obadiah — degraded-data scenario) ★ | ✓ Covered (degraded-data path) |
| query_events | — | ✗ NOT COVERED |
| query_theme | — | ✗ NOT COVERED |
| query_lexicon | — | ✗ NOT COVERED |
| parallel_text | — | ✗ NOT COVERED |
| confessional_lookup | — | ✗ NOT COVERED |

## Gap Analysis — Top 5 Priority Cells

### Gap 1: Poetry/Wisdom — Job (exegetical-notes)
**Genre:** Poetry/Wisdom | **Book:** Job | **Skills affected:** exegetical-notes, biblical-segmentation
**Rationale:** Zero wisdom poetry beyond Psalms in RED. Job's theodicy genre requires genre-graduated redemptive-historical method (indirect, not direct arc). Exercises query_speakers (God's speech from whirlwind) and query_theme.
**Failure mode expected:** Bare model forces narrative arc on wisdom poetry; reads Job as moral instruction without theodicy context.

### Gap 2: Poetry/Wisdom — Ecclesiastes (exegetical-notes, pericope-delimitation)
**Genre:** Poetry/Wisdom | **Book:** Ecclesiastes | **Skills affected:** exegetical-notes, pericope-delimitation
**Rationale:** Genre-graduated redemptive-historical approach needed. Bare model likely flattens "meaningless" (hebel) into nihilism or forces premature resolution.
**Failure mode expected:** Missing genre-graduated method; flat reading without canonical-literary framing.

### Gap 3: Sparse-MCP-data passage — Obadiah (exegetical-notes)
**Genre:** Prophecy | **Book:** Obadiah | **Skills affected:** exegetical-notes
**Rationale:** Tests degraded-data fallback when MCP tools (query_places, query_events, query_people) return EMPTY. Exercises query_cross_references for Edom motif.
**Failure mode expected:** No degraded-data fallback; bare model fills sparse data with training-knowledge hallucinations.

### Gap 4: Law — Leviticus 16 (exegetical-notes)
**Genre:** Law | **Book:** Leviticus | **Skills affected:** exegetical-notes
**Rationale:** Zero law genre scenarios. Day of Atonement ritual requires covenantal-fulfillment framework (Heb 9 typology). Exercises query_ot_quotes, query_theme.
**Failure mode expected:** Flat application of OT ritual law without covenantal fulfillment; either dismissed as irrelevant or applied moralistically.

### Gap 5: OT Apocalyptic — Daniel 7 (argument-flow)
**Genre:** Apocalyptic | **Book:** Daniel | **Skills affected:** argument-flow
**Rationale:** Only NT apocalyptic (Rev) tested. OT apocalyptic has different tool coverage (parallel_text, query_ot_quotes). Daniel 7 is the "son of man" source text for NT Christology.
**Failure mode expected:** Symbolic imagery treated as narrative sequence; no genre governance for OT apocalyptic.
