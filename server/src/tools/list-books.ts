import { z } from 'zod';
import { COMMENTARY_ID_TO_DATASET, requireDataset } from '../provenance/registry.js';
import { ProvenanceSchema } from '../provenance/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAllBooks } from '../db/books.js';
import { query } from '../db/query.js';

export const ListBooksInputSchema = z.strictObject({
  testament: z.enum(['nt', 'ot']).optional().describe(
    'Filter by testament. Omit to list all 66 books.'
  ),
  include_themes: z.boolean().default(false).describe(
    'Include available thematic keyword groups for vocabulary queries (default: false)'
  ),
});

export type ListBooksInput = z.output<typeof ListBooksInputSchema>;

export const ListBooksOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  total: z.number(),
  ot: z.array(z.string()).optional(),
  nt: z.array(z.string()).optional(),
  themes: z.strictObject({
    ot: z.array(z.string()),
    nt: z.array(z.string()),
  }).optional(),
  available_translations: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
    license: z.string(),
  })).optional(),
  available_commentaries: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
    license: z.string(),
  })).optional(),
});

const AVAILABLE_TRANSLATIONS = [
  { id: 'BSB', name: 'Berean Standard Bible', license: 'CC0 / Public Domain' },
  { id: 'WEB', name: 'World English Bible', license: 'Public Domain' },
  { id: 'KJV', name: 'King James Version', license: 'Public Domain' },
  { id: 'ASV', name: 'American Standard Version', license: 'Public Domain' },
  { id: 'YLT', name: "Young's Literal Translation", license: 'Public Domain' },
  { id: 'DBY', name: 'Darby Bible', license: 'Public Domain' },
] as const;

const AVAILABLE_COMMENTARIES = Object.entries(COMMENTARY_ID_TO_DATASET).map(([id, datasetId]) => {
  const dataset = requireDataset(datasetId);
  return { id, name: dataset.title, license: dataset.rights.name };
});

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
      themes,
      available_translations: [...AVAILABLE_TRANSLATIONS],
      available_commentaries: [...AVAILABLE_COMMENTARIES],
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
    available_translations: [...AVAILABLE_TRANSLATIONS],
    available_commentaries: [...AVAILABLE_COMMENTARIES],
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
