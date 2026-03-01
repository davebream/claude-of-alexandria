import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const CHARACTER_LIMIT = 25_000;
const SPEAKER_ATTRIBUTION = 'MACULA Quotation and Speaker Data (CC BY 4.0), Clear Bible, Inc. Character data: Glyssen (MIT License, SIL LSDev / FCBH).';

export const SpeakersInputSchema = {
  book: z.string().describe('Biblical book name (e.g., "Genesis", "Matthew")'),
  range: z.string().optional().describe('Verse range (e.g., "22:1-22:19")'),
  speaker_id: z.string().optional().describe('Filter to specific speaker'),
  divinity_only: z.boolean().default(false).describe('Only return divine speech'),
};

export type SpeakersInput = z.output<z.ZodObject<typeof SpeakersInputSchema>>;

export const SpeakersOutputSchema = {
  book: z.string(),
  range: z.string().optional(),
  total_quotations: z.number(),
  speakers: z.array(z.object({
    character_id: z.string(),
    name: z.string(),
    gender: z.string().optional(),
    divinity: z.string(),
    quotation_count: z.number(),
  })),
  quotations: z.array(z.object({
    verse_range: z.string(),
    speaker_id: z.string(),
    speaker_label: z.string().optional(),
    alt_speaker_id: z.string().optional(),
    quote_type: z.string(),
    quote_delivery: z.string().optional(),
  })),
  prophetic_speech_caveat: z.string(),
  christophany_caveat: z.string(),
  attribution: z.string(),
};

export async function speakersQuery(args: SpeakersInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) }
      }) }],
      isError: true,
    };
  }

  // Quotations table stores displayName format (e.g., "Genesis", "1 Chronicles")
  const bookDisplay = bookInfo.displayName;

  // Build base query with JOIN to speakers table
  let sql = `
    SELECT q.book, q.chapter, q.verse_start, q.verse_end,
           q.speaker_id, q.speaker_label, q.alt_speaker_id,
           q.quote_type, q.quote_delivery, q.speech_key,
           s.name, s.gender, s.age, s.divinity
    FROM quotations q
    JOIN speakers s ON q.speaker_id = s.character_id
    WHERE q.book = ?
  `;
  const params: unknown[] = [bookDisplay];

  // Range filter using overlap logic
  if (args.range) {
    const parsed = parseVerseRange(args.range);
    if ('error' in parsed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: parsed.error } }) }],
        isError: true,
      };
    }

    const { startChapter, startVerse, endChapter, endVerse } = parsed;

    // Overlap: quotation starts before range ends AND ends after range starts
    sql += ` AND (q.chapter > ? OR (q.chapter = ? AND q.verse_end >= ?))
             AND (q.chapter < ? OR (q.chapter = ? AND q.verse_start <= ?))`;
    params.push(startChapter, startChapter, startVerse, endChapter, endChapter, endVerse);
  }

  // Speaker filter
  if (args.speaker_id) {
    sql += ' AND q.speaker_id = ?';
    params.push(args.speaker_id);
  }

  // Divinity filter
  if (args.divinity_only) {
    sql += " AND s.divinity = 'Y'";
  }

  sql += ' ORDER BY q.chapter, q.verse_start';

  const rows = await query(sql, params);

  // Build speaker summary
  const speakerMap = new Map<string, { character_id: string; name: string; gender: string | null; divinity: string; count: number }>();
  for (const r of rows) {
    const sid = r.speaker_id as string;
    if (!speakerMap.has(sid)) {
      speakerMap.set(sid, {
        character_id: sid,
        name: r.name as string,
        gender: (r.gender as string) || null,
        divinity: r.divinity as string,
        count: 0,
      });
    }
    speakerMap.get(sid)!.count++;
  }

  const speakers = Array.from(speakerMap.values())
    .sort((a, b) => b.count - a.count)
    .map(s => ({
      character_id: s.character_id,
      name: s.name,
      ...(s.gender ? { gender: s.gender } : {}),
      divinity: s.divinity,
      quotation_count: s.count,
    }));

  // Build quotations list
  const quotations = rows.map(r => {
    const ch = r.chapter as number;
    const vs = r.verse_start as number;
    const ve = r.verse_end as number;
    const verseRange = vs === ve ? `${ch}:${vs}` : `${ch}:${vs}-${ch}:${ve}`;

    const entry: Record<string, unknown> = {
      verse_range: verseRange,
      speaker_id: r.speaker_id,
      quote_type: r.quote_type || 'Normal',
    };

    if (r.speaker_label) entry.speaker_label = r.speaker_label;
    if (r.alt_speaker_id) entry.alt_speaker_id = r.alt_speaker_id;
    if (r.quote_delivery) entry.quote_delivery = r.quote_delivery;

    return entry;
  });

  const result = {
    book: bookInfo.displayName,
    ...(args.range ? { range: args.range } : {}),
    total_quotations: quotations.length,
    speakers,
    quotations,
    prophetic_speech_caveat: 'In prophetic literature, divinity_only captures direct divine speech only. Prophetic oracles mediated through the prophet are attributed to the prophet, not God. Check speaker_label for divine titles (e.g., "Yahweh", "Lord") in prophetic literature.',
    christophany_caveat: 'The dataset attributes Angel-of-the-LORD speech to "Jesus" with speaker_label "angel of". This reflects FCBH/Clear Bible\'s Christophany interpretation. Present as dataset attribution, not settled exegesis.',
    attribution: SPEAKER_ATTRIBUTION,
  };

  // Truncation: if response exceeds limit, truncate quotations (keep speakers summary)
  let jsonStr = JSON.stringify(result);
  if (jsonStr.length > CHARACTER_LIMIT) {
    let truncatedQuotations = [...quotations];
    while (truncatedQuotations.length > 1 && JSON.stringify({ ...result, quotations: truncatedQuotations }).length > CHARACTER_LIMIT) {
      truncatedQuotations = truncatedQuotations.slice(0, Math.floor(truncatedQuotations.length * 0.8));
    }
    const truncatedResult = {
      ...result,
      quotations: truncatedQuotations,
      truncated: true,
      total_available: quotations.length,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(truncatedResult) }],
      structuredContent: truncatedResult,
    };
  }

  return {
    content: [{ type: 'text', text: jsonStr }],
    structuredContent: result,
  };
}
