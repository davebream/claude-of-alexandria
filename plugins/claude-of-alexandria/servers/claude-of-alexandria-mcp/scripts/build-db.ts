import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'sql.js';
import yaml from 'js-yaml';
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

// ─── Vocabulary ───────────────────────────────────────────────────────────────

const VOCAB_DIR = join(REFERENCE_DIR, 'vocabulary');

const MIN_OCCURRENCES = 5;
const MIN_CHAPTERS = 2;
const MAX_CHAPTERS = 4;
const CLUSTERING_THRESHOLD = 0.6;

interface LemmaData {
  total: number;
  by_chapter: Record<number, number>;
}

interface VocabFile {
  books: Record<string, {
    total_lemmas: number;
    lemmas: Record<string, LemmaData>;
  }>;
}

function findBestCluster(
  byChapter: Record<number, number>
): { start: number; end: number; concentration: number } | null {
  const chapters = Object.keys(byChapter).map(Number).sort((a, b) => a - b);
  const total = Object.values(byChapter).reduce((a, b) => a + b, 0);

  if (total < MIN_OCCURRENCES || chapters.length < MIN_CHAPTERS) return null;

  let best = { start: 0, end: 0, concentration: 0 };

  for (let size = MIN_CHAPTERS; size <= MAX_CHAPTERS; size++) {
    for (let i = 0; i <= chapters.length - size; i++) {
      const start = chapters[i];
      const end = chapters[i + size - 1];
      const inRange = chapters.slice(i, i + size).reduce(
        (sum, ch) => sum + (byChapter[ch] ?? 0), 0
      );
      const concentration = inRange / total;
      if (concentration > best.concentration) {
        best = { start, end, concentration };
      }
    }
  }

  return best.concentration >= CLUSTERING_THRESHOLD ? best : null;
}

export function loadVocabulary(db: Database): void {
  const vocabStmt = db.prepare(`
    INSERT INTO vocabulary (book, testament, chapter, lemma, frequency)
    VALUES (?, ?, ?, ?, ?)
  `);
  const clusterStmt = db.prepare(`
    INSERT INTO vocabulary_clusters (book, testament, lemma, concentration, chapter_start, chapter_end, total_occurrences)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let vocabRows = 0;
  let clusterRows = 0;

  for (const testament of ['nt', 'ot'] as const) {
    const filePath = join(VOCAB_DIR, `${testament}_lemmas.yaml`);
    const data = yaml.load(readFileSync(filePath, 'utf-8')) as VocabFile;

    for (const [bookDisplayName, bookData] of Object.entries(data.books ?? {})) {
      const bookInfo = lookupBook(bookDisplayName);
      if (!bookInfo) {
        console.warn(`  WARN: Unknown book in ${testament}_lemmas.yaml: ${bookDisplayName}`);
        continue;
      }
      const canonical = bookInfo.canonical;

      for (const [lemma, lemmaData] of Object.entries(bookData.lemmas ?? {})) {
        const byChapter = lemmaData.by_chapter ?? {};
        for (const [chStr, freq] of Object.entries(byChapter)) {
          vocabStmt.run([canonical, testament, parseInt(chStr, 10), lemma, freq]);
          vocabRows++;
        }

        const cluster = findBestCluster(byChapter);
        if (cluster) {
          clusterStmt.run([
            canonical, testament, lemma,
            cluster.concentration, cluster.start, cluster.end,
            lemmaData.total
          ]);
          clusterRows++;
        }
      }
    }
  }

  vocabStmt.free();
  clusterStmt.free();
  console.log(`  Vocabulary: ${vocabRows} rows, ${clusterRows} clusters`);
}

export function loadThematicKeywords(db: Database): void {
  const filePath = join(VOCAB_DIR, 'semantic_groups.yaml');
  const data = yaml.load(readFileSync(filePath, 'utf-8')) as {
    semantic_groups: Record<string, {
      nt_lemmas: Record<string, string>;
      ot_strongs: Record<string, unknown>;
    }>;
  };

  const stmt = db.prepare(`
    INSERT INTO thematic_keywords (theme, lemma, testament) VALUES (?, ?, ?)
  `);

  let rows = 0;
  for (const [theme, group] of Object.entries(data.semantic_groups ?? {})) {
    for (const lemma of Object.keys(group.nt_lemmas ?? {})) {
      stmt.run([theme, lemma, 'nt']);
      rows++;
    }
    for (const strongsNum of Object.keys(group.ot_strongs ?? {})) {
      stmt.run([theme, strongsNum, 'ot']);
      rows++;
    }
  }

  stmt.free();
  console.log(`  Thematic keywords: ${rows} rows`);
}

// ─── Morphology ───────────────────────────────────────────────────────────────

// Compact NT parsing JSON to reduce storage (~67% size reduction)
const PARSING_KEY_MAP: Record<string, string> = {
  case: 'c', number: 'n', gender: 'g', tense: 't',
  voice: 'v', mood: 'm', person: 'p', degree: 'd',
};
const PARSING_VAL_MAP: Record<string, string> = {
  nominative: 'nom', genitive: 'gen', dative: 'dat', accusative: 'acc', vocative: 'voc',
  singular: 'sg', plural: 'pl', dual: 'du',
  masculine: 'mas', feminine: 'fem', neuter: 'neu',
  present: 'prs', aorist: 'aor', perfect: 'prf', imperfect: 'ipf',
  future: 'fut', pluperfect: 'plpf',
  active: 'act', middle: 'mid', passive: 'pas',
  indicative: 'ind', subjunctive: 'sub', optative: 'opt',
  imperative: 'imp', infinitive: 'inf', participle: 'ptc',
  comparative: 'cmp', superlative: 'sup',
};

function compactNtParsing(parsing: Record<string, string>): string {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsing)) {
    const ck = PARSING_KEY_MAP[k] ?? k;
    const cv = PARSING_VAL_MAP[v] ?? v;
    out[ck] = cv;
  }
  return JSON.stringify(out);
}

// Reverse map for decoding at query time (exported for use in tools)
export const PARSING_KEY_EXPAND: Record<string, string> = Object.fromEntries(
  Object.entries(PARSING_KEY_MAP).map(([k, v]) => [v, k])
);
export const PARSING_VAL_EXPAND: Record<string, string> = Object.fromEntries(
  Object.entries(PARSING_VAL_MAP).map(([k, v]) => [v, k])
);

const MORPH_DIR = join(REFERENCE_DIR, 'morphology');

// NT morphology word
interface NtWordEntry {
  text: string;
  normalized?: string;
  lemma: string;
  pos: string;
  parsing?: Record<string, string>;
}

// OT morphology word (different structure)
interface OtWordEntry {
  text: string;
  strongs?: string[];
  morph_code?: string;
  pos: string;
  parsing?: Record<string, string>;
}

interface MorphologyFile {
  verses: Record<string, (NtWordEntry | OtWordEntry)[]>;
}

export function loadMorphology(db: Database): void {
  const stmt = db.prepare(`
    INSERT INTO morphology
      (book, testament, chapter, verse, word_position, text, normalized, lemma, pos, parsing)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalRows = 0;

  for (const testament of ['nt', 'ot'] as const) {
    const dir = join(MORPH_DIR, testament);
    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      console.warn(`  WARN: morphology/${testament}/ not found, skipping`);
      continue;
    }

    for (const filename of files) {
      const stem = filename.replace('.json', '');
      const bookInfo = lookupBook(stem);
      if (!bookInfo) {
        console.warn(`  WARN: Unknown book file: morphology/${testament}/${filename}`);
        continue;
      }

      const data: MorphologyFile = JSON.parse(
        readFileSync(join(dir, filename), 'utf-8')
      );

      for (const [verseKey, words] of Object.entries(data.verses ?? {})) {
        const colonIdx = verseKey.indexOf(':');
        if (colonIdx === -1) continue;
        const chapter = parseInt(verseKey.slice(0, colonIdx), 10);
        const verse = parseInt(verseKey.slice(colonIdx + 1), 10);
        if (isNaN(chapter) || isNaN(verse)) continue;

        words.forEach((word, idx) => {
          let lemma: string;
          let normalized: string | null;

          if (testament === 'nt') {
            const w = word as NtWordEntry;
            lemma = w.lemma ?? word.text;
            normalized = w.normalized ?? null;
          } else {
            const w = word as OtWordEntry;
            // Use first Strong's number as lemma, morph_code as normalized
            lemma = (w.strongs && w.strongs.length > 0) ? w.strongs[0] : word.text;
            normalized = w.morph_code ?? null;
          }

          // NT: compact parsing JSON; OT: parsing null (morph_code already in normalized)
          const parsingStr = (testament === 'nt' && word.parsing)
            ? compactNtParsing(word.parsing as Record<string, string>)
            : null;

          stmt.run([
            bookInfo.canonical,
            testament,
            chapter,
            verse,
            idx + 1,
            word.text,
            normalized,
            lemma,
            word.pos,
            parsingStr,
          ]);
          totalRows++;
        });
      }

      if (totalRows % 100_000 === 0 && totalRows > 0) {
        process.stdout.write(`\r  Morphology: ${totalRows} rows...`);
      }
    }
  }

  stmt.free();
  console.log(`\n  Morphology: ${totalRows} rows total`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const DB_PATH = join(__dirname, '../data/biblical.sqlite');

async function main() {
  console.log('Building biblical.sqlite...');
  const start = Date.now();

  const { createDatabase, saveDatabase } = await import('./create-schema');
  const db = await createDatabase(DB_PATH);

  console.log('Loading Levinsohn discourse features...');
  loadLevinsohn(db);

  console.log('Loading Masoretic paragraph markers...');
  loadMasoretic(db);

  console.log('Loading vocabulary and clusters...');
  loadVocabulary(db);
  loadThematicKeywords(db);

  console.log('Loading morphology (this takes a while)...');
  loadMorphology(db);

  console.log('Saving database...');
  saveDatabase(db, DB_PATH);
  db.close();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
