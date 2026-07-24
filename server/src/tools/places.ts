import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange, ENTITY_ATTRIBUTION } from './utils.js';

const HIGH_FREQUENCY_THRESHOLD = 500;

export const PlacesInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('Book name in any common form (e.g., "Acts", "Gen", "Romans")'),
  range: z.string().describe('Verse range (e.g., "18:1-18:18" or "1:1")'),
  testament: z.enum(['nt', 'ot']).optional().describe('Testament — auto-detected from book if omitted'),
});

export type PlacesInput = z.output<typeof PlacesInputSchema>;

export const PlacesOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  range: z.string(),
  text_basis: z.literal('KJV'),
  places: z.array(z.strictObject({
    name: z.string(),
    slug: z.string(),
    display_title: z.string().optional(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    feature_type: z.string().nullable(),
    feature_subtype: z.string().nullable(),
    aliases: z.string().optional(),
    appearance_count: z.number(),
    appearances_by_book: z.record(z.string(), z.number()).optional(),
    high_frequency_note: z.string().optional(),
    verses_in_range: z.array(z.string()),
  })),
  summary: z.strictObject({
    total_places: z.number(),
  }),
  attribution: z.string(),
});

export async function queryPlaces(args: PlacesInput): Promise<CallToolResult> {
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

  // Single collapsed query: get all places in the verse range with their metadata
  let sql = `
    SELECT DISTINCT
      p.id, p.name, p.slug, p.display_title, p.latitude, p.longitude,
      p.feature_type, p.feature_subtype, p.aliases, p.appearance_count
    FROM verse_places vpl
    JOIN places p ON p.id = vpl.place_id
    WHERE vpl.book = ?
  `;
  const params: unknown[] = [bookCanonical];

  if (startChapter === endChapter) {
    sql += ' AND vpl.chapter = ? AND vpl.verse >= ? AND vpl.verse <= ?';
    params.push(startChapter, startVerse, endVerse);
  } else {
    sql += ` AND (
      (vpl.chapter = ? AND vpl.verse >= ?) OR
      (vpl.chapter > ? AND vpl.chapter < ?) OR
      (vpl.chapter = ? AND vpl.verse <= ?)
    )`;
    params.push(startChapter, startVerse, startChapter, endChapter, endChapter, endVerse);
  }

  sql += ' ORDER BY p.appearance_count DESC, p.id';

  const placesRows = await query(sql, params);

  if (placesRows.length === 0) {
    const result = {
      book: bookInfo.displayName,
      range: args.range,
      text_basis: 'KJV' as const,
      places: [],
      summary: { total_places: 0 },
      attribution: ENTITY_ATTRIBUTION,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  // Get verses_in_range for each place
  const placeIds = placesRows.map(r => r.id as number);
  const placeholders = placeIds.map(() => '?').join(',');

  let versesSql = `
    SELECT place_id, chapter, verse FROM verse_places
    WHERE book = ? AND place_id IN (${placeholders})
  `;
  const versesParams: unknown[] = [bookCanonical, ...placeIds];

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

  // Group verses by place_id
  const versesByPlace = new Map<number, string[]>();
  for (const r of versesRows) {
    const pid = r.place_id as number;
    const ref = `${r.chapter}:${r.verse}`;
    if (!versesByPlace.has(pid)) versesByPlace.set(pid, []);
    versesByPlace.get(pid)!.push(ref);
  }

  // Get appearances_by_book for each place (skip for high-frequency entities)
  const normalIds = placeIds.filter(id => {
    const row = placesRows.find(r => r.id === id);
    return row && (row.appearance_count as number) <= HIGH_FREQUENCY_THRESHOLD;
  });

  const appsByBook = new Map<number, Record<string, number>>();

  if (normalIds.length > 0) {
    const normalPlaceholders = normalIds.map(() => '?').join(',');
    const appsSql = `
      SELECT place_id, book, COUNT(*) as cnt
      FROM verse_places
      WHERE place_id IN (${normalPlaceholders})
      GROUP BY place_id, book
    `;
    const appsRows = await query(appsSql, normalIds);
    for (const r of appsRows) {
      const pid = r.place_id as number;
      if (!appsByBook.has(pid)) appsByBook.set(pid, {});
      appsByBook.get(pid)![r.book as string] = r.cnt as number;
    }
  }

  // Build response
  const places = placesRows.map(r => {
    const pid = r.id as number;

    const entry: Record<string, unknown> = {
      name: r.name,
      slug: r.slug,
      display_title: r.display_title || r.name,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      feature_type: r.feature_type ?? null,
      feature_subtype: r.feature_subtype ?? null,
      aliases: r.aliases || undefined,
      appearance_count: r.appearance_count,
      verses_in_range: versesByPlace.get(pid) || [],
    };

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
    places,
    summary: {
      total_places: places.length,
    },
    attribution: ENTITY_ATTRIBUTION,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
