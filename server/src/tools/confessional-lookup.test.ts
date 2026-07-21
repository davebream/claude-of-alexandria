import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confessionalLookup } from './confessional-lookup.js';

// Mock the database query module
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

// Mock the books module
vi.mock('../db/books.js', () => ({
  lookupBook: vi.fn(),
  suggestBooks: vi.fn(),
}));

import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

const mockQuery = vi.mocked(query);
const mockLookupBook = vi.mocked(lookupBook);
const mockSuggestBooks = vi.mocked(suggestBooks);

// Minimal section row used in multiple tests
const sectionRow = {
  slug: 'wcf',
  title: 'Westminster Confession of Faith',
  year: 1647,
  tradition: 'reformed',
  format: 'confession',
  section_id: 1,
  chapter_number: 5,
  chapter_title: 'Of Providence',
  section_number: 1,
  content: 'God the great Creator...',
  content_with_proofs: 'God the great Creator... [1]',
  question_number: null,
  question: null,
  answer: null,
  answer_with_proofs: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSuggestBooks.mockReturnValue([]);
});

// ─── mode="list" ──────────────────────────────────────────────────────────────

describe('mode="list"', () => {
  it('returns all documents with empty sections arrays when no filters applied', async () => {
    mockQuery.mockResolvedValue([
      { slug: 'wcf', title: 'Westminster Confession of Faith', year: 1647, tradition: 'reformed', format: 'confession', authors: null, source: 'Creeds.json', id: 1 },
      { slug: 'hc', title: 'Heidelberg Catechism', year: 1563, tradition: 'reformed', format: 'catechism', authors: null, source: 'Creeds.json', id: 2 },
    ]);

    const result = await confessionalLookup({ mode: 'list' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('list');
    expect(body.total_documents).toBe(2);
    expect(body.documents[0].sections).toEqual([]);
    expect(body.documents[1].sections).toEqual([]);
  });

  it('passes tradition filter to SQL', async () => {
    mockQuery.mockResolvedValue([]);

    await confessionalLookup({ mode: 'list', tradition: 'reformed' });

    const sqlArg = mockQuery.mock.calls[0][0] as string;
    expect(sqlArg).toContain('tradition = ?');
    const paramsArg = mockQuery.mock.calls[0][1] as unknown[];
    expect(paramsArg).toContain('reformed');
  });
});

// ─── mode="direct" ────────────────────────────────────────────────────────────

describe('mode="direct"', () => {
  it('returns MISSING_DOCUMENT error when document slug omitted', async () => {
    const result = await confessionalLookup({ mode: 'direct' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_DOCUMENT');
  });

  it('returns DOCUMENT_NOT_FOUND when slug is unknown', async () => {
    mockQuery.mockResolvedValue([]); // empty doc query result

    const result = await confessionalLookup({ mode: 'direct', document: 'nonexistent-doc' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('fetches all sections for document when no chapter/question specified', async () => {
    // First query: document lookup; Second query: sections
    mockQuery
      .mockResolvedValueOnce([{ id: 1, slug: 'wcf', title: 'Westminster Confession of Faith', year: 1647, tradition: 'reformed', format: 'confession' }])
      .mockResolvedValueOnce([sectionRow]);

    const result = await confessionalLookup({ mode: 'direct', document: 'wcf' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.documents[0].sections).toHaveLength(1);
    expect(body.documents[0].sections[0].chapter_number).toBe(5);
  });

  it('adds chapter_number clause when chapter is specified', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 1, slug: 'wcf', title: 'WCF', year: 1647, tradition: 'reformed', format: 'confession' }])
      .mockResolvedValueOnce([sectionRow]);

    await confessionalLookup({ mode: 'direct', document: 'wcf', chapter: 5 });

    const secSql = mockQuery.mock.calls[1][0] as string;
    expect(secSql).toContain('chapter_number = ?');
    const secParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(secParams).toContain(5);
  });

  it('adds question_number clause when question is specified', async () => {
    const catRow = { ...sectionRow, chapter_number: null, section_number: null, question_number: 1, question: 'What is your only comfort?', answer: 'That I...', answer_with_proofs: 'That I... [1]', content: null, content_with_proofs: null };
    mockQuery
      .mockResolvedValueOnce([{ id: 2, slug: 'hc', title: 'Heidelberg Catechism', year: 1563, tradition: 'reformed', format: 'catechism' }])
      .mockResolvedValueOnce([catRow]);

    await confessionalLookup({ mode: 'direct', document: 'hc', question: 1 });

    const secSql = mockQuery.mock.calls[1][0] as string;
    expect(secSql).toContain('question_number = ?');
    const secParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(secParams).toContain(1);
  });
});

// ─── mode="scripture" ─────────────────────────────────────────────────────────

describe('mode="scripture"', () => {
  it('returns MISSING_BOOK error when book omitted', async () => {
    const result = await confessionalLookup({ mode: 'scripture', range: '8:28' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_BOOK');
  });

  it('returns MISSING_RANGE error when range omitted', async () => {
    const result = await confessionalLookup({ mode: 'scripture', book: 'Romans' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_RANGE');
  });

  it('returns BOOK_NOT_FOUND with suggestions for unknown book', async () => {
    mockLookupBook.mockReturnValue(null);
    mockSuggestBooks.mockReturnValue(['romans', 'revelation']);

    const result = await confessionalLookup({ mode: 'scripture', book: 'Roamns', range: '8:28' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('BOOK_NOT_FOUND');
    expect(body.error.suggestions).toEqual(['romans', 'revelation']);
  });

  it('returns INVALID_RANGE for malformed range', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'romans', displayName: 'Romans', testament: 'nt', morphologyFile: 'romans' });

    const result = await confessionalLookup({ mode: 'scripture', book: 'Romans', range: 'notarange' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('builds range boundary SQL and returns document-grouped result', async () => {
    mockLookupBook.mockReturnValue({ canonical: 'romans', displayName: 'Romans', testament: 'nt', morphologyFile: 'romans' });
    mockQuery.mockResolvedValue([sectionRow]);

    const result = await confessionalLookup({ mode: 'scripture', book: 'Romans', range: '8:28' });

    expect(result.isError).toBeFalsy();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('confessional_proof_texts');
    expect(sql).toContain('JOIN confessional_sections');
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.mode).toBe('scripture');
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].slug).toBe('wcf');
  });
});

// ─── mode="keyword" ───────────────────────────────────────────────────────────

describe('mode="keyword"', () => {
  it('returns MISSING_KEYWORD error when keyword omitted', async () => {
    const result = await confessionalLookup({ mode: 'keyword' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('MISSING_KEYWORD');
  });

  it('returns KEYWORD_TOO_SHORT error for single-character keyword', async () => {
    const result = await confessionalLookup({ mode: 'keyword', keyword: 'a' });

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error.code).toBe('KEYWORD_TOO_SHORT');
  });

  it('wraps keyword in % wildcards for LIKE query', async () => {
    mockQuery.mockResolvedValue([sectionRow]);

    await confessionalLookup({ mode: 'keyword', keyword: 'election' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('%election%');
    expect(params[1]).toBe('%election%');
    expect(params[2]).toBe('%election%');
  });

  it('passes tradition filter when provided', async () => {
    mockQuery.mockResolvedValue([sectionRow]);

    await confessionalLookup({ mode: 'keyword', keyword: 'election', tradition: 'reformed' });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('cd.tradition = ?');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('reformed');
  });

  it('returns document-grouped result', async () => {
    mockQuery.mockResolvedValue([sectionRow]);

    const result = await confessionalLookup({ mode: 'keyword', keyword: 'election' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.total_documents).toBe(1);
    expect(body.total_sections).toBe(1);
  });
});

// ─── character-limit guard ────────────────────────────────────────────────────

describe('protocol pagination handoff', () => {
  it('returns complete records to the shared protocol paginator', async () => {
    // Generate 60 rows with unique slugs — each becomes its own document (1 section each)
    // 60 docs × ~300 chars each = ~18k — may or may not exceed 25k depending on content size
    // Use longer content to ensure we exceed the limit
    const largeContent = 'A'.repeat(500);
    const rows = Array.from({ length: 60 }, (_, i) => ({
      ...sectionRow,
      slug: `doc-${i}`,
      title: `Document ${i} with a fairly long title to increase payload size`,
      section_id: i + 1,
      content: largeContent,
      content_with_proofs: largeContent + ' [1]',
    }));
    mockQuery.mockResolvedValue(rows);

    const result = await confessionalLookup({ mode: 'keyword', keyword: 'election' });

    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.documents).toHaveLength(60);
    expect(body.truncated).toBeUndefined();
    expect(body.truncation_message).toBeUndefined();
  });
});
