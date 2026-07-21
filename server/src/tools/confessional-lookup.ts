import { z } from 'zod';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_KEYWORD_LENGTH = 2;

// ─── Input Schema ─────────────────────────────────────────────────────────────

const ConfessionalTraditionSchema = z.enum(['reformed', 'baptist', 'ancient', 'lutheran', 'anglican', 'methodist']);
const ConfessionalFormatSchema = z.enum(['confession', 'catechism']);

export const ConfessionalLookupInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    ...PaginationInputShape,
    mode: z.literal('direct').describe('Read sections from one document.'),
    document: z.string().min(1).describe('Document slug.'),
    chapter: z.number().int().positive().optional().describe('Optional positive chapter number.'),
    section: z.number().int().positive().optional().describe('Optional positive section number.'),
    question: z.number().int().positive().optional().describe('Optional positive catechism question number.'),
    tradition: ConfessionalTraditionSchema.optional().describe('Restrict results to one tradition.'),
    format: ConfessionalFormatSchema.optional().describe('Restrict results to confessions or catechisms.'),
  }),
  z.strictObject({
    ...PaginationInputShape,
    mode: z.literal('scripture').describe('Find sections citing a Scripture passage.'),
    book: z.string().min(1).describe('Biblical book name.'),
    range: z.string().min(1).describe('Chapter or verse range within the book.'),
    tradition: ConfessionalTraditionSchema.optional().describe('Restrict results to one tradition.'),
    format: ConfessionalFormatSchema.optional().describe('Restrict results to confessions or catechisms.'),
  }),
  z.strictObject({
    ...PaginationInputShape,
    mode: z.literal('keyword').describe('Search section text by keyword.'),
    keyword: z.string().min(MIN_KEYWORD_LENGTH).max(200).describe('Keyword text, 2 to 200 characters.'),
    tradition: ConfessionalTraditionSchema.optional().describe('Restrict results to one tradition.'),
    format: ConfessionalFormatSchema.optional().describe('Restrict results to confessions or catechisms.'),
  }),
  z.strictObject({
    ...PaginationInputShape,
    mode: z.literal('list').describe('List available documents.'),
    tradition: ConfessionalTraditionSchema.optional().describe('Restrict results to one tradition.'),
    format: ConfessionalFormatSchema.optional().describe('Restrict results to confessions or catechisms.'),
  }),
]);

export type ConfessionalLookupInput = z.output<typeof ConfessionalLookupInputSchema>;

// ─── Output Schema ────────────────────────────────────────────────────────────

const ConfessionalDocumentSummarySchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  tradition: z.string(),
  format: z.string(),
});

const ConfessionalSectionSchema = ConfessionalDocumentSummarySchema.extend({
  chapter_number: z.number().int().nullable(),
  chapter_title: z.string().nullable(),
  section_number: z.number().int().nullable(),
  content: z.string().nullable(),
  content_with_proofs: z.string().nullable(),
  question_number: z.number().int().nullable(),
  question: z.string().nullable(),
  answer: z.string().nullable(),
  answer_with_proofs: z.string().nullable(),
});

const ConfessionalOutputCommon = {
  page: PageSchema,
  total_documents: z.number().int().nonnegative(),
  total_sections: z.number().int().nonnegative(),
};

export const ConfessionalLookupOutputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...ConfessionalOutputCommon, mode: z.literal('direct'), query_info: z.strictObject({ document: z.string(), tradition: z.string().optional(), format: z.string().optional() }), results: z.array(ConfessionalSectionSchema) }),
  z.strictObject({ ...ConfessionalOutputCommon, mode: z.literal('scripture'), query_info: z.strictObject({ book: z.string(), range: z.string(), tradition: z.string().optional(), format: z.string().optional() }), results: z.array(ConfessionalSectionSchema) }),
  z.strictObject({ ...ConfessionalOutputCommon, mode: z.literal('keyword'), query_info: z.strictObject({ keyword: z.string(), tradition: z.string().optional(), format: z.string().optional() }), results: z.array(ConfessionalSectionSchema) }),
  z.strictObject({ ...ConfessionalOutputCommon, mode: z.literal('list'), query_info: z.strictObject({ tradition: z.string().optional(), format: z.string().optional() }), results: z.array(ConfessionalDocumentSummarySchema) }),
]);

// ─── Helper: build error response ────────────────────────────────────────────

function errorResponse(code: string, message: string, suggestions?: string[]): CallToolResult {
  const body: Record<string, unknown> = { error: { code, message } };
  if (suggestions) body.error = { ...body.error as object, suggestions };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
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

async function handleList(args: Extract<ConfessionalLookupInput, { mode: 'list' }>): Promise<CallToolResult> {
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

async function handleDirect(args: Extract<ConfessionalLookupInput, { mode: 'direct' }>): Promise<CallToolResult> {
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
  secSql += ' ORDER BY chapter_number, section_number, question_number, id';

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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: scripture ──────────────────────────────────────────────────────────

async function handleScripture(args: Extract<ConfessionalLookupInput, { mode: 'scripture' }>): Promise<CallToolResult> {
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
    ORDER BY cd.tradition, cd.slug, cs.chapter_number, cs.section_number, cs.question_number, cs.id
  `;

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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── Mode: keyword ────────────────────────────────────────────────────────────

async function handleKeyword(args: Extract<ConfessionalLookupInput, { mode: 'keyword' }>): Promise<CallToolResult> {
  if (!args.keyword) {
    return errorResponse('MISSING_KEYWORD', 'keyword is required for mode="keyword".');
  }
  if (args.keyword.length < MIN_KEYWORD_LENGTH) {
    return errorResponse('KEYWORD_TOO_SHORT', `Keyword must be at least ${MIN_KEYWORD_LENGTH} characters.`);
  }

  const pattern = `%${args.keyword}%`;
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
    ORDER BY cd.tradition, cd.slug, cs.chapter_number, cs.section_number, cs.question_number, cs.id
  `;

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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
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
