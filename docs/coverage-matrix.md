# RED Scenario Coverage Matrix

**Last updated:** 2026-05-04
**Total RED scenarios:** 51 (skills) + 14 (agents) = 65

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
| arg-S1 | argument-flow | Phil 2:1-4 | Philippians | Epistle | Connective-skipping | query_morphology, query_discourse_features |
| arg-S3 | argument-flow | Phil 4:4-7 | Philippians | Epistle | Devotional drift | query_morphology, query_discourse_features |
| arg-S4 | argument-flow | Col 1:15-20 | Colossians | Epistle | Overconfident structural claims | query_morphology, query_discourse_features |
| arg-S5 | argument-flow | Eph 2:8-9 | Ephesians | Epistle | Mode confusion | query_morphology, query_discourse_features |
| arg-ADV1 | argument-flow | 1 Cor 13:1-3 | 1 Corinthians | Epistle | User pressure compliance | query_morphology, query_discourse_features |
| arg-S6 | argument-flow | Gen 18:23-29 | Genesis | Narrative | Speaker-unaware dialogue | query_speakers |
| arg-S8 | argument-flow | Rom 8:28-30 | Romans | Epistle | Clause annotations absent | query_syntax |
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
| peri-S1 | pericope-delimitation | Eph 4:1-6 | Ephesians | Epistle | Truncated pericope accepted | query_discourse_features |
| peri-S4 | pericope-delimitation | Gen 37:2-11 | Genesis | Narrative | Narrative-only OT reasoning | query_discourse_features |
| peri-S7 | pericope-delimitation | Gal 2:20 | Galatians | Epistle | Fame-based leniency | query_discourse_features |
| peri-S10 | pericope-delimitation | Rom 1:16-17 | Romans | Epistle | Authority-bias validation | query_discourse_features |
| peri-S11 | pericope-delimitation | Gen 3:14-19 | Genesis | Narrative | Speaker-unaware boundary | query_speakers |
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
| Law | 0 | 0 | 0 | 0 | 0 |
| Poetry/Wisdom | 0 | 0 | 2 (Ps) | 0 | 0 |
| Prophecy | 0 | 0 | 0 | 0 | 0 |
| Apocalyptic | 1 (Rev) | 0 | 1 (Rev) | 0 | 0 |
| Epistle | 9 | 6 | 4 | 4 | 8 |
| Gospel | 1 (John) | 0 | 1 (John) | 0 | 0 |

_Cells showing 0 are coverage gaps._

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
| query_places | — | ✗ NOT COVERED |
| query_events | — | ✗ NOT COVERED |
| query_themes | — | ✗ NOT COVERED |
| query_lexicon | — | ✗ NOT COVERED |
| query_timeline | — | ✗ NOT COVERED |
| query_parallel_text | — | ✗ NOT COVERED |
| query_book_outline | — | ✗ NOT COVERED |
| query_pericope | — | ✗ NOT COVERED |
| query_topic | — | ✗ NOT COVERED |
| query_doctrine | — | ✗ NOT COVERED |
