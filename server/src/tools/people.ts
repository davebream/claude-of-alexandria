import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange, ENTITY_ATTRIBUTION } from './utils.js';

const CHARACTER_LIMIT = 25_000;
const HIGH_FREQUENCY_THRESHOLD = 500;

export const PeopleInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "Acts")'),
  range: z.string().describe('Verse range (e.g., "16:1-16:16" or "1:1")'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
};

export type PeopleInput = z.output<z.ZodObject<typeof PeopleInputSchema>>;

export const PeopleOutputSchema = {
  book: z.string(),
  range: z.string(),
  text_basis: z.literal('KJV'),
  people: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    display_title: z.string().optional(),
    gender: z.string().optional(),
    aliases: z.string().optional(),
    appearance_count: z.number(),
    appearances_by_book: z.record(z.number()).optional(),
    verses_in_range: z.array(z.string()),
    disputed: z.boolean(),
    dispute_note: z.string().optional(),
  })),
  disputed_identifications: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    dispute_note: z.string(),
  })),
  mention_type_caveat: z.string(),
  summary: z.object({
    total_people: z.number(),
    disputed_count: z.number(),
  }),
  attribution: z.string(),
};

export async function queryPeople(args: PeopleInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) }
      }) }],
      isError: true,
    };
  }

  const parsed = parseVerseRange(args.range);
  if ('error' in parsed) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: parsed.error } }) }],
      isError: true,
    };
  }

  const bookCanonical = bookInfo.canonical;
  const { startChapter, startVerse, endChapter, endVerse } = parsed;

  // Single collapsed query: get all people in the verse range with their metadata
  let sql = `
    SELECT DISTINCT
      p.id, p.name, p.slug, p.display_title, p.gender, p.aliases,
      p.appearance_count, p.disputed, p.dispute_note
    FROM verse_people vp
    JOIN people p ON p.id = vp.person_id
    WHERE vp.book = ?
  `;
  const params: unknown[] = [bookCanonical];

  if (startChapter === endChapter) {
    sql += ' AND vp.chapter = ? AND vp.verse >= ? AND vp.verse <= ?';
    params.push(startChapter, startVerse, endVerse);
  } else {
    sql += ` AND (
      (vp.chapter = ? AND vp.verse >= ?) OR
      (vp.chapter > ? AND vp.chapter < ?) OR
      (vp.chapter = ? AND vp.verse <= ?)
    )`;
    params.push(startChapter, startVerse, startChapter, endChapter, endChapter, endVerse);
  }

  sql += ' ORDER BY p.appearance_count DESC';

  const peopleRows = await query(sql, params);

  if (peopleRows.length === 0) {
    const result = {
      book: bookInfo.displayName,
      range: args.range,
      text_basis: 'KJV' as const,
      people: [],
      disputed_identifications: [],
      mention_type_caveat: 'Entity mentions do not distinguish narrative vs typological vs genealogical mention types. The exegete must classify from context.',
      summary: { total_people: 0, disputed_count: 0 },
      attribution: ENTITY_ATTRIBUTION,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  // Get verses_in_range for each person
  const personIds = peopleRows.map(r => r.id as number);
  const placeholders = personIds.map(() => '?').join(',');

  let versesSql = `
    SELECT person_id, chapter, verse FROM verse_people
    WHERE book = ? AND person_id IN (${placeholders})
  `;
  const versesParams: unknown[] = [bookCanonical, ...personIds];

  if (startChapter === endChapter) {
    versesSql += ' AND chapter = ? AND verse >= ? AND verse <= ?';
    versesParams.push(startChapter, startVerse, endVerse);
  } else {
    versesSql += ` AND (
      (chapter = ? AND verse >= ?) OR
      (chapter > ? AND chapter < ?) OR
      (chapter = ? AND verse <= ?)
    )`;
    versesParams.push(startChapter, startVerse, startChapter, endChapter, endChapter, endVerse);
  }

  const versesRows = await query(versesSql, versesParams);

  // Group verses by person_id
  const versesByPerson = new Map<number, string[]>();
  for (const r of versesRows) {
    const pid = r.person_id as number;
    const ref = `${r.chapter}:${r.verse}`;
    if (!versesByPerson.has(pid)) versesByPerson.set(pid, []);
    versesByPerson.get(pid)!.push(ref);
  }

  // Get appearances_by_book for each person (skip for high-frequency entities)
  const normalIds = personIds.filter(id => {
    const row = peopleRows.find(r => r.id === id);
    return row && (row.appearance_count as number) <= HIGH_FREQUENCY_THRESHOLD;
  });

  const appsByBook = new Map<number, Record<string, number>>();

  if (normalIds.length > 0) {
    const normalPlaceholders = normalIds.map(() => '?').join(',');
    const appsSql = `
      SELECT person_id, book, COUNT(*) as cnt
      FROM verse_people
      WHERE person_id IN (${normalPlaceholders})
      GROUP BY person_id, book
    `;
    const appsRows = await query(appsSql, normalIds);
    for (const r of appsRows) {
      const pid = r.person_id as number;
      if (!appsByBook.has(pid)) appsByBook.set(pid, {});
      appsByBook.get(pid)![r.book as string] = r.cnt as number;
    }
  }

  // Build response
  const disputed: { name: string; slug: string; dispute_note: string }[] = [];
  const people = peopleRows.map(r => {
    const pid = r.id as number;
    const isDisputed = (r.disputed as number) === 1;
    const disputeNote = r.dispute_note as string | null;

    if (isDisputed && disputeNote) {
      disputed.push({ name: r.name as string, slug: r.slug as string, dispute_note: disputeNote });
    }

    const entry: Record<string, unknown> = {
      name: r.name,
      slug: r.slug,
      display_title: r.display_title || r.name,
      gender: r.gender,
      aliases: r.aliases || undefined,
      appearance_count: r.appearance_count,
      verses_in_range: versesByPerson.get(pid) || [],
      disputed: isDisputed,
    };

    if (isDisputed && disputeNote) {
      entry.dispute_note = disputeNote;
    }

    // appearances_by_book: include for normal frequency, skip for high frequency
    if ((r.appearance_count as number) > HIGH_FREQUENCY_THRESHOLD) {
      entry.appearances_by_book = undefined;
      entry.high_frequency_note = `Appears in ${r.appearance_count} verses — cross-book breakdown omitted for performance.`;
    } else {
      entry.appearances_by_book = appsByBook.get(pid) || {};
    }

    return entry;
  });

  const result = {
    book: bookInfo.displayName,
    range: args.range,
    text_basis: 'KJV' as const,
    people,
    disputed_identifications: disputed,
    mention_type_caveat: 'Entity mentions do not distinguish narrative vs typological vs genealogical mention types. The exegete must classify from context.',
    summary: {
      total_people: people.length,
      disputed_count: disputed.length,
    },
    attribution: ENTITY_ATTRIBUTION,
  };

  // Character limit guard
  let jsonStr = JSON.stringify(result);
  if (jsonStr.length > CHARACTER_LIMIT) {
    // Truncate people array, keep summary accurate
    let truncatedPeople = [...people];
    while (truncatedPeople.length > 1 && JSON.stringify({ ...result, people: truncatedPeople }).length > CHARACTER_LIMIT) {
      truncatedPeople = truncatedPeople.slice(0, Math.floor(truncatedPeople.length * 0.8));
    }
    const truncatedResult = {
      ...result,
      people: truncatedPeople,
      truncated: true,
      total_available: people.length,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
      structuredContent: truncatedResult,
    };
  }

  return {
    content: [{ type: 'text', text: jsonStr }],
    structuredContent: result,
  };
}
