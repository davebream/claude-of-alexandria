/**
 * seed-controversies.ts
 * ETL script: transforms the curated CONTROVERSY_DATASET into SQL INSERT statements
 * for D1 ingestion into the controversy_topics and controversy_passages tables.
 *
 * Usage:
 *   cd server && npx tsx scripts/seed-controversies.ts --output migrations/0018_seed_controversies.sql
 *
 * Source: Curated in-house — no external fetch (OR-5).
 */

import { writeFileSync } from 'fs';
import {
  slugify,
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
} from '../src/tools/utils.js';
import { lookupBook } from '../src/db/books.js';

// ─── Dataset types ─────────────────────────────────────────────────────────

export interface ControversyPosition {
  label: string;       // Short position name — must NOT contain adjudicative language
  view: string;        // One-sentence summary of this position
  evidence: string;    // Key textual or archaeological evidence
  scholars: string[];  // Named scholars who hold this view (at least 1)
}

export interface ControversySource {
  citation: string;    // Full bibliographic citation
  tier: 'A' | 'B' | 'C';  // A = peer-reviewed monograph, B = commentary, C = popular/secondary
}

export interface ControversyTopic {
  topic: string;       // Display name, e.g. 'Date of the Exodus'
  category: 'dating' | 'authorship' | 'composition' | 'historicity' | 'harmonization';
  rating: 'low' | 'medium' | 'high';
  summary: string;     // Neutral description of what is disputed — do NOT adjudicate
  keywords: string[];
  positions: ControversyPosition[];  // At least 2 required
  sources: ControversySource[];      // At least 1, with tier A or B required
  passages: string[];  // References like "Exodus 12:40-41" — MUST all resolve
  note?: string;
}

// ─── Curated dataset ────────────────────────────────────────────────────────
// Exactly 2 starter topics. Each is genuinely balanced with real named scholars
// and Tier A/B sources. Slugs are derived at build time via slugify(topic).
// DO NOT adjudicate between positions — describe, do not decide.

export const CONTROVERSY_DATASET: ControversyTopic[] = [
  {
    topic: 'Date of the Exodus',
    category: 'dating',
    rating: 'high',
    summary:
      'Scholars dispute when the Israelite Exodus from Egypt occurred, with the two main proposals ' +
      'separated by roughly 200 years. The early (15th-century BCE) date is inferred from a literal ' +
      'reading of 1 Kings 6:1, while the late (13th-century BCE) date correlates with Egyptian ' +
      'archaeological evidence from the Ramesside period. Neither position commands consensus, and ' +
      'each faces unresolved exegetical and archaeological difficulties.',
    keywords: [
      'exodus', 'exodus date', 'early date', 'late date', '15th century', '13th century',
      'Ramesside', '1 Kings 6:1', 'Judges 11:26', 'Amarna', 'Merneptah stele',
    ],
    positions: [
      {
        label: 'Early (15th-century BCE) date',
        view:
          'The Exodus occurred ca. 1446 BCE, anchored by the 480-year figure in 1 Kings 6:1 and ' +
          'corroborated by Judges 11:26, which implies roughly 300 years of Israelite settlement ' +
          'prior to Jephthah.',
        evidence:
          '1 Kings 6:1 places the Exodus 480 years before Solomon\'s fourth regnal year (ca. 966 BCE), ' +
          'yielding ca. 1446 BCE. Judges 11:26 independently implies a long pre-monarchic settlement ' +
          'period. Proponents argue that the city Avaris (Tell el-Dab\'a) shows a Semitic population ' +
          'presence during the Middle Bronze Age consistent with an earlier sojourn. Some correlate the ' +
          'Amarna letters with the period of Israelite conquest.',
        scholars: ['Bryant Wood', 'John Bimson', 'Andrew Steinmann', 'Charles Aling'],
      },
      {
        label: 'Late (13th-century BCE) date',
        view:
          'The Exodus occurred ca. 1260–1250 BCE under Ramesses II (or near his reign), based on ' +
          'the reference to the store-city Raamses in Exodus 1:11 and the flourishing of Ramesside ' +
          'building projects in the eastern Delta during this period.',
        evidence:
          'Exodus 1:11 names Raamses as a store-city built by Israelite labor, widely identified with ' +
          'Pi-Ramesse, a major city under Ramesses II (1279–1213 BCE). The Merneptah Stele (ca. 1208 BCE) ' +
          'attests Israel as a people in Canaan, setting a terminus ante quem. The absence of clear ' +
          'Mycenaean Late Bronze Age destructions matching a 15th-century conquest at key Canaanite sites ' +
          'also weighs against the early date.',
        scholars: ['Kenneth Kitchen', 'James Hoffmeier', 'Alan Millard', 'Manfred Bietak (on Avaris)'],
      },
    ],
    sources: [
      {
        citation: 'Kitchen, K. A. On the Reliability of the Old Testament. Grand Rapids: Eerdmans, 2003.',
        tier: 'A',
      },
      {
        citation: 'Hoffmeier, J. K. Israel in Egypt: The Evidence for the Authenticity of the Exodus Tradition. Oxford: Oxford University Press, 1997.',
        tier: 'A',
      },
      {
        citation: 'Bimson, J. J. Redating the Exodus and Conquest. Sheffield: JSOT Press, 1978.',
        tier: 'A',
      },
      {
        citation: 'Wood, B. G. "The Sons of Jacob: New Evidence for the Presence of the Israelites in Egypt." Biblical Archaeology Review 34.2 (2008).',
        tier: 'B',
      },
    ],
    passages: ['Exodus 12:40-41', '1 Kings 6:1', 'Judges 11:26'],
  },
  {
    topic: 'Authorship and dating of Daniel',
    category: 'authorship',
    rating: 'high',
    summary:
      'Scholars are divided over whether the book of Daniel was composed by a single author in the ' +
      '6th century BCE (the traditional view) or by one or more authors writing in the 2nd century BCE ' +
      'during the Maccabean crisis. The dispute turns on the interpretation of detailed prophecy in ' +
      'chapters 7–12, the linguistic character of the Aramaic and Hebrew sections, and historical ' +
      'details in chapter 1 and 5. Both positions have substantial scholarly representation.',
    keywords: [
      'Daniel', 'authorship', 'vaticinium ex eventu', 'Maccabean', '6th century', '2nd century',
      'Antiochus Epiphanes', 'Daniel 11', 'Aramaic', 'apocalyptic', 'single authorship',
    ],
    positions: [
      {
        label: 'Traditional 6th-century single-author view',
        view:
          'Daniel the Jew wrote the book in Babylon during the 6th century BCE under Nebuchadnezzar, ' +
          'Belshazzar, and Darius the Mede, and the detailed predictions of chapters 7–12 are genuine ' +
          'predictive prophecy.',
        evidence:
          'The book presents itself as first-person testimony from the 6th century (Dan 1:1; 7:1). ' +
          'Jesus cites Daniel as prophetic (Matt 24:15). Dead Sea Scroll manuscripts of Daniel predate ' +
          'the Maccabean period sufficiently to suggest a pre-2nd century composition. The early Old ' +
          'Greek translation implies circulation well before 165 BCE. Proponents argue that "Darius ' +
          'the Mede" is a historical figure whose identity has not yet been definitively resolved, and ' +
          'that "vaticinium ex eventu" arguments depend on a prior commitment against predictive prophecy.',
        scholars: ['Joyce Baldwin', 'Stephen Miller', 'Gleason Archer'],
      },
      {
        label: 'Maccabean 2nd-century pseudepigraphical view',
        view:
          'The book of Daniel reached its final form in the 160s BCE, composed pseudepigraphically to ' +
          'encourage Jews facing the persecution of Antiochus IV Epiphanes, with chapters 7–12 describing ' +
          'those events as if predicted from the 6th century.',
        evidence:
          'Daniel 11:2–35 tracks Hellenistic history with extraordinary accuracy up to Antiochus IV, then ' +
          'becomes vague at 11:40, suggesting the author\'s horizon. Linguistic analysis finds late Biblical ' +
          'Hebrew forms and an Aramaic dialect consistent with the 3rd–2nd century. The absence of Daniel ' +
          'from Ben Sira\'s "Praise of the Fathers" (ca. 180 BCE) is cited as evidence the book was not yet ' +
          'widely known. The genre of pseudepigraphical apocalyptic has close parallels in 2nd-century Jewish ' +
          'literature.',
        scholars: ['John J. Collins', 'Louis Hartman', 'Klaus Koch', 'Norman Porteous'],
      },
    ],
    sources: [
      {
        citation: 'Baldwin, J. G. Daniel: An Introduction and Commentary. Tyndale Old Testament Commentaries. Leicester: IVP, 1978.',
        tier: 'B',
      },
      {
        citation: 'Collins, J. J. Daniel: A Commentary on the Book of Daniel. Hermeneia. Minneapolis: Fortress, 1993.',
        tier: 'A',
      },
      {
        citation: 'Miller, S. R. Daniel. New American Commentary. Nashville: Broadman & Holman, 1994.',
        tier: 'B',
      },
      {
        citation: 'Goldingay, J. Daniel. Word Biblical Commentary 30. Dallas: Word Books, 1989.',
        tier: 'A',
      },
    ],
    passages: ['Daniel 1:1', 'Daniel 11:2-35'],
  },
];

// ─── Reference parser (mirrors seed-liturgical.ts) ──────────────────────────

function parseReference(ref: string): { book: string; range: string } | null {
  const match = ref.match(/^(.+?)\s+(\d+(?::\d+)?(?:-\d+(?::\d+)?)?)$/);
  if (!match) return null;
  return { book: match[1], range: match[2] };
}

// ─── Row types ──────────────────────────────────────────────────────────────

export interface ControversyPassageRow {
  controversy_id: number;
  book: string;
  start_chapter: number;
  start_verse: number;
  end_chapter: number;
  end_verse: number;
  start_enc: number;
  end_enc: number;
  reference_display: string;
}

// ─── Row builders ────────────────────────────────────────────────────────────

/**
 * Build all passage rows for a topic.
 * THROWS (via expect-to-fail in tests) if any passage cannot be resolved.
 * Distinct from seed-liturgical which warn-drops — here unresolvable passages are errors.
 */
export function buildPassageRows(
  topic: ControversyTopic,
  controversyId: number
): ControversyPassageRow[] {
  const rows: ControversyPassageRow[] = [];

  for (const passage of topic.passages) {
    const parsed = parseReference(passage);
    if (!parsed) {
      throw new Error(`[seed-controversies] Cannot parse reference: "${passage}" in topic "${topic.topic}"`);
    }

    const bookInfo = lookupBook(parsed.book);
    if (!bookInfo) {
      throw new Error(`[seed-controversies] Unresolvable book: "${parsed.book}" in reference "${passage}" in topic "${topic.topic}"`);
    }

    let startChapter: number;
    let startVerse: number;
    let endChapter: number;
    let endVerse: number;

    if (parsed.range.includes(':')) {
      const result = parseVerseRange(parsed.range);
      if ('error' in result) {
        throw new Error(`[seed-controversies] Cannot parse verse range "${parsed.range}" in "${passage}": ${result.error}`);
      }
      startChapter = result.startChapter;
      startVerse = result.startVerse;
      endChapter = result.endChapter;
      endVerse = result.endVerse;
    } else {
      const result = parseChapterRange(parsed.range);
      if ('error' in result) {
        throw new Error(`[seed-controversies] Cannot parse chapter range "${parsed.range}" in "${passage}": ${result.error}`);
      }
      if (result.min === undefined) {
        throw new Error(`[seed-controversies] Empty chapter range in "${passage}"`);
      }
      startChapter = result.min;
      startVerse = 1;
      endChapter = result.max ?? result.min;
      endVerse = CHAPTER_ONLY_MAX_VERSE;
    }

    rows.push({
      controversy_id: controversyId,
      book: bookInfo.canonical,
      start_chapter: startChapter,
      start_verse: startVerse,
      end_chapter: endChapter,
      end_verse: endVerse,
      start_enc: encodePosition(startChapter, startVerse),
      end_enc: encodePosition(endChapter, endVerse),
      reference_display: passage,
    });
  }

  return rows;
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────

function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

// ─── SQL emitters ─────────────────────────────────────────────────────────────

export function topicInsertSql(id: number, topic: ControversyTopic): string {
  const slug = slugify(topic.topic);
  return (
    `INSERT OR REPLACE INTO controversy_topics ` +
    `(id, topic, slug, category, rating, summary, positions, keywords, sources, note, source) VALUES (` +
    `${escapeNum(id)}, ` +
    `${escapeSQL(topic.topic)}, ` +
    `${escapeSQL(slug)}, ` +
    `${escapeSQL(topic.category)}, ` +
    `${escapeSQL(topic.rating)}, ` +
    `${escapeSQL(topic.summary)}, ` +
    `${escapeSQL(JSON.stringify(topic.positions))}, ` +
    `${escapeSQL(JSON.stringify(topic.keywords))}, ` +
    `${escapeSQL(JSON.stringify(topic.sources))}, ` +
    `${escapeSQL(topic.note ?? null)}, ` +
    `'curated-in-house');`
  );
}

export function passageInsertSql(id: number, row: ControversyPassageRow): string {
  return (
    `INSERT OR REPLACE INTO controversy_passages ` +
    `(id, controversy_id, book, start_chapter, start_verse, end_chapter, end_verse, start_enc, end_enc, reference_display) VALUES (` +
    `${escapeNum(id)}, ` +
    `${escapeNum(row.controversy_id)}, ` +
    `${escapeSQL(row.book)}, ` +
    `${escapeNum(row.start_chapter)}, ` +
    `${escapeNum(row.start_verse)}, ` +
    `${escapeNum(row.end_chapter)}, ` +
    `${escapeNum(row.end_verse)}, ` +
    `${escapeNum(row.start_enc)}, ` +
    `${escapeNum(row.end_enc)}, ` +
    `${escapeSQL(row.reference_display)});`
  );
}

// ─── ETL main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : '/tmp/controversies-seed.sql';

  console.log(`[seed-controversies] Output: ${outputPath}`);

  const lines: string[] = [
    '-- 0018_seed_controversies.sql',
    '-- Generated by seed-controversies.ts — do not edit manually.',
    '-- Apply after 0017_add_controversies.sql',
    '-- Apply with: npx wrangler d1 execute <DB_NAME> --file=<this-file> --remote',
    '',
    '-- Controversy topics and passages',
  ];

  let topicId = 0;
  let passageId = 0;
  let totalTopics = 0;
  let totalPassages = 0;

  for (const topic of CONTROVERSY_DATASET) {
    topicId++;
    totalTopics++;
    lines.push(topicInsertSql(topicId, topic));

    const passageRows = buildPassageRows(topic, topicId);
    for (const row of passageRows) {
      passageId++;
      totalPassages++;
      lines.push(passageInsertSql(passageId, row));
    }
  }

  const sql = lines.join('\n') + '\n';
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n[seed-controversies] Written to: ${outputPath}`);

  console.log('\n=== Validation Report ===');
  console.log(`Topics emitted:   ${totalTopics}`);
  console.log(`Passages emitted: ${totalPassages}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
