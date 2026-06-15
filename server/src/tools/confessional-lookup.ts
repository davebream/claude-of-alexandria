import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_KEYWORD_LENGTH = 2;

// ─── Input Schema ─────────────────────────────────────────────────────────────

export const ConfessionalLookupInputSchema = {
  mode: z.enum(['direct', 'scripture', 'keyword', 'list'])
    .describe(
      'Query mode:\n' +
      '  "direct" — lookup by document slug + chapter/section or question number\n' +
      '  "scripture" — which confessional statements cite a Bible passage (book + range required)\n' +
      '  "keyword" — substring search on section content (keyword required)\n' +
      '  "list" — enumerate available documents with metadata'
    ),
  document: z.string().optional()
    .describe('Document slug (e.g., "westminster-confession-of-faith"). Required for mode="direct".'),
  chapter: z.number().optional()
    .describe('Chapter number. For confession sections in mode="direct".'),
  section: z.number().optional()
    .describe('Section number within chapter. For confession sections in mode="direct".'),
  question: z.number().optional()
    .describe('Question number. For catechism Q&A in mode="direct".'),
  book: z.string().optional()
    .describe('Bible book name in any common form (e.g., "Romans", "Gen"). Required for mode="scripture".'),
  range: z.string().optional()
    .describe('Verse range: "8:28-8:30", "8:28-30", or single verse "8:28". Required for mode="scripture".'),
  keyword: z.string().optional()
    .describe('Substring to search in section content. Required for mode="keyword". Case-insensitive LIKE match.'),
  tradition: z.enum(['reformed', 'baptist', 'ancient', 'lutheran', 'anglican', 'methodist']).optional()
    .describe('Filter by confessional tradition.'),
  format: z.enum(['confession', 'catechism']).optional()
    .describe('Filter by document format.'),
  limit: z.number().optional()
    .describe('Maximum sections returned per mode (default: 50, max: 200). Applies to scripture, keyword, and direct without a specific section/question.'),
};

export type ConfessionalLookupInput = z.output<z.ZodObject<typeof ConfessionalLookupInputSchema>>;

// ─── Output Schema ────────────────────────────────────────────────────────────

export const ConfessionalLookupOutputSchema = {
  mode: z.string(),
  query_info: z.object({
    document: z.string().optional(),
    book: z.string().optional(),
    range: z.string().optional(),
    keyword: z.string().optional(),
    tradition: z.string().optional(),
    format: z.string().optional(),
  }),
  documents: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    year: z.number().nullable(),
    tradition: z.string(),
    format: z.string(),
    sections: z.array(z.object({
      chapter_number: z.number().nullable(),
      chapter_title: z.string().nullable(),
      section_number: z.number().nullable(),
      content: z.string().nullable(),
      content_with_proofs: z.string().nullable(),
      question_number: z.number().nullable(),
      question: z.string().nullable(),
      answer: z.string().nullable(),
      answer_with_proofs: z.string().nullable(),
    })),
  })),
  total_documents: z.number(),
  total_sections: z.number(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

// ─── Helper: build error response ────────────────────────────────────────────

function errorResponse(code: string, message: string, suggestions?: string[]): CallToolResult {
  const body: Record<string, unknown> = { error: { code, message } };
  if (suggestions) body.error = { ...body.error as object, suggestions };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
}

// ─── Helper: apply character-limit guard ─────────────────────────────────────

function applyCharacterLimit(
  result: Record<string, unknown>,
  documents: Array<{ slug: string; sections: unknown[] }>,
): Record<string, unknown> {
  const serialized = JSON.stringify(result);
  if (serialized.length <= CHARACTER_LIMIT || documents.length <= 1) return result;

  const sorted = [...documents].sort((a, b) => a.sections.length - b.sections.length);
  let truncated = sorted;
  while (
    JSON.stringify({ ...result, documents: truncated }).length > CHARACTER_LIMIT &&
    truncated.length > 1
  ) {
    truncated = truncated.slice(1);
  }
  return {
    ...result,
    documents: truncated,
    truncated: true,
    truncation_message: `Response truncated from ${documents.length} to ${truncated.length} documents (character limit). Use tradition/format filters or the limit parameter to narrow results.`,
  };
}

// ─── Helper: group flat SQL rows into document-grouped structure ──────────────

type DocRow = Record<string, unknown>;

function groupRowsByDocument(rows: DocRow[]): Array<{
  slug: string; title: string; year: number | null;
  tradition: string; format: string;
  sections: Array<{
    chapter_number: number | null; chapter_title: string | null;
    section_number: number | null; content: string | null;
    content_with_proofs: string | null; question_number: number | null;
    question: string | null; answer: string | null; answer_with_proofs: string | null;
  }>;
}> {
  const docMap = new Map<string, ReturnType<typeof groupRowsByDocument>[number]>();
  const sectionSeen = new Map<string, Set<number>>();

  for (const row of rows) {
    const slug = row.slug as string;
    if (!docMap.has(slug)) {
      docMap.set(slug, {
        slug,
        title: row.title as string,
        year: row.year as number | null,
        tradition: row.tradition as string,
        format: row.format as string,
        sections: [],
      });
      sectionSeen.set(slug, new Set());
    }
    const sectionId = row.section_id as number;
    if (!sectionSeen.get(slug)!.has(sectionId)) {
      sectionSeen.get(slug)!.add(sectionId);
      docMap.get(slug)!.sections.push({
        chapter_number: row.chapter_number as number | null,
        chapter_title: row.chapter_title as string | null,
        section_number: row.section_number as number | null,
        content: row.content as string | null,
        content_with_proofs: row.content_with_proofs as string | null,
        question_number: row.question_number as number | null,
        question: row.question as string | null,
        answer: row.answer as string | null,
        answer_with_proofs: row.answer_with_proofs as string | null,
      });
    }
  }
  return [...docMap.values()];
}

// ─── Mode: list ───────────────────────────────────────────────────────────────

async function handleList(args: ConfessionalLookupInput): Promise<CallToolResult> {
  let sql = `SELECT id, slug, title, year, tradition, format, authors, source
             FROM confessional_documents`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (args.tradition) {
    conditions.push('tradition = ?');
    params.push(args.tradition);
  }
  if (args.format) {
    conditions.push('format = ?');
    params.push(args.format);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY tradition, year, slug';

  const rows = await query(sql, params);
  const documents = rows.map(row => ({
    slug: row.slug as string,
    title: row.title as string,
    year: row.year as number | null,
    tradition: row.tradition as string,
    format: row.format as string,
    sections: [] as never[],
  }));

  const result: Record<string, unknown> = {
    mode: 'list',
    query_info: {
      ...(args.tradition ? { tradition: args.tradition } : {}),
      ...(args.format ? { format: args.format } : {}),
    },
    documents,
    total_documents: documents.length,
    total_sections: 0,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: direct ─────────────────────────────────────────────────────────────

async function handleDirect(args: ConfessionalLookupInput): Promise<CallToolResult> {
  if (!args.document) {
    return errorResponse('MISSING_DOCUMENT', 'document slug is required for mode="direct". Use mode="list" to discover available slugs.');
  }

  // Fetch document by slug
  let docSql = `SELECT id, slug, title, year, tradition, format
                FROM confessional_documents WHERE slug = ?`;
  const docParams: unknown[] = [args.document];

  if (args.tradition) { docSql += ' AND tradition = ?'; docParams.push(args.tradition); }
  if (args.format)    { docSql += ' AND format = ?';    docParams.push(args.format); }

  const docRows = await query(docSql, docParams);
  if (docRows.length === 0) {
    return errorResponse('DOCUMENT_NOT_FOUND', `Document slug "${args.document}" not found. Use mode="list" to discover available documents.`);
  }
  const doc = docRows[0];

  // Fetch sections
  let secSql = `
    SELECT id as section_id, chapter_number, chapter_title, section_number,
           content, content_with_proofs,
           question_number, question, answer, answer_with_proofs
    FROM confessional_sections
    WHERE document_id = ?
  `;
  const secParams: unknown[] = [doc.id];

  if (args.question !== undefined) {
    secSql += ' AND question_number = ?';
    secParams.push(args.question);
  } else if (args.chapter !== undefined) {
    secSql += ' AND chapter_number = ?';
    secParams.push(args.chapter);
    if (args.section !== undefined) {
      secSql += ' AND section_number = ?';
      secParams.push(args.section);
    }
  }
  secSql += ' ORDER BY chapter_number, section_number, question_number LIMIT ?';
  const lim = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  secParams.push(lim);

  const secRows = await query(secSql, secParams);
  const sections = secRows.map(r => ({
    chapter_number: r.chapter_number as number | null,
    chapter_title: r.chapter_title as string | null,
    section_number: r.section_number as number | null,
    content: r.content as string | null,
    content_with_proofs: r.content_with_proofs as string | null,
    question_number: r.question_number as number | null,
    question: r.question as string | null,
    answer: r.answer as string | null,
    answer_with_proofs: r.answer_with_proofs as string | null,
  }));

  const documents = [{
    slug: doc.slug as string,
    title: doc.title as string,
    year: doc.year as number | null,
    tradition: doc.tradition as string,
    format: doc.format as string,
    sections,
  }];

  const result: Record<string, unknown> = {
    mode: 'direct',
    query_info: {
      document: args.document,
      ...(args.tradition ? { tradition: args.tradition } : {}),
      ...(args.format ? { format: args.format } : {}),
    },
    documents,
    total_documents: 1,
    total_sections: sections.length,
  };

  const finalResult = applyCharacterLimit(result, documents);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Mode: scripture ──────────────────────────────────────────────────────────

async function handleScripture(args: ConfessionalLookupInput): Promise<CallToolResult> {
  if (!args.book) {
    return errorResponse('MISSING_BOOK', 'book is required for mode="scripture".');
  }
  if (!args.range) {
    return errorResponse('MISSING_RANGE', 'range is required for mode="scripture".');
  }

  const bookInfo = lookupBook(args.book);
  if (!bookInfo) {
    return errorResponse('BOOK_NOT_FOUND', `Book "${args.book}" not found.`, suggestBooks(args.book));
  }

  const verseRange = parseVerseRange(args.range);
  if ('error' in verseRange) {
    return errorResponse('INVALID_RANGE', verseRange.error);
  }

  const lim = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conditions: string[] = [
    'cpt.book = ?',
    '(cpt.chapter > ? OR (cpt.chapter = ? AND cpt.verse >= ?))',
    '(cpt.chapter < ? OR (cpt.chapter = ? AND cpt.verse <= ?))',
  ];
  const params: unknown[] = [
    bookInfo.canonical,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  if (args.tradition) { conditions.push('cd.tradition = ?'); params.push(args.tradition); }
  if (args.format)    { conditions.push('cd.format = ?');    params.push(args.format); }

  const sql = `
    SELECT DISTINCT
      cd.slug, cd.title, cd.year, cd.tradition, cd.format,
      cs.id as section_id, cs.chapter_number, cs.chapter_title, cs.section_number,
      cs.content, cs.content_with_proofs,
      cs.question_number, cs.question, cs.answer, cs.answer_with_proofs
    FROM confessional_proof_texts cpt
    JOIN confessional_sections cs ON cs.id = cpt.section_id
    JOIN confessional_documents cd ON cd.id = cs.document_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cd.tradition, cd.slug, cs.chapter_number, cs.section_number, cs.question_number
    LIMIT ?
  `;
  params.push(lim);

  const rows = await query(sql, params);
  const documents = groupRowsByDocument(rows);

  const result: Record<string, unknown> = {
    mode: 'scripture',
    query_info: {
      book: bookInfo.displayName,
      range: args.range,
      ...(args.tradition ? { tradition: args.tradition } : {}),
      ...(args.format ? { format: args.format } : {}),
    },
    documents,
    total_documents: documents.length,
    total_sections: documents.reduce((s, d) => s + d.sections.length, 0),
  };

  const finalResult = applyCharacterLimit(result, documents);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Mode: keyword ────────────────────────────────────────────────────────────

async function handleKeyword(args: ConfessionalLookupInput): Promise<CallToolResult> {
  if (!args.keyword) {
    return errorResponse('MISSING_KEYWORD', 'keyword is required for mode="keyword".');
  }
  if (args.keyword.length < MIN_KEYWORD_LENGTH) {
    return errorResponse('KEYWORD_TOO_SHORT', `Keyword must be at least ${MIN_KEYWORD_LENGTH} characters.`);
  }

  const pattern = `%${args.keyword}%`;
  const lim = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conditions: string[] = [
    '(cs.content LIKE ? OR cs.answer LIKE ? OR cs.question LIKE ?)',
  ];
  const params: unknown[] = [pattern, pattern, pattern];

  if (args.tradition) { conditions.push('cd.tradition = ?'); params.push(args.tradition); }
  if (args.format)    { conditions.push('cd.format = ?');    params.push(args.format); }

  const sql = `
    SELECT
      cd.slug, cd.title, cd.year, cd.tradition, cd.format,
      cs.id as section_id, cs.chapter_number, cs.chapter_title, cs.section_number,
      cs.content, cs.content_with_proofs,
      cs.question_number, cs.question, cs.answer, cs.answer_with_proofs
    FROM confessional_sections cs
    JOIN confessional_documents cd ON cd.id = cs.document_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cd.tradition, cd.slug, cs.chapter_number, cs.section_number, cs.question_number
    LIMIT ?
  `;
  params.push(lim);

  const rows = await query(sql, params);
  const documents = groupRowsByDocument(rows);

  const result: Record<string, unknown> = {
    mode: 'keyword',
    query_info: {
      keyword: args.keyword,
      ...(args.tradition ? { tradition: args.tradition } : {}),
      ...(args.format ? { format: args.format } : {}),
    },
    documents,
    total_documents: documents.length,
    total_sections: documents.reduce((s, d) => s + d.sections.length, 0),
  };

  const finalResult = applyCharacterLimit(result, documents);
  return {
    content: [{ type: 'text', text: JSON.stringify(finalResult) }],
    structuredContent: finalResult,
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function confessionalLookup(args: ConfessionalLookupInput): Promise<CallToolResult> {
  switch (args.mode) {
    case 'direct':    return handleDirect(args);
    case 'scripture': return handleScripture(args);
    case 'keyword':   return handleKeyword(args);
    case 'list':      return handleList(args);
  }
}
