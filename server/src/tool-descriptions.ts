export const SERVER_INSTRUCTIONS = `Use tools/list as the authoritative tool inventory. Pass arrays as native JSON arrays, never as JSON-encoded strings. Continue pageable results by repeating the same filters with next_cursor; page_size may change between pages. Normalize biblical references through the tool schemas and returned canonical fields rather than assuming English versification. Cross-reference path tracing is a bounded graph search: inspect complete and termination_reason before treating a missing path as exhaustive. Prefer list_books for available books and datasets, query_morphology before lemma/theme analysis, and bible_lookup or parallel_text for biblical text.`;

export const DESC_LIST_BOOKS = 'List canonical books and available dataset catalogs. Filter by testament or request theme catalogs; use MCP tools/list for tool discovery.';
export const DESC_DISCOURSE = 'Return New Testament discourse features and word-level boundaries as a pageable record stream. Use for information flow, reported speech, and segmentation analysis.';
export const DESC_PARAGRAPHS = 'Return Masoretic paragraph markers and graphic signs for an Old Testament book. Verse-end markers indicate a boundary after the verse; within-verse markers do not.';
export const DESC_VOCABULARY = 'Analyze lemma frequency or a named thematic vocabulary set for one book. Select frequency or theme mode explicitly; results are pageable.';
export const DESC_MORPHOLOGY = 'Return pageable word-level morphology for a biblical range. Select a detail level and optionally filter by part of speech, original-script word, or Strong number.';
export const DESC_OT_QUOTES = 'Return pageable Old Testament quotations and allusions in a New Testament book, optionally restricted to a range or source book.';
export const DESC_THEMES = 'Resolve native Greek lemmas or Old Testament Strong numbers to thematic groups. Useful between morphology and vocabulary/theme distribution queries.';
export const DESC_LEMMAS = 'Return pageable occurrences and distribution for a bounded batch of lemmas in one book or testament.';
export const DESC_THEME_DISTRIBUTION = 'Return a pageable, canonical cross-book distribution for one named theme in a testament.';
export const DESC_LEXICON = 'Look up Strong numbers, look up a bounded lemma batch, or search lexicon text. Select the mode explicitly and choose compact or full records.';
export const DESC_VERSIFICATION = 'Check whether a biblical reference differs across supported versification systems and return documented mappings.';
export const DESC_CROSS_REFERENCES = 'List pageable cross-references for a verse with direction and vote filters. This is adjacency lookup, not path traversal.';
export const DESC_TRACE_CROSS_REFERENCE_PATH = 'Run a bounded cross-reference graph search between two verses. Inspect complete and termination_reason to distinguish exhaustive results from budget limits.';
export const DESC_PLACES = 'Find pageable biblical place records by name, book, or passage, including coordinates and occurrence metadata when available.';
export const DESC_PEOPLE = 'Find pageable biblical person records by name, book, or passage, including names, roles, and occurrence metadata.';
export const DESC_EVENTS = 'Find pageable biblical events by book, passage, person, place, or event category.';
export const DESC_PERSON_NETWORK = 'Return pageable relationship, co-appearance, or expanded-network connection records for a biblical person.';
export const DESC_SPEAKERS = 'Return pageable speech spans and speaker metadata for a biblical book or passage.';
export const DESC_SYNTAX = 'Return pageable clause and syntax records for a biblical range, with optional clause-type filtering.';
export const DESC_OT_STRUCTURE = 'Return pageable Old Testament verse-edge syntax, participant, and speech boundary records derived from Macula Hebrew data.';
export const DESC_VARIANTS = 'Return pageable textual-variant records for a biblical book or range.';
export const DESC_BIBLE_LOOKUP = 'Return pageable verse text for one translation and biblical range. Use parallel_text to compare translations.';
export const DESC_COMMENTARY_LOOKUP = 'Return pageable commentary entry records for a biblical range, optionally restricted to named commentaries.';
export const DESC_PARALLEL_TEXT = 'Return pageable verse-aligned text for a bounded set of translations.';
export const DESC_CONFESSIONAL_LOOKUP = 'Query confessional documents by direct section, Scripture reference, keyword, or catalog mode. Mode-specific inputs are enforced by schema.';
export const DESC_LITURGICAL_LOOKUP = 'Query liturgical readings by season, passage, date, or catalog mode. Results include season slugs, themes, and explicit reading coordinates.';
export const DESC_QUERY_CONTROVERSIES = 'Query historical theological controversies by topic, Scripture reference, tradition, or catalog mode. Mode-specific inputs are enforced by schema.';

export const TOOL_DESCRIPTIONS = [
  DESC_LIST_BOOKS, DESC_DISCOURSE, DESC_PARAGRAPHS, DESC_VOCABULARY,
  DESC_MORPHOLOGY, DESC_OT_QUOTES, DESC_THEMES, DESC_LEMMAS,
  DESC_THEME_DISTRIBUTION, DESC_LEXICON, DESC_VERSIFICATION,
  DESC_CROSS_REFERENCES, DESC_TRACE_CROSS_REFERENCE_PATH, DESC_PLACES,
  DESC_PEOPLE, DESC_EVENTS, DESC_PERSON_NETWORK, DESC_SPEAKERS, DESC_SYNTAX,
  DESC_OT_STRUCTURE, DESC_VARIANTS, DESC_BIBLE_LOOKUP, DESC_COMMENTARY_LOOKUP,
  DESC_PARALLEL_TEXT, DESC_CONFESSIONAL_LOOKUP, DESC_LITURGICAL_LOOKUP,
  DESC_QUERY_CONTROVERSIES,
] as const;
