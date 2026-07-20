import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

// Evidence-scope semantics (design C4/C7, plan #119): byte-identical across
// all 39 corrected Masoretic corpus JSONs. Absence of a marker attests only
// "no_explicit_p_s_event_at_this_anchor" — it must never be read as "no
// manuscript evidence" or "confirmed no boundary here". Guarded against
// drift by paragraphs.test.ts, which deep-equals this literal against an
// actual corpus JSON's evidence_scope block at test time.
const EVIDENCE_SCOPE = {
  presence_directly_attests: ['explicit_p_s_event_in_this_electronic_witness'],
  presence_may_support: ['graphic_unit_boundary', 'literary_unit_boundary'],
  absence_directly_attests: ['no_explicit_p_s_event_at_this_anchor'],
  absence_does_not_attest: [
    'no_other_graphic_division',
    'no_literary_unit_boundary',
    'no_valid_teaching_boundary',
  ],
};

export const ParagraphsInputSchema = {
  book: z.string().describe('OT book name (any common form, e.g., "Genesis", "Gen", "Psalms")'),
  chapter_range: z.string().optional().describe('Chapter range: "3" (single), "3-7" (range), or omit for all chapters'),
};

export type ParagraphsInput = z.output<z.ZodObject<typeof ParagraphsInputSchema>>;

export const ParagraphsOutputSchema = {
  book: z.string(),
  chapter_range: z.string(),
  markers: z.array(z.object({
    chapter: z.number(),
    verse: z.number(),
    type: z.string(),
    ordinal_in_verse: z.number().describe('1-based position of this marker among possibly multiple markers in the same verse.'),
    position: z.enum(['verse_end', 'within_verse']).describe(
      'verse_end: the paragraph break falls after this verse. within_verse: the marker sits between two words mid-verse and supports NO verse-level boundary claim.'
    ),
    lexical_position: z.enum(['after_final_word', 'between_words']).describe(
      'Where the marker sits relative to the verse text: after the final word, or between two words mid-verse.'
    ),
  })),
  graphic_signs: z.array(z.object({
    id: z.string(),
    chapter: z.number(),
    verse: z.number(),
    kind: z.string(),
    subtype: z.string(),
    interpretive_status: z.string(),
    is_paragraph_separation: z.boolean(),
  })).describe(
    'Scribal annotations (e.g. reversed nun, suspended/large/small letters) — NOT paragraph divisions. Filtered by chapter_range identically to markers.'
  ),
  evidence_scope: z.object({
    presence_directly_attests: z.array(z.string()),
    presence_may_support: z.array(z.string()),
    absence_directly_attests: z.array(z.string()),
    absence_does_not_attest: z.array(z.string()),
  }).describe(
    'What an empty markers/graphic_signs result does and does not attest. An empty result means only "no explicit paragraph/section event recorded at this anchor" — it is not evidence of "no boundary here".'
  ),
  summary: z.object({
    petuchot: z.number(),
    setumot: z.number(),
    total: z.number(),
  }).describe(
    'Raw all-position row counts across every marker regardless of `position` — NOT a count of boundary-supporting markers. within_verse markers are counted here too, so summary.total must not be read as "confirmed paragraph boundaries".'
  ),
};

export async function queryParagraphBreaks(args: ParagraphsInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } }) }],
      isError: true,
    };
  }
  if (bookInfo.testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `Paragraph markers are OT only. '${bookInfo.displayName}' is an NT book.` } }) }],
      isError: true,
    };
  }

  const chapterRange = args.chapter_range;
  const rangeResult = parseChapterRange(chapterRange);
  if ('error' in rangeResult) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: rangeResult.error } }) }],
      isError: true,
    };
  }

  let sql = 'SELECT chapter, verse, marker_type, ordinal_in_verse, position, lexical_position FROM paragraph_markers WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  let signsSql = 'SELECT id, chapter, verse, kind, subtype, interpretive_status, is_paragraph_separation FROM graphic_signs WHERE book = ?';
  const signsParams: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
    signsSql += ' AND chapter >= ? AND chapter <= ?';
    signsParams.push(rangeResult.min, rangeResult.max);
  }

  sql += ' ORDER BY chapter, verse';
  signsSql += ' ORDER BY chapter, verse';

  const rows = await query(sql, params);
  const signRows = await query(signsSql, signsParams);

  const markers = rows.map(r => ({
    chapter: r.chapter as number,
    verse: r.verse as number,
    type: r.marker_type as string,
    ordinal_in_verse: r.ordinal_in_verse as number,
    position: r.position as 'verse_end' | 'within_verse',
    lexical_position: r.lexical_position as 'after_final_word' | 'between_words',
  }));

  const graphicSigns = signRows.map(r => ({
    id: r.id as string,
    chapter: r.chapter as number,
    verse: r.verse as number,
    kind: r.kind as string,
    subtype: r.subtype as string,
    interpretive_status: r.interpretive_status as string,
    is_paragraph_separation: Boolean(r.is_paragraph_separation),
  }));

  const petuchot = markers.filter(m => m.type === 'petuchah').length;
  const setumot = markers.filter(m => m.type === 'setumah').length;

  const result = {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    markers,
    graphic_signs: graphicSigns,
    evidence_scope: EVIDENCE_SCOPE,
    summary: { petuchot, setumot, total: petuchot + setumot },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
