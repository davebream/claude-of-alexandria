import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import {
  slugifySeason,
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
} from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ─── Input Schema ─────────────────────────────────────────────────────────────

export const LiturgicalLookupInputSchema = {
  mode: z.enum(['season', 'passage', 'list'])
    .describe(
      'Query mode:\n' +
      '  "season" — get readings and themes for a liturgical season (season required)\n' +
      '  "passage" — find which season(s) feature a given Scripture passage (book + range required)\n' +
      '  "list" — enumerate available seasons with metadata'
    ),
  season: z.string().optional()
    .describe('Season name or slug (e.g., "Advent", "Holy Week"). Required for mode="season".'),
  book: z.string().optional()
    .describe('Bible book name in any common form (e.g., "Isaiah", "Luke"). Required for mode="passage".'),
  range: z.string().optional()
    .describe(
      'Verse or chapter range. Accepts: "9:6" (single verse), "9:2-7" (same-chapter), ' +
      '"9:2-11:9" (cross-chapter), "9" or "9-11" (chapter-only). Required for mode="passage".'
    ),
  tradition: z.string().optional()
    .describe('Filter by liturgical tradition (e.g., "western", "reformed"). Case-insensitive.'),
  limit: z.number().optional()
    .describe('Maximum seasons returned (default: 50, max: 200).'),
};

export type LiturgicalLookupInput = z.output<z.ZodObject<typeof LiturgicalLookupInputSchema>>;

// ─── Output Schema ────────────────────────────────────────────────────────────

export const LiturgicalLookupOutputSchema = {
  mode: z.string(),
  query_info: z.object({
    season: z.string().optional(),
    book: z.string().optional(),
    range: z.string().optional(),
    tradition: z.string().optional(),
  }),
  seasons: z.array(z.object({
    season: z.string(),
    season_order: z.number(),
    tradition: z.string(),
    readings: z.array(z.object({
      reference_display: z.string(),
      book: z.string(),
      themes: z.array(z.string()),
      note: z.string().nullable(),
    })),
  })),
  total_seasons: z.number(),
  total_readings: z.number(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

// ─── Helper: build error response ────────────────────────────────────────────

function errorResponse(code: string, message: string, suggestions?: string[]): CallToolResult {
  const body: Record<string, unknown> = { error: { code, message } };
  if (suggestions) body.error = { ...body.error as object, suggestions };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
}

// ─── Helper: parse themes JSON safely ────────────────────────────────────────

function parseThemes(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

// ─── Helper: apply character-limit guard (liturgical variant) ─────────────────

function applyCharacterLimit(
  result: Record<string, unknown>,
  seasons: Array<{ season: string; readings: unknown[] }>,
): Record<string, unknown> {
  const serialized = JSON.stringify(result);
  if (serialized.length <= CHARACTER_LIMIT || seasons.length <= 1) return result;

  const sorted = [...seasons].sort((a, b) => a.readings.length - b.readings.length);
  let truncated = sorted;
  while (
    JSON.stringify({ ...result, seasons: truncated }).length > CHARACTER_LIMIT &&
    truncated.length > 1
  ) {
    truncated = truncated.slice(1);
  }
  return {
    ...result,
    seasons: truncated,
    truncated: true,
    truncation_message: `Response truncated from ${seasons.length} to ${truncated.length} seasons (character limit). Use the tradition filter or the limit parameter to narrow results.`,
  };
}

// ─── Helper: group flat SQL rows into season-grouped structure ─────────────────

type SeasonRow = Record<string, unknown>;

function groupRowsBySeasonSlug(rows: SeasonRow[]): Array<{
  season: string;
  season_order: number;
  tradition: string;
  readings: Array<{
    reference_display: string;
    book: string;
    themes: string[];
    note: string | null;
  }>;
}> {
  const seasonMap = new Map<string, ReturnType<typeof groupRowsBySeasonSlug>[number]>();

  for (const row of rows) {
    const slug = row.season_slug as string;
    if (!seasonMap.has(slug)) {
      seasonMap.set(slug, {
        season: row.season as string,
        season_order: row.season_order as number,
        tradition: row.tradition as string,
        readings: [],
      });
    }
    seasonMap.get(slug)!.readings.push({
      reference_display: row.reference_display as string,
      book: row.book as string,
      themes: parseThemes(row.themes),
      note: (row.note as string | null) ?? null,
    });
  }

  return [...seasonMap.values()];
}

// ─── Mode: list ───────────────────────────────────────────────────────────────

async function handleList(args: LiturgicalLookupInput): Promise<CallToolResult> {
  let sql = `SELECT DISTINCT season, season_slug, season_order, tradition
             FROM liturgical_readings`;
  const params: unknown[] = [];

  if (args.tradition) {
    sql += ' WHERE tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY season_order';

  const rows = await query(sql, params);
  const seasons = rows.map(row => ({
    season: row.season as string,
    season_order: row.season_order as number,
    tradition: row.tradition as string,
    readings: [] as never[],
  }));

  const result: Record<string, unknown> = {
    mode: 'list',
    query_info: {
      ...(args.tradition ? { tradition: args.tradition } : {}),
    },
    seasons,
    total_seasons: seasons.length,
    total_readings: 0,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: season ─────────────────────────────────────────────────────────────

async function handleSeason(args: LiturgicalLookupInput): Promise<CallToolResult> {
  if (!args.season) {
    return errorResponse('MISSING_SEASON', 'season is required for mode="season". Use mode="list" to discover available seasons.');
  }

  const slug = slugifySeason(args.season);
  const lim = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  let sql = `SELECT season, season_slug, season_order, tradition, book,
                    start_enc, end_enc, reference_display, themes, note
             FROM liturgical_readings
             WHERE season_slug = ?`;
  const params: unknown[] = [slug];

  if (args.tradition) {
    sql += ' AND tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY book, start_enc LIMIT ?';
  params.push(lim);

  const rows = await query(sql, params);
  const seasons = groupRowsBySeasonSlug(rows);

  const result: Record<string, unknown> = {
    mode: 'season',
    query_info: {
      season: args.season,
      ...(args.tradition ? { tradition: args.tradition } : {}),
    },
    seasons,
    total_seasons: seasons.length,
    total_readings: seasons.reduce((s, season) => s + season.readings.length, 0),
  };

  const finalResult = applyCharacterLimit(result, seasons);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Mode: passage ────────────────────────────────────────────────────────────

async function handlePassage(args: LiturgicalLookupInput): Promise<CallToolResult> {
  if (!args.book) {
    return errorResponse('MISSING_BOOK', 'book is required for mode="passage".');
  }
  if (!args.range) {
    return errorResponse('MISSING_RANGE', 'range is required for mode="passage".');
  }

  const bookInfo = lookupBook(args.book);
  if (!bookInfo) {
    return errorResponse('BOOK_NOT_FOUND', `Book "${args.book}" not found.`, suggestBooks(args.book));
  }

  // Determine query start/end encoded positions
  let queryStart: number;
  let queryEnd: number;

  if (args.range.includes(':')) {
    // Verse-level reference
    const parsed = parseVerseRange(args.range);
    if ('error' in parsed) {
      return errorResponse('INVALID_RANGE', parsed.error);
    }
    queryStart = encodePosition(parsed.startChapter, parsed.startVerse);
    queryEnd = encodePosition(parsed.endChapter, parsed.endVerse);
  } else {
    // Chapter-only reference
    const parsed = parseChapterRange(args.range);
    if ('error' in parsed) {
      return errorResponse('INVALID_RANGE', (parsed as { error: string }).error);
    }
    const chParsed = parsed as { min?: number; max?: number };
    if (chParsed.min === undefined || chParsed.max === undefined) {
      return errorResponse('INVALID_RANGE', `Invalid chapter range: "${args.range}"`);
    }
    queryStart = encodePosition(chParsed.min, 1);
    queryEnd = encodePosition(chParsed.max, CHAPTER_ONLY_MAX_VERSE);
  }

  const lim = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  let sql = `SELECT season, season_slug, season_order, tradition, book,
                    start_enc, end_enc, reference_display, themes, note
             FROM liturgical_readings
             WHERE book = ? AND start_enc <= ? AND end_enc >= ?`;
  const params: unknown[] = [bookInfo.canonical, queryEnd, queryStart];

  if (args.tradition) {
    sql += ' AND tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY season_order, start_enc LIMIT ?';
  params.push(lim);

  const rows = await query(sql, params);
  const seasons = groupRowsBySeasonSlug(rows);

  const result: Record<string, unknown> = {
    mode: 'passage',
    query_info: {
      book: bookInfo.displayName,
      range: args.range,
      ...(args.tradition ? { tradition: args.tradition } : {}),
    },
    seasons,
    total_seasons: seasons.length,
    total_readings: seasons.reduce((s, season) => s + season.readings.length, 0),
  };

  const finalResult = applyCharacterLimit(result, seasons);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function liturgicalLookup(args: LiturgicalLookupInput): Promise<CallToolResult> {
  switch (args.mode) {
    case 'list':    return handleList(args);
    case 'season':  return handleSeason(args);
    case 'passage': return handlePassage(args);
  }
}
