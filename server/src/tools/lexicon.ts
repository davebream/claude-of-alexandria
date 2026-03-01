import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { jsonArray } from './json-array.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a Strong's ID for database lookup.
 * Strips leading zeros, then pads to 4-digit format: H430 → H0430.
 */
function normalizeStrongs(id: string): string {
  const match = id.match(/^([HG])0*(\d+)([a-z]?)$/);
  if (!match) return id;
  return `${match[1]}${match[2].padStart(4, '0')}${match[3]}`;
}

/**
 * Strip diacritical marks from a Greek/Hebrew lemma for fuzzy matching.
 */
function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export const LexiconInputSchema = {
  strongs_ids: jsonArray(z.array(z.string()).min(1).max(20)).optional()
    .describe("Array of Strong's numbers (e.g., [\"H1961\", \"G3056\"]). Max 20."),
  lemmas: jsonArray(z.array(z.string()).min(1).max(20)).optional()
    .describe('Array of Greek/Hebrew lemmas to look up. Max 20.'),
  compact: z.boolean().optional()
    .describe('If true, return only strongs_id, gloss, transliteration (default: false)'),
};

export type LexiconInput = z.output<z.ZodObject<typeof LexiconInputSchema>>;

export const LexiconOutputSchema = {
  entries: z.array(z.object({
    strongs_id: z.string(),
    disambiguated: z.string().optional(),
    testament: z.string().optional(),
    original_word: z.string().optional(),
    transliteration: z.string().nullable().optional(),
    morphology: z.string().nullable().optional(),
    gloss: z.string(),
    meaning: z.string().nullable().optional(),
  })),
  not_found: z.array(z.string()),
  errors: z.array(z.string()),
  lexical_precision: z.string(),
};

export async function queryLexicon(args: LexiconInput): Promise<CallToolResult> {
  const errors: string[] = [];

  // Validate: at least one parameter required
  if (!args.strongs_ids && !args.lemmas) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'MISSING_INPUT', message: "At least one of 'strongs_ids' or 'lemmas' is required." }
      }) }],
      isError: true,
    };
  }

  // Validate: mutual exclusivity
  if (args.strongs_ids && args.lemmas) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'INVALID_INPUT', message: "Provide either 'strongs_ids' or 'lemmas', not both." }
      }) }],
      isError: true,
    };
  }

  const compact = args.compact ?? false;

  interface LexiconEntry {
    strongs_id: string;
    disambiguated?: string;
    testament?: string;
    original_word?: string;
    transliteration?: string | null;
    morphology?: string | null;
    gloss: string;
    meaning?: string | null;
  }

  let entries: LexiconEntry[] = [];
  let notFound: string[] = [];

  if (args.strongs_ids) {
    // ─── Strong's ID lookup ───────────────────────────────────────────────
    const normalized = args.strongs_ids.map(normalizeStrongs);
    const placeholders = normalized.map(() => '?').join(', ');
    const sql = `SELECT * FROM lexicon WHERE strongs_id IN (${placeholders})`;
    const rows = await query(sql, normalized);

    const foundIds = new Set(rows.map(r => r.strongs_id as string));
    notFound = normalized.filter(id => !foundIds.has(id));

    entries = rows.map(r => formatEntry(r, compact));
  } else if (args.lemmas) {
    // ─── Lemma lookup with 3-form fallback in single query ────────────────
    // For each lemma, try: exact match on original_word, NFC-normalized, accent-stripped
    const allVariants: string[] = [];
    for (const lemma of args.lemmas) {
      const nfc = lemma.normalize('NFC');
      const stripped = stripDiacritics(lemma);
      allVariants.push(nfc, nfc, stripped); // original_word, nfc, stripped
    }

    // Build WHERE clause: for each lemma, check 3 columns
    const conditions = args.lemmas.map(() =>
      '(original_word = ? OR original_word_nfc = ? OR original_word_stripped = ?)'
    ).join(' OR ');

    const sql = `SELECT * FROM lexicon WHERE ${conditions}`;
    const rows = await query(sql, allVariants);

    // Track which input lemmas were found
    const foundLemmas = new Set<string>();
    for (const row of rows) {
      for (const lemma of args.lemmas) {
        const nfc = lemma.normalize('NFC');
        const stripped = stripDiacritics(lemma);
        if (row.original_word === nfc || row.original_word_nfc === nfc || row.original_word_stripped === stripped) {
          foundLemmas.add(lemma);
        }
      }
    }
    notFound = args.lemmas.filter(l => !foundLemmas.has(l));

    entries = rows.map(r => formatEntry(r, compact));
  }

  const result = {
    entries,
    not_found: notFound,
    errors,
    lexical_precision: 'concordance-level',
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

function formatEntry(row: Record<string, unknown>, compact: boolean) {
  if (compact) {
    return {
      strongs_id: row.strongs_id as string,
      gloss: row.gloss as string,
      transliteration: row.transliteration as string | null,
    };
  }
  return {
    strongs_id: row.strongs_id as string,
    disambiguated: row.disambiguated as string,
    testament: row.testament as string,
    original_word: row.original_word as string,
    transliteration: row.transliteration as string | null,
    morphology: row.morphology as string | null,
    gloss: row.gloss as string,
    meaning: row.meaning as string | null,
  };
}
