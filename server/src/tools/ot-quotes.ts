import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

export const OtQuotesInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('NT book name (any common form, e.g., "Romans", "Matt", "Hebrews")'),
  range: z.string().optional().describe('Verse range: "8:28-8:39" or single verse "1:23". Omit for entire book.'),
  ot_book: z.string().optional().describe('Filter by OT source book (e.g., "Isaiah", "Isa", "Psalms")'),
});

export type OtQuotesInput = z.output<typeof OtQuotesInputSchema>;

export const OtQuotesOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  range: z.string().optional(),
  quotes: z.array(z.strictObject({
    nt_ref: z.string(),
    greek_text: z.string(),
    quote_type: z.string(),
    ot_sources: z.array(z.strictObject({
      book: z.string(),
      chapter: z.number(),
      verse: z.number(),
      verse_end: z.number().nullable(),
      ref: z.string(),
    })),
    source_ids: z.array(z.string()).min(1),
  })),
  summary: z.strictObject({
    total: z.number(),
    nt_verses_with_quotes: z.number(),
    ot_books_referenced: z.array(z.string()),
  }),
});

function formatOtRef(canonicalBook: string, chapter: number, verse: number, verseEnd: number | null): string {
  const bookInfo = lookupBook(canonicalBook);
  const displayName = bookInfo ? bookInfo.displayName : canonicalBook;
  const base = `${displayName} ${chapter}:${verse}`;
  return verseEnd ? `${base}-${verseEnd}` : base;
}

export async function queryOtQuotes(args: OtQuotesInput): Promise<CallToolResult> {
  const bookInfo = lookupBook(args.book);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.book}' not found.`, suggestions: suggestBooks(args.book) } }) }],
      isError: true,
    };
  }

  // Testament gate: OT quotes tool is NT-only
  if (bookInfo.testament === 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `query_ot_quotes is for NT books only. '${bookInfo.displayName}' is an OT book.` } }) }],
      isError: true,
    };
  }

  // Build query
  let sql = `
    SELECT q.id, q.nt_book, q.nt_chapter, q.nt_verse, q.greek_text, q.quote_type,
           s.ot_book, s.ot_chapter, s.ot_verse, s.ot_verse_end
    FROM ot_quotes q
    LEFT JOIN ot_quote_sources s ON s.quote_id = q.id
    WHERE q.nt_book = ?
  `;
  const params: unknown[] = [bookInfo.canonical];

  // Optional verse range filter
  if (args.range) {
    const verseRange = parseVerseRange(args.range);
    if ('error' in verseRange) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
        isError: true,
      };
    }
    sql += ' AND (q.nt_chapter > ? OR (q.nt_chapter = ? AND q.nt_verse >= ?))';
    sql += ' AND (q.nt_chapter < ? OR (q.nt_chapter = ? AND q.nt_verse <= ?))';
    params.push(
      verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
      verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
    );
  }

  // Optional OT book filter — filters by OT source reference.
  // Because this uses LEFT JOIN, adding s.ot_book = ? in WHERE
  // excludes quotes that have no matching source (Levinsohn-only entries
  // without STEPBible source data). This is intentional: when the user
  // asks "what does Romans quote from Isaiah?", we only want quotes
  // with known Isaiah sources, not all quotes.
  if (args.ot_book) {
    const otBookInfo = lookupBook(args.ot_book);
    if (!otBookInfo) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `OT book '${args.ot_book}' not found.`, suggestions: suggestBooks(args.ot_book) } }) }],
        isError: true,
      };
    }
    sql += ' AND s.ot_book = ?';
    params.push(otBookInfo.canonical);
  }

  sql += ' ORDER BY q.nt_chapter, q.nt_verse, q.id, s.ot_book, s.ot_chapter, s.ot_verse';

  const rows = await query(sql, params);

  // Group flat rows by quote id
  const quotesMap = new Map<number, {
    nt_ref: string;
    greek_text: string;
    quote_type: string;
    ot_sources: { book: string; chapter: number; verse: number; verse_end: number | null; ref: string }[];
  }>();

  for (const row of rows) {
    const qid = row.id as number;
    if (!quotesMap.has(qid)) {
      quotesMap.set(qid, {
        nt_ref: `${bookInfo.displayName} ${row.nt_chapter}:${row.nt_verse}`,
        greek_text: row.greek_text as string,
        quote_type: row.quote_type as string,
        ot_sources: [],
      });
    }
    if (row.ot_book) {
      const otCanonical = row.ot_book as string;
      const otBookInfo = lookupBook(otCanonical);
      const otDisplayName = otBookInfo ? otBookInfo.displayName : otCanonical;
      const otChapter = row.ot_chapter as number;
      const otVerse = row.ot_verse as number;
      const otVerseEnd = row.ot_verse_end as number | null;
      quotesMap.get(qid)!.ot_sources.push({
        book: otDisplayName,
        chapter: otChapter,
        verse: otVerse,
        verse_end: otVerseEnd,
        ref: formatOtRef(otCanonical, otChapter, otVerse, otVerseEnd),
      });
    }
  }

  const quotes = [...quotesMap.values()];

  // Build summary
  const otBooks = new Set<string>();
  for (const q of quotes) {
    for (const s of q.ot_sources) {
      const otInfo = lookupBook(s.book);
      otBooks.add(otInfo ? otInfo.displayName : s.book);
    }
  }

  const result = {
    book: bookInfo.displayName,
    ...(args.range ? { range: args.range } : {}),
    quotes,
    summary: {
      total: quotes.length,
      nt_verses_with_quotes: new Set(quotes.map(q => q.nt_ref)).size,
      ot_books_referenced: [...otBooks].sort(),
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
