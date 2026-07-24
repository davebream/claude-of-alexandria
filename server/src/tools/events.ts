import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange, ENTITY_ATTRIBUTION, encodePosition, CHAPTER_ONLY_MAX_VERSE } from './utils.js';


const CHRONOLOGY_CAVEAT =
  'Dates follow Ussher/Masoretic-derived chronology. Alternative traditions (LXX, Samaritan Pentateuch, critical scholarship) yield different dates. Use as relative sequencing, not absolute dating.';

export const EventsInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('Book name in any common form (e.g., "Genesis", "Acts", "Romans")'),
  chapter_range: z.string().optional().describe('Chapter range (e.g., "22" or "1-3"). Omit for entire book.'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
});

export type EventsInput = z.output<typeof EventsInputSchema>;

export const EventsOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  chapter_range: z.string().optional(),
  text_basis: z.literal('KJV'),
  events: z.array(z.strictObject({
    title: z.string(),
    start_date: z.string().nullable(),
    duration: z.string().nullable(),
    sort_key: z.number().nullable(),
    participants: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    chapters: z.array(z.number()),
    chapter_contested: z.boolean().optional(),
    controversies: z.array(z.strictObject({
      topic: z.string(),
      slug: z.string(),
      rating: z.string(),
    })).optional(),
  })),
  chronology_caveat: z.string(),
  summary: z.strictObject({
    total_events: z.number(),
  }),
  attribution: z.string(),
});

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

  sql += ' ORDER BY e.sort_key ASC NULLS LAST, e.id';

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

  chaptersSql += ' GROUP BY event_id, chapter ORDER BY event_id, chapter';

  // Get participants and locations in parallel
  const participantsSql = `
    SELECT ep.event_id, p.name
    FROM event_participants ep
    JOIN people p ON p.id = ep.person_id
    WHERE ep.event_id IN (${placeholders})
    ORDER BY ep.event_id, p.appearance_count DESC, p.id
  `;

  const locationsSql = `
    SELECT el.event_id, pl.name
    FROM event_locations el
    JOIN places pl ON pl.id = el.place_id
    WHERE el.event_id IN (${placeholders})
    ORDER BY el.event_id, pl.id
  `;

  // Build controversy-overlap query for the requested chapter span (chapter-only enc bounds)
  // Overlap condition: start_enc <= encodePosition(maxChapter, CHAPTER_ONLY_MAX_VERSE)
  //                   AND end_enc >= encodePosition(minChapter, 1)
  // When no chapter_range is given we use unbounded (all passages for the book).
  let controversyOverlapPromise: Promise<Record<string, unknown>[]>;
  {
    const minChapter = ('min' in chapterRange && chapterRange.min !== undefined) ? chapterRange.min : 1;
    const maxChapter = ('max' in chapterRange && chapterRange.max !== undefined) ? chapterRange.max : 999999;
    const spanStartEnc = encodePosition(minChapter, 1);
    const spanEndEnc = encodePosition(maxChapter, CHAPTER_ONLY_MAX_VERSE);

    const controversySql = `
      SELECT
        CAST((p.start_enc / 1000) AS INTEGER) AS start_chapter,
        CAST((p.end_enc / 1000) AS INTEGER) AS end_chapter,
        t.topic,
        t.slug,
        t.rating
      FROM controversy_passages p
      JOIN controversy_topics t ON t.id = p.topic_id
      WHERE p.book = ?
        AND p.start_enc <= ?
        AND p.end_enc >= ?
    `;
    controversyOverlapPromise = query(controversySql, [bookCanonical, spanEndEnc, spanStartEnc]).catch(err => {
      console.error('[query_events] controversy overlap query failed:', err);
      return [];
    });
  }

  const [chaptersRows, participantsRows, locationsRows, controversyRows] = await Promise.all([
    query(chaptersSql, chaptersParams),
    query(participantsSql, eventIds),
    query(locationsSql, eventIds),
    controversyOverlapPromise,
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

  // Build controversy passage ranges for chapter-membership lookup
  // Each row: { start_chapter, end_chapter, topic, slug, rating }
  const ratingOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  type ControvRow = { start_chapter: number; end_chapter: number; topic: string; slug: string; rating: string };
  const controvPassages: ControvRow[] = controversyRows.map(r => ({
    start_chapter: r.start_chapter as number,
    end_chapter: r.end_chapter as number,
    topic: r.topic as string,
    slug: r.slug as string,
    rating: r.rating as string,
  }));

  // Build response
  const events = eventRows.map(r => {
    const eid = r.id as number;
    const chapters = chaptersByEvent.get(eid) || [];

    // Per-chapter set membership: find topics whose passage ranges overlap any chapter
    const matchedTopics = new Map<string, ControvRow>();
    for (const chapter of chapters) {
      for (const passage of controvPassages) {
        if (chapter >= passage.start_chapter && chapter <= passage.end_chapter) {
          if (!matchedTopics.has(passage.slug)) {
            matchedTopics.set(passage.slug, passage);
          }
        }
      }
    }

    const baseEvent = {
      title: r.title as string,
      start_date: (r.start_date as string) ?? null,
      duration: (r.duration as string) ?? null,
      sort_key: (r.sort_key as number) ?? null,
      participants: participantsByEvent.get(eid) || [],
      locations: locationsByEvent.get(eid) || [],
      chapters,
    };

    if (matchedTopics.size === 0) {
      return baseEvent;
    }

    // Sort: rating desc (high>medium>low) then slug asc
    const controversies = Array.from(matchedTopics.values())
      .sort((a, b) => {
        const ra = ratingOrder[a.rating] ?? 99;
        const rb = ratingOrder[b.rating] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.slug.localeCompare(b.slug);
      })
      .map(p => ({ topic: p.topic, slug: p.slug, rating: p.rating }));

    return {
      ...baseEvent,
      chapter_contested: true as const,
      controversies,
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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
