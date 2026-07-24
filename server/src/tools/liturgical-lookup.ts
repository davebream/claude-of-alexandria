import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
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


// ─── Input Schema ─────────────────────────────────────────────────────────────

export const LiturgicalLookupInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...PaginationInputShape, mode: z.literal('season').describe('Find readings in one liturgical season.'), season: z.string().min(1).describe('Season name or slug.'), tradition: z.string().min(1).optional().describe('Restrict results to one liturgical tradition.') }),
  z.strictObject({ ...PaginationInputShape, mode: z.literal('passage').describe('Find seasons containing a biblical passage.'), book: z.string().min(1).describe('Biblical book name.'), range: z.string().min(1).describe('Chapter or verse range within the book.'), tradition: z.string().min(1).optional().describe('Restrict results to one liturgical tradition.') }),
  z.strictObject({ ...PaginationInputShape, mode: z.literal('list').describe('List available seasons.'), tradition: z.string().min(1).optional().describe('Restrict results to one liturgical tradition.') }),
]);

export type LiturgicalLookupInput = z.output<typeof LiturgicalLookupInputSchema>;

// ─── Output Schema ────────────────────────────────────────────────────────────

const LiturgicalReadingSchema = z.strictObject({
  reference_display: z.string(),
  book: z.string(),
  start: z.strictObject({ chapter: z.number().int().positive(), verse: z.number().int().positive() }),
  end: z.strictObject({ chapter: z.number().int().positive(), verse: z.number().int().positive() }),
  themes: z.array(z.string()),
  note: z.string().nullable(),
  source: z.string(),
});

const LiturgicalSeasonSchema = z.strictObject({
  season: z.string(),
  season_slug: z.string(),
  season_order: z.number().int().positive(),
  tradition: z.string(),
  themes: z.array(z.string()),
  readings: z.array(LiturgicalReadingSchema),
});

const LiturgicalSeasonSummarySchema = LiturgicalSeasonSchema.omit({ readings: true });
const LiturgicalReadingResultSchema = LiturgicalReadingSchema.extend({
  season: z.string(),
  season_slug: z.string(),
  season_order: z.number().int().positive(),
  tradition: z.string(),
  season_themes: z.array(z.string()),
});

const LiturgicalOutputCommon = {
  provenance: ProvenanceSchema,
  page: PageSchema,
  total_seasons: z.number().int().nonnegative(),
  total_readings: z.number().int().nonnegative(),
};

export const LiturgicalLookupOutputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...LiturgicalOutputCommon, mode: z.literal('season'), query_info: z.strictObject({ season: z.string(), tradition: z.string().optional() }), results: z.array(LiturgicalReadingResultSchema) }),
  z.strictObject({ ...LiturgicalOutputCommon, mode: z.literal('passage'), query_info: z.strictObject({ book: z.string(), range: z.string(), tradition: z.string().optional() }), results: z.array(LiturgicalReadingResultSchema) }),
  z.strictObject({ ...LiturgicalOutputCommon, mode: z.literal('list'), query_info: z.strictObject({ tradition: z.string().optional() }), results: z.array(LiturgicalSeasonSummarySchema) }),
]);

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

// ─── Helper: group flat SQL rows into season-grouped structure ─────────────────

type SeasonRow = Record<string, unknown>;

function groupRowsBySeasonSlug(rows: SeasonRow[]): Array<{
  season: string;
  season_slug: string;
  season_order: number;
  tradition: string;
  themes: string[];
  readings: Array<{
    reference_display: string;
    book: string;
    start: { chapter: number; verse: number };
    end: { chapter: number; verse: number };
    themes: string[];
    note: string | null;
    source: string;
  }>;
}> {
  const seasonMap = new Map<string, ReturnType<typeof groupRowsBySeasonSlug>[number]>();

  for (const row of rows) {
    const slug = row.season_slug as string;
    if (!seasonMap.has(slug)) {
      seasonMap.set(slug, {
        season: row.season as string,
        season_slug: slug,
        season_order: row.season_order as number,
        tradition: row.tradition as string,
        themes: [],
        readings: [],
      });
    }
    const season = seasonMap.get(slug)!;
    const themes = parseThemes(row.themes);
    for (const theme of themes) if (!season.themes.includes(theme)) season.themes.push(theme);
    const start = row.start_enc as number;
    const end = row.end_enc as number;
    if (!Number.isInteger(start) || !Number.isInteger(end) || typeof row.book !== 'string') continue;
    season.readings.push({
      reference_display: row.reference_display as string,
      book: row.book as string,
      start: { chapter: Math.floor(start / 1000), verse: start % 1000 },
      end: { chapter: Math.floor(end / 1000), verse: end % 1000 },
      themes,
      note: (row.note as string | null) ?? null,
      source: row.source as string,
    });
  }

  return [...seasonMap.values()];
}

// ─── Mode: list ───────────────────────────────────────────────────────────────

async function handleList(args: Extract<LiturgicalLookupInput, { mode: 'list' }>): Promise<CallToolResult> {
  let sql = `SELECT id, season, season_slug, season_order, tradition, book,
                    start_enc, end_enc, reference_display, themes, note, source
             FROM liturgical_readings`;
  const params: unknown[] = [];

  if (args.tradition) {
    sql += ' WHERE tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY season_order, season_slug, book, start_enc, id';

  const rows = await query(sql, params);
  const seasons = groupRowsBySeasonSlug(rows);

  const result: Record<string, unknown> = {
    mode: 'list',
    query_info: {
      ...(args.tradition ? { tradition: args.tradition } : {}),
    },
    seasons,
    total_seasons: seasons.length,
    total_readings: seasons.reduce((sum, season) => sum + season.readings.length, 0),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: season ─────────────────────────────────────────────────────────────

async function handleSeason(args: Extract<LiturgicalLookupInput, { mode: 'season' }>): Promise<CallToolResult> {
  if (!args.season) {
    return errorResponse('MISSING_SEASON', 'season is required for mode="season". Use mode="list" to discover available seasons.');
  }

  const slug = slugifySeason(args.season);
  let sql = `SELECT id, season, season_slug, season_order, tradition, book,
                    start_enc, end_enc, reference_display, themes, note, source
             FROM liturgical_readings
             WHERE season_slug = ?`;
  const params: unknown[] = [slug];

  if (args.tradition) {
    sql += ' AND tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY book, start_enc, id';

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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: passage ────────────────────────────────────────────────────────────

async function handlePassage(args: Extract<LiturgicalLookupInput, { mode: 'passage' }>): Promise<CallToolResult> {
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

  let sql = `SELECT id, season, season_slug, season_order, tradition, book,
                    start_enc, end_enc, reference_display, themes, note, source
             FROM liturgical_readings
             WHERE book = ? AND start_enc <= ? AND end_enc >= ?`;
  const params: unknown[] = [bookInfo.canonical, queryEnd, queryStart];

  if (args.tradition) {
    sql += ' AND tradition = ?';
    params.push(args.tradition.toLowerCase());
  }
  sql += ' ORDER BY season_order, start_enc, id';

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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
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
