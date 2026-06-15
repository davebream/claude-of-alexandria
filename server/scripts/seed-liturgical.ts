/**
 * seed-liturgical.ts
 * ETL script: transforms the curated LITURGICAL_DATASET into SQL INSERT statements
 * for D1 ingestion into the liturgical_readings table.
 *
 * Usage:
 *   cd server && npx tsx scripts/seed-liturgical.ts --output /tmp/liturgical-seed.sql
 *
 * Source: Curated in-house — no external fetch (OR-5).
 */

import { writeFileSync } from 'fs';
import {
  slugifySeason,
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
} from '../src/tools/utils.js';
import { lookupBook } from '../src/db/books.js';

// ─── Dataset types ─────────────────────────────────────────────────────────

export interface LiturgicalReading {
  reference: string;
  themes: string[];
  note?: string;
}

export interface LiturgicalSeason {
  season: string;
  season_order: number;
  tradition: string;
  readings: LiturgicalReading[];
}

// ─── Curated dataset ────────────────────────────────────────────────────────
// Western church year, Protestant/Reformed orientation.
// Each reading is one contiguous range within a single book.
// season_slug is NOT stored here — it is derived by slugifySeason(season).

export const LITURGICAL_DATASET: LiturgicalSeason[] = [
  {
    season: 'Advent',
    season_order: 1,
    tradition: 'western',
    readings: [
      {
        reference: 'Isaiah 9:2-7',
        themes: ['messianic hope', 'light in darkness', 'promise of peace'],
        note: 'Classic Advent prophecy of the child to be born as Prince of Peace',
      },
      {
        reference: 'Jeremiah 33:14-16',
        themes: ['covenant faithfulness', 'righteous branch', 'expectation'],
        note: 'Promise of the righteous Branch from David\'s line',
      },
      {
        reference: 'Romans 13:11-14',
        themes: ['watchfulness', 'awakening', 'putting on Christ', 'eschatological hope'],
      },
      {
        reference: 'Luke 21:25-36',
        themes: ['coming of the Son of Man', 'watchfulness', 'redemption drawing near'],
      },
    ],
  },
  {
    season: 'Christmas / Christmastide',
    season_order: 2,
    tradition: 'western',
    readings: [
      {
        reference: 'Isaiah 9:6-7',
        themes: ['incarnation', 'eternal kingship', 'peace', 'the child given to us'],
      },
      {
        reference: 'John 1:1-14',
        themes: ['incarnation', 'Word made flesh', 'light and life', 'grace and truth'],
        note: 'The prologue: the eternal Word dwelling among us',
      },
      {
        reference: 'Luke 2:1-20',
        themes: ['nativity', 'shepherds', 'glory', 'Savior born in Bethlehem'],
      },
      {
        reference: 'Titus 2:11-14',
        themes: ['grace appeared', 'salvation for all', 'blessed hope', 'redemption'],
      },
    ],
  },
  {
    season: 'Epiphany',
    season_order: 3,
    tradition: 'western',
    readings: [
      {
        reference: 'Isaiah 60:1-6',
        themes: ['light to the nations', 'glory of the Lord', 'nations streaming to the light'],
      },
      {
        reference: 'Matthew 2:1-12',
        themes: ['manifestation', 'wise men', 'nations worshipping', 'Christ revealed to Gentiles'],
        note: 'Magi from the East: the universal scope of the incarnation',
      },
      {
        reference: 'Ephesians 3:1-12',
        themes: ['mystery revealed', 'Gentiles as co-heirs', 'unsearchable riches of Christ'],
      },
    ],
  },
  {
    season: 'Lent',
    season_order: 4,
    tradition: 'western',
    readings: [
      {
        reference: 'Joel 2:12-17',
        themes: ['repentance', 'return to God', 'fasting and mourning', 'steadfast love'],
        note: 'Classic call to communal repentance with fasting',
      },
      {
        reference: 'Psalm 51:1-17',
        themes: ['confession', 'mercy', 'broken spirit', 'restoration', 'create in me a clean heart'],
      },
      {
        reference: 'Matthew 4:1-11',
        themes: ['temptation', 'wilderness', 'Word of God as weapon', 'obedience of Christ'],
        note: 'Christ\'s temptation recapitulating Israel\'s wilderness journey',
      },
      {
        reference: 'Romans 8:1-11',
        themes: ['no condemnation', 'Spirit of life', 'law of sin and death overcome'],
      },
    ],
  },
  {
    season: 'Holy Week',
    season_order: 5,
    tradition: 'western',
    readings: [
      {
        reference: 'Isaiah 53:1-12',
        themes: ['suffering servant', 'vicarious atonement', 'wounds for our transgressions', 'intercession'],
        note: 'The heart of the passion narrative in prophecy',
      },
      {
        reference: 'Philippians 2:5-11',
        themes: ['humiliation of Christ', 'servanthood', 'obedience to death', 'exaltation'],
        note: 'Christ\'s kenosis and subsequent glorification',
      },
      {
        reference: 'John 19:17-30',
        themes: ['crucifixion', 'it is finished', 'death of Christ', 'sacrifice'],
      },
      {
        reference: 'Hebrews 10:1-18',
        themes: ['once-for-all sacrifice', 'new covenant', 'sins remembered no more'],
      },
    ],
  },
  {
    season: 'Easter / Eastertide',
    season_order: 6,
    tradition: 'western',
    readings: [
      {
        reference: 'Matthew 28:1-10',
        themes: ['resurrection', 'empty tomb', 'do not be afraid', 'he has risen'],
      },
      {
        reference: '1 Corinthians 15:1-22',
        themes: ['resurrection gospel', 'firstfruits', 'in Adam all die in Christ all made alive'],
        note: 'The definitive NT statement on the resurrection',
      },
      {
        reference: 'Romans 6:1-11',
        themes: ['baptism into death and resurrection', 'alive to God', 'new life'],
      },
      {
        reference: 'Colossians 3:1-4',
        themes: ['risen with Christ', 'set your mind on things above', 'hidden with Christ in God'],
      },
    ],
  },
  {
    season: 'Ascension',
    season_order: 7,
    tradition: 'western',
    readings: [
      {
        reference: 'Acts 1:1-11',
        themes: ['ascension', 'witnesses', 'Holy Spirit promised', 'he will come back'],
        note: 'The ascension account and the disciples\' commission',
      },
      {
        reference: 'Ephesians 1:15-23',
        themes: ['exaltation', 'far above all rule', 'head over everything', 'fullness of Christ'],
      },
      {
        reference: 'Hebrews 4:14-16',
        themes: ['great high priest', 'passed through the heavens', 'throne of grace', 'intercession'],
      },
    ],
  },
  {
    season: 'Pentecost',
    season_order: 8,
    tradition: 'western',
    readings: [
      {
        reference: 'Acts 2:1-21',
        themes: ['outpouring of the Spirit', 'tongues of fire', 'mission', 'Joel\'s prophecy fulfilled'],
        note: 'The day of Pentecost and Peter\'s proclamation',
      },
      {
        reference: 'Joel 2:28-32',
        themes: ['Spirit poured on all flesh', 'sons and daughters prophesying', 'everyone who calls saved'],
      },
      {
        reference: 'Romans 8:14-17',
        themes: ['children of God', 'Spirit of adoption', 'heirs of God', 'co-heirs with Christ'],
      },
      {
        reference: 'John 16:5-15',
        themes: ['the Advocate', 'Spirit of truth', 'conviction of sin and righteousness', 'guidance'],
      },
    ],
  },
  {
    season: 'Trinity Sunday',
    season_order: 9,
    tradition: 'western',
    readings: [
      {
        reference: 'Isaiah 6:1-8',
        themes: ['holiness of God', 'seraphim', 'Holy Holy Holy', 'sending of Isaiah', 'commission'],
        note: 'The Trisagion and the call of Isaiah before the Triune God',
      },
      {
        reference: 'Matthew 28:16-20',
        themes: ['Great Commission', 'baptism in the Triune name', 'all authority', 'presence of Christ'],
      },
      {
        reference: 'Romans 5:1-5',
        themes: ['justified by faith', 'peace with God', 'Spirit poured into our hearts', 'love of God'],
      },
    ],
  },
  {
    season: 'Ordinary Time',
    season_order: 10,
    tradition: 'western',
    readings: [
      {
        reference: 'Matthew 5:1-12',
        themes: ['Beatitudes', 'kingdom of heaven', 'blessedness', 'kingdom ethics'],
        note: 'The opening of the Sermon on the Mount',
      },
      {
        reference: 'Micah 6:6-8',
        themes: ['justice', 'mercy', 'walking humbly with God', 'covenant discipleship'],
      },
      {
        reference: 'Psalm 23',
        themes: ['shepherd', 'provision', 'guidance', 'comfort', 'dwelling in the house of the Lord'],
      },
      {
        reference: 'Romans 12:1-2',
        themes: ['living sacrifice', 'transformed mind', 'discerning the will of God', 'discipleship'],
      },
      {
        reference: 'Matthew 13:31-33',
        themes: ['kingdom of heaven', 'mustard seed', 'leaven', 'growth of the kingdom'],
      },
    ],
  },
  {
    season: 'Reformation Sunday',
    season_order: 11,
    tradition: 'reformed',
    readings: [
      {
        reference: 'Romans 1:16-17',
        themes: ['gospel power', 'righteousness of God', 'justification by faith', 'sola fide'],
        note: 'The thesis of Romans and the rallying text of the Reformation',
      },
      {
        reference: 'Galatians 2:15-21',
        themes: ['justification by faith not works', 'crucified with Christ', 'grace of God'],
      },
      {
        reference: 'Psalm 46',
        themes: ['God our refuge and strength', 'tower of strength', 'be still and know', 'Lord of hosts'],
        note: 'Luther\'s Reformation hymn Ein feste Burg is drawn from this psalm',
      },
      {
        reference: '2 Timothy 3:14-17',
        themes: ['Scripture alone', 'God-breathed', 'profitable for doctrine', 'sola scriptura'],
      },
    ],
  },
  {
    season: 'Christ the King / Reign of Christ',
    season_order: 12,
    tradition: 'western',
    readings: [
      {
        reference: 'Revelation 1:4-8',
        themes: ['Alpha and Omega', 'coming on the clouds', 'ruler of kings on earth', 'kingdom'],
      },
      {
        reference: 'Colossians 1:11-20',
        themes: ['dominion of the Son', 'firstborn over all creation', 'head of the church', 'reconciliation'],
        note: 'The cosmic lordship of Christ over all things',
      },
      {
        reference: 'Luke 23:33-43',
        themes: ['crucified king', 'kingdom of God', 'paradise', 'mercy toward the penitent thief'],
        note: 'Christ\'s kingship paradoxically displayed at the cross',
      },
      {
        reference: 'Daniel 7:9-14',
        themes: ['Ancient of Days', 'Son of Man', 'everlasting dominion', 'all peoples serving him'],
      },
    ],
  },
];

// ─── Reference splitter ─────────────────────────────────────────────────────

/**
 * Split a full "Book Ch:V" reference string into { book, range }.
 * This is net-new: the existing parseVerseRange/parseChapterRange only accept
 * the range portion, not a full "Book Ch:V" string.
 *
 * Regex: anchored trailing digit sequence is the range; everything before is the book.
 * Handles:
 *   "Isaiah 9:2-7"          → { book: "Isaiah", range: "9:2-7" }
 *   "Psalm 23"              → { book: "Psalm", range: "23" }
 *   "Isaiah 9-11"           → { book: "Isaiah", range: "9-11" }
 *   "1 Corinthians 13:4-7"  → { book: "1 Corinthians", range: "13:4-7" }
 *   "Song of Songs 2:8-13"  → { book: "Song of Songs", range: "2:8-13" }
 */
export function parseReference(ref: string): { book: string; range: string } | null {
  const match = ref.match(/^(.+?)\s+(\d+(?::\d+)?(?:-\d+(?::\d+)?)?)$/);
  if (!match) return null;
  return { book: match[1], range: match[2] };
}

// ─── Row types ──────────────────────────────────────────────────────────────

export interface LiturgicalReadingRow {
  season: string;
  season_slug: string;
  season_order: number;
  tradition: string;
  book: string;
  start_chapter: number;
  start_verse: number;
  end_chapter: number;
  end_verse: number;
  start_enc: number;
  end_enc: number;
  reference_display: string;
  themes: string; // JSON-encoded
  note: string | null;
}

// ─── Row builder ────────────────────────────────────────────────────────────

/**
 * Transform one reading into a database row.
 * Returns null (and warns) if the book or range cannot be resolved.
 * NEVER throws — all parse errors are warnings only.
 */
export function buildReadingRow(
  season: string,
  season_order: number,
  tradition: string,
  reading: LiturgicalReading
): LiturgicalReadingRow | null {
  const parsed = parseReference(reading.reference);
  if (!parsed) {
    console.warn(`[seed-liturgical] Cannot parse reference: "${reading.reference}"`);
    return null;
  }

  const bookInfo = lookupBook(parsed.book);
  if (!bookInfo) {
    console.warn(`[seed-liturgical] Unresolvable book: "${parsed.book}" in reference "${reading.reference}"`);
    return null;
  }

  let startChapter: number;
  let startVerse: number;
  let endChapter: number;
  let endVerse: number;

  if (parsed.range.includes(':')) {
    // Verse-level reference (e.g. "9:2-7", "9:2-11:9", "13:4-7")
    const result = parseVerseRange(parsed.range);
    if ('error' in result) {
      console.warn(`[seed-liturgical] Cannot parse verse range "${parsed.range}" in "${reading.reference}": ${result.error}`);
      return null;
    }
    startChapter = result.startChapter;
    startVerse = result.startVerse;
    endChapter = result.endChapter;
    endVerse = result.endVerse;
  } else {
    // Chapter-only reference (e.g. "23", "9-11")
    const result = parseChapterRange(parsed.range);
    if ('error' in result) {
      console.warn(`[seed-liturgical] Cannot parse chapter range "${parsed.range}" in "${reading.reference}": ${result.error}`);
      return null;
    }
    if (result.min === undefined) {
      console.warn(`[seed-liturgical] Empty chapter range in "${reading.reference}"`);
      return null;
    }
    startChapter = result.min;
    startVerse = 1;
    endChapter = result.max ?? result.min;
    endVerse = CHAPTER_ONLY_MAX_VERSE;
  }

  return {
    season,
    season_slug: slugifySeason(season),
    season_order,
    tradition: tradition.toLowerCase(),
    book: bookInfo.canonical,
    start_chapter: startChapter,
    start_verse: startVerse,
    end_chapter: endChapter,
    end_verse: endVerse,
    start_enc: encodePosition(startChapter, startVerse),
    end_enc: encodePosition(endChapter, endVerse),
    reference_display: reading.reference,
    themes: JSON.stringify(reading.themes),
    note: reading.note ?? null,
  };
}

// ─── SQL helpers (copied from seed-confessional.ts — file-private there) ────

function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

// ─── ETL main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : '/tmp/liturgical-seed.sql';

  console.log(`[seed-liturgical] Output: ${outputPath}`);

  const lines: string[] = [
    '-- liturgical-seed.sql',
    '-- Generated by seed-liturgical.ts — do not edit manually.',
    '-- Apply with: npx wrangler d1 execute <DB_NAME> --file=<this-file> --remote',
    '',
    '-- Liturgical readings',
  ];

  const unresolvedRefs: string[] = [];
  let readingId = 0;
  let totalSeasons = 0;
  let totalReadings = 0;

  for (const seasonEntry of LITURGICAL_DATASET) {
    totalSeasons++;
    for (const reading of seasonEntry.readings) {
      const row = buildReadingRow(
        seasonEntry.season,
        seasonEntry.season_order,
        seasonEntry.tradition,
        reading
      );
      if (!row) {
        unresolvedRefs.push(`${seasonEntry.season}:${reading.reference}`);
        continue;
      }
      readingId++;
      totalReadings++;
      lines.push(
        `INSERT INTO liturgical_readings (id, season, season_slug, season_order, tradition, book, start_chapter, start_verse, end_chapter, end_verse, start_enc, end_enc, reference_display, themes, note, source) VALUES (${escapeNum(readingId)}, ${escapeSQL(row.season)}, ${escapeSQL(row.season_slug)}, ${escapeNum(row.season_order)}, ${escapeSQL(row.tradition)}, ${escapeSQL(row.book)}, ${escapeNum(row.start_chapter)}, ${escapeNum(row.start_verse)}, ${escapeNum(row.end_chapter)}, ${escapeNum(row.end_verse)}, ${escapeNum(row.start_enc)}, ${escapeNum(row.end_enc)}, ${escapeSQL(row.reference_display)}, ${escapeSQL(row.themes)}, ${escapeSQL(row.note)}, 'curated-in-house');`
      );
    }
  }

  const sql = lines.join('\n') + '\n';
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n[seed-liturgical] Written to: ${outputPath}`);

  // ── Validation report ──
  console.log('\n=== Validation Report ===');
  console.log(`Seasons processed:           ${totalSeasons}`);
  console.log(`Readings emitted:            ${totalReadings}`);
  console.log(`Unresolvable references:     ${unresolvedRefs.length}`);
  if (unresolvedRefs.length > 0) {
    console.warn('\nUnresolvable references:');
    for (const r of unresolvedRefs) {
      console.warn(`  ${r}`);
    }
    console.warn('\nNote: unresolvable refs are WARNINGS, not failures.');
  }
}

// Only run main() when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
