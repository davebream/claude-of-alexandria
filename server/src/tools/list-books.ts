import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAllBooks } from '../db/books.js';
import { query } from '../db/query.js';

export const ListBooksInputSchema = {
  testament: z.enum(['nt', 'ot']).optional().describe(
    'Filter by testament. Omit to list all 66 books.'
  ),
  include_themes: z.boolean().optional().describe(
    'Include available thematic keyword groups for vocabulary queries (default: false)'
  ),
};

export type ListBooksInput = z.output<z.ZodObject<typeof ListBooksInputSchema>>;

export const ListBooksOutputSchema = {
  total: z.number(),
  ot: z.array(z.string()).optional(),
  nt: z.array(z.string()).optional(),
  available_tools: z.array(z.string()),
  themes: z.object({
    ot: z.array(z.string()),
    nt: z.array(z.string()),
  }).optional(),
};

const AVAILABLE_TOOLS = [
  'query_morphology - word-level parsing for any book (OT + NT). Use fields parameter for progressive disclosure: "basic" (default) = text, normalized, lemma, pos, parsing; "syntax" adds clause_id, clause_type, strongs; "full" adds gloss, semantic_frame, subject_ref, participant_ref; "lexical" = compact text, lemma, strongs, gloss. Use strongs_filter to filter by Strong\'s number.',
  'query_vocabulary - lemma frequencies + thematic keywords (OT + NT)',
  'query_lemmas - cross-book lemma distribution (OT + NT)',
  'query_discourse_features - Levinsohn discourse markers (NT only)',
  'query_paragraph_breaks - Masoretic petuchah/setumah markers (OT only)',
  'query_ot_quotes - OT quotations in NT passages (NT only)',
  'query_themes_for_lemmas - resolve lemmas to vocabulary themes (OT + NT)',
  'query_lexicon - Strong\'s definitions and word meanings (OT + NT)',
  'check_versification - Hebrew-English verse numbering differences (OT only)',
  'query_cross_references - editorial tradition cross-references with vote counts (OT + NT)',
  'query_people - named individuals with cross-canonical appearances from Theographic/TIPNR (OT + NT)',
  'query_places - geographic locations with coordinates from Theographic/TIPNR (OT + NT)',
  'query_events - timeline events with participants, locations, and Ussher chronology (OT + NT)',
  'query_person_network - family relationships and co-appearances for a named individual (OT + NT)',
] as const;

export async function listBooks(args: ListBooksInput): Promise<CallToolResult> {
  const allBooks = getAllBooks();
  const filtered = args.testament
    ? allBooks.filter(b => b.testament === args.testament)
    : allBooks;

  const ot = filtered.filter(b => b.testament === 'ot').map(b => b.displayName);
  const nt = filtered.filter(b => b.testament === 'nt').map(b => b.displayName);

  if (args.include_themes) {
    const themeRows = await query(
      'SELECT DISTINCT theme, testament FROM thematic_keywords ORDER BY testament, theme',
      []
    );
    const themes: { ot: string[]; nt: string[] } = { ot: [], nt: [] };
    for (const row of themeRows) {
      const t = row.testament as string;
      if (t === 'ot' || t === 'nt') themes[t].push(row.theme as string);
    }
    const result = {
      total: filtered.length,
      ot: ot.length > 0 ? ot : undefined,
      nt: nt.length > 0 ? nt : undefined,
      available_tools: [...AVAILABLE_TOOLS],
      themes,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  const result = {
    total: filtered.length,
    ot: ot.length > 0 ? ot : undefined,
    nt: nt.length > 0 ? nt : undefined,
    available_tools: [...AVAILABLE_TOOLS],
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
