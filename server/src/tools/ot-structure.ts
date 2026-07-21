import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { encodePosition, parseVerseRange } from './utils.js';

const CHARACTER_LIMIT = 25_000;
const ATTRIBUTION = 'Macula Hebrew lowfat XML (Clear Bible, CC BY 4.0) and MACULA Quotation and Speaker Data (Clear Bible, CC BY 4.0).';
const LIMITATIONS = [
  'Boundary features are derived signals, not a literary verdict.',
  'Hebrew/Masoretic versification is used for source anchors.',
  'SDBH-derived word-sense fields and gloss text are excluded from this dataset.',
  'Location changes, temporal frame changes, and formula matches are not part of query_ot_structure v1; use query_places, query_events, query_lemmas, or query_vocabulary for those signals.',
];

const BoundaryRefSchema = z.object({
  chapter: z.number(),
  verse: z.number(),
  ref: z.string(),
});

const ClauseSummarySchema = z.object({
  class: z.string().nullable(),
  rule: z.string().nullable(),
  role: z.string().nullable(),
});

const QuotationEventSchema = z.object({
  speech_key: z.string(),
  speaker_id: z.string(),
  speaker_label: z.string().nullable(),
  quote_type: z.string().nullable(),
});

export const OtStructureInputSchema = {
  book: z.string().describe('OT book name (any common form, e.g., "Genesis", "Gen", "Psalms")'),
  range: z.string().describe('Verse range, e.g. "1:1-1:10", "1:1-10", or a single verse "1:1"'),
};

export type OtStructureInput = z.output<z.ZodObject<typeof OtStructureInputSchema>>;

export const OtStructureOutputSchema = {
  book: z.string(),
  range: z.string(),
  boundaries: z.array(z.object({
    before: BoundaryRefSchema,
    after: BoundaryRefSchema,
    relation_to_range: z.enum(['start_edge', 'internal', 'end_edge']),
    syntax: z.object({
      previous_sentence_ended: z.boolean(),
      new_sentence_begins: z.boolean(),
      open_clause_depth: z.number(),
      clause_end_count: z.number(),
      clause_start_count: z.number(),
      clause_endings: z.array(ClauseSummarySchema),
      clause_beginnings: z.array(ClauseSummarySchema),
    }),
    participants: z.object({
      before: z.array(z.string()),
      after: z.array(z.string()),
      entered: z.array(z.string()),
      exited: z.array(z.string()),
      participant_set_changed: z.boolean(),
    }),
    speech: z.object({
      speakers_before: z.array(z.string()),
      speakers_after: z.array(z.string()),
      speaker_changed: z.boolean(),
      quotation_opened: z.boolean(),
      quotation_closed: z.boolean(),
      quotations_opened: z.array(QuotationEventSchema),
      quotations_closed: z.array(QuotationEventSchema),
    }),
  })),
  summary: z.object({
    total: z.number(),
    returned: z.number(),
    truncated: z.boolean().optional(),
    start_edge_available: z.boolean(),
    end_edge_available: z.boolean(),
  }),
  attribution: z.string(),
  limitations: z.array(z.string()),
};

type JsonValue = string[] | Record<string, unknown>[];

function parseJsonArray(value: unknown, field: string): JsonValue {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as JsonValue : [];
  } catch {
    throw new Error(`Malformed JSON in ot_structure_boundaries.${field}`);
  }
}

function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

function ref(chapter: number, verse: number) {
  return { chapter, verse, ref: `${chapter}:${verse}` };
}

function relationToRange(row: Record<string, unknown>, startEnc: number, endEnc: number): 'start_edge' | 'internal' | 'end_edge' {
  if (row.after_ref_enc === startEnc) return 'start_edge';
  if (row.before_ref_enc === endEnc) return 'end_edge';
  return 'internal';
}

export async function queryOtStructure(args: OtStructureInput): Promise<CallToolResult> {
  const bookInfo = lookupBook(args.book);
  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.book}' not found.`, suggestions: suggestBooks(args.book) } }) }],
      isError: true,
    };
  }

  if (bookInfo.testament !== 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TESTAMENT_MISMATCH', message: `OT structure features are OT only. '${bookInfo.displayName}' is an NT book.` } }) }],
      isError: true,
    };
  }

  const parsed = parseVerseRange(args.range);
  if ('error' in parsed) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: parsed.error } }) }],
      isError: true,
    };
  }

  const startEnc = encodePosition(parsed.startChapter, parsed.startVerse);
  const endEnc = encodePosition(parsed.endChapter, parsed.endVerse);

  const sql = `
    SELECT *
    FROM ot_structure_boundaries
    WHERE book = ?
      AND (
        after_ref_enc = ?
        OR (before_ref_enc >= ? AND after_ref_enc <= ?)
        OR before_ref_enc = ?
      )
    ORDER BY before_ref_enc
    LIMIT 2000
  `;

  let rows: Record<string, unknown>[];
  try {
    rows = await query(sql, [bookInfo.canonical, startEnc, startEnc, endEnc, endEnc]);
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'DATA_NOT_LOADED', message: `OT structure data is not available yet. Apply migration 0024 and run the ot-structure backfill. Detail: ${error instanceof Error ? error.message : String(error)}` } }) }],
      isError: true,
    };
  }

  if (rows.length === 0) {
    const countRows = await query('SELECT COUNT(*) AS count FROM ot_structure_boundaries WHERE book = ?', [bookInfo.canonical]);
    const count = Number(countRows[0]?.count ?? 0);
    if (count === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'DATA_NOT_LOADED', message: `No OT structure rows are loaded for ${bookInfo.displayName}. Run the ot-structure backfill before using query_ot_structure.` } }) }],
        isError: true,
      };
    }
  }

  const boundaries = rows.map(row => ({
    before: ref(row.before_chapter as number, row.before_verse as number),
    after: ref(row.after_chapter as number, row.after_verse as number),
    relation_to_range: relationToRange(row, startEnc, endEnc),
    syntax: {
      previous_sentence_ended: bool(row.previous_sentence_ended),
      new_sentence_begins: bool(row.new_sentence_begins),
      open_clause_depth: row.open_clause_depth as number,
      clause_end_count: row.clause_end_count as number,
      clause_start_count: row.clause_start_count as number,
      clause_endings: parseJsonArray(row.clause_endings_json, 'clause_endings_json') as Record<string, unknown>[],
      clause_beginnings: parseJsonArray(row.clause_beginnings_json, 'clause_beginnings_json') as Record<string, unknown>[],
    },
    participants: {
      before: parseJsonArray(row.participants_before_json, 'participants_before_json') as string[],
      after: parseJsonArray(row.participants_after_json, 'participants_after_json') as string[],
      entered: parseJsonArray(row.participants_entered_json, 'participants_entered_json') as string[],
      exited: parseJsonArray(row.participants_exited_json, 'participants_exited_json') as string[],
      participant_set_changed: bool(row.participant_set_changed),
    },
    speech: {
      speakers_before: parseJsonArray(row.speakers_before_json, 'speakers_before_json') as string[],
      speakers_after: parseJsonArray(row.speakers_after_json, 'speakers_after_json') as string[],
      speaker_changed: bool(row.speaker_changed),
      quotation_opened: bool(row.quotation_opened),
      quotation_closed: bool(row.quotation_closed),
      quotations_opened: parseJsonArray(row.quotations_opened_json, 'quotations_opened_json') as Record<string, unknown>[],
      quotations_closed: parseJsonArray(row.quotations_closed_json, 'quotations_closed_json') as Record<string, unknown>[],
    },
  }));

  const result: Record<string, unknown> = {
    book: bookInfo.displayName,
    range: args.range,
    boundaries,
    summary: {
      total: boundaries.length,
      returned: boundaries.length,
      start_edge_available: boundaries.some(b => b.relation_to_range === 'start_edge'),
      end_edge_available: boundaries.some(b => b.relation_to_range === 'end_edge'),
    },
    attribution: ATTRIBUTION,
    limitations: LIMITATIONS,
  };

  let json = JSON.stringify(result);
  if (json.length > CHARACTER_LIMIT && boundaries.length > 1) {
    const truncated = [];
    let approxSize = json.length - JSON.stringify(boundaries).length + 100;
    for (const boundary of boundaries) {
      const boundaryJson = JSON.stringify(boundary);
      if (approxSize + boundaryJson.length + 1 > CHARACTER_LIMIT) break;
      approxSize += boundaryJson.length + 1;
      truncated.push(boundary);
    }
    result.boundaries = truncated;
    result.summary = {
      ...(result.summary as Record<string, unknown>),
      returned: truncated.length,
      truncated: true,
    };
    json = JSON.stringify(result);
  }

  return {
    content: [{ type: 'text', text: json }],
    structuredContent: result,
  };
}
