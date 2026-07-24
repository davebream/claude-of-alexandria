import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

export const VariantsInputSchema = z.strictObject({
  ...PaginationInputShape,
  book: z.string().describe('NT book name (any common form, e.g., "John", "Romans", "1 Cor")'),
  range: z.string().optional().describe('Verse range: "7:53-8:11" or "1:1". Omit for entire book.'),
  edition: z.string().optional().describe('Filter by edition code: B=Byzantine, I=NIV Greek, M=NA28, N=NA27, R=Textus Receptus, S=SBLGNT, T=Tregelles, W=Westcott-Hort, H=Tyndale House GNT'),
});

export type VariantsInput = z.output<typeof VariantsInputSchema>;

export const VariantsOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  book: z.string(),
  range: z.string(),
  variants: z.array(z.strictObject({
    chapter: z.number(),
    verse: z.number(),
    word_position: z.number(),
    ognt_text: z.string(),
    editions: z.string(),
    variant_type: z.string().nullable(),
    variant_text: z.string().nullable(),
  })),
  summary: z.strictObject({
    total: z.number(),
    by_variant_type: z.record(z.string(), z.number()),
  }),
  edition_key: z.record(z.string(), z.string()),
});

const EDITION_KEY: Record<string, string> = {
  B: 'Byzantine',
  I: 'NIV Greek NT',
  M: 'NA28',
  N: 'NA27',
  R: 'Textus Receptus',
  S: 'SBLGNT',
  T: 'Tregelles',
  W: 'Westcott-Hort',
  H: 'Tyndale House GNT',
};

export async function queryVariants(args: VariantsInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }
  if (bookInfo.testament !== 'nt') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `Textual variants are NT only. '${bookInfo.displayName}' is an OT book.` } }) }],
      isError: true,
    };
  }

  let sql = 'SELECT chapter, verse, word_position, ognt_text, editions, variant_type, variant_text FROM textual_variants WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if (args.range) {
    const verseRange = parseVerseRange(args.range);
    if ('error' in verseRange) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
        isError: true,
      };
    }
    sql += ' AND (chapter > ? OR (chapter = ? AND verse >= ?)) AND (chapter < ? OR (chapter = ? AND verse <= ?))';
    params.push(
      verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
      verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
    );
  }

  if (args.edition) {
    const code = args.edition.toUpperCase();
    if (!EDITION_KEY[code]) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_EDITION', message: `Unknown edition code '${args.edition}'. Valid codes: ${Object.entries(EDITION_KEY).map(([k, v]) => `${k}=${v}`).join(', ')}` } }) }],
        isError: true,
      };
    }
    // editions column is a contiguous string of single-letter codes (e.g., "BIMNRSTWH")
    sql += ' AND editions LIKE ?';
    params.push(`%${code}%`);
  }

  sql += ' ORDER BY chapter, verse, word_position, id';

  const rows = await query(sql, params);

  const variants = rows.map(r => ({
    chapter: r.chapter as number,
    verse: r.verse as number,
    word_position: r.word_position as number,
    ognt_text: r.ognt_text as string,
    editions: r.editions as string,
    variant_type: r.variant_type as string | null,
    variant_text: r.variant_text as string | null,
  }));

  const byVariantType: Record<string, number> = {};
  for (const v of variants) {
    const t = v.variant_type ?? 'unclassified';
    byVariantType[t] = (byVariantType[t] ?? 0) + 1;
  }

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    range: args.range ?? 'all',
    variants,
    summary: { total: variants.length, by_variant_type: byVariantType },
    edition_key: EDITION_KEY,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
