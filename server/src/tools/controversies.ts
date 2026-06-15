import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import {
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
  ENTITY_ATTRIBUTION,
} from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25_000;

const NEUTRALITY_CAVEAT =
  'This catalogs academic dispute and the major scholarly positions; it does not adjudicate which view is correct. Present positions with their evidence; do not resolve a contested debate.';

const ATTRIBUTION = ENTITY_ATTRIBUTION;

// ─── Input Schema ─────────────────────────────────────────────────────────────

export const ControversiesInputSchema = {
  mode: z.enum(['topic', 'passage', 'list'])
    .describe(
      'Query mode:\n' +
      '  "topic" — search by controversy topic name or keyword (topic required)\n' +
      '  "passage" — find controversies associated with a Bible passage (book + range required)\n' +
      '  "list" — enumerate all controversy topics with optional rating/category filter'
    ),
  topic: z.string().optional()
    .describe('Topic name or keyword to search. Required for mode="topic".'),
  book: z.string().optional()
    .describe('Bible book name in any common form. Required for mode="passage".'),
  range: z.string().optional()
    .describe('Verse or chapter range (e.g., "12:1-51", "12", "12:1"). Required for mode="passage".'),
  rating: z.string().optional()
    .describe('Filter by rating (e.g., "debated", "minority", "majority"). For mode="list".'),
  category: z.string().optional()
    .describe('Filter by category (e.g., "historicity", "authorship", "theology"). For mode="list".'),
};

export type ControversiesInput = z.output<z.ZodObject<typeof ControversiesInputSchema>>;

// ─── Output Schema ────────────────────────────────────────────────────────────

export const ControversiesOutputSchema = {
  mode: z.string(),
  query_info: z.object({
    topic: z.string().optional(),
    book: z.string().optional(),
    range: z.string().optional(),
    rating: z.string().optional(),
    category: z.string().optional(),
  }),
  topics: z.array(z.object({
    topic: z.string(),
    slug: z.string(),
    category: z.string(),
    rating: z.string(),
    summary: z.string().optional(),
    positions: z.array(z.object({
      label: z.string(),
      view: z.string(),
      evidence: z.string().optional(),
      scholars: z.array(z.string()),
    })),
    sources: z.array(z.object({
      citation: z.string(),
      tier: z.string(),
    })),
    passages: z.array(z.unknown()).optional(),
    note: z.string().nullable().optional(),
  })),
  attribution: z.string(),
  neutrality_caveat: z.string(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

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

// ─── Helper: apply character limit truncation ─────────────────────────────────

function applyCharacterLimit(
  result: Record<string, unknown>,
  topics: ReturnType<typeof rowToTopic>[],
): Record<string, unknown> {
  const serialized = JSON.stringify(result);
  if (serialized.length <= CHARACTER_LIMIT || topics.length <= 1) return result;

  let truncated = [...topics];
  while (
    JSON.stringify({ ...result, topics: truncated }).length > CHARACTER_LIMIT &&
    truncated.length > 1
  ) {
    truncated = truncated.slice(0, truncated.length - 1);
  }
  return {
    ...result,
    topics: truncated,
    truncated: true,
    truncation_message: `Response truncated from ${topics.length} to ${truncated.length} topics (character limit). Use the rating or category filter, or the topic/passage mode to narrow results.`,
  };
}

// ─── Mode: list ───────────────────────────────────────────────────────────────

async function handleList(args: ControversiesInput): Promise<CallToolResult> {
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
  sql += ' ORDER BY category, topic';

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

async function handleTopic(args: ControversiesInput): Promise<CallToolResult> {
  if (!args.topic) {
    return errorResponse('MISSING_TOPIC', 'topic is required for mode="topic". Use mode="list" to discover available topics.');
  }

  // Strip LIKE metacharacters per lexicon.ts precedent (avoid false-positive substring matches)
  const safeTopic = args.topic.replace(/[%_]/g, '');

  const sql = `
    SELECT t.topic, t.slug, t.category, t.rating, t.summary, t.positions, t.sources, t.note
    FROM controversy_topics t
    WHERE t.topic LIKE ? ESCAPE '\\'
       OR EXISTS (
         SELECT 1 FROM json_each(t.keywords) k
         WHERE lower(k.value) = lower(?)
       )
    ORDER BY t.category, t.topic
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

  const finalResult = applyCharacterLimit(result, topics);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Mode: passage ────────────────────────────────────────────────────────────

async function handlePassage(args: ControversiesInput): Promise<CallToolResult> {
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
    JOIN controversy_passages p ON p.topic_id = t.id
    WHERE p.book = ? AND p.start_enc <= ? AND p.end_enc >= ?
    ORDER BY t.category, t.topic
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

  const finalResult = applyCharacterLimit(result, topics);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
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
