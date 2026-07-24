# Third-Party Data Attribution

This file's MCP dataset section is generated from `server/src/provenance/registry.ts`.
Do not edit the MCP section by hand — run `npx tsx scripts/generate-notices.ts`.

## Abbott-Smith Lexicon

- **ID:** `abbott_smith`
- **Creator:** G. Abbott-Smith (via STEP Bible packaging) (https://www.stepbible.org/)
- **Source:** https://github.com/STEPBible/STEPBible-Data
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Abbott-Smith Manual Greek Lexicon of the New Testament, public domain; distributed via STEP Bible data (CC BY 4.0 packaging).
- **Modifications:** Extracted into lexicon_abbott_smith for Greek lexicon entries.
- **MCP tools:** query_lexicon
- **Special conditions:**
- Underlying lexicon text is public domain; STEP packaging attribution applies where relevant.

## Brown-Driver-Briggs Hebrew Lexicon (via TBESH)

- **ID:** `bdb`
- **Creator:** Francis Brown, S. R. Driver, Charles A. Briggs (via STEP Bible TBESH) (https://www.stepbible.org/)
- **Source:** https://github.com/STEPBible/STEPBible-Data
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Hebrew definitions derived from Brown-Driver-Briggs via STEPBible TBESH, CC BY 4.0 packaging.
- **Modifications:** Loaded into lexicon_bdb for Hebrew lexicon entries.
- **MCP tools:** query_lexicon
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## American Standard Version (1901)

- **ID:** `bible_asv`
- **Creator:** American Revision Committee
- **Source:** https://bible.helloao.org/docs/reference/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** American Standard Version (1901), public domain.
- **Modifications:** Ingested into bible_text for bible_lookup and parallel_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- None

## Berean Standard Bible

- **ID:** `bible_bsb`
- **Creator:** Bible Hub / Berean Bible (https://berean.bible/)
- **Source:** https://berean.bible/licensing.htm
- **Rights:** public-domain — Public Domain (BSB dedication) ([license](https://berean.bible/licensing.htm))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Berean Standard Bible text. The BSB has been dedicated to the public domain (see berean.bible/licensing.htm).
- **Modifications:** Ingested via HelloAO Bible API source metadata into bible_text for bible_lookup and parallel_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- Official public-domain dedication: https://berean.bible/licensing.htm

## Darby Bible

- **ID:** `bible_darby`
- **Creator:** John Nelson Darby
- **Source:** https://bible.helloao.org/docs/reference/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Darby Bible translation, public domain.
- **Modifications:** Ingested into bible_text (id DBY) for bible_lookup and parallel_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- None

## King James Version (1769)

- **ID:** `bible_kjv`
- **Creator:** Public domain translators (1769 Blayney edition lineage)
- **Source:** https://bible.helloao.org/docs/reference/
- **Rights:** public-domain — Public Domain (US); UK jurisdiction caveat
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** King James Version text. Public domain in the United States; Crown rights may still apply in the United Kingdom.
- **Modifications:** Ingested from scrollmapper / HelloAO public-domain translation corpora into bible_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- Treated as public domain for US hosting. In the United Kingdom, Crown copyright / letterspatent considerations may still apply to the KJV text.

## World English Bible

- **ID:** `bible_web`
- **Creator:** Rainbow Missions / WEB publishers (https://worldenglish.bible/)
- **Source:** https://worldenglish.bible/
- **Rights:** public-domain — Public Domain Mark ([license](https://worldenglish.bible/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** World English Bible text is in the public domain (see worldenglish.bible).
- **Modifications:** Ingested via HelloAO Bible API source metadata into bible_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- Official public-domain statement: https://worldenglish.bible/

## Young's Literal Translation

- **ID:** `bible_ylt`
- **Creator:** Robert Young
- **Source:** https://bible.helloao.org/docs/reference/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Young's Literal Translation, public domain.
- **Modifications:** Ingested into bible_text for bible_lookup and parallel_text.
- **MCP tools:** bible_lookup, parallel_text, list_books
- **Special conditions:**
- None

## Clear Bible / FCBH Speaker Quotations

- **ID:** `clear_bible_speakers`
- **Creator:** Clear Bible, Inc. / Faith Comes By Hearing (https://github.com/Clear-Bible)
- **Source:** https://github.com/Clear-Bible/speaker-quotations
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** MACULA Quotation and Speaker Data (CC BY 4.0), Clear Bible, Inc. Angel-of-the-LORD attributions to Jesus reflect FCBH Christophany interpretation, not settled exegesis.
- **Modifications:** Speaker metadata and quotation spans loaded for query_speakers and OT structure speech transitions.
- **MCP tools:** query_speakers, query_ot_structure
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Claude of Alexandria Canonical Book Metadata

- **ID:** `coa_canonical`
- **Creator:** Claude of Alexandria (https://github.com/davebream/claude-of-alexandria)
- **Source:** https://github.com/davebream/claude-of-alexandria
- **Rights:** project-owned — Project-owned curation
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Canonical book list and display-name metadata curated by Claude of Alexandria.
- **Modifications:** Original project metadata for book names, testament grouping, and tool catalogs.
- **MCP tools:** list_books
- **Special conditions:**
- None

## Claude of Alexandria Controversy Summaries

- **ID:** `coa_controversies`
- **Creator:** Claude of Alexandria (https://github.com/davebream/claude-of-alexandria)
- **Source:** https://github.com/davebream/claude-of-alexandria
- **Rights:** project-owned — Project-owned curation
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Controversy topic summaries curated from scholarship citations by Claude of Alexandria. Present as curated overview, not settled dogma.
- **Modifications:** Original curated summaries with scholarly citations; may reference Theographic/TIPNR event identifiers.
- **MCP tools:** query_controversies, query_events
- **Special conditions:**
- Neutrality caveat remains part of the tool response contract.

## Claude of Alexandria Liturgical Calendar Curation

- **ID:** `coa_liturgical`
- **Creator:** Claude of Alexandria (https://github.com/davebream/claude-of-alexandria)
- **Source:** https://github.com/davebream/claude-of-alexandria
- **Rights:** project-owned — Project-owned curation (RCL readings attributed per record)
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Liturgical seasons and readings curated by Claude of Alexandria, with Revised Common Lectionary readings attributed per record.
- **Modifications:** Curated liturgical migrations; individual readings retain source labels such as Revised Common Lectionary.
- **MCP tools:** liturgical_lookup
- **Special conditions:**
- Methodology and source notes are project documentation rather than an external dataset license.

## Claude of Alexandria Thematic Keyword Curation

- **ID:** `coa_thematic`
- **Creator:** Claude of Alexandria (https://github.com/davebream/claude-of-alexandria)
- **Source:** https://github.com/davebream/claude-of-alexandria
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Thematic keyword groups and lemma-to-theme mappings curated by Claude of Alexandria (CC BY-SA 4.0).
- **Modifications:** Project-created thematic classifications over MorphGNT/MorphHB lemmas.
- **MCP tools:** list_books, query_vocabulary, query_themes_for_lemmas, query_theme_distribution, query_lemmas
- **Special conditions:**
- None

## Adam Clarke Bible Commentary

- **ID:** `commentary_adam_clarke`
- **Creator:** Adam Clarke
- **Source:** https://www.sacred-texts.com/bib/cmt/clarke/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Adam Clarke Bible Commentary, public domain.
- **Modifications:** Normalized into commentary_entries with commentary id adam-clarke.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- None

## Jamieson-Fausset-Brown Bible Commentary

- **ID:** `commentary_jfb`
- **Creator:** Robert Jamieson, A. R. Fausset, David Brown
- **Source:** https://www.sacred-texts.com/bib/cmt/jfb/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Jamieson-Fausset-Brown Bible Commentary, public domain.
- **Modifications:** Normalized into commentary_entries with commentary id jamieson-fausset-brown.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- None

## John Gill Bible Commentary

- **ID:** `commentary_john_gill`
- **Creator:** John Gill
- **Source:** https://www.sacred-texts.com/bib/cmt/gill/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** John Gill Exposition of the Bible, public domain.
- **Modifications:** Normalized into commentary_entries with commentary id john-gill.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- None

## Keil-Delitzsch Old Testament Commentary

- **ID:** `commentary_keil_delitzsch`
- **Creator:** C. F. Keil and Franz Delitzsch
- **Source:** https://www.sacred-texts.com/bib/cmt/kad/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Keil-Delitzsch Commentary on the Old Testament, public domain.
- **Modifications:** Normalized into commentary_entries with commentary id keil-delitzsch.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- None

## Matthew Henry Bible Commentary

- **ID:** `commentary_matthew_henry`
- **Creator:** Matthew Henry
- **Source:** https://www.sacred-texts.com/bib/cmt/mhc/
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Matthew Henry Commentary on the Whole Bible, public domain.
- **Modifications:** Normalized into commentary_entries with commentary id matthew-henry.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- None

## Tyndale Open Study Notes

- **ID:** `commentary_tyndale`
- **Creator:** Tyndale House Publishers (https://www.tyndale.com/)
- **Source:** https://github.com/TyndaleHousePublishers/tyndale-open-study-notes
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Tyndale Open Study Notes, CC BY-SA 4.0, Tyndale House Publishers.
- **Modifications:** Normalized into commentary_entries with commentary id tyndale.
- **MCP tools:** commentary_lookup, list_books
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Creeds.json Confessional Corpus

- **ID:** `creeds_json`
- **Creator:** NonlinearFruit / Creeds.json contributors (https://github.com/NonlinearFruit/Creeds.json)
- **Source:** https://github.com/NonlinearFruit/Creeds.json
- **Rights:** public-domain — Unlicense / public domain (selected documents) ([license](https://github.com/NonlinearFruit/Creeds.json))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Confessional texts from Creeds.json (Unlicense / public-domain documents only). Copyrighted creeds listed upstream are excluded.
- **Modifications:** Selected public-domain creeds, catechisms, and confessions ingested; explicitly copyrighted documents excluded from production.
- **MCP tools:** confessional_lookup
- **Special conditions:**
- Upstream Creeds.json documents that require permission are not published.
- Source revision was not pinned at import; disclosed as unversioned.

## Glyssen Character Metadata

- **ID:** `glyssen`
- **Creator:** SIL LSDev / FCBH (https://github.com/sillsdev/glyssen)
- **Source:** https://github.com/sillsdev/glyssen
- **Rights:** open-license — MIT License ([license](https://opensource.org/licenses/MIT))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Glyssen character metadata, MIT License, SIL LSDev / FCBH.
- **Modifications:** Character gender/age/divinity metadata merged into speaker responses.
- **MCP tools:** query_speakers
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Levinsohn Greek New Testament Discourse Features

- **ID:** `lgntdf`
- **Creator:** SIL International (https://www.sil.org/)
- **Source:** https://github.com/biblicalhumanities/levinsohn
- **Rights:** custom-license — SIL International LGNTDF EULA ([license](https://github.com/biblicalhumanities/levinsohn/blob/master/LICENSE.md))
- **Version:** badd3a1043aebfa9907d0515069a4be1dd6eeb7a
- **Attribution:** LGNTDF references marked "LGNTDF" are from Levinsohn Greek New Testament Discourse Features, Copyright 2016 SIL International®. With online or electronic quotations, link "LGNTDF" to https://github.com/biblicalhumanities/levinsohn and "SIL International®" to http://sil.org. Greek text referenced is from the Greek New Testament NA27/UBS4
- **Modifications:** Normalized into D1 tables discourse_features and ot_quotes; word-position indexes preserved. OT quotation Greek text merged with STEP Bible OT source references. OpenGNT Levinsohn boundary columns extracted into discourse_boundaries.
- **MCP tools:** query_discourse_features, query_ot_quotes
- **Special conditions:**
- May not be sold as a standalone product.
- Commercial works in which LGNTDF exceeds 25% of content require a separate SIL licensing agreement.
- Giving away LGNTDF for use with a commercial product, or selling a work containing more than 25% LGNTDF, requires a SIL license and annual reporting of units sold, distributed, and/or downloaded.
- This MCP attribution repair does not constitute commercial permission from SIL.

## MACULA Hebrew Linguistic Datasets

- **ID:** `macula_hebrew`
- **Creator:** Clear Bible, Inc. / Groves Center (https://github.com/Clear-Bible)
- **Source:** https://github.com/Clear-Bible/macula-hebrew
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** MACULA Hebrew linguistic datasets, CC BY 4.0, Clear Bible, Inc. and contributors.
- **Modifications:** OT morphology enrichment, syntax/participant features for query_ot_structure, and related gloss/transliteration layers. SDBH columns excluded (permission-based, not open).
- **MCP tools:** query_morphology, query_ot_structure, query_syntax
- **Special conditions:**
- SDBH material is not published.
- Source revision was not pinned at import; disclosed as unversioned.

## MorphGNT SBLGNT Morphology

- **ID:** `morphgnt`
- **Creator:** MorphGNT Project (https://github.com/morphgnt)
- **Source:** https://github.com/morphgnt/sblgnt
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) ([license](https://creativecommons.org/licenses/by-sa/3.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** MorphGNT morphology and lemmatization, CC BY-SA 3.0, MorphGNT Project.
- **Modifications:** Normalized into vocabulary and lemma-distribution tables for NT tools.
- **MCP tools:** query_vocabulary, query_lemmas, query_themes_for_lemmas, query_theme_distribution
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Open Scriptures Hebrew Bible (MorphHB) / Westminster Leningrad Codex

- **ID:** `morphhb`
- **Creator:** Open Scriptures (https://github.com/openscriptures)
- **Source:** https://github.com/openscriptures/morphhb
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Open Scriptures Hebrew Bible morphological markup, CC BY 4.0. Underlying Westminster Leningrad Codex text is public domain.
- **Modifications:** OT morphology, vocabulary, lemma distribution, and Masoretic paragraph markers derived from MorphHB markup. Paragraph markers regenerated with checksum-verified extraction (see docs/data-provenance/paragraph-markers.md).
- **MCP tools:** query_paragraph_breaks, query_vocabulary, query_lemmas, query_themes_for_lemmas, query_theme_distribution, query_morphology
- **Special conditions:**
- WLC base text is public domain; MorphHB morphological markup is CC BY 4.0.
- Source revision may be pinned per subsystem; unversioned entries disclose null version.

## OpenBible.info Cross-References

- **ID:** `openbible_xref`
- **Creator:** OpenBible.info (https://www.openbible.info/)
- **Source:** https://www.openbible.info/labs/cross-references/
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Cross-reference edges reflect the OpenBible.info editorial tradition with community vote weights; each hop is an attributed association, not an asserted theological dependence. CC BY 4.0.
- **Modifications:** Normalized into cross-reference edge tables for lookup and path tracing.
- **MCP tools:** query_cross_references, trace_cross_reference_path
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## OpenGNT / OGNT

- **ID:** `opengnt`
- **Creator:** Eliran Wong (https://github.com/eliranwong)
- **Source:** https://github.com/eliranwong/OpenGNT
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** OpenGNT / OGNT data © Eliran Wong, CC BY-SA 4.0. Levinsohn discourse boundary columns retained under SIL LGNTDF terms.
- **Modifications:** Selected columns ingested for morphology, syntax (OpenText annotations), variant flags, and Levinsohn discourse boundaries. Permission-only columns (e.g. Mounce, SDBH, Louw-Nida lexical material) are excluded from the published corpus.
- **MCP tools:** query_morphology, query_syntax, query_variants, query_discourse_features
- **Special conditions:**
- Upstream OpenGNT mixes rights across columns; CoA publishes only columns treated as open or LGNTDF-derived.
- Source revision was not pinned at import; disclosed as unversioned.

## OpenText.org Linguistic Annotations

- **ID:** `opentext`
- **Creator:** OpenText.org (https://www.opentext.org/)
- **Source:** https://github.com/eliranwong/OpenGNT
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** OpenText original linguistic annotations as packaged in OpenGNT, CC BY-SA 4.0 packaging lineage.
- **Modifications:** Syntax annotations exposed via query_syntax.
- **MCP tools:** query_syntax
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Robinson's Morphological Analysis Codes (RMAC)

- **ID:** `rmac`
- **Creator:** CrossWire Bible Society / MorphGNT (https://github.com/morphgnt)
- **Source:** https://github.com/morphgnt/crosswire-morphgnt
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) ([license](https://creativecommons.org/licenses/by-sa/3.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Robinson's Morphological Analysis Codes (RMAC), CC BY-SA 3.0, CrossWire Bible Society / MorphGNT.
- **Modifications:** RMAC parsing codes exposed through OpenGNT-derived morphology responses.
- **MCP tools:** query_morphology
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Savoy Declaration of Faith

- **ID:** `savoy_declaration`
- **Creator:** Savoy Conference (1658) / Reformed Standards packaging (https://reformedstandards.com/)
- **Source:** https://reformedstandards.com/
- **Rights:** open-license — Apache License 2.0 ([license](https://www.apache.org/licenses/LICENSE-2.0))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Savoy Declaration of Faith, Apache License 2.0 via Reformed Standards packaging where applicable.
- **Modifications:** Published as confessional document slug savoy_declaration when present in the production corpus.
- **MCP tools:** confessional_lookup
- **Special conditions:**
- Ensure production seed uses the Apache-2.0-cleared text, not a permission-only Creeds.json copy.

## SBL Greek New Testament

- **ID:** `sblgnt`
- **Creator:** Society of Biblical Literature / Logos Bible Software (https://www.sblgnt.com/)
- **Source:** https://www.sblgnt.com/license/
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** SBL Greek New Testament text, CC BY 4.0, Society of Biblical Literature and Logos Bible Software.
- **Modifications:** Surface Greek text embedded in MorphGNT-derived morphology and vocabulary responses.
- **MCP tools:** query_vocabulary, query_lemmas, query_themes_for_lemmas, query_theme_distribution, query_morphology
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## STEPBible TFLSJ (Liddell-Scott-Jones)

- **ID:** `step_tflsj`
- **Creator:** Tyndale House / STEP Bible (from Perseus LSJ) (https://www.stepbible.org/)
- **Source:** https://github.com/STEPBible/STEPBible-Data
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Full Liddell-Scott-Jones Greek lexicon via STEPBible TFLSJ, CC BY 4.0.
- **Modifications:** Loaded into lexicon_lsj; used for full Greek lexicon entries and discourse word transliteration joins.
- **MCP tools:** query_lexicon, query_discourse_features
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## STEP Bible Data

- **ID:** `stepbible`
- **Creator:** Tyndale House / STEP Bible (https://www.stepbible.org/)
- **Source:** https://github.com/STEPBible/STEPBible-Data
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** STEP Bible data, CC BY 4.0, Tyndale House Cambridge / STEP Bible.
- **Modifications:** TBESH/TBESG lexicons, TFLSJ (LSJ), Abbott-Smith via STEP packaging, OT-in-NT quotation references, TANTT edition comparison for variants, and selected gloss/transliteration layers.
- **MCP tools:** query_lexicon, query_ot_quotes, query_morphology, query_variants, query_discourse_features
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Theographic Bible Data

- **ID:** `theographic`
- **Creator:** Theographic (https://github.com/robertrouse/theographic-bible-data)
- **Source:** https://github.com/robertrouse/theographic-bible-data
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Entity data: Theographic (CC BY-SA 4.0). Entity identifications may be contested — verify against critical commentaries.
- **Modifications:** People, places, events, and relationship graphs ingested for entity tools.
- **MCP tools:** query_people, query_places, query_events, query_person_network
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Thirty-Nine Articles of Religion

- **ID:** `thirty_nine_articles`
- **Creator:** Church of England (https://www.churchofengland.org/)
- **Source:** https://www.churchofengland.org/prayer-and-worship/worship-texts-and-resources/book-common-prayer/articles-religion
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Thirty-Nine Articles of Religion from The Book of Common Prayer (1662 lineage), public domain. Church of England.
- **Modifications:** Seeded via seed-confessional-anglican-wesleyan.ts as slug thirty_nine_articles.
- **MCP tools:** confessional_lookup
- **Special conditions:**
- None

## TIPNR / OpenBible Geocoding

- **ID:** `tipnr`
- **Creator:** Tyndale House / OpenBible.info (https://www.openbible.info/)
- **Source:** https://www.openbible.info/
- **Rights:** open-license — Creative Commons Attribution 4.0 International (CC BY 4.0) ([license](https://creativecommons.org/licenses/by/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** TIPNR by Tyndale House (CC BY 4.0) / OpenBible geocoding. Verify contested identifications against critical commentaries.
- **Modifications:** Place and person identification layers merged with Theographic entity records.
- **MCP tools:** query_people, query_places, query_events, query_person_network
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## UBS Semantic Domains (SDGNT / SDBH excerpts used)

- **ID:** `ubs_domains`
- **Creator:** United Bible Societies (via OpenGNT / STEP packaging where open) (https://www.unitedbiblesocieties.org/)
- **Source:** https://github.com/eliranwong/OpenGNT
- **Rights:** open-license — Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0) ([license](https://creativecommons.org/licenses/by-sa/4.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** UBS semantic-domain classifications included only where the imported packaging permits republication.
- **Modifications:** Domain tags attached to lexicon entries as ubs-sdgnt / ubs-sdbh source tokens when present.
- **MCP tools:** query_lexicon, query_morphology
- **Special conditions:**
- Full proprietary Louw-Nida / SDBH corpora are excluded where license requires permission.
- Source revision was not pinned at import; disclosed as unversioned.

## UBS/Paratext Versification JSON

- **ID:** `ubs_versification`
- **Creator:** United Bible Societies / Paratext (https://github.com/ubsicap)
- **Source:** https://github.com/ubsicap/versification_json
- **Rights:** open-license — MIT License ([license](https://opensource.org/licenses/MIT))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** UBS/Paratext versification mappings, MIT License.
- **Modifications:** Hebrew–English versification differences loaded for check_versification.
- **MCP tools:** check_versification
- **Special conditions:**
- Source revision was not pinned at import; disclosed as unversioned.

## Wesley's Twenty-Five Articles of Religion

- **ID:** `wesleys_articles`
- **Creator:** John Wesley / Philip Schaff (Creeds of Christendom) (https://www.ccel.org/)
- **Source:** https://www.ccel.org/ccel/schaff/creeds3
- **Rights:** public-domain — Public Domain Mark ([license](https://creativecommons.org/publicdomain/mark/1.0/))
- **Version:** _not pinned at import (unversioned)_
- **Attribution:** Wesley's Twenty-Five Articles of Religion via Philip Schaff, Creeds of Christendom vol. III (1877), public domain (CCEL).
- **Modifications:** Seeded via seed-confessional-anglican-wesleyan.ts as slug wesleys_25_articles.
- **MCP tools:** confessional_lookup
- **Special conditions:**
- None

## Repository-only datasets

See the root `NOTICE` file for Kline Torah units, Sefaria audit fixtures, and other non-MCP corpora.
