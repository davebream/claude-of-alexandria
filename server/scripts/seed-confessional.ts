/**
 * seed-confessional.ts
 * ETL script: fetches Creeds.json, transforms confessional documents,
 * and emits SQL INSERT statements for D1 ingestion.
 *
 * Usage:
 *   cd server && npx tsx scripts/seed-confessional.ts --output /tmp/confessional-seed.sql
 *   cd server && npx tsx scripts/seed-confessional.ts --local <path-to-creeds-dir>
 *
 * Source: Creeds.json (Unlicense) — https://github.com/NonlinearFruit/Creeds.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lookupBook } from '../src/db/books.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Static verse-count map ────────────────────────────────────────────────
// Maps canonical book name → array of verse counts indexed by chapter (1-based,
// index 0 is unused). Derived from the standard Protestant canon.
// Used for cross-chapter range expansion only — not queried from D1 at ETL time.
export const VERSE_COUNTS: Record<string, number[]> = {
  genesis:        [0,31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  exodus:         [0,22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  leviticus:      [0,17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,24,8,12,14,44,16,33,24,33,44],
  numbers:        [0,54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  deuteronomy:    [0,46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  joshua:         [0,18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  judges:         [0,36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  ruth:           [0,22,23,18,22],
  '1_samuel':     [0,28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  '2_samuel':     [0,27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  '1_kings':      [0,53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  '2_kings':      [0,18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  '1_chronicles': [0,54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  '2_chronicles': [0,17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  ezra:           [0,11,70,13,24,17,22,28,36,15,44],
  nehemiah:       [0,11,20,32,23,19,19,73,18,38,39,36,47,31],
  esther:         [0,22,23,15,17,14,14,10,17,32,3],
  job:            [0,22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  psalms:         [0,6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  proverbs:       [0,33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
  ecclesiastes:   [0,18,26,22,16,20,12,29,17,18,20,10,14],
  song_of_songs:  [0,17,17,11,16,16,13,13,14],
  isaiah:         [0,31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  jeremiah:       [0,19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  lamentations:   [0,22,22,66,22,22],
  ezekiel:        [0,28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  daniel:         [0,21,49,30,37,31,28,28,27,27,21,45,13],
  hosea:          [0,11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  joel:           [0,20,32,21],
  amos:           [0,15,16,15,13,27,14,17,14,15],
  obadiah:        [0,21],
  jonah:          [0,17,10,10,11],
  micah:          [0,16,13,12,13,15,16,20],
  nahum:          [0,15,13,19],
  habakkuk:       [0,17,20,19],
  zephaniah:      [0,18,15,20],
  haggai:         [0,15,23],
  zechariah:      [0,21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  malachi:        [0,14,17,18,6],
  matthew:        [0,25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  mark:           [0,45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  luke:           [0,80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  john:           [0,51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  acts:           [0,26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  romans:         [0,32,29,31,25,21,23,25,39,33,21,36,21,14,26,33,24],
  '1_corinthians':[0,31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
  '2_corinthians':[0,24,17,18,18,21,18,16,24,15,18,33,21,14],
  galatians:      [0,24,21,29,31,26,18],
  ephesians:      [0,23,22,21,28,30,14],
  philippians:    [0,30,30,21,23],
  colossians:     [0,29,23,25,18],
  '1_thessalonians':[0,10,20,13,18,28],
  '2_thessalonians':[0,12,17,18],
  '1_timothy':    [0,20,15,16,16,25,21],
  '2_timothy':    [0,18,26,17,22],
  titus:          [0,16,15,15],
  philemon:       [0,25],
  hebrews:        [0,14,18,19,16,14,20,28,13,28,39,40,29,25],
  james:          [0,27,26,18,17,20],
  '1_peter':      [0,25,25,22,19,14],
  '2_peter':      [0,21,22,18],
  '1_john':       [0,10,29,24,21,21],
  '2_john':       [0,13],
  '3_john':       [0,14],
  jude:           [0,25],
  revelation:     [0,20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21],
};

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * Parse a single Creeds.json proof-text citation into individual verse rows.
 *
 * Citation formats:
 *   Single verse:       "Ps.19.1"
 *   Dash range:         "Gen.1.1-Gen.1.5"  or  "1Cor.15.1-1Cor.15.4"
 *   Comma-separated:    "Luke.16.29,Luke.16.31"  (two independent verses, not a range)
 *
 * Returns an array of { book, chapter, verse } objects (one per verse).
 * Returns [] and logs a warning for unresolvable book abbreviations.
 * Clamps verses exceeding chapter length and logs a warning.
 */
export function parseProofTextRef(citation: string): VerseRef[] {
  // Handle comma-separated references (multiple independent verses in one citation)
  if (citation.includes(',')) {
    const parts = citation.split(',');
    const results: VerseRef[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) {
        results.push(...parseProofTextRef(trimmed));
      }
    }
    return results;
  }

  // Split on '-' only between two full Book.Ch.V endpoints.
  // A range dash appears between digits (end of first V) and a letter (start of second Book).
  // Since book abbreviations can start with a digit (1Cor), we split on the LAST '-' that is
  // preceded by a digit — this handles "1Cor.15.1-1Cor.15.4" correctly.
  const dashIndex = findRangeDash(citation);

  if (dashIndex === -1) {
    // Single reference
    return parseSingleRef(citation);
  }

  const startStr = citation.slice(0, dashIndex);
  const endStr = citation.slice(dashIndex + 1);
  return expandRange(startStr, endStr);
}

/**
 * Find the index of the range-separating dash in a citation like "Gen.1.1-Gen.1.5".
 * Returns -1 if no range dash exists (single reference).
 *
 * The range dash sits between two verse numbers (digit) and a book abbreviation (letter or digit).
 * We locate the dash that follows a digit AND precedes a letter — this excludes negative numbers
 * and matches the standard Creeds.json dot-notation format.
 */
function findRangeDash(citation: string): number {
  for (let i = citation.length - 1; i >= 0; i--) {
    if (citation[i] === '-' && i > 0) {
      const before = citation[i - 1];
      const after = citation[i + 1] ?? '';
      if (/\d/.test(before) && /[A-Za-z0-9]/.test(after)) {
        return i;
      }
    }
  }
  return -1;
}

function parseSingleRef(ref: string): VerseRef[] {
  const parsed = parseEndpoint(ref);
  if (!parsed) return [];
  const { book, chapter, verse } = parsed;
  const clamped = clampVerse(book, chapter, verse);
  return [{ book, chapter, verse: clamped }];
}

// Creeds.json-specific book abbreviation aliases not covered by lookupBook
// Maps lowercase Creeds.json abbreviation → lookupBook-compatible abbreviation
const CREEDS_BOOK_ALIASES: Record<string, string> = {
  'song': 'SongOfSongs',  // "Song" = Song of Solomon / Song of Songs
  'cant': 'SongOfSongs',  // Canticum (Latin abbreviation used in some Reformed confessions)
};

function parseEndpoint(ref: string): { book: string; chapter: number; verse: number } | null {
  // Format: BookAbbrev.chapter.verse  (e.g. "Ps.19.1", "1Cor.15.3")
  // Also handles chapter-only refs: "Ps.88" → treat as "Ps.88.1" (verse 1)
  const dotCount = (ref.match(/\./g) || []).length;
  if (dotCount < 1) {
    console.warn(`[seed-confessional] Cannot parse ref endpoint: "${ref}" (expected at least 1 dot)`);
    return null;
  }
  if (dotCount === 1) {
    // Chapter-only reference (e.g. "Gen.1", "Ps.88") — default to verse 1
    console.warn(`[seed-confessional] Chapter-only ref: "${ref}" — defaulting to verse 1`);
    return parseEndpoint(`${ref}.1`);
  }

  // Split on the LAST two dots to get chapter and verse
  const lastDot = ref.lastIndexOf('.');
  const secondLastDot = ref.lastIndexOf('.', lastDot - 1);

  const rawAbbrev = ref.slice(0, secondLastDot);
  // Resolve Creeds.json-specific aliases before passing to lookupBook
  const bookAbbrev = CREEDS_BOOK_ALIASES[rawAbbrev.toLowerCase()] ?? rawAbbrev;
  const chapter = parseInt(ref.slice(secondLastDot + 1, lastDot), 10);
  const verse = parseInt(ref.slice(lastDot + 1), 10);

  if (isNaN(chapter) || isNaN(verse)) {
    console.warn(`[seed-confessional] Cannot parse chapter/verse in: "${ref}"`);
    return null;
  }

  const bookInfo = lookupBook(bookAbbrev);
  if (!bookInfo) {
    console.warn(`[seed-confessional] Unresolvable book abbreviation: "${bookAbbrev}" in ref "${ref}"`);
    return null;
  }

  return { book: bookInfo.canonical, chapter, verse };
}

function clampVerse(book: string, chapter: number, verse: number): number {
  const counts = VERSE_COUNTS[book];
  if (!counts || chapter < 1 || chapter >= counts.length) return verse;
  const max = counts[chapter];
  if (verse > max) {
    console.warn(`[seed-confessional] Verse ${verse} exceeds chapter length for ${book} ${chapter} (max ${max}) — clamping`);
    return max;
  }
  return verse;
}

function expandRange(startStr: string, endStr: string): VerseRef[] {
  const start = parseEndpoint(startStr);
  const end = parseEndpoint(endStr);

  if (!start || !end) return [];

  const results: VerseRef[] = [];

  if (start.book !== end.book) {
    // Cross-book range: expand start book through end of its last chapter, then end book from beginning.
    // In practice, genuine cross-book ranges are rare in Creeds.json. Treat conservatively:
    // expand start ref through end of start book's last chapter, then expand end book from 1:1 to end ref.
    const startBookCounts = VERSE_COUNTS[start.book];
    if (startBookCounts) {
      for (let ch = start.chapter; ch < startBookCounts.length; ch++) {
        const startV = ch === start.chapter ? start.verse : 1;
        const endV = startBookCounts[ch];
        for (let v = startV; v <= endV; v++) {
          results.push({ book: start.book, chapter: ch, verse: v });
        }
      }
    } else {
      results.push({ book: start.book, chapter: start.chapter, verse: start.verse });
    }

    const endBookCounts = VERSE_COUNTS[end.book];
    if (endBookCounts) {
      for (let ch = 1; ch <= end.chapter; ch++) {
        const endV = ch === end.chapter ? end.verse : endBookCounts[ch];
        for (let v = 1; v <= endV; v++) {
          results.push({ book: end.book, chapter: ch, verse: v });
        }
      }
    } else {
      results.push({ book: end.book, chapter: end.chapter, verse: end.verse });
    }

    return results;
  }

  // Same book — expand from start to end
  const bookCounts = VERSE_COUNTS[start.book];

  for (let ch = start.chapter; ch <= end.chapter; ch++) {
    const rawStartV = ch === start.chapter ? start.verse : 1;
    const rawEndV = ch === end.chapter
      ? end.verse
      : (bookCounts ? bookCounts[ch] : end.verse);
    const chMax = bookCounts ? (bookCounts[ch] ?? rawEndV) : rawEndV;
    // Clamp both start and end verse to chapter max
    const startV = Math.min(rawStartV, chMax);
    const clampedEndV = Math.min(rawEndV, chMax);
    if (rawStartV > chMax) {
      console.warn(`[seed-confessional] Start verse ${rawStartV} exceeds chapter length for ${start.book} ${ch} (max ${chMax}) — clamping`);
    }
    if (rawEndV > chMax) {
      console.warn(`[seed-confessional] End verse ${rawEndV} exceeds chapter length for ${start.book} ${ch} (max ${chMax}) — clamping`);
    }
    for (let v = startV; v <= clampedEndV; v++) {
      results.push({ book: start.book, chapter: ch, verse: v });
    }
  }

  return results;
}

// ─── Copyright exclusion list ──────────────────────────────────────────────
// Documents whose Metadata.SourceAttribution indicates a copyright restriction.
// Slugs are the filename without '.json' (e.g. 'chicago_statement_on_biblical_inerrancy').
// Confirmed from Creeds.json repo inspection (May 2026):
//   - chicago_statement_on_biblical_inerrancy: "Copyright - Alliance of Confessing Evangelicals, Inc"
//   - helvetic_consensus: "Translation Copyright 1990 - Martin Klauber"
//   - shema_yisrael: "Copyright - Crossway"
const COPYRIGHT_EXCLUDED_SLUGS = new Set<string>([
  'chicago_statement_on_biblical_inerrancy',
  'helvetic_consensus',
  'shema_yisrael',
]);

// ─── Tradition classification map ─────────────────────────────────────────
// Maps document slug (filename without .json) → tradition string.
// Covers all 43 confirmed documents in NonlinearFruit/Creeds.json (May 2026).
// 'other' is the fallback for any slug not explicitly listed.
const TRADITION_MAP: Record<string, string> = {
  // Reformed / Presbyterian
  'westminster_confession_of_faith':          'reformed',
  'westminster_shorter_catechism':            'reformed',
  'westminster_larger_catechism':             'reformed',
  'belgic_confession_of_faith':               'reformed',
  'heidelberg_catechism':                     'reformed',
  'canons_of_dort':                           'reformed',
  'london_baptist_1689':                      'reformed',
  'savoy_declaration':                        'reformed',
  'abstract_of_principles':                   'reformed',
  'puritan_catechism':                        'reformed',
  'keachs_catechism':                         'reformed',
  '1695_baptist_catechism':                   'reformed',
  'catechism_for_young_children':             'reformed',
  'exposition_of_the_assemblies_catechism':   'reformed',
  'shorter_catechism_explained':              'reformed',
  'matthew_henrys_scripture_catechism':       'reformed',
  // Ancient / Ecumenical
  'apostles_creed':                           'ancient',
  'nicene_creed':                             'ancient',
  'athanasian_creed':                         'ancient',
  'chalcedonian_definition':                  'ancient',
  // Reformation / Continental
  'scots_confession':                         'reformed',
  'french_confession_of_faith':               'reformed',
  'second_helvetic_confession':               'reformed',
  'first_helvetic_confession':                'reformed',
  'first_confession_of_basel':                'reformed',
  'waldensian_confession':                    'reformed',
  'tetrapolitan_confession':                  'reformed',
  'ten_theses_of_berne':                      'reformed',
  'consensus_tigurinus':                      'reformed',
  'zwinglis_67_articles':                     'reformed',
  'zwinglis_fidei_ratio':                     'reformed',
  'council_of_orange':                        'ancient',
  // Patristic / Early Church
  'gregorys_declaration_of_faith':            'ancient',
  'ignatius_creed':                           'ancient',
  'irenaeus_rule_of_faith':                   'ancient',
  'tertullians_rule_of_faith':                'ancient',
  // Scripture passages / hymns
  'christ_hymn_of_colossians':                'other',
  'christ_hymn_of_philippians':               'other',
  'christian_shema':                          'other',
  'confession_of_peter':                      'other',
  // Copyright-excluded (slugs present for reference — excluded by COPYRIGHT_EXCLUDED_SLUGS)
  'chicago_statement_on_biblical_inerrancy':  'other',
  'helvetic_consensus':                       'reformed',
  'shema_yisrael':                            'other',
};

function getTradition(slug: string): string {
  return TRADITION_MAP[slug] ?? 'other';
}

// ─── SQL helpers ──────────────────────────────────────────────────────────
function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

// ─── Creeds.json type definitions ─────────────────────────────────────────
// Confirmed by inspecting NonlinearFruit/Creeds.json repo (May 2026).
// Each document JSON has: { Metadata: {...}, Data: [...] | {...} }
// "Proofs" is the field name (not "ProofTexts").
interface ProofEntry {
  Id: number;
  References: string[];
}

interface ConfessionSection {
  Section: number | string;  // Canons of Dort uses string sections like "A1", "R1"
  Content: string;
  ContentWithProofs?: string;
  Proofs: ProofEntry[];
}

interface ConfessionChapter {
  Chapter: number | string;  // Canons of Dort uses string chapter numbers
  Title?: string;
  Sections: ConfessionSection[];
}

interface CatechismQuestion {
  Number: number;
  Question: string;
  Answer: string;
  AnswerWithProofs?: string;
  Proofs?: ProofEntry[];
}

// Canon-format documents (e.g. Zwingli's 67 Articles, Consensus Tigurinus)
interface CanonArticle {
  Article: string | number;
  Title?: string;
  Content: string;
  ContentWithProofs?: string;
  Proofs?: ProofEntry[];
}

// Creed-format documents (e.g. Apostles' Creed): Data is a dict not an array
interface CreedData {
  Content: string;
  ContentWithProofs?: string;
  Proofs?: ProofEntry[];
}

interface CreedsMetadata {
  Title: string;
  Year?: string;
  SourceAttribution?: string;
  CreedFormat?: string;  // 'Confession' | 'Catechism' | 'Canon' | 'Creed'
}

interface CreedsDocument {
  Metadata: CreedsMetadata;
  // Data is an array for Confession/Catechism/Canon formats,
  // or an object (CreedData) for simple Creed format
  Data: ConfessionChapter[] | CatechismQuestion[] | CanonArticle[] | CreedData;
}

// ─── Confirmed document filenames in NonlinearFruit/Creeds.json ───────────
// Source: creeds/ directory listing, May 2026 (43 files total).
// The repo has no aggregate JSON file — each document is fetched individually.
// Filenames without .json extension = the slug used in TRADITION_MAP and copyright check.
const CREEDS_FILENAMES = [
  '1695_baptist_catechism', 'abstract_of_principles', 'apostles_creed',
  'athanasian_creed', 'belgic_confession_of_faith', 'canons_of_dort',
  'catechism_for_young_children', 'chalcedonian_definition',
  'chicago_statement_on_biblical_inerrancy', 'christ_hymn_of_colossians',
  'christ_hymn_of_philippians', 'christian_shema', 'confession_of_peter',
  'consensus_tigurinus', 'council_of_orange', 'exposition_of_the_assemblies_catechism',
  'first_confession_of_basel', 'first_helvetic_confession', 'french_confession_of_faith',
  'gregorys_declaration_of_faith', 'heidelberg_catechism', 'helvetic_consensus',
  'ignatius_creed', 'irenaeus_rule_of_faith', 'keachs_catechism',
  'london_baptist_1689', 'matthew_henrys_scripture_catechism', 'nicene_creed',
  'puritan_catechism', 'savoy_declaration', 'scots_confession',
  'second_helvetic_confession', 'shema_yisrael', 'shorter_catechism_explained',
  'ten_theses_of_berne', 'tertullians_rule_of_faith', 'tetrapolitan_confession',
  'waldensian_confession', 'westminster_confession_of_faith',
  'westminster_larger_catechism', 'westminster_shorter_catechism',
  'zwinglis_67_articles', 'zwinglis_fidei_ratio',
] as const;

const CREEDS_BASE_URL = 'https://raw.githubusercontent.com/NonlinearFruit/Creeds.json/master/creeds';

// ─── ETL main ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const localIndex = args.indexOf('--local');
  const outputIndex = args.indexOf('--output');

  // RC-3: Guard against missing --local argument
  if (localIndex !== -1 && !args[localIndex + 1]) {
    console.error('[seed-confessional] --local flag requires a path argument (directory containing <slug>.json files)');
    process.exit(1);
  }

  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : '/tmp/confessional-seed.sql';
  const localDir = localIndex !== -1 ? args[localIndex + 1] : null;

  console.log(`[seed-confessional] Output: ${outputPath}`);

  // ── Phase 1: Fetch source ──
  // There is no aggregate creeds.json file in the repo.
  // Each document is fetched individually from creeds/<slug>.json.
  const documents: Array<{ slug: string; doc: CreedsDocument }> = [];

  if (localDir) {
    console.log(`[seed-confessional] Loading from local directory: ${localDir}`);
    for (const slug of CREEDS_FILENAMES) {
      const filePath = join(localDir, `${slug}.json`);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const doc = JSON.parse(raw) as CreedsDocument;
        documents.push({ slug, doc });
      } catch (err) {
        console.warn(`[seed-confessional] Skipping ${slug}: ${err}`);
      }
    }
  } else {
    console.log('[seed-confessional] Fetching individual document files from GitHub...');
    for (const slug of CREEDS_FILENAMES) {
      const url = `${CREEDS_BASE_URL}/${slug}.json`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[seed-confessional] HTTP ${response.status} fetching ${slug} — skipping`);
          continue;
        }
        const doc = await response.json() as CreedsDocument;
        documents.push({ slug, doc });
      } catch (err) {
        console.warn(`[seed-confessional] Error fetching ${slug}: ${err} — skipping`);
      }
    }
  }

  console.log(`[seed-confessional] Loaded ${documents.length} documents.`);

  // ── Phase 2: Transform and emit SQL ──
  const lines: string[] = [
    '-- confessional-seed.sql',
    '-- Generated by seed-confessional.ts — do not edit manually.',
    '-- Apply with: npx wrangler d1 execute <DB_NAME> --file=<this-file> --remote',
    '',
    '-- Documents',
  ];

  let docId = 0;
  let sectionId = 0;
  let proofId = 0;
  let skippedCopyright = 0;
  let skippedSections = 0;
  const unresolvedRefs: string[] = [];

  for (const { slug, doc: creedsDoc } of documents) {
    if (COPYRIGHT_EXCLUDED_SLUGS.has(slug)) {
      console.log(`[seed-confessional] Skipping copyright-excluded document: ${slug}`);
      skippedCopyright++;
      continue;
    }

    docId++;
    const tradition = getTradition(slug);
    const title = creedsDoc.Metadata.Title;
    // Year may be prefixed with "c. " (circa) or other text — extract first integer found
    const yearRaw = creedsDoc.Metadata.Year;
    const yearMatch = yearRaw ? yearRaw.match(/\d{3,4}/) : null;
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const authors = null; // Creeds.json does not provide structured author data in a consistently parseable form

    // Use creedsDoc.Metadata.CreedFormat for format detection instead of data-shape inference.
    // CreedFormat values: 'Confession' | 'Catechism' | 'Canon' | 'Creed'
    // Canon and Creed format documents are ingested as confessional_documents rows but will have
    // zero sections — this is intentional. They represent non-structured texts (creeds, articles)
    // that lack a chapter/section or question/answer hierarchy.
    const creedFormat = creedsDoc.Metadata.CreedFormat?.toLowerCase() ?? 'confession';
    const format: 'confession' | 'catechism' = creedFormat === 'catechism' ? 'catechism' : 'confession';
    const data = creedsDoc.Data;

    lines.push(
      `INSERT OR REPLACE INTO confessional_documents (id, slug, title, year, tradition, format, authors, source) VALUES (${docId}, ${escapeSQL(slug)}, ${escapeSQL(title)}, ${escapeNum(year)}, ${escapeSQL(tradition)}, ${escapeSQL(format)}, ${escapeSQL(authors)}, 'Creeds.json');`
    );

    if (format === 'confession' && Array.isArray(data)) {
      const chapters = data as ConfessionChapter[];
      lines.push('');
      lines.push(`-- Sections: ${slug}`);
      for (const chapter of chapters) {
        // Coerce chapter number to integer (Canons of Dort uses string "1", "2", etc.)
        const chapterNum = typeof chapter.Chapter === 'number'
          ? chapter.Chapter
          : parseInt(String(chapter.Chapter), 10);
        const chapterNumSql = isNaN(chapterNum) ? 'NULL' : String(chapterNum);

        for (const section of chapter.Sections ?? []) {
          if (!section.Content) {
            console.warn(`[seed-confessional] Section missing Content in ${slug} ch${chapter.Chapter} s${section.Section} — skipping`);
            skippedSections++;
            continue;
          }
          // Coerce section number to integer (Canons of Dort uses "A1", "R1" etc.)
          const sectionNum = typeof section.Section === 'number'
            ? section.Section
            : parseInt(String(section.Section).replace(/[^0-9]/g, ''), 10);
          const sectionNumSql = isNaN(sectionNum) ? 'NULL' : String(sectionNum);

          sectionId++;
          lines.push(
            `INSERT INTO confessional_sections (id, document_id, chapter_number, chapter_title, section_number, content, content_with_proofs) VALUES (${sectionId}, ${docId}, ${chapterNumSql}, ${escapeSQL(chapter.Title)}, ${sectionNumSql}, ${escapeSQL(section.Content)}, ${escapeSQL(section.ContentWithProofs)});`
          );

          // Field name is Proofs, not ProofTexts (confirmed during C5 research)
          for (const pt of section.Proofs ?? []) {
            for (const ref of pt.References ?? []) {
              const verses = parseProofTextRef(ref);
              if (verses.length === 0) {
                unresolvedRefs.push(`${slug}:ch${chapter.Chapter}s${section.Section}:${ref}`);
                continue;
              }
              for (const v of verses) {
                proofId++;
                lines.push(
                  `INSERT OR IGNORE INTO confessional_proof_texts (id, section_id, proof_group, book, chapter, verse) VALUES (${proofId}, ${sectionId}, ${pt.Id}, ${escapeSQL(v.book)}, ${v.chapter}, ${v.verse});`
                );
              }
            }
          }
        }
      }
    } else if (format === 'catechism' && Array.isArray(data)) {
      const questions = data as CatechismQuestion[];
      lines.push('');
      lines.push(`-- Questions: ${slug}`);
      for (const q of questions) {
        if (!q.Question || !q.Answer) {
          console.warn(`[seed-confessional] Question missing Question/Answer in ${slug} Q${q.Number} — skipping`);
          skippedSections++;
          continue;
        }
        sectionId++;
        lines.push(
          `INSERT INTO confessional_sections (id, document_id, question_number, question, answer, answer_with_proofs) VALUES (${sectionId}, ${docId}, ${q.Number}, ${escapeSQL(q.Question)}, ${escapeSQL(q.Answer)}, ${escapeSQL(q.AnswerWithProofs)});`
        );

        // Field name is Proofs, not ProofTexts (confirmed during C5 research)
        for (const pt of q.Proofs ?? []) {
          for (const ref of pt.References ?? []) {
            const verses = parseProofTextRef(ref);
            if (verses.length === 0) {
              unresolvedRefs.push(`${slug}:Q${q.Number}:${ref}`);
              continue;
            }
            for (const v of verses) {
              proofId++;
              lines.push(
                `INSERT OR IGNORE INTO confessional_proof_texts (id, section_id, proof_group, book, chapter, verse) VALUES (${proofId}, ${sectionId}, ${pt.Id}, ${escapeSQL(v.book)}, ${v.chapter}, ${v.verse});`
              );
            }
          }
        }
      }
    }
  }

  // ── Phase 3: Write output ──
  const sql = lines.join('\n') + '\n';
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n[seed-confessional] Written to: ${outputPath}`);

  // ── Validation report ──
  console.log('\n=== Validation Report ===');
  console.log(`Documents ingested:          ${docId}`);
  console.log(`Sections ingested:           ${sectionId}`);
  console.log(`Proof-text rows emitted:     ${proofId}`);
  console.log(`Copyright-excluded docs:     ${skippedCopyright}`);
  console.log(`Skipped sections (errors):   ${skippedSections}`);
  console.log(`Unresolvable proof refs:     ${unresolvedRefs.length}`);
  if (unresolvedRefs.length > 0) {
    console.warn('\nUnresolvable proof-text references:');
    for (const r of unresolvedRefs) {
      console.warn(`  ${r}`);
    }
    console.warn('\nNote: unresolvable refs are WARNINGS, not failures. Ingestion continues with partial data.');
  }
}

// Only run main() when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
