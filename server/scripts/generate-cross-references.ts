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
const MIN_ROW_COUNT = 300_000;

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

function escapeSQL(val: string): string {
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

async function main() {
  console.log('Reading cross_references.txt...');
  const content = readFileSync(INPUT_FILE, 'utf-8');
  const lines = content.split('\n');
  console.log(`  Total lines: ${lines.length}`);

  const rows: string[] = [];
  const skipped: string[] = [];
  let id = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('From Verse')) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 3) {
      skipped.push(`Malformed line: ${trimmed}`);
      continue;
    }

    const [fromStr, toStr, votesStr] = parts;
    const votes = parseInt(votesStr, 10);
    if (isNaN(votes)) {
      skipped.push(`Invalid votes: ${trimmed}`);
      continue;
    }

    const fromRef = parseRef(fromStr);
    const toRef = parseToRef(toStr);

    if (!fromRef) {
      skipped.push(`Unmappable from-ref: ${fromStr}`);
      continue;
    }
    if (!toRef) {
      skipped.push(`Unmappable to-ref: ${toStr}`);
      continue;
    }

    rows.push(
      `(${id}, ${escapeSQL(fromRef.book)}, ${fromRef.chapter}, ${fromRef.verse}, ` +
      `${escapeSQL(toRef.book)}, ${toRef.chapter}, ${toRef.verseStart}, ${toRef.verseEnd}, ` +
      `${votes})`
    );
    id++;
  }

  console.log(`  Parsed rows: ${rows.length}`);
  console.log(`  Skipped: ${skipped.length}`);

  // Assertion
  if (rows.length < MIN_ROW_COUNT) {
    console.error(`ASSERTION FAILED: Expected >= ${MIN_ROW_COUNT} rows, got ${rows.length}`);
    process.exit(1);
  }

  // Write skip report
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SKIP_REPORT, skipped.join('\n'), 'utf-8');
  console.log(`  Skip report: ${SKIP_REPORT}`);

  // Write SQL in batches
  writeFileSync(OUTPUT_FILE, '-- Auto-generated by generate-cross-references.ts\n');
  appendFileSync(OUTPUT_FILE, '-- Source: OpenBible.info Cross References (CC BY 4.0)\n\n');

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sql =
      'INSERT OR IGNORE INTO cross_references ' +
      '(id, from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes) VALUES\n' +
      batch.join(',\n') +
      ';\n\n';
    appendFileSync(OUTPUT_FILE, sql);
  }

  console.log(`\nWrote ${rows.length} rows to ${OUTPUT_FILE}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
