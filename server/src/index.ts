import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { setDb } from './db/query.js';
import { queryDiscourseFeatures, DiscourseInputSchema, DiscourseOutputSchema } from './tools/discourse.js';
import { queryParagraphBreaks, ParagraphsInputSchema, ParagraphsOutputSchema } from './tools/paragraphs.js';
import { queryVocabulary, VocabularyInputSchema, VocabularyOutputSchema } from './tools/vocabulary.js';
import { queryMorphology, MorphologyInputSchema, MorphologyOutputSchema } from './tools/morphology.js';
import { listBooks, ListBooksInputSchema, ListBooksOutputSchema } from './tools/list-books.js';
import { queryOtQuotes, OtQuotesInputSchema, OtQuotesOutputSchema } from './tools/ot-quotes.js';
import { queryThemesForLemmas, ThemesInputSchema, ThemesOutputSchema } from './tools/themes.js';
import { queryLemmas, LemmasInputSchema, LemmasOutputSchema, type LemmasInput } from './tools/lemmas.js';
import { queryThemeDistribution, ThemeDistributionInputSchema, ThemeDistributionOutputSchema } from './tools/theme-distribution.js';
import { queryLexicon, LexiconInputSchema, LexiconOutputSchema } from './tools/lexicon.js';
import { checkVersification, VersificationInputSchema, VersificationOutputSchema } from './tools/versification.js';
import { queryCrossReferences, CrossReferencesInputSchema, CrossReferencesOutputSchema } from './tools/cross-references.js';
import { queryPeople, PeopleInputSchema, PeopleOutputSchema } from './tools/people.js';
import { queryPlaces, PlacesInputSchema, PlacesOutputSchema } from './tools/places.js';
import { queryEvents, EventsInputSchema, EventsOutputSchema } from './tools/events.js';
import { queryPersonNetwork, PersonNetworkInputSchema, PersonNetworkOutputSchema } from './tools/person-network.js';
import { speakersQuery, SpeakersInputSchema, SpeakersOutputSchema } from './tools/speakers.js';
import { querySyntax, SyntaxInputSchema, SyntaxOutputSchema } from './tools/syntax.js';
import { queryVariants, VariantsInputSchema, VariantsOutputSchema } from './tools/variants.js';
import { bibleLookup, BibleLookupInputSchema, BibleLookupOutputSchema } from './tools/bible-lookup.js';
import { commentaryLookup, CommentaryLookupInputSchema, CommentaryLookupOutputSchema } from './tools/commentary-lookup.js';
import { parallelText, ParallelTextInputSchema, ParallelTextOutputSchema, type ParallelTextInput } from './tools/parallel-text.js';
import { confessionalLookup, ConfessionalLookupInputSchema, ConfessionalLookupOutputSchema, type ConfessionalLookupInput } from './tools/confessional-lookup.js';

// ─── Rich tool descriptions ───────────────────────────────────────────────────

const DESC_LIST_BOOKS = `List all available biblical books and their testaments. Use this tool first to discover what data is available before querying specific tools.

Optionally include available thematic keyword groups for use with query_vocabulary's theme parameter.

Args:
  - testament (string, optional): "nt" or "ot" to filter. Omit for all 66 books.
  - include_themes (boolean, optional): Include available thematic keyword groups (default: false)

Returns: { total, ot: string[], nt: string[], available_tools: string[], themes?: {ot: string[], nt: string[]} }`;

const DESC_DISCOURSE = `Query Levinsohn's New Testament discourse features for a given book and chapter range.

Returns discourse-grammatical features like historical present, left dislocation, tail-head linkage, and reported speech markers that signal narrative structure and information flow. NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "John", "1 Cor", "Revelation", "Rom")
  - features (string[], optional): Feature names to filter. Defaults to 6 segmentation features: historical_present, left_dislocation, referential_pod, situational_pod, reported_speech, tail_head_linkage. Use without filter first to see available_features in the response.
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, features: { [name]: [{chapter, verse, word, feature_description}] }, summary: { [name]: count }, available_features: string[] }

Examples:
  - Historical presents in Mark 1-5: book="Mark", chapter_range="1-5", features=["historical_present"]
  - All discourse features in Romans: book="Romans"
  - Left dislocations in John: book="John", features=["left_dislocation"]`;

const DESC_PARAGRAPHS = `Query Masoretic paragraph markers (petuchah and setumah) for an Old Testament book.

Petuchah (open) and setumah (closed) markers are ancient paragraph divisions in the Hebrew Masoretic text that indicate structural breaks in the narrative or discourse. OT books only.

Args:
  - book (string, required): OT book name in any common form (e.g., "Genesis", "Gen", "Psalms", "Isa")
  - chapter_range (string, optional): "3" for single chapter, "3-7" for range, omit for entire book

Returns: { book, chapter_range, markers: [{chapter, verse, type}], summary: {petuchot, setumot, total} }

Examples:
  - All markers in Genesis 1-3: book="Genesis", chapter_range="1-3"
  - Paragraph structure of Isaiah: book="Isaiah"`;

const DESC_VOCABULARY = `Query vocabulary frequencies, thematic keyword matches, and clustering data for any biblical book.

Returns lemma frequencies broken down by chapter, with optional thematic filtering (e.g., "joy", "faith") and concentration clustering analysis. Works for both OT and NT books.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "Psalms")
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted
  - theme (string, optional): Thematic keyword group to filter by (e.g., "joy", "faith", "covenant"). If the theme is not found, the error response lists all available themes for that testament.
  - check_clustering (boolean, optional): Include precomputed vocabulary concentration clusters showing where lemmas are concentrated within the book
  - min_frequency (number, optional): Minimum total lemma frequency to include (default: 1)
  - limit (number, optional): Max lemmas returned (default: 200, max: 500)

Returns (without theme): { response_type: "full", book, testament, lemmas: [{lemma, total, by_chapter: {ch: count}}], total_lemmas, returned, clustering }
Returns (with theme): { response_type: "themed", book, testament, theme, thematic_matches: [{lemma, total, by_chapter}], clustering }

Examples:
  - Top vocabulary in Romans: book="Romans", min_frequency=5
  - Joy-related words in Philippians: book="Philippians", theme="joy"
  - Vocabulary clusters in Genesis: book="Genesis", check_clustering=true`;

const DESC_OT_QUOTES = `Query Old Testament quotations found within New Testament books.

Returns quotation data including the quoted Greek text, quote type (direct/allusion/echo), and the OT source passage(s). NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "Romans", "Matt", "Hebrews")
  - range (string, optional): Verse range "8:28-8:39" or single verse "1:23". Omit for entire book.
  - ot_book (string, optional): Filter by OT source book (e.g., "Isaiah", "Isa", "Psalms"). Only returns quotes that have a known source in this book.

Returns: { book, range?, quotes: [{nt_ref, greek_text, quote_type, ot_sources: [{book, chapter, verse, verse_end?, ref}]}], summary: {total, nt_verses_with_quotes, ot_books_referenced} }

Examples:
  - All OT quotes in Romans: book="Romans"
  - Isaiah quotes in Matthew: book="Matthew", ot_book="Isaiah"
  - Quotes in Romans 8: book="Romans", range="8:1-8:39"`;

const DESC_MORPHOLOGY = `Query word-level morphological parsing data for a verse range in any biblical book.

Returns each word with its surface form, normalized form, lemma, part of speech, and grammatical parsing. Use the "fields" parameter for progressive disclosure of enrichment data.

Args:
  - book (string, required): Book name in any common form (e.g., "John", "Gen", "Hebrews")
  - range (string, required): Verse range as "chapter:verse-chapter:verse" (e.g., "1:1-1:11") or single verse "1:6"
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted
  - pos_filter (string, optional): Filter by part of speech (e.g., "verb", "noun", "adjective", "preposition", "conjunction")
  - word_filter (string, optional): Filter by exact word form — matches against surface text, normalized form, or lemma
  - fields (string, optional): Level of detail — each level includes all fields from previous levels:
    - "basic" (default): text, normalized, lemma, pos, parsing
    - "syntax": + clause_id, clause_type, strongs
    - "full": + gloss, semantic_frame, subject_ref, participant_ref, gloss_tbesg, louw_nida, louw_nida_domain
    - "lexical": compact word-study set (text, lemma, strongs, gloss only)
  - strongs_filter (string, optional): Filter words by Strong's number (e.g., "H7225a" for OT, "G2316" for NT). Requires range.

Returns: { book, range, testament, words: [{verse, position, text, normalized, lemma, pos, parsing, ...enrichment fields}], summary: {total_words, by_pos} }

Note: OT enrichment fields (gloss, strongs, clause_type, semantic_frame, subject_ref, participant_ref) are populated from Macula Hebrew data. NT enrichment fields (gloss, strongs, gloss_tbesg, louw_nida, louw_nida_domain) are populated from OpenGNT data. Null-only enrichment fields are omitted from the response.

Examples:
  - Basic morphology: book="John", range="1:1-1:5"
  - OT with full enrichment: book="Genesis", range="1:1-1:5", fields="full"
  - Filter by Strong's: book="Genesis", range="1:1-1:5", strongs_filter="H430"
  - Lexical compact view: book="Genesis", range="22:1-22:5", fields="lexical"`;

const DESC_THEMES = `Resolve lemmas from query_morphology into thematic keyword groups for use with query_vocabulary's theme parameter.

Accepts lemmas in the format returned by query_morphology for the given testament (Greek lemmas for NT, Strong's numbers for OT). Returns themes sorted by the number of matching lemmas (most relevant first).

Use this tool in the pipeline: query_morphology → query_themes_for_lemmas → query_vocabulary(theme=...).

Args:
  - lemmas (string[], required): 1–100 lemmas to resolve (e.g., ["χαίρω", "χαρά", "εἰρήνη"] for NT, ["H2617a", "H6664"] for OT)
  - testament (string, required): "nt" or "ot" — must match the testament used in query_morphology
  - include_unmatched (boolean, optional): Include unmatched lemmas in response (default: true). Set false to reduce payload for large passages.

Returns: { testament, themes: string[], matches: {lemma: themes[]}, unmatched?: string[], total_lemmas, matched_count, unmatched_count }

Examples:
  - Resolve NT lemmas: lemmas=["χαίρω", "χαρά", "εἰρήνη"], testament="nt"
  - Resolve OT Strong's codes: lemmas=["H2617a", "H6664", "H4941"], testament="ot"
  - Pipeline use (suppress unmatched): lemmas=[...from morphology...], testament="nt", include_unmatched=false`;

const DESC_THEME_DISTRIBUTION = `Query the canonical distribution of a thematic keyword group across all books in a testament.

Unlike query_vocabulary (which filters within one book), this tool shows where a theme appears across the entire NT or OT — every book, every lemma, every chapter — sorted by density.

Args:
  - theme (string, required): Theme name (e.g., "joy", "faith", "covenant", "deity"). Use list_books with include_themes=true to see all 81 available themes. If the theme is not found, the error response lists all available themes for that testament.
  - testament (string, required): "nt" or "ot" — themes are testament-specific

Returns: { theme, testament, theme_lemmas: string[], books: [{book, total, by_lemma: {lemma: {chapter: count}}}], summary: {total_occurrences, books_count} }

Books are sorted by total occurrences descending (densest theme use first).

Examples:
  - Where does "joy" appear across the NT? theme="joy", testament="nt"
  - Covenant theme across the OT: theme="covenant", testament="ot"
  - Deity language across the NT: theme="deity", testament="nt"`;

const DESC_LEMMAS = `Query cross-book distribution of specific lemma IDs across the biblical canon.

Unlike query_vocabulary (which shows vocabulary within one book), this tool shows where specific lemmas appear across ALL books in a testament. Use after query_morphology identifies lemmas of interest.

OT lemmas use Strong's numbers (H-prefix, e.g., "H7462b"). NT lemmas use Greek lexical forms (e.g., "πατήρ", "κύριος"). Get these from query_morphology output (the "lemma" field).

Args:
  - lemmas (string[], required): 1–50 lemma IDs. OT: Strong's numbers like "H7462b". NT: Greek forms like "πατήρ". Mixed allowed.

Returns: { lemmas: [{lemma, testament, total_occurrences, books_count, distribution: {Book: {chapter: count}}}], not_found: string[], total_requested, total_found }

Note: No lexeme/gloss field is included. The calling agent already has morphology context with normalized forms from a prior query_morphology call.

Examples:
  - OT shepherd lemma across the canon: lemmas=["H7462b"]
  - Multiple NT lemmas: lemmas=["πατήρ", "πίστις"]
  - Mixed OT/NT for covenant study: lemmas=["H1285", "διαθήκη"]`;

const DESC_LEXICON = `Query Strong's-based word definitions from multi-source scholarly lexicons.

Returns lexical entries with source-attributed definitions from LSJ (Liddell-Scott-Jones for Greek), Abbott-Smith (NT-focused Greek), BDB (Brown-Driver-Briggs for Hebrew), and UBS semantic domain classifications. Supports lookup by Strong's number, original language lemma, or English meaning search.

Args:
  - strongs_ids (string[], optional): Array of Strong's numbers (e.g., ["H1961", "G3056"]). Max 20.
  - lemmas (string[], optional): Array of Greek/Hebrew lemmas to look up. Max 20.
  - search (string, optional): English meaning or concept to search for (e.g., "love", "redemption"). Searches gloss and full definitions across all lexicon sources. Returns up to 20 matches. Min 2 chars, max 100 chars.
  - compact (boolean, optional): If true, return only strongs_id, gloss, transliteration (default: false).

Provide exactly one of: strongs_ids, lemmas, or search.

Search results may be capped at 20 entries across all sources combined (results_capped: true). Callers can infer testament from the Strong's ID prefix: G = Greek (NT), H = Hebrew (OT).

Examples:
  - Greek word study: strongs_ids=["G3056"]
  - Hebrew word study: strongs_ids=["H7225"]
  - Greek lemma: lemmas=["λόγος"]
  - Hebrew lemma: lemmas=["רֵאשִׁית"]
  - Meaning search: search="love" (returns ἀγάπη, אַהֲבָה, and related words)
  - Concept search: search="redemption" (returns λύτρον, גָּאַל, and related words)`;

const DESC_VERSIFICATION = `Check Hebrew-English verse numbering differences for Old Testament books.

Returns versification mappings showing where English (Protestant) and Hebrew (Masoretic) verse numbering diverge. Common in Psalms (superscription verses), and books where chapter boundaries differ. OT books only.

This tool maps MT (Masoretic Text) ↔ English versification. NT authors frequently quote the LXX (Septuagint), which has its own versification differences not covered by this tool. When studying NT quotations of the OT, be aware that LXX verse numbering may differ from both MT and English.

Args:
  - book (string, required): OT book name in any common form (e.g., "Genesis", "Gen", "Psalms")
  - chapter (number, optional): Filter to a specific chapter
  - verse (number, optional): Filter to a specific verse
  - verse_end (number, optional): End verse for range queries

Returns: { book, differences: [{english, hebrew, mapping_type}], summary: {total_differences, mapping_types} }

Examples:
  - Genesis chapter boundary: book="Genesis", chapter=32, verse=1
  - All Psalm differences: book="Psalms"
  - Specific verse: book="Exodus", chapter=8, verse=1`;

const DESC_CROSS_REFERENCES = `Query editorial tradition cross-references between Bible verses.

Returns verse-pair cross-references with community vote counts indicating strength of association. Data from OpenBible.info (CC BY 4.0), covering ~340K cross-reference pairs across the entire Bible.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "Psalms")
  - range (string, optional): Verse range "8:28" or "8:28-8:39". Omit for entire book.
  - min_votes (number, optional): Minimum vote count to include (default: 2)
  - limit (number, optional): Maximum results returned (default: 100, max: 500)
  - direction (string, optional): "from" = references FROM this passage, "to" = references TO this passage, "both" = bidirectional (default)

Returns: { book, range?, cross_references: [{from_ref, to_ref, votes, direction}], summary: {total, avg_votes} }

Examples:
  - Cross-references for Romans 8:28: book="Romans", range="8:28"
  - References from Genesis 1:1: book="Genesis", range="1:1", direction="from"
  - High-confidence only: book="John", range="3:16", min_votes=100`;

const DESC_PEOPLE = `Query named individuals mentioned in a verse range, with cross-canonical appearances from Theographic/TIPNR data.

Returns people identified in the passage with their appearance counts across all biblical books, disputed identification flags, and gender. Entity data is KJV-based — verse assignments follow KJV versification.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "Acts")
  - range (string, required): Verse range as "chapter:verse-chapter:verse" (e.g., "16:1-16:16") or single verse "1:1"
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted

Returns: { book, range, text_basis: "KJV", people: [{name, slug, display_title, gender, aliases, appearance_count, appearances_by_book, verses_in_range, disputed, dispute_note?}], disputed_identifications: [{name, slug, dispute_note}], mention_type_caveat, summary: {total_people, disputed_count}, attribution }

High-frequency entities (appearance_count > 500) omit appearances_by_book for performance.
Entity mentions do not distinguish narrative vs typological vs genealogical mention types. The exegete must classify from context.

Examples:
  - People in Romans 16: book="Romans", range="16:1-16:16"
  - People in Genesis 22: book="Genesis", range="22:1-22:19"
  - Single verse: book="Acts", range="18:2"`;

const DESC_PLACES = `Query geographic locations mentioned in a verse range, with coordinates and cross-canonical appearances from Theographic/TIPNR data.

Returns places identified in the passage with latitude/longitude, feature type classification, appearance counts across all biblical books. Entity data is KJV-based — verse assignments follow KJV versification.

Args:
  - book (string, required): Book name in any common form (e.g., "Acts", "Gen", "Romans")
  - range (string, required): Verse range as "chapter:verse-chapter:verse" (e.g., "18:1-18:18") or single verse "1:1"
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted

Returns: { book, range, text_basis: "KJV", places: [{name, slug, display_title, latitude, longitude, feature_type, feature_subtype, aliases, appearance_count, appearances_by_book, verses_in_range}], summary: {total_places}, attribution }

High-frequency entities (appearance_count > 500) omit appearances_by_book for performance.

Examples:
  - Places in Acts 18: book="Acts", range="18:1-18:18"
  - Places in Genesis 12: book="Genesis", range="12:1-12:9"`;

const DESC_EVENTS = `Query timeline events mentioned in a book/chapter range, with participants, locations, and chronological data from Theographic/TIPNR data.

Returns events linked to the passage with start dates (Ussher/Masoretic-derived chronology), participants, and locations. Event coverage is not exhaustive — Theographic includes ~450 events focused on major narrative milestones.

IMPORTANT: Dates follow Ussher/Masoretic-derived chronology. Alternative traditions (LXX, Samaritan Pentateuch, critical scholarship) yield different dates. Use as relative sequencing, not absolute dating.

Args:
  - book (string, required): Book name in any common form (e.g., "Genesis", "Acts", "Romans")
  - chapter_range (string, optional): Chapter range (e.g., "22" or "1-3"). Omit for entire book.
  - testament (string, optional): "nt" or "ot" — auto-detected from book if omitted

Returns: { book, chapter_range?, text_basis: "KJV", events: [{title, start_date, duration, sort_key, participants, locations, chapters}], chronology_caveat, summary: {total_events}, attribution }

Examples:
  - Events in Genesis 22: book="Genesis", chapter_range="22"
  - Events in Exodus 1-15: book="Exodus", chapter_range="1-15"
  - All events in Acts: book="Acts"`;

const DESC_PERSON_NETWORK = `Query family relationships and co-appearances for a named individual from Theographic/TIPNR data.

Returns the person's family tree (relationships) and top co-appearing individuals (by shared verse count). Supports iterative depth expansion (1-3 levels).

Person lookup: provide a slug (e.g., "abraham_2") for exact match, or a name (e.g., "Abraham"). Ambiguous names return an error with matching slugs for disambiguation.

Args:
  - person (string, required): Person slug (e.g., "abraham_2") or name (e.g., "Abraham"). Slug preferred for disambiguation.
  - depth (number, optional): Network depth 1-3 (default 1). Depth 1 = immediate family + co-appearances. Higher depths expand related persons' networks iteratively.

Returns: { person: {name, slug, display_title, gender, appearance_count}, relationships: [{name, slug, relationship_type}], co_appearances: [{name, slug, shared_verses}], depth, attribution }

High-frequency entities (appearance_count > 500) omit co-appearances for performance.

Examples:
  - Abraham's family tree: person="abraham_2"
  - Mary disambiguation: person="Mary" → AMBIGUOUS_PERSON with slugs
  - Extended family (depth 2): person="abraham_2", depth=2`;

const DESC_SPEAKERS = `Query who speaks in a biblical passage, with speaker metadata, quotation type, and divine speech filtering.

Returns quotation spans with speaker attribution, including divinity flag, speaker labels, and quote type classification (Normal/Dialogue/Implicit/Quotation/Hypothetical). Covers both OT and NT.

For prophetic books, divinity_only captures direct divine speech only. Prophetic oracles (prophet speaking God's words) are attributed to the prophet, not God. Check speaker_label for divine titles (e.g., "Yahweh", "Lord") in prophetic literature.

The dataset attributes Angel-of-the-LORD speech to "Jesus" with speaker_label "angel of". This reflects FCBH/Clear Bible's Christophany interpretation. Present as dataset attribution, not settled exegesis.

Args:
  - book (string, required): Book name in any common form (e.g., "Genesis", "Matthew", "Rom")
  - range (string, optional): Verse range (e.g., "22:1-22:19" or "3:16"). Omit for entire book.
  - speaker_id (string, optional): Filter to a specific speaker (e.g., "God", "Moses")
  - divinity_only (boolean, optional): Only return divine speech (default: false)

Returns: { book, range?, total_quotations, speakers: [{character_id, name, gender?, divinity, quotation_count}], quotations: [{verse_range, speaker_id, speaker_label?, alt_speaker_id?, quote_type, quote_delivery?}], prophetic_speech_caveat, christophany_caveat, attribution }

Examples:
  - Who speaks in Genesis 22: book="Genesis", range="22:1-22:19"
  - Divine speech only in Genesis 3: book="Genesis", range="3:1-3:19", divinity_only=true
  - All of Jesus' speech in Matthew: book="Matthew", speaker_id="Jesus"`;

const DESC_SYNTAX = `Query OpenText clause-level semantic role annotations for a New Testament book.

Returns clause-level annotations including clause type, relation, and text from the OpenText.org project (Porter's Systemic Functional Linguistics framework). NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "Romans", "John", "1 Cor")
  - chapter_range (string, optional): "8" for single chapter, "1-3" for range, omit for entire book
  - clause_type (string, optional): Filter by clause type (e.g., "primary", "secondary")

Returns: { book, chapter_range, annotations: [{chapter, verse, clause_id, clause_type, clause_relation, clause_text, parent_clause_id}], summary: {total, by_clause_type}, framework_note }

Examples:
  - Clause annotations in Romans 8: book="Romans", chapter_range="8"
  - All annotations in Philippians: book="Philippians"`;

const DESC_VARIANTS = `Query textual variant edition comparison data for a New Testament book.

Returns word-level variant markers showing which critical editions agree or disagree on readings. Covers 9 editions: Byzantine (B), NIV Greek (I), NA27 (N), NA28 (M), Textus Receptus (R), SBLGNT (S), Tregelles (T), Westcott-Hort (W), Tyndale House GNT (H). NT books only.

This is edition comparison data, not a full text-critical apparatus. It shows where editions diverge, not manuscript evidence for each reading.

Args:
  - book (string, required): NT book name in any common form (e.g., "John", "Romans", "1 Cor")
  - range (string, optional): Verse range "7:53-8:11" or "1:1". Omit for entire book.
  - edition (string, optional): Filter by edition code: B, I, M, N, R, S, T, W, H

Returns: { book, range, variants: [{chapter, verse, word_position, ognt_text, editions, variant_type, variant_text}], summary: {total, by_variant_type}, edition_key }

Examples:
  - Variants in Pericope Adulterae: book="John", range="7:53-8:11"
  - SBLGNT-specific variants in Romans: book="Romans", edition="S"
  - All variants in Mark: book="Mark"`;

const DESC_BIBLE_LOOKUP = `Look up biblical text in a specific translation.

Returns verse text for a given book and range. Uses English Protestant versification.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "1 Cor")
  - range (string, required): Verse range "8:28-8:30", abbreviated "8:28-30", or single verse "8:28"
  - translation (string, optional): Bible translation (default: BSB). Options: BSB, WEB, KJV, ASV, YLT, DBY

Returns: { translation, book, range, verses: [{chapter, verse, text}], versification_note? }

Examples:
  - Romans 8:28-30 in BSB: book="Romans", range="8:28-30"
  - Genesis 1:1-3 in KJV: book="Genesis", range="1:1-3", translation="KJV"
  - John 3:16 in all translations: use parallel_text instead`;

const DESC_COMMENTARY_LOOKUP = `Look up commentary entries for a biblical passage.

Returns commentary text from up to 6 public-domain/CC-BY-SA commentaries. When no specific commentary is requested, returns all available entries for the range.

Available commentaries: adam-clarke, jamieson-fausset-brown, john-gill, keil-delitzsch, matthew-henry, tyndale

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "1 Cor")
  - range (string, required): Verse range "8:28-8:30", abbreviated "8:28-30", or single verse "8:28"
  - commentary (string, optional): Filter to a specific commentary. Omit for all available.

Returns: { book, range, commentaries: [{commentary, attribution, entries: [{verse_start, verse_end, text}]}], range_warning? }

Examples:
  - All commentaries on Romans 8:28: book="Romans", range="8:28"
  - Matthew Henry on Genesis 1:1-3: book="Genesis", range="1:1-3", commentary="matthew-henry"
  - Tyndale notes on John 3:16: book="John", range="3:16", commentary="tyndale"`;

const DESC_CONFESSIONAL_LOOKUP = `Look up confessional and catechetical content from Reformed, Baptist, Lutheran, and ancient traditions.

Four query modes:
- "direct": Look up a specific document section by slug + chapter/section or question number
- "scripture": Find which confessional statements cite a Bible passage (e.g., Romans 8:28-30)
- "keyword": Substring search on section content (case-insensitive)
- "list": Enumerate available documents with metadata

Available documents: Westminster Confession of Faith, Westminster Shorter/Larger Catechisms, Heidelberg Catechism, Belgic Confession, Canons of Dort, London Baptist Confession 1689, Apostles' Creed, Nicene Creed, Augsburg Confession, and more.

Filters (tradition: reformed|baptist|ancient|lutheran; format: confession|catechism) apply to all modes.

Args:
  - mode (string, required): "direct" | "scripture" | "keyword" | "list"
  - document (string): Document slug — required for mode="direct". Use mode="list" to discover slugs.
  - chapter (number, optional): Chapter number for direct mode (confession format)
  - section (number, optional): Section number within chapter for direct mode
  - question (number, optional): Question number for direct mode (catechism format)
  - book (string): Bible book name — required for mode="scripture"
  - range (string): Verse range "8:28" or "8:28-8:30" — required for mode="scripture"
  - keyword (string): Search term — required for mode="keyword" (min 2 characters)
  - tradition (string, optional): Filter by tradition: reformed | baptist | ancient | lutheran
  - format (string, optional): Filter by format: confession | catechism
  - limit (number, optional): Max sections returned (default: 50, max: 200). Does not apply to mode="list".

Returns: { mode, query_info, documents: [{slug, title, year, tradition, format, sections: [{...}]}], total_documents, total_sections, truncated?, truncation_message? }

Content note: Sections include both plain content and content_with_proofs (text with [1], [2] markers mapping to Scripture citations).

Examples:
  - WCF on Providence: mode="direct", document="westminster-confession-of-faith", chapter=5
  - Romans 8:28 citations: mode="scripture", book="Romans", range="8:28"
  - Reformed confessions on election: mode="keyword", keyword="election", tradition="reformed"
  - All Reformed catechisms: mode="list", tradition="reformed", format="catechism"`;

const DESC_PARALLEL_TEXT = `Compare biblical text across multiple translations side by side.

Returns verse-aligned multi-translation output for easy comparison. Hard cap: 30 verses. For larger ranges, make multiple calls.

Args:
  - book (string, required): Book name in any common form (e.g., "Romans", "Gen", "1 Cor")
  - range (string, required): Verse range "8:28-8:30", abbreviated "8:28-30", or single verse "8:28". Max 30 verses.
  - translations (string[], optional): Translations to compare (default: all 6). Options: BSB, WEB, KJV, ASV, YLT, DBY

Returns: { book, range, verses: [{chapter, verse, translations: {BSB: "...", KJV: "...", ...}}], missing_verses?, truncated, versification_note? }

Examples:
  - All translations of John 3:16: book="John", range="3:16"
  - KJV vs BSB for Romans 8:28-30: book="Romans", range="8:28-30", translations=["KJV", "BSB"]
  - Psalm 23 across all: book="Psalms", range="23:1-23:6"`;

// ─── CORS ─────────────────────────────────────────────────────────────────────

// CORS is not required for MCP clients (Claude Desktop, Claude Code are native
// apps, not browsers). It is included to enable browser-based callers (web tools,
// debugging UIs). Applied to all responses including the MCP transport response.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

// ─── Response cache ───────────────────────────────────────────────────────────

// Cache MCP tool results keyed by tool name + sorted args JSON.
// Biblical reference data is static — entries never need invalidation.
// Cache intercepts inside the CallTool handler before MCP serialization.
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

async function cachedToolCall(
  name: string,
  args: Record<string, unknown>,
  handler: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  const sortedArgs = stableStringify(args);
  const cacheKey = new Request(`https://cache/v4/${name}/${encodeURIComponent(sortedArgs)}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return JSON.parse(await cached.text()) as CallToolResult;
  }

  const result = await handler();
  const response = new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
  });
  try {
    await cache.put(cacheKey, response.clone());
  } catch {
    // Cache write failures are non-fatal — response is still returned from handler()
  }
  return result;
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

// Per-request McpServer instance. The MCP SDK's Protocol.connect() is single-use
// — calling it twice on the same Server throws "Already connected". Creating
// per request is cheap (constructor only sets up handler maps, no I/O).
function createServer(): McpServer {
  const server = new McpServer(
    { name: 'claude-of-alexandria-mcp', version: '3.0.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool('list_books', {
    title: 'List Biblical Books',
    description: DESC_LIST_BOOKS,
    inputSchema: ListBooksInputSchema,
    outputSchema: ListBooksOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('list_books', args as unknown as Record<string, unknown>, () => listBooks(args))
  );

  server.registerTool('query_discourse_features', {
    title: 'Query Discourse Features',
    description: DESC_DISCOURSE,
    inputSchema: DiscourseInputSchema,
    outputSchema: DiscourseOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_discourse_features', args as unknown as Record<string, unknown>, () => queryDiscourseFeatures(args))
  );

  server.registerTool('query_paragraph_breaks', {
    title: 'Query Paragraph Breaks',
    description: DESC_PARAGRAPHS,
    inputSchema: ParagraphsInputSchema,
    outputSchema: ParagraphsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_paragraph_breaks', args as unknown as Record<string, unknown>, () => queryParagraphBreaks(args))
  );

  server.registerTool('query_vocabulary', {
    title: 'Query Vocabulary',
    description: DESC_VOCABULARY,
    inputSchema: VocabularyInputSchema,
    outputSchema: VocabularyOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_vocabulary', args as unknown as Record<string, unknown>, () => queryVocabulary(args))
  );

  server.registerTool('query_morphology', {
    title: 'Query Morphology',
    description: DESC_MORPHOLOGY,
    inputSchema: MorphologyInputSchema,
    outputSchema: MorphologyOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize fields: omitting and passing "basic" must produce the same cache key
    // Normalize strongs_filter: H430 → H0430 (4-digit zero-padded) for consistent cache keys
    let normalizedStrongs = args.strongs_filter;
    if (normalizedStrongs) {
      const match = normalizedStrongs.match(/^([HG])0*(\d+)([a-z]?)$/);
      if (match) {
        normalizedStrongs = `${match[1]}${match[2].padStart(4, '0')}${match[3]}`;
      }
    }
    const normalizedArgs = {
      ...args,
      fields: args.fields ?? 'basic',
      ...(normalizedStrongs !== undefined && { strongs_filter: normalizedStrongs }),
    };
    return cachedToolCall(
      'query_morphology',
      normalizedArgs as unknown as Record<string, unknown>,
      () => queryMorphology(normalizedArgs)
    );
  });

  server.registerTool('query_ot_quotes', {
    title: 'Query OT Quotations in NT',
    description: DESC_OT_QUOTES,
    inputSchema: OtQuotesInputSchema,
    outputSchema: OtQuotesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_ot_quotes', args as unknown as Record<string, unknown>, () => queryOtQuotes(args))
  );

  server.registerTool('query_themes_for_lemmas', {
    title: 'Resolve Lemmas to Themes',
    description: DESC_THEMES,
    inputSchema: ThemesInputSchema,
    outputSchema: ThemesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize lemmas BEFORE cachedToolCall so identical sets produce the same cache key.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_themes_for_lemmas',
      normalizedArgs as unknown as Record<string, unknown>,
      () => queryThemesForLemmas({ ...args, lemmas: normalizedLemmas } as unknown as import('./tools/themes.js').ThemesInput)
    );
  });

  server.registerTool('query_lemmas', {
    title: 'Query Lemma Distribution',
    description: DESC_LEMMAS,
    inputSchema: LemmasInputSchema,
    outputSchema: LemmasOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize lemmas: dedup + sort for cache key stability.
    // stableStringify sorts object keys but preserves array order — dedup+sort here is required.
    const normalizedLemmas = [...new Set(args.lemmas as string[])].sort();
    const normalizedArgs = { ...args, lemmas: normalizedLemmas };
    return cachedToolCall(
      'query_lemmas',
      normalizedArgs as unknown as Record<string, unknown>,
      () => queryLemmas(normalizedArgs as unknown as LemmasInput)
    );
  });

  server.registerTool('query_theme', {
    title: 'Query Theme Distribution',
    description: DESC_THEME_DISTRIBUTION,
    inputSchema: ThemeDistributionInputSchema,
    outputSchema: ThemeDistributionOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_theme', args as unknown as Record<string, unknown>, () => queryThemeDistribution(args))
  );

  server.registerTool('query_lexicon', {
    title: 'Query Lexicon',
    description: DESC_LEXICON,
    inputSchema: LexiconInputSchema,
    outputSchema: LexiconOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_lexicon', args as unknown as Record<string, unknown>, () => queryLexicon(args))
  );

  server.registerTool('check_versification', {
    title: 'Check Versification',
    description: DESC_VERSIFICATION,
    inputSchema: VersificationInputSchema,
    outputSchema: VersificationOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('check_versification', args as unknown as Record<string, unknown>, () => checkVersification(args))
  );

  server.registerTool('query_cross_references', {
    title: 'Query Cross-References',
    description: DESC_CROSS_REFERENCES,
    inputSchema: CrossReferencesInputSchema,
    outputSchema: CrossReferencesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_cross_references', args as unknown as Record<string, unknown>, () => queryCrossReferences(args))
  );

  server.registerTool('query_places', {
    title: 'Query Places',
    description: DESC_PLACES,
    inputSchema: PlacesInputSchema,
    outputSchema: PlacesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_places', args as unknown as Record<string, unknown>, () => queryPlaces(args))
  );

  server.registerTool('query_people', {
    title: 'Query People',
    description: DESC_PEOPLE,
    inputSchema: PeopleInputSchema,
    outputSchema: PeopleOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_people', args as unknown as Record<string, unknown>, () => queryPeople(args))
  );

  server.registerTool('query_events', {
    title: 'Query Events',
    description: DESC_EVENTS,
    inputSchema: EventsInputSchema,
    outputSchema: EventsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_events', args as unknown as Record<string, unknown>, () => queryEvents(args))
  );

  server.registerTool('query_person_network', {
    title: 'Query Person Network',
    description: DESC_PERSON_NETWORK,
    inputSchema: PersonNetworkInputSchema,
    outputSchema: PersonNetworkOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_person_network', args as unknown as Record<string, unknown>, () => queryPersonNetwork(args))
  );

  server.registerTool('query_speakers', {
    title: 'Query Speaker Quotations',
    description: DESC_SPEAKERS,
    inputSchema: SpeakersInputSchema,
    outputSchema: SpeakersOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_speakers', args as unknown as Record<string, unknown>, () => speakersQuery(args))
  );

  server.registerTool('query_syntax', {
    title: 'Query Syntax Annotations',
    description: DESC_SYNTAX,
    inputSchema: SyntaxInputSchema,
    outputSchema: SyntaxOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_syntax', args as unknown as Record<string, unknown>, () => querySyntax(args))
  );

  server.registerTool('query_variants', {
    title: 'Query Textual Variants',
    description: DESC_VARIANTS,
    inputSchema: VariantsInputSchema,
    outputSchema: VariantsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_variants', args as unknown as Record<string, unknown>, () => queryVariants(args))
  );

  server.registerTool('bible_lookup', {
    title: 'Look Up Bible Text',
    description: DESC_BIBLE_LOOKUP,
    inputSchema: BibleLookupInputSchema,
    outputSchema: BibleLookupOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('bible_lookup', args as unknown as Record<string, unknown>, () => bibleLookup(args))
  );

  server.registerTool('commentary_lookup', {
    title: 'Look Up Commentary',
    description: DESC_COMMENTARY_LOOKUP,
    inputSchema: CommentaryLookupInputSchema,
    outputSchema: CommentaryLookupOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('commentary_lookup', args as unknown as Record<string, unknown>, () => commentaryLookup(args))
  );

  server.registerTool('parallel_text', {
    title: 'Parallel Text Comparison',
    description: DESC_PARALLEL_TEXT,
    inputSchema: ParallelTextInputSchema,
    outputSchema: ParallelTextOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) => {
    // Normalize translations array for cache key stability (sort before caching)
    const translations = args.translations
      ? [...new Set(args.translations as string[])].sort()
      : undefined;
    const normalizedArgs = translations ? { ...args, translations } : args;
    return cachedToolCall(
      'parallel_text',
      normalizedArgs as unknown as Record<string, unknown>,
      () => parallelText(normalizedArgs as unknown as ParallelTextInput)
    );
  });

  server.registerTool('confessional_lookup', {
    title: 'Confessional Lookup',
    description: DESC_CONFESSIONAL_LOOKUP,
    inputSchema: ConfessionalLookupInputSchema,
    outputSchema: ConfessionalLookupOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('confessional_lookup', args as unknown as Record<string, unknown>, () =>
      confessionalLookup(args as unknown as ConfessionalLookupInput)
    )
  );

  return server;
}

// ─── Worker entry point ───────────────────────────────────────────────────────

// AUTH BOUNDARY: This server is intentionally unauthenticated. It serves read-only,
// public-domain biblical reference data. If write operations, user-specific data,
// or administrative endpoints are ever added, authentication becomes mandatory.

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check with D1 connectivity probe
    if (url.pathname === '/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return new Response(
          JSON.stringify({ status: 'ok', version: '3.0.0', db: 'connected' }),
          { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      } catch {
        return new Response(
          JSON.stringify({ status: 'degraded', version: '3.0.0', db: 'unreachable' }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
    }

    // Only /mcp path is handled by MCP transport
    if (url.pathname !== '/mcp') {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    // Stateless Workers cannot maintain long-lived SSE connections.
    // Return 405 for GET so MCP clients (mcp-remote, Claude Code) fall back to POST-only mode.
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'POST, OPTIONS', ...CORS_HEADERS },
      });
    }

    // Inject D1 binding for this request
    setDb(env.DB);

    // Per-request Server and transport
    const server = createServer();
    // Stateless mode: sessionIdGenerator omitted intentionally.
    // Per-request transports require stateless mode — each request creates a new
    // transport with no session history. Stateful mode would reject all non-initialize
    // requests because the new transport has no knowledge of the session ID issued
    // by a previous transport instance.
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);

    // Apply CORS headers to transport response (enables browser-based callers)
    const mcpResponse = await transport.handleRequest(request);
    const responseHeaders = new Headers(mcpResponse.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v);
    }
    return new Response(mcpResponse.body, { status: mcpResponse.status, headers: responseHeaders });
  },
};
