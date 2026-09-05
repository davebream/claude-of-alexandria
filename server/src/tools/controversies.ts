import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import {
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
} from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────


const NEUTRALITY_CAVEAT =
  'This catalogs academic dispute and the major scholarly positions; it does not adjudicate which view is correct. Present positions with their evidence; do not resolve a contested debate.';

const ATTRIBUTION =
  'Controversy data: curated in-house from cited academic scholarship (see each topic\'s sources). Positions are summarized neutrally and do not adjudicate contested debates.';

// ─── Input Schema ─────────────────────────────────────────────────────────────

export const ControversiesInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...PaginationInputShape, mode: z.literal('topic').describe('Search controversies by topic or keyword.'), topic: z.string().min(1).max(200).describe('Topic search text, 1 to 200 characters.') }),
  z.strictObject({ ...PaginationInputShape, mode: z.literal('passage').describe('Find controversies associated with a passage.'), book: z.string().min(1).describe('Biblical book name.'), range: z.string().min(1).describe('Chapter or verse range within the book.') }),
  z.strictObject({ ...PaginationInputShape, mode: z.literal('list').describe('List controversy topics.'), rating: z.string().min(1).optional().describe('Restrict topics to one evidence rating.'), category: z.string().min(1).optional().describe('Restrict topics to one category.') }),
]);

export type ControversiesInput = z.output<typeof ControversiesInputSchema>;

// ─── Output Schema ────────────────────────────────────────────────────────────

const ControversyTopicSchema = z.strictObject({
  topic: z.string(),
  slug: z.string(),
  category: z.string(),
  rating: z.string(),
  summary: z.string().optional(),
  positions: z.array(z.strictObject({
    label: z.string(),
    view: z.string(),
    evidence: z.string().optional(),
    scholars: z.array(z.string()),
  })),
  sources: z.array(z.strictObject({ citation: z.string(), tier: z.string() })),
  passages: z.array(z.unknown()).optional(),
  note: z.string().nullable().optional(),
});

const ControversiesOutputBaseSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  topics: z.array(ControversyTopicSchema),
  attribution: z.string(),
  neutrality_caveat: z.string(),
});

export const ControversiesOutputSchema = z.discriminatedUnion('mode', [
  ControversiesOutputBaseSchema.extend({ mode: z.literal('topic'), query_info: z.strictObject({ topic: z.string() }) }),
  ControversiesOutputBaseSchema.extend({ mode: z.literal('passage'), query_info: z.strictObject({ book: z.string(), range: z.string() }) }),
  ControversiesOutputBaseSchema.extend({ mode: z.literal('list'), query_info: z.strictObject({ rating: z.string().optional(), category: z.string().optional() }) }),
]);

// ─── Helper: build error response ────────────────────────────────────────────

function errorResponse(code: string, message: string, suggestions?: string[]): CallToolResult {
  const body: Record<string, unknown> = { error: { code, message } };
  if (suggestions) body.error = { ...(body.error as object), suggestions };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
}

// ─── Helper: safely parse a TEXT column that should be a JSON array ───────────

function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as unknown[];
    return [];
  } catch {
    return [];
  }
}

// ─── Helper: map a DB row to a topic object ───────────────────────────────────

type TopicRow = Record<string, unknown>;

function rowToTopic(row: TopicRow) {
  return {
    topic: row.topic as string,
    slug: row.slug as string,
    category: row.category as string,
    rating: row.rating as string,
    summary: (row.summary as string | undefined) ?? undefined,
    positions: parseJsonArray(row.positions) as Array<{ label: string; view: string; evidence?: string; scholars: string[] }>,
    sources: parseJsonArray(row.sources) as Array<{ citation: string; tier: string }>,
    note: (row.note as string | null) ?? null,
  };
}

// ─── Mode: list ───────────────────────────────────────────────────────────────

async function handleList(args: Extract<ControversiesInput, { mode: 'list' }>): Promise<CallToolResult> {
  let sql = 'SELECT topic, slug, category, rating FROM controversy_topics';
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (args.rating) {
    conditions.push('rating = ?');
    params.push(args.rating);
  }
  if (args.category) {
    conditions.push('category = ?');
    params.push(args.category);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY category, topic, slug';

  const rows = await query(sql, params);
  const topics = rows.map(row => ({
    topic: row.topic as string,
    slug: row.slug as string,
    category: row.category as string,
    rating: row.rating as string,
    positions: [],
    sources: [],
  }));

  const result: Record<string, unknown> = {
    mode: 'list',
    query_info: {
      ...(args.rating ? { rating: args.rating } : {}),
      ...(args.category ? { category: args.category } : {}),
    },
    topics,
    attribution: ATTRIBUTION,
    neutrality_caveat: NEUTRALITY_CAVEAT,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: topic ─────────────────────────────────────────────────────────────

async function handleTopic(args: Extract<ControversiesInput, { mode: 'topic' }>): Promise<CallToolResult> {
  if (!args.topic) {
    return errorResponse('MISSING_TOPIC', 'topic is required for mode="topic". Use mode="list" to discover available topics.');
  }

  // Strip LIKE metacharacters per lexicon.ts precedent (avoid false-positive substring matches)
  const safeTopic = args.topic.replace(/[%_]/g, '');

  // ESCAPE '\\' is retained for SQLite compatibility but is inert here because
  // metacharacters are stripped before use (safeTopic has no % or _ characters).
  // This matches the lexicon.ts precedent: strip, don't escape.
  const sql = `
    SELECT t.topic, t.slug, t.category, t.rating, t.summary, t.positions, t.sources, t.note
    FROM controversy_topics t
    WHERE t.topic LIKE ? ESCAPE '\\'
       OR EXISTS (
         SELECT 1 FROM json_each(t.keywords) k
         WHERE lower(k.value) = lower(?)
       )
    ORDER BY t.category, t.topic, t.slug
  `;
  const likeParam = `%${safeTopic}%`;

  const rows = await query(sql, [likeParam, safeTopic]);
  const topics = rows.map(rowToTopic);

  const result: Record<string, unknown> = {
    mode: 'topic',
    query_info: { topic: args.topic },
    topics,
    attribution: ATTRIBUTION,
    neutrality_caveat: NEUTRALITY_CAVEAT,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: passage ────────────────────────────────────────────────────────────

async function handlePassage(args: Extract<ControversiesInput, { mode: 'passage' }>): Promise<CallToolResult> {
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

  let queryStart: number;
  let queryEnd: number;

  if (args.range.includes(':')) {
    const parsed = parseVerseRange(args.range);
    if ('error' in parsed) {
      return errorResponse('INVALID_RANGE', parsed.error);
    }
    queryStart = encodePosition(parsed.startChapter, parsed.startVerse);
    queryEnd = encodePosition(parsed.endChapter, parsed.endVerse);
  } else {
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

  const sql = `
    SELECT DISTINCT t.topic, t.slug, t.category, t.rating, t.summary, t.positions, t.sources, t.note
    FROM controversy_topics t
    JOIN controversy_passages p ON p.controversy_id = t.id
    WHERE p.book = ? AND p.start_enc <= ? AND p.end_enc >= ?
    ORDER BY t.category, t.topic, t.slug
  `;
  const rows = await query(sql, [bookInfo.canonical, queryEnd, queryStart]);
  const topics = rows.map(rowToTopic);

  const result: Record<string, unknown> = {
    mode: 'passage',
    query_info: {
      book: bookInfo.displayName,
      range: args.range,
    },
    topics,
    attribution: ATTRIBUTION,
    neutrality_caveat: NEUTRALITY_CAVEAT,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function queryControversies(args: ControversiesInput): Promise<CallToolResult> {
  switch (args.mode) {
    case 'list':    return handleList(args);
    case 'topic':   return handleTopic(args);
    case 'passage': return handlePassage(args);
  }
}
