import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange, ENTITY_ATTRIBUTION } from './utils.js';

const CHARACTER_LIMIT = 25_000;

const CHRONOLOGY_CAVEAT =
  'Dates follow Ussher/Masoretic-derived chronology. Alternative traditions (LXX, Samaritan Pentateuch, critical scholarship) yield different dates. Use as relative sequencing, not absolute dating.';

export const EventsInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Genesis", "Acts", "Romans")'),
  chapter_range: z.string().optional().describe('Chapter range (e.g., "22" or "1-3"). Omit for entire book.'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
};

export type EventsInput = z.output<z.ZodObject<typeof EventsInputSchema>>;

export const EventsOutputSchema = {
  book: z.string(),
  chapter_range: z.string().optional(),
  text_basis: z.literal('KJV'),
  events: z.array(z.object({
    title: z.string(),
    start_date: z.string().nullable(),
    duration: z.string().nullable(),
    sort_key: z.number().nullable(),
    participants: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    chapters: z.array(z.number()),
  })),
  chronology_caveat: z.string(),
  summary: z.object({
    total_events: z.number(),
  }),
  attribution: z.string(),
};

export async function queryEvents(args: EventsInput): Promise<CallToolResult> {
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

  const chapterRange = parseChapterRange(args.chapter_range);
  if ('error' in chapterRange) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: chapterRange.error } }) }],
      isError: true,
    };
  }

  const bookCanonical = bookInfo.canonical;

  // Get events linked to this book/chapter range via verse_events
  let sql = `
    SELECT DISTINCT
      e.id, e.title, e.start_date, e.duration, e.sort_key
    FROM verse_events ve
    JOIN events e ON e.id = ve.event_id
    WHERE ve.book = ?
  `;
  const params: unknown[] = [bookCanonical];

  if ('min' in chapterRange && chapterRange.min !== undefined) {
    sql += ' AND ve.chapter >= ? AND ve.chapter <= ?';
    params.push(chapterRange.min, chapterRange.max!);
  }

  sql += ' ORDER BY e.sort_key ASC NULLS LAST';

  const eventRows = await query(sql, params);

  if (eventRows.length === 0) {
    const result = {
      book: bookInfo.displayName,
      chapter_range: args.chapter_range,
      text_basis: 'KJV' as const,
      events: [],
      chronology_caveat: CHRONOLOGY_CAVEAT,
      summary: { total_events: 0 },
      attribution: ENTITY_ATTRIBUTION,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  const eventIds = eventRows.map(r => r.id as number);
  const placeholders = eventIds.map(() => '?').join(',');

  // Get chapters per event in the requested range
  let chaptersSql = `
    SELECT event_id, chapter FROM verse_events
    WHERE book = ? AND event_id IN (${placeholders})
  `;
  const chaptersParams: unknown[] = [bookCanonical, ...eventIds];

  if ('min' in chapterRange && chapterRange.min !== undefined) {
    chaptersSql += ' AND chapter >= ? AND chapter <= ?';
    chaptersParams.push(chapterRange.min, chapterRange.max!);
  }

  chaptersSql += ' GROUP BY event_id, chapter ORDER BY chapter';

  // Get participants and locations in parallel
  const participantsSql = `
    SELECT ep.event_id, p.name
    FROM event_participants ep
    JOIN people p ON p.id = ep.person_id
    WHERE ep.event_id IN (${placeholders})
    ORDER BY p.appearance_count DESC
  `;

  const locationsSql = `
    SELECT el.event_id, pl.name
    FROM event_locations el
    JOIN places pl ON pl.id = el.place_id
    WHERE el.event_id IN (${placeholders})
  `;

  const [chaptersRows, participantsRows, locationsRows] = await Promise.all([
    query(chaptersSql, chaptersParams),
    query(participantsSql, eventIds),
    query(locationsSql, eventIds),
  ]);

  // Group chapters by event
  const chaptersByEvent = new Map<number, number[]>();
  for (const r of chaptersRows) {
    const eid = r.event_id as number;
    if (!chaptersByEvent.has(eid)) chaptersByEvent.set(eid, []);
    chaptersByEvent.get(eid)!.push(r.chapter as number);
  }

  // Group participants by event
  const participantsByEvent = new Map<number, string[]>();
  for (const r of participantsRows) {
    const eid = r.event_id as number;
    if (!participantsByEvent.has(eid)) participantsByEvent.set(eid, []);
    const name = r.name as string;
    if (!participantsByEvent.get(eid)!.includes(name)) {
      participantsByEvent.get(eid)!.push(name);
    }
  }

  // Group locations by event
  const locationsByEvent = new Map<number, string[]>();
  for (const r of locationsRows) {
    const eid = r.event_id as number;
    if (!locationsByEvent.has(eid)) locationsByEvent.set(eid, []);
    const name = r.name as string;
    if (!locationsByEvent.get(eid)!.includes(name)) {
      locationsByEvent.get(eid)!.push(name);
    }
  }

  // Build response
  const events = eventRows.map(r => {
    const eid = r.id as number;
    return {
      title: r.title as string,
      start_date: (r.start_date as string) ?? null,
      duration: (r.duration as string) ?? null,
      sort_key: (r.sort_key as number) ?? null,
      participants: participantsByEvent.get(eid) || [],
      locations: locationsByEvent.get(eid) || [],
      chapters: chaptersByEvent.get(eid) || [],
    };
  });

  const result = {
    book: bookInfo.displayName,
    chapter_range: args.chapter_range,
    text_basis: 'KJV' as const,
    events,
    chronology_caveat: CHRONOLOGY_CAVEAT,
    summary: {
      total_events: events.length,
    },
    attribution: ENTITY_ATTRIBUTION,
  };

  // Character limit guard
  const jsonStr = JSON.stringify(result);
  if (jsonStr.length > CHARACTER_LIMIT) {
    let truncatedEvents = [...events];
    while (truncatedEvents.length > 1 && JSON.stringify({ ...result, events: truncatedEvents }).length > CHARACTER_LIMIT) {
      truncatedEvents = truncatedEvents.slice(0, Math.floor(truncatedEvents.length * 0.8));
    }
    const truncatedResult = {
      ...result,
      events: truncatedEvents,
      truncated: true,
      total_available: events.length,
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
