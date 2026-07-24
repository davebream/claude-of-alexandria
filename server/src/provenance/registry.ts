import type { DatasetRegistryEntry } from './types.js';
import { LGNTDF_ATTRIBUTION } from './types.js';

const CC_BY_4 = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';
const CC_BY_SA_4 = 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)';
const CC_BY_SA_3 = 'Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)';
const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';
const CC_BY_SA_4_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const CC_BY_SA_3_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';
const PDM = 'Public Domain Mark';
const PDM_URL = 'https://creativecommons.org/publicdomain/mark/1.0/';

/**
 * Canonical dataset registry for MCP provenance, /legal/datasets, and NOTICE generation.
 * IDs are stable public identifiers used in provenance.datasets[].id and record source_ids.
 */
export const DATASET_REGISTRY: Record<string, DatasetRegistryEntry> = {
  lgntdf: {
    id: 'lgntdf',
    title: 'Levinsohn Greek New Testament Discourse Features',
    creator: 'SIL International',
    creator_url: 'https://www.sil.org/',
    attribution: LGNTDF_ATTRIBUTION,
    source_url: 'https://github.com/biblicalhumanities/levinsohn',
    rights: {
      status: 'custom-license',
      name: 'SIL International LGNTDF EULA',
      url: 'https://github.com/biblicalhumanities/levinsohn/blob/master/LICENSE.md',
    },
    version: 'badd3a1043aebfa9907d0515069a4be1dd6eeb7a',
    modifications:
      'Normalized into D1 tables discourse_features and ot_quotes; word-position indexes preserved. '
      + 'OT quotation Greek text merged with STEP Bible OT source references. '
      + 'OpenGNT Levinsohn boundary columns extracted into discourse_boundaries.',
    mcp_tools: ['query_discourse_features', 'query_ot_quotes'],
    special_conditions: [
      'May not be sold as a standalone product.',
      'Commercial works in which LGNTDF exceeds 25% of content require a separate SIL licensing agreement.',
      'Giving away LGNTDF for use with a commercial product, or selling a work containing more than 25% LGNTDF, requires a SIL license and annual reporting of units sold, distributed, and/or downloaded.',
      'This MCP attribution repair does not constitute commercial permission from SIL.',
    ],
    project_surfaces: ['MCP', 'biblical-segmentation skill reference data'],
    mcp_published: true,
  },

  opengnt: {
    id: 'opengnt',
    title: 'OpenGNT / OGNT',
    creator: 'Eliran Wong',
    creator_url: 'https://github.com/eliranwong',
    attribution: 'OpenGNT / OGNT data © Eliran Wong, CC BY-SA 4.0. Levinsohn discourse boundary columns retained under SIL LGNTDF terms.',
    source_url: 'https://github.com/eliranwong/OpenGNT',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications:
      'Selected columns ingested for morphology, syntax (OpenText annotations), variant flags, and Levinsohn discourse boundaries. '
      + 'Permission-only columns (e.g. Mounce, SDBH, Louw-Nida lexical material) are excluded from the published corpus.',
    mcp_tools: ['query_morphology', 'query_syntax', 'query_variants', 'query_discourse_features'],
    special_conditions: [
      'Upstream OpenGNT mixes rights across columns; CoA publishes only columns treated as open or LGNTDF-derived.',
      'Source revision was not pinned at import; disclosed as unversioned.',
    ],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  rmac: {
    id: 'rmac',
    title: "Robinson's Morphological Analysis Codes (RMAC)",
    creator: 'CrossWire Bible Society / MorphGNT',
    creator_url: 'https://github.com/morphgnt',
    attribution: "Robinson's Morphological Analysis Codes (RMAC), CC BY-SA 3.0, CrossWire Bible Society / MorphGNT.",
    source_url: 'https://github.com/morphgnt/crosswire-morphgnt',
    rights: { status: 'open-license', name: CC_BY_SA_3, url: CC_BY_SA_3_URL },
    version: null,
    modifications: 'RMAC parsing codes exposed through OpenGNT-derived morphology responses.',
    mcp_tools: ['query_morphology'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  morphgnt: {
    id: 'morphgnt',
    title: 'MorphGNT SBLGNT Morphology',
    creator: 'MorphGNT Project',
    creator_url: 'https://github.com/morphgnt',
    attribution: 'MorphGNT morphology and lemmatization, CC BY-SA 3.0, MorphGNT Project.',
    source_url: 'https://github.com/morphgnt/sblgnt',
    rights: { status: 'open-license', name: CC_BY_SA_3, url: CC_BY_SA_3_URL },
    version: null,
    modifications: 'Normalized into vocabulary and lemma-distribution tables for NT tools.',
    mcp_tools: [
      'query_vocabulary', 'query_lemmas', 'query_themes_for_lemmas', 'query_theme_distribution',
    ],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP', 'plugin morphology reference JSON'],
    mcp_published: true,
  },

  sblgnt: {
    id: 'sblgnt',
    title: 'SBL Greek New Testament',
    creator: 'Society of Biblical Literature / Logos Bible Software',
    creator_url: 'https://www.sblgnt.com/',
    attribution: 'SBL Greek New Testament text, CC BY 4.0, Society of Biblical Literature and Logos Bible Software.',
    source_url: 'https://www.sblgnt.com/license/',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Surface Greek text embedded in MorphGNT-derived morphology and vocabulary responses.',
    mcp_tools: [
      'query_vocabulary', 'query_lemmas', 'query_themes_for_lemmas', 'query_theme_distribution', 'query_morphology',
    ],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP', 'plugin morphology reference JSON'],
    mcp_published: true,
  },

  morphhb: {
    id: 'morphhb',
    title: 'Open Scriptures Hebrew Bible (MorphHB) / Westminster Leningrad Codex',
    creator: 'Open Scriptures',
    creator_url: 'https://github.com/openscriptures',
    attribution:
      'Open Scriptures Hebrew Bible morphological markup, CC BY 4.0. '
      + 'Underlying Westminster Leningrad Codex text is public domain.',
    source_url: 'https://github.com/openscriptures/morphhb',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications:
      'OT morphology, vocabulary, lemma distribution, and Masoretic paragraph markers derived from MorphHB markup. '
      + 'Paragraph markers regenerated with checksum-verified extraction (see docs/data-provenance/paragraph-markers.md).',
    mcp_tools: [
      'query_paragraph_breaks', 'query_vocabulary', 'query_lemmas', 'query_themes_for_lemmas',
      'query_theme_distribution', 'query_morphology',
    ],
    special_conditions: [
      'WLC base text is public domain; MorphHB morphological markup is CC BY 4.0.',
      'Source revision may be pinned per subsystem; unversioned entries disclose null version.',
    ],
    project_surfaces: ['MCP', 'Masoretic paragraph provenance docs'],
    mcp_published: true,
  },

  macula_hebrew: {
    id: 'macula_hebrew',
    title: 'MACULA Hebrew Linguistic Datasets',
    creator: 'Clear Bible, Inc. / Groves Center',
    creator_url: 'https://github.com/Clear-Bible',
    attribution: 'MACULA Hebrew linguistic datasets, CC BY 4.0, Clear Bible, Inc. and contributors.',
    source_url: 'https://github.com/Clear-Bible/macula-hebrew',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications:
      'OT morphology enrichment, syntax/participant features for query_ot_structure, and related gloss/transliteration layers. '
      + 'SDBH columns excluded (permission-based, not open).',
    mcp_tools: ['query_morphology', 'query_ot_structure', 'query_syntax'],
    special_conditions: ['SDBH material is not published.', 'Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  stepbible: {
    id: 'stepbible',
    title: 'STEP Bible Data',
    creator: 'Tyndale House / STEP Bible',
    creator_url: 'https://www.stepbible.org/',
    attribution: 'STEP Bible data, CC BY 4.0, Tyndale House Cambridge / STEP Bible.',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications:
      'TBESH/TBESG lexicons, TFLSJ (LSJ), Abbott-Smith via STEP packaging, OT-in-NT quotation references, '
      + 'TANTT edition comparison for variants, and selected gloss/transliteration layers.',
    mcp_tools: [
      'query_lexicon', 'query_ot_quotes', 'query_morphology', 'query_variants', 'query_discourse_features',
    ],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  step_tflsj: {
    id: 'step_tflsj',
    title: 'STEPBible TFLSJ (Liddell-Scott-Jones)',
    creator: 'Tyndale House / STEP Bible (from Perseus LSJ)',
    creator_url: 'https://www.stepbible.org/',
    attribution: 'Full Liddell-Scott-Jones Greek lexicon via STEPBible TFLSJ, CC BY 4.0.',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Loaded into lexicon_lsj; used for full Greek lexicon entries and discourse word transliteration joins.',
    mcp_tools: ['query_lexicon', 'query_discourse_features'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  abbott_smith: {
    id: 'abbott_smith',
    title: 'Abbott-Smith Lexicon',
    creator: 'G. Abbott-Smith (via STEP Bible packaging)',
    creator_url: 'https://www.stepbible.org/',
    attribution: 'Abbott-Smith Manual Greek Lexicon of the New Testament, public domain; distributed via STEP Bible data (CC BY 4.0 packaging).',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Extracted into lexicon_abbott_smith for Greek lexicon entries.',
    mcp_tools: ['query_lexicon'],
    special_conditions: ['Underlying lexicon text is public domain; STEP packaging attribution applies where relevant.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bdb: {
    id: 'bdb',
    title: 'Brown-Driver-Briggs Hebrew Lexicon (via TBESH)',
    creator: 'Francis Brown, S. R. Driver, Charles A. Briggs (via STEP Bible TBESH)',
    creator_url: 'https://www.stepbible.org/',
    attribution: 'Hebrew definitions derived from Brown-Driver-Briggs via STEPBible TBESH, CC BY 4.0 packaging.',
    source_url: 'https://github.com/STEPBible/STEPBible-Data',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Loaded into lexicon_bdb for Hebrew lexicon entries.',
    mcp_tools: ['query_lexicon'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  ubs_domains: {
    id: 'ubs_domains',
    title: 'UBS Semantic Domains (SDGNT / SDBH excerpts used)',
    creator: 'United Bible Societies (via OpenGNT / STEP packaging where open)',
    creator_url: 'https://www.unitedbiblesocieties.org/',
    attribution: 'UBS semantic-domain classifications included only where the imported packaging permits republication.',
    source_url: 'https://github.com/eliranwong/OpenGNT',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications: 'Domain tags attached to lexicon entries as ubs-sdgnt / ubs-sdbh source tokens when present.',
    mcp_tools: ['query_lexicon', 'query_morphology'],
    special_conditions: [
      'Full proprietary Louw-Nida / SDBH corpora are excluded where license requires permission.',
      'Source revision was not pinned at import; disclosed as unversioned.',
    ],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  ubs_versification: {
    id: 'ubs_versification',
    title: 'UBS/Paratext Versification JSON',
    creator: 'United Bible Societies / Paratext',
    creator_url: 'https://github.com/ubsicap',
    attribution: 'UBS/Paratext versification mappings, MIT License.',
    source_url: 'https://github.com/ubsicap/versification_json',
    rights: { status: 'open-license', name: 'MIT License', url: 'https://opensource.org/licenses/MIT' },
    version: null,
    modifications: 'Hebrew–English versification differences loaded for check_versification.',
    mcp_tools: ['check_versification'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  openbible_xref: {
    id: 'openbible_xref',
    title: 'OpenBible.info Cross-References',
    creator: 'OpenBible.info',
    creator_url: 'https://www.openbible.info/',
    attribution:
      'Cross-reference edges reflect the OpenBible.info editorial tradition with community vote weights; '
      + 'each hop is an attributed association, not an asserted theological dependence. CC BY 4.0.',
    source_url: 'https://www.openbible.info/labs/cross-references/',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Normalized into cross-reference edge tables for lookup and path tracing.',
    mcp_tools: ['query_cross_references', 'trace_cross_reference_path'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  theographic: {
    id: 'theographic',
    title: 'Theographic Bible Data',
    creator: 'Theographic',
    creator_url: 'https://github.com/robertrouse/theographic-bible-data',
    attribution: 'Entity data: Theographic (CC BY-SA 4.0). Entity identifications may be contested — verify against critical commentaries.',
    source_url: 'https://github.com/robertrouse/theographic-bible-data',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications: 'People, places, events, and relationship graphs ingested for entity tools.',
    mcp_tools: ['query_people', 'query_places', 'query_events', 'query_person_network'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  tipnr: {
    id: 'tipnr',
    title: 'TIPNR / OpenBible Geocoding',
    creator: 'Tyndale House / OpenBible.info',
    creator_url: 'https://www.openbible.info/',
    attribution: 'TIPNR by Tyndale House (CC BY 4.0) / OpenBible geocoding. Verify contested identifications against critical commentaries.',
    source_url: 'https://www.openbible.info/',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Place and person identification layers merged with Theographic entity records.',
    mcp_tools: ['query_people', 'query_places', 'query_events', 'query_person_network'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  clear_bible_speakers: {
    id: 'clear_bible_speakers',
    title: 'Clear Bible / FCBH Speaker Quotations',
    creator: 'Clear Bible, Inc. / Faith Comes By Hearing',
    creator_url: 'https://github.com/Clear-Bible',
    attribution:
      'MACULA Quotation and Speaker Data (CC BY 4.0), Clear Bible, Inc. '
      + 'Angel-of-the-LORD attributions to Jesus reflect FCBH Christophany interpretation, not settled exegesis.',
    source_url: 'https://github.com/Clear-Bible/speaker-quotations',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: null,
    modifications: 'Speaker metadata and quotation spans loaded for query_speakers and OT structure speech transitions.',
    mcp_tools: ['query_speakers', 'query_ot_structure'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  glyssen: {
    id: 'glyssen',
    title: 'Glyssen Character Metadata',
    creator: 'SIL LSDev / FCBH',
    creator_url: 'https://github.com/sillsdev/glyssen',
    attribution: 'Glyssen character metadata, MIT License, SIL LSDev / FCBH.',
    source_url: 'https://github.com/sillsdev/glyssen',
    rights: { status: 'open-license', name: 'MIT License', url: 'https://opensource.org/licenses/MIT' },
    version: null,
    modifications: 'Character gender/age/divinity metadata merged into speaker responses.',
    mcp_tools: ['query_speakers'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  opentext: {
    id: 'opentext',
    title: 'OpenText.org Linguistic Annotations',
    creator: 'OpenText.org',
    creator_url: 'https://www.opentext.org/',
    attribution: 'OpenText original linguistic annotations as packaged in OpenGNT, CC BY-SA 4.0 packaging lineage.',
    source_url: 'https://github.com/eliranwong/OpenGNT',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications: 'Syntax annotations exposed via query_syntax.',
    mcp_tools: ['query_syntax'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_bsb: {
    id: 'bible_bsb',
    title: 'Berean Standard Bible',
    creator: 'Bible Hub / Berean Bible',
    creator_url: 'https://berean.bible/',
    attribution: 'Berean Standard Bible text. The BSB has been dedicated to the public domain (see berean.bible/licensing.htm).',
    source_url: 'https://berean.bible/licensing.htm',
    rights: { status: 'public-domain', name: 'Public Domain (BSB dedication)', url: 'https://berean.bible/licensing.htm' },
    version: null,
    modifications: 'Ingested via HelloAO Bible API source metadata into bible_text for bible_lookup and parallel_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: ['Official public-domain dedication: https://berean.bible/licensing.htm'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_web: {
    id: 'bible_web',
    title: 'World English Bible',
    creator: 'Rainbow Missions / WEB publishers',
    creator_url: 'https://worldenglish.bible/',
    attribution: 'World English Bible text is in the public domain (see worldenglish.bible).',
    source_url: 'https://worldenglish.bible/',
    rights: { status: 'public-domain', name: PDM, url: 'https://worldenglish.bible/' },
    version: null,
    modifications: 'Ingested via HelloAO Bible API source metadata into bible_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: ['Official public-domain statement: https://worldenglish.bible/'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_kjv: {
    id: 'bible_kjv',
    title: 'King James Version (1769)',
    creator: 'Public domain translators (1769 Blayney edition lineage)',
    creator_url: null,
    attribution: 'King James Version text. Public domain in the United States; Crown rights may still apply in the United Kingdom.',
    source_url: 'https://bible.helloao.org/docs/reference/',
    rights: { status: 'public-domain', name: 'Public Domain (US); UK jurisdiction caveat', url: null },
    version: null,
    modifications: 'Ingested from scrollmapper / HelloAO public-domain translation corpora into bible_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: [
      'Treated as public domain for US hosting. In the United Kingdom, Crown copyright / letterspatent considerations may still apply to the KJV text.',
    ],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_asv: {
    id: 'bible_asv',
    title: 'American Standard Version (1901)',
    creator: 'American Revision Committee',
    creator_url: null,
    attribution: 'American Standard Version (1901), public domain.',
    source_url: 'https://bible.helloao.org/docs/reference/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Ingested into bible_text for bible_lookup and parallel_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_ylt: {
    id: 'bible_ylt',
    title: "Young's Literal Translation",
    creator: 'Robert Young',
    creator_url: null,
    attribution: "Young's Literal Translation, public domain.",
    source_url: 'https://bible.helloao.org/docs/reference/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Ingested into bible_text for bible_lookup and parallel_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  bible_darby: {
    id: 'bible_darby',
    title: 'Darby Bible',
    creator: 'John Nelson Darby',
    creator_url: null,
    attribution: 'Darby Bible translation, public domain.',
    source_url: 'https://bible.helloao.org/docs/reference/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Ingested into bible_text (id DBY) for bible_lookup and parallel_text.',
    mcp_tools: ['bible_lookup', 'parallel_text', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_adam_clarke: {
    id: 'commentary_adam_clarke',
    title: 'Adam Clarke Bible Commentary',
    creator: 'Adam Clarke',
    creator_url: null,
    attribution: 'Adam Clarke Bible Commentary, public domain.',
    source_url: 'https://www.sacred-texts.com/bib/cmt/clarke/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id adam-clarke.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_jfb: {
    id: 'commentary_jfb',
    title: 'Jamieson-Fausset-Brown Bible Commentary',
    creator: 'Robert Jamieson, A. R. Fausset, David Brown',
    creator_url: null,
    attribution: 'Jamieson-Fausset-Brown Bible Commentary, public domain.',
    source_url: 'https://www.sacred-texts.com/bib/cmt/jfb/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id jamieson-fausset-brown.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_john_gill: {
    id: 'commentary_john_gill',
    title: 'John Gill Bible Commentary',
    creator: 'John Gill',
    creator_url: null,
    attribution: 'John Gill Exposition of the Bible, public domain.',
    source_url: 'https://www.sacred-texts.com/bib/cmt/gill/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id john-gill.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_keil_delitzsch: {
    id: 'commentary_keil_delitzsch',
    title: 'Keil-Delitzsch Old Testament Commentary',
    creator: 'C. F. Keil and Franz Delitzsch',
    creator_url: null,
    attribution: 'Keil-Delitzsch Commentary on the Old Testament, public domain.',
    source_url: 'https://www.sacred-texts.com/bib/cmt/kad/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id keil-delitzsch.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_matthew_henry: {
    id: 'commentary_matthew_henry',
    title: 'Matthew Henry Bible Commentary',
    creator: 'Matthew Henry',
    creator_url: null,
    attribution: 'Matthew Henry Commentary on the Whole Bible, public domain.',
    source_url: 'https://www.sacred-texts.com/bib/cmt/mhc/',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id matthew-henry.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  commentary_tyndale: {
    id: 'commentary_tyndale',
    title: 'Tyndale Open Study Notes',
    creator: 'Tyndale House Publishers',
    creator_url: 'https://www.tyndale.com/',
    attribution: 'Tyndale Open Study Notes, CC BY-SA 4.0, Tyndale House Publishers.',
    source_url: 'https://github.com/TyndaleHousePublishers/tyndale-open-study-notes',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications: 'Normalized into commentary_entries with commentary id tyndale.',
    mcp_tools: ['commentary_lookup', 'list_books'],
    special_conditions: ['Source revision was not pinned at import; disclosed as unversioned.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  creeds_json: {
    id: 'creeds_json',
    title: 'Creeds.json Confessional Corpus',
    creator: 'NonlinearFruit / Creeds.json contributors',
    creator_url: 'https://github.com/NonlinearFruit/Creeds.json',
    attribution: 'Confessional texts from Creeds.json (Unlicense / public-domain documents only). Copyrighted creeds listed upstream are excluded.',
    source_url: 'https://github.com/NonlinearFruit/Creeds.json',
    rights: { status: 'public-domain', name: 'Unlicense / public domain (selected documents)', url: 'https://github.com/NonlinearFruit/Creeds.json' },
    version: null,
    modifications: 'Selected public-domain creeds, catechisms, and confessions ingested; explicitly copyrighted documents excluded from production.',
    mcp_tools: ['confessional_lookup'],
    special_conditions: [
      'Upstream Creeds.json documents that require permission are not published.',
      'Source revision was not pinned at import; disclosed as unversioned.',
    ],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  savoy_declaration: {
    id: 'savoy_declaration',
    title: 'Savoy Declaration of Faith',
    creator: 'Savoy Conference (1658) / Reformed Standards packaging',
    creator_url: 'https://reformedstandards.com/',
    attribution: 'Savoy Declaration of Faith, Apache License 2.0 via Reformed Standards packaging where applicable.',
    source_url: 'https://reformedstandards.com/',
    rights: { status: 'open-license', name: 'Apache License 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    version: null,
    modifications: 'Published as confessional document slug savoy_declaration when present in the production corpus.',
    mcp_tools: ['confessional_lookup'],
    special_conditions: ['Ensure production seed uses the Apache-2.0-cleared text, not a permission-only Creeds.json copy.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  thirty_nine_articles: {
    id: 'thirty_nine_articles',
    title: 'Thirty-Nine Articles of Religion',
    creator: 'Church of England',
    creator_url: 'https://www.churchofengland.org/',
    attribution: 'Thirty-Nine Articles of Religion from The Book of Common Prayer (1662 lineage), public domain. Church of England.',
    source_url: 'https://www.churchofengland.org/prayer-and-worship/worship-texts-and-resources/book-common-prayer/articles-religion',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Seeded via seed-confessional-anglican-wesleyan.ts as slug thirty_nine_articles.',
    mcp_tools: ['confessional_lookup'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  wesleys_articles: {
    id: 'wesleys_articles',
    title: "Wesley's Twenty-Five Articles of Religion",
    creator: 'John Wesley / Philip Schaff (Creeds of Christendom)',
    creator_url: 'https://www.ccel.org/',
    attribution: "Wesley's Twenty-Five Articles of Religion via Philip Schaff, Creeds of Christendom vol. III (1877), public domain (CCEL).",
    source_url: 'https://www.ccel.org/ccel/schaff/creeds3',
    rights: { status: 'public-domain', name: PDM, url: PDM_URL },
    version: null,
    modifications: 'Seeded via seed-confessional-anglican-wesleyan.ts as slug wesleys_25_articles.',
    mcp_tools: ['confessional_lookup'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  coa_canonical: {
    id: 'coa_canonical',
    title: 'Claude of Alexandria Canonical Book Metadata',
    creator: 'Claude of Alexandria',
    creator_url: 'https://github.com/davebream/claude-of-alexandria',
    attribution: 'Canonical book list and display-name metadata curated by Claude of Alexandria.',
    source_url: 'https://github.com/davebream/claude-of-alexandria',
    rights: { status: 'project-owned', name: 'Project-owned curation', url: null },
    version: null,
    modifications: 'Original project metadata for book names, testament grouping, and tool catalogs.',
    mcp_tools: ['list_books'],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  coa_thematic: {
    id: 'coa_thematic',
    title: 'Claude of Alexandria Thematic Keyword Curation',
    creator: 'Claude of Alexandria',
    creator_url: 'https://github.com/davebream/claude-of-alexandria',
    attribution: 'Thematic keyword groups and lemma-to-theme mappings curated by Claude of Alexandria (CC BY-SA 4.0).',
    source_url: 'https://github.com/davebream/claude-of-alexandria',
    rights: { status: 'open-license', name: CC_BY_SA_4, url: CC_BY_SA_4_URL },
    version: null,
    modifications: 'Project-created thematic classifications over MorphGNT/MorphHB lemmas.',
    mcp_tools: [
      'list_books', 'query_vocabulary', 'query_themes_for_lemmas', 'query_theme_distribution', 'query_lemmas',
    ],
    special_conditions: [],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  coa_liturgical: {
    id: 'coa_liturgical',
    title: 'Claude of Alexandria Liturgical Calendar Curation',
    creator: 'Claude of Alexandria',
    creator_url: 'https://github.com/davebream/claude-of-alexandria',
    attribution:
      'Liturgical seasons and readings curated by Claude of Alexandria, with Revised Common Lectionary readings attributed per record.',
    source_url: 'https://github.com/davebream/claude-of-alexandria',
    rights: { status: 'project-owned', name: 'Project-owned curation (RCL readings attributed per record)', url: null },
    version: null,
    modifications: 'Curated liturgical migrations; individual readings retain source labels such as Revised Common Lectionary.',
    mcp_tools: ['liturgical_lookup'],
    special_conditions: ['Methodology and source notes are project documentation rather than an external dataset license.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  coa_controversies: {
    id: 'coa_controversies',
    title: 'Claude of Alexandria Controversy Summaries',
    creator: 'Claude of Alexandria',
    creator_url: 'https://github.com/davebream/claude-of-alexandria',
    attribution: 'Controversy topic summaries curated from scholarship citations by Claude of Alexandria. Present as curated overview, not settled dogma.',
    source_url: 'https://github.com/davebream/claude-of-alexandria',
    rights: { status: 'project-owned', name: 'Project-owned curation', url: null },
    version: null,
    modifications: 'Original curated summaries with scholarly citations; may reference Theographic/TIPNR event identifiers.',
    mcp_tools: ['query_controversies', 'query_events'],
    special_conditions: ['Neutrality caveat remains part of the tool response contract.'],
    project_surfaces: ['MCP'],
    mcp_published: true,
  },

  // Repository-only datasets (not returned by MCP tools, but kept for NOTICE generation).
  kline_torah_units: {
    id: 'kline_torah_units',
    title: 'Kline Torah Literary Units Dataset',
    creator: 'Moshe Kline',
    creator_url: 'https://chaver.com/torah-weave/data/',
    attribution: 'Kline Torah literary units, CC BY 4.0, Moshe Kline.',
    source_url: 'https://chaver.com/torah-weave/data/torah-units.json',
    rights: { status: 'open-license', name: CC_BY_4, url: CC_BY_4_URL },
    version: '1.0',
    modifications: 'Used only for offline Torah boundary benchmarks; not published via MCP tools.',
    mcp_tools: [],
    special_conditions: ['Not part of the production MCP corpus.'],
    project_surfaces: ['Offline benchmarks / promptfoo EXTENDED suites'],
    mcp_published: false,
  },

  sefaria_masoretic: {
    id: 'sefaria_masoretic',
    title: 'Sefaria Masoretic Paragraph Metadata',
    creator: 'Sefaria',
    creator_url: 'https://www.sefaria.org/',
    attribution:
      'Sefaria metadata contributions CC BY-SA; underlying Westminster Leningrad Codex text is public domain. '
      + 'Used for corruption audits and fixtures, not the production paragraph MCP corpus.',
    source_url: 'https://github.com/Sefaria/Sefaria-Export',
    rights: { status: 'open-license', name: 'Creative Commons Attribution-ShareAlike (CC BY-SA)', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    version: null,
    modifications: 'Archived fixtures for Masoretic marker corruption audit; production markers come from MorphHB.',
    mcp_tools: [],
    special_conditions: ['Not part of the normal production MCP corpus.'],
    project_surfaces: ['docs/data-provenance', 'corruption audit fixtures'],
    mcp_published: false,
  },
};

export const DATASET_IDS = Object.keys(DATASET_REGISTRY) as string[];

export function requireDataset(id: string): DatasetRegistryEntry {
  const entry = DATASET_REGISTRY[id];
  if (!entry) throw new Error(`Unknown dataset id: ${id}`);
  return entry;
}

export function mcpDatasets(): DatasetRegistryEntry[] {
  return Object.values(DATASET_REGISTRY).filter(entry => entry.mcp_published);
}

export const COMMENTARY_ID_TO_DATASET: Record<string, string> = {
  'adam-clarke': 'commentary_adam_clarke',
  'jamieson-fausset-brown': 'commentary_jfb',
  'john-gill': 'commentary_john_gill',
  'keil-delitzsch': 'commentary_keil_delitzsch',
  'matthew-henry': 'commentary_matthew_henry',
  tyndale: 'commentary_tyndale',
};

export const TRANSLATION_ID_TO_DATASET: Record<string, string> = {
  BSB: 'bible_bsb',
  WEB: 'bible_web',
  KJV: 'bible_kjv',
  ASV: 'bible_asv',
  YLT: 'bible_ylt',
  DBY: 'bible_darby',
};

export const LEXICON_SOURCE_TO_DATASET: Record<string, string> = {
  lsj: 'step_tflsj',
  'abbott-smith': 'abbott_smith',
  bdb: 'bdb',
  'ubs-sdgnt': 'ubs_domains',
  'ubs-sdbh': 'ubs_domains',
};

export const CONFESSIONAL_SLUG_TO_DATASET: Record<string, string> = {
  savoy_declaration: 'savoy_declaration',
  thirty_nine_articles: 'thirty_nine_articles',
  wesleys_25_articles: 'wesleys_articles',
};
