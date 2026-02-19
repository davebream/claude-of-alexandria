import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'sql.js';
import { lookupBook } from '../src/db/books';

const REFERENCE_DIR = join(__dirname, '../../../skills/biblical-segmentation/reference');
const LEVINSOHN_DIR = join(REFERENCE_DIR, 'levinsohn');

// ─── Levinsohn ────────────────────────────────────────────────────────────────

interface LevinsohnRef {
  verse: string;
  word: string;
  type: string;
}

interface LevinsohnFile {
  feature: string;
  description: string;
  references: LevinsohnRef[];
}

function parseLevinsohnVerse(verseStr: string): { book: string; chapter: number; verse: number } | null {
  // Format: "Matt 2:13" or "1Cor 3:1"
  const spaceIdx = verseStr.lastIndexOf(' ');
  if (spaceIdx === -1) return null;

  const bookAbbrev = verseStr.slice(0, spaceIdx).trim();
  const chVerse = verseStr.slice(spaceIdx + 1).trim();
  const colonIdx = chVerse.indexOf(':');
  if (colonIdx === -1) return null;

  const chapter = parseInt(chVerse.slice(0, colonIdx), 10);
  const verse = parseInt(chVerse.slice(colonIdx + 1), 10);
  if (isNaN(chapter) || isNaN(verse)) return null;

  const bookInfo = lookupBook(bookAbbrev);
  if (!bookInfo) return null;

  return { book: bookInfo.canonical, chapter, verse };
}

export function loadLevinsohn(db: Database): void {
  const files = readdirSync(LEVINSOHN_DIR).filter(f => f.endsWith('.json'));
  let totalRows = 0;
  let skipped = 0;

  const stmt = db.prepare(`
    INSERT INTO discourse_features (book, chapter, verse, feature, feature_description, word)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const filename of files) {
    const filePath = join(LEVINSOHN_DIR, filename);
    const data: LevinsohnFile = JSON.parse(readFileSync(filePath, 'utf-8'));
    const featureName = data.feature.toLowerCase().replace(/[\s\-]+/g, '_');
    const description = data.description ?? null;

    for (const ref of data.references ?? []) {
      const parsed = parseLevinsohnVerse(ref.verse);
      if (!parsed) {
        skipped++;
        continue;
      }
      stmt.run([parsed.book, parsed.chapter, parsed.verse, featureName, description, ref.word ?? null]);
      totalRows++;
    }
  }

  stmt.free();
  console.log(`  Levinsohn: ${totalRows} rows, ${skipped} skipped`);
}

// ─── Masoretic ────────────────────────────────────────────────────────────────

const MASORETIC_DIR = join(REFERENCE_DIR, 'masoretic');

interface MasoreticFile {
  book: string;
  petuchot: string[];
  setumot: string[];
}

export function loadMasoretic(db: Database): void {
  const files = readdirSync(MASORETIC_DIR).filter(f => f.endsWith('.json'));
  let totalRows = 0;

  const stmt = db.prepare(`
    INSERT INTO paragraph_markers (book, chapter, verse, marker_type)
    VALUES (?, ?, ?, ?)
  `);

  for (const filename of files) {
    const stem = filename.replace('.json', '');
    const bookInfo = lookupBook(stem);
    if (!bookInfo) {
      console.warn(`  WARN: Unknown book file: ${filename}`);
      continue;
    }

    const data: MasoreticFile = JSON.parse(readFileSync(join(MASORETIC_DIR, filename), 'utf-8'));

    const insertMarkers = (refs: string[], markerType: string) => {
      for (const ref of refs ?? []) {
        const colonIdx = ref.indexOf(':');
        if (colonIdx === -1) continue;
        const chapter = parseInt(ref.slice(0, colonIdx), 10);
        const verse = parseInt(ref.slice(colonIdx + 1), 10);
        if (isNaN(chapter) || isNaN(verse)) continue;
        stmt.run([bookInfo.canonical, chapter, verse, markerType]);
        totalRows++;
      }
    };

    insertMarkers(data.petuchot, 'petuchah');
    insertMarkers(data.setumot, 'setumah');
  }

  stmt.free();
  console.log(`  Masoretic: ${totalRows} rows`);
}
