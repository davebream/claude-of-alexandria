/**
 * Cross-References ETL — generate seed SQL from OpenBible cross-references.
 *
 * Reads the TSV file (cross_references.txt) already present in scripts/.
 * Parses From/To verse pairs, maps OpenBible abbreviations to canonical names,
 * and outputs chunked INSERT statements.
 *
 * Usage:
 *   cd server && npm run generate-cross-references
 *
 * Source:
 *   OpenBible.info Cross References (CC BY 4.0)
 *   https://www.openbible.info/labs/cross-references/
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPTS_DIR = __dirname;
const OUT_DIR = join(__dirname, '..', 'd1-seed');
const INPUT_FILE = join(SCRIPTS_DIR, 'cross_references.txt');
const OUTPUT_FILE = join(OUT_DIR, 'cross-references.sql');
const SKIP_REPORT = join(OUT_DIR, 'cross-references-skip-report.txt');
const BATCH_SIZE = 500;
// MIN_ROW_COUNT gates on resolved (ok) rows only — not total rows
const MIN_ROW_COUNT = 300_000;

// ─── Column list (arity lock: must stay in sync with INSERT header and row tuples) ──
export const XREF_COLUMNS = [
  'id', 'from_book', 'from_chapter', 'from_verse',
  'to_book', 'to_chapter', 'to_verse_start', 'to_verse_end',
  'votes', 'review_status', 'from_raw', 'to_raw',
] as const;

// ─── OpenBible abbreviation → canonical book name ────────────────────────────
const BOOK_MAP: Record<string, string> = {
  'Gen': 'Genesis', 'Exod': 'Exodus', 'Lev': 'Leviticus', 'Num': 'Numbers',
  'Deut': 'Deuteronomy', 'Josh': 'Joshua', 'Judg': 'Judges', 'Ruth': 'Ruth',
  '1Sam': '1 Samuel', '2Sam': '2 Samuel', '1Kgs': '1 Kings', '2Kgs': '2 Kings',
  '1Chr': '1 Chronicles', '2Chr': '2 Chronicles', 'Ezra': 'Ezra', 'Neh': 'Nehemiah',
  'Esth': 'Esther', 'Job': 'Job', 'Ps': 'Psalms', 'Prov': 'Proverbs',
  'Eccl': 'Ecclesiastes', 'Song': 'Song of Songs', 'Isa': 'Isaiah', 'Jer': 'Jeremiah',
  'Lam': 'Lamentations', 'Ezek': 'Ezekiel', 'Dan': 'Daniel', 'Hos': 'Hosea',
  'Joel': 'Joel', 'Amos': 'Amos', 'Obad': 'Obadiah', 'Jonah': 'Jonah',
  'Mic': 'Micah', 'Nah': 'Nahum', 'Hab': 'Habakkuk', 'Zeph': 'Zephaniah',
  'Hag': 'Haggai', 'Zech': 'Zechariah', 'Mal': 'Malachi',
  'Matt': 'Matthew', 'Mark': 'Mark', 'Luke': 'Luke', 'John': 'John',
  'Acts': 'Acts', 'Rom': 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians',
  'Gal': 'Galatians', 'Eph': 'Ephesians', 'Phil': 'Philippians', 'Col': 'Colossians',
  '1Thess': '1 Thessalonians', '2Thess': '2 Thessalonians',
  '1Tim': '1 Timothy', '2Tim': '2 Timothy', 'Titus': 'Titus', 'Phlm': 'Philemon',
  'Heb': 'Hebrews', 'Jas': 'James', '1Pet': '1 Peter', '2Pet': '2 Peter',
  '1John': '1 John', '2John': '2 John', '3John': '3 John',
  'Jude': 'Jude', 'Rev': 'Revelation',
};

export function escapeSQL(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

interface ParsedRef {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * Parse an OpenBible reference like "Gen.1.1" into components.
 */
function parseRef(ref: string): ParsedRef | null {
  const parts = ref.split('.');
  if (parts.length < 3) return null;

  const bookAbbrev = parts[0];
  const chapter = parseInt(parts[1], 10);
  const verse = parseInt(parts[2], 10);

  if (isNaN(chapter) || isNaN(verse)) return null;

  const book = BOOK_MAP[bookAbbrev];
  if (!book) return null;

  return { book, chapter, verse };
}

/**
 * Parse a "To Verse" field which may be a range like "Prov.8.22-Prov.8.30"
 * or a single verse like "Gen.1.2".
 */
function parseToRef(ref: string): { book: string; chapter: number; verseStart: number; verseEnd: number } | null {
  // Check for range: Book.Ch.V-Book.Ch.V
  const rangeParts = ref.split('-');
  if (rangeParts.length === 2) {
    const start = parseRef(rangeParts[0]);
    const end = parseRef(rangeParts[1]);
    if (start && end && start.book === end.book && start.chapter === end.chapter) {
      return {
        book: start.book,
        chapter: start.chapter,
        verseStart: start.verse,
        verseEnd: end.verse,
      };
    }
    // Cross-chapter ranges: use start verse only
    if (start) {
      return {
        book: start.book,
        chapter: start.chapter,
        verseStart: start.verse,
        verseEnd: start.verse,
      };
    }
    return null;
  }

  // Single verse
  const parsed = parseRef(ref);
  if (!parsed) return null;
  return {
    book: parsed.book,
    chapter: parsed.chapter,
    verseStart: parsed.verse,
    verseEnd: parsed.verse,
  };
}

// ─── Exported types ───────────────────────────────────────────────────────────

export type ReviewStatus = 'ok' | 'unresolved_source' | 'unresolved_target' | 'unresolved_both';

export interface ClassifiedEdge {
  reviewStatus: ReviewStatus;
  from: ParsedRef | null;
  to: { book: string; chapter: number; verseStart: number; verseEnd: number } | null;
  fromRaw: string;
  toRaw: string;
}

export interface Counts {
  ok: number;
  unresolved_source: number;
  unresolved_target: number;
  unresolved_both: number;
  malformedLines: number;
}

// ─── Pure, unit-testable helpers ─────────────────────────────────────────────

/**
 * Classify a from/to reference pair, returning the review status and parsed
 * endpoint data. fromRaw/toRaw always carry the original strings.
 */
export function classifyEdge(fromStr: string, toStr: string): ClassifiedEdge {
  const from = parseRef(fromStr);
  const to = parseToRef(toStr);

  let reviewStatus: ReviewStatus;
  if (from && to) {
    reviewStatus = 'ok';
  } else if (!from && to) {
    reviewStatus = 'unresolved_source';
  } else if (from && !to) {
    reviewStatus = 'unresolved_target';
  } else {
    reviewStatus = 'unresolved_both';
  }

  return { reviewStatus, from, to, fromRaw: fromStr, toRaw: toStr };
}

/**
 * Process raw TSV lines from the cross_references.txt input.
 *
 * Returns:
 *   rows    — SQL value tuples (one per retained edge, matching XREF_COLUMNS arity)
 *   counts  — per-status tallies including malformedLines
 *
 * Line-level guards (parts.length < 3, isNaN(votes), header/blank lines)
 * increment malformedLines and skip — these are not edges.
 * Every from/to/votes triple is RETAINED regardless of resolution status.
 */
export function processLines(lines: string[]): { rows: string[]; counts: Counts } {
  const rows: string[] = [];
  const counts: Counts = {
    ok: 0,
    unresolved_source: 0,
    unresolved_target: 0,
    unresolved_both: 0,
    malformedLines: 0,
  };

  let id = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('From Verse')) {
      counts.malformedLines++;
      continue;
    }

    const parts = trimmed.split('\t');
    if (parts.length < 3) {
      counts.malformedLines++;
      continue;
    }

    const [fromStr, toStr, votesStr] = parts;
    const votes = parseInt(votesStr, 10);
    if (isNaN(votes)) {
      counts.malformedLines++;
      continue;
    }

    // Classify the edge — every from/to/votes triple is retained
    const { reviewStatus, from, to, fromRaw, toRaw } = classifyEdge(fromStr, toStr);
    counts[reviewStatus]++;

    // Build the row tuple for this edge.
    // For an UNRESOLVED endpoint, the book column stores the FULL original reference
    // string (e.g. 'Sir.1.1') — NOT the bare book abbreviation — so distinct unresolved
    // refs occupy distinct UNIQUE keys (collision-safety CR-1).
    const fromBook = from ? escapeSQL(from.book) : escapeSQL(fromRaw);
    const fromChapter = from ? from.chapter : 0;
    const fromVerse = from ? from.verse : 0;

    const toBook = to ? escapeSQL(to.book) : escapeSQL(toRaw);
    const toChapter = to ? to.chapter : 0;
    const toVerseStart = to ? to.verseStart : 0;
    const toVerseEnd = to ? to.verseEnd : 0;

    // from_raw / to_raw: NULL for resolved endpoints, escaped string for unresolved
    const fromRawCol = from ? 'NULL' : escapeSQL(fromRaw);
    const toRawCol = to ? 'NULL' : escapeSQL(toRaw);

    rows.push(
      `(${id}, ${fromBook}, ${fromChapter}, ${fromVerse}, ` +
      `${toBook}, ${toChapter}, ${toVerseStart}, ${toVerseEnd}, ` +
      `${votes}, ${escapeSQL(reviewStatus)}, ${fromRawCol}, ${toRawCol})`
    );
    id++;
  }

  return { rows, counts };
}

// ─── Main (filesystem + DB; excluded from unit tests via entry guard) ─────────

async function main() {
  console.log('Reading cross_references.txt...');
  const content = readFileSync(INPUT_FILE, 'utf-8');
  const lines = content.split('\n');
  console.log(`  Total lines: ${lines.length}`);

  const skipped: string[] = [];

  // Collect malformed-line details for the skip report (main()-only concern)
  const skippedLines: string[] = [];
  const mainLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('From Verse')) {
      return line; // passthrough; processLines will count it
    }
    const parts = trimmed.split('\t');
    if (parts.length < 3) {
      skippedLines.push(`Malformed line: ${trimmed}`);
    } else {
      const votes = parseInt(parts[2], 10);
      if (isNaN(votes)) {
        skippedLines.push(`Invalid votes: ${trimmed}`);
      } else {
        const { reviewStatus, fromRaw, toRaw } = classifyEdge(parts[0], parts[1]);
        if (reviewStatus !== 'ok') {
          skippedLines.push(`${reviewStatus}: from=${fromRaw} to=${toRaw}`);
        }
      }
    }
    return line;
  });

  const { rows, counts } = processLines(mainLines);

  console.log(`  Retained rows: ${rows.length} (ok: ${counts.ok}, unresolved: ${counts.unresolved_source + counts.unresolved_target + counts.unresolved_both})`);
  console.log(`  Malformed lines: ${counts.malformedLines}`);

  // Assertion gates on resolved (ok) rows — so adding unresolved rows can't mask a regression
  if (counts.ok < MIN_ROW_COUNT) {
    console.error(`ASSERTION FAILED: Expected >= ${MIN_ROW_COUNT} resolved (ok) rows, got ${counts.ok}`);
    process.exit(1);
  }

  // Write skip report (all non-ok lines for auditability)
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SKIP_REPORT, skippedLines.join('\n'), 'utf-8');
  console.log(`  Skip report: ${SKIP_REPORT}`);

  // Write SQL in batches using the canonical XREF_COLUMNS list
  writeFileSync(OUTPUT_FILE, '-- Auto-generated by generate-cross-references.ts\n');
  appendFileSync(OUTPUT_FILE, '-- Source: OpenBible.info Cross References (CC BY 4.0)\n\n');

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sql =
      `INSERT OR IGNORE INTO cross_references (${XREF_COLUMNS.join(', ')}) VALUES\n` +
      batch.join(',\n') +
      ';\n\n';
    appendFileSync(OUTPUT_FILE, sql);
  }

  console.log(`\nWrote ${rows.length} rows to ${OUTPUT_FILE}`);
  console.log(`Flagged edges — ok: ${counts.ok}, unresolved_source: ${counts.unresolved_source}, unresolved_target: ${counts.unresolved_target}, unresolved_both: ${counts.unresolved_both}, malformed lines: ${counts.malformedLines}`);
  console.log('Done.');
}

// Only run main() when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
