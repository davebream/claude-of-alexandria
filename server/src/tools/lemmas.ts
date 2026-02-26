import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { getAllBooks } from '../db/books.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LEMMAS = 50;
const D1_PARAM_LIMIT = 100;
const CHARACTER_LIMIT = 25_000;

// ─── Testament detection ──────────────────────────────────────────────────────

// OT lemmas use Strong's H-prefix (e.g. H7462b, H430).
// NT lemmas are bare Greek lexical forms (e.g. πατήρ, κύριος).
// There is no G-prefix convention in the data.
function isOtLemma(lemma: string): boolean {
  return lemma.length >= 2 && lemma[0] === 'H' && lemma[1] >= '0' && lemma[1] <= '9';
}

// ─── Canonical-to-display name map ────────────────────────────────────────────

// vocabulary table stores lowercase canonical names (e.g. "genesis", "1_corinthians").
// We need display names (e.g. "Genesis", "1 Corinthians") for the response.
let _displayMap: Record<string, string> | null = null;
function getDisplayMap(): Record<string, string> {
  if (!_displayMap) {
    _displayMap = {};
    for (const book of getAllBooks()) {
      _displayMap[book.canonical] = book.displayName;
    }
  }
  return _displayMap;
}

// ─── Input / Output schemas ───────────────────────────────────────────────────

export const LemmasInputSchema = {
  lemmas: z.array(z.string()).min(1).max(50).describe(
    'Lemma IDs to look up. OT: Strong\'s numbers (e.g. "H7462b"). NT: Greek lexical forms (e.g. "πατήρ"). 1–50 items. Mixed OK.'
  ),
};

export type LemmasInput = z.output<z.ZodObject<typeof LemmasInputSchema>>;

const DistributionEntry = z.object({
  lemma: z.string(),
  testament: z.enum(['ot', 'nt']),
  total_occurrences: z.number(),
  books_count: z.number(),
  distribution: z.record(z.string(), z.record(z.string(), z.number())),
});

export const LemmasOutputSchema = {
  lemmas: z.array(DistributionEntry),
  not_found: z.array(z.string()),
  total_requested: z.number(),
  total_found: z.number(),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};
