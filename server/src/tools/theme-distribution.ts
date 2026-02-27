import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { getAllBooks } from '../db/books.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARACTER_LIMIT = 25_000;

// ─── Canonical-to-display name map ────────────────────────────────────────────

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

export const ThemeDistributionInputSchema = {
  theme: z.string().describe(
    'Theme name (e.g., "joy", "faith", "covenant", "deity"). Use list_books with include_themes=true to see all 81 available themes.'
  ),
  testament: z.enum(['nt', 'ot']).describe(
    '"nt" or "ot" — themes are testament-specific. NT themes use Greek lemmas; OT themes use Strong\'s numbers.'
  ),
};

export type ThemeDistributionInput = z.output<z.ZodObject<typeof ThemeDistributionInputSchema>>;

const BookEntry = z.object({
  book: z.string(),
  total: z.number(),
  by_lemma: z.record(z.string(), z.record(z.string(), z.number())),
});

export const ThemeDistributionOutputSchema = {
  theme: z.string(),
  testament: z.enum(['nt', 'ot']),
  theme_lemmas: z.array(z.string()),
  books: z.array(BookEntry),
  summary: z.object({
    total_occurrences: z.number(),
    books_count: z.number(),
  }),
  truncated: z.boolean().optional(),
  truncation_message: z.string().optional(),
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function queryThemeDistribution(args: ThemeDistributionInput): Promise<CallToolResult> {
  const { theme, testament } = args;

  // Validate theme exists for this testament
  const themeCheck = await query(
    'SELECT DISTINCT theme FROM thematic_keywords WHERE theme = ? AND testament = ?',
    [theme, testament]
  );
  if (themeCheck.length === 0) {
    const allThemes = await query(
      'SELECT DISTINCT theme FROM thematic_keywords WHERE testament = ? ORDER BY theme',
      [testament]
    );
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: {
            code: 'INVALID_THEME',
            message: `Theme '${theme}' not found for ${testament.toUpperCase()}.`,
            available_themes: allThemes.map(r => r.theme),
          }
        })
      }],
      isError: true,
    };
  }

  const displayMap = getDisplayMap();

  // Fetch vocabulary rows for all theme lemmas across all books in parallel
  const [rows, lemmaRows] = await Promise.all([
    query(
      `SELECT v.book, v.chapter, v.lemma, v.frequency
       FROM vocabulary v
       JOIN thematic_keywords tk ON tk.lemma = v.lemma AND tk.testament = v.testament
       WHERE tk.theme = ? AND v.testament = ?
       ORDER BY v.book, v.lemma, v.chapter`,
      [theme, testament]
    ),
    query(
      'SELECT DISTINCT lemma FROM thematic_keywords WHERE theme = ? AND testament = ? ORDER BY lemma',
      [theme, testament]
    ),
  ]);

  const themeLemmas = lemmaRows.map(r => r.lemma as string);

  // Group by canonical book → lemma → chapter
  const grouped: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of rows) {
    const canonical = row.book as string;
    const lemma = row.lemma as string;
    const chapter = String(row.chapter);
    const freq = row.frequency as number;

    if (!grouped[canonical]) grouped[canonical] = {};
    if (!grouped[canonical][lemma]) grouped[canonical][lemma] = {};
    grouped[canonical][lemma][chapter] = freq;
  }

  // Build books array: use display names, compute per-book totals, sort heaviest first
  const books = Object.entries(grouped).map(([canonical, lemmas]) => {
    const displayName = displayMap[canonical] ?? canonical;
    let total = 0;
    const byLemma: Record<string, Record<string, number>> = {};
    for (const [lemma, chapters] of Object.entries(lemmas)) {
      byLemma[lemma] = chapters;
      for (const count of Object.values(chapters)) {
        total += count;
      }
    }
    return { book: displayName, total, by_lemma: byLemma };
  }).sort((a, b) => b.total - a.total);

  const totalOccurrences = books.reduce((sum, b) => sum + b.total, 0);

  let result: Record<string, unknown> = {
    theme,
    testament,
    theme_lemmas: themeLemmas,
    books,
    summary: {
      total_occurrences: totalOccurrences,
      books_count: books.length,
    },
  };

  // Truncation: binary search for the largest book subset under the character limit.
  // Books are already sorted heaviest-first so we keep the most relevant entries.
  let serialized = JSON.stringify(result);
  if (serialized.length > CHARACTER_LIMIT && books.length > 1) {
    let lo = 1, hi = books.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = books.slice(0, mid);
      const probe = JSON.stringify({ ...result, books: candidate });
      if (probe.length <= CHARACTER_LIMIT) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const truncatedBooks = books.slice(0, lo);
    result = {
      theme,
      testament,
      theme_lemmas: themeLemmas,
      books: truncatedBooks,
      summary: { total_occurrences: totalOccurrences, books_count: books.length },
      truncated: true,
      truncation_message: `Response truncated from ${books.length} to ${truncatedBooks.length} books (character limit). Full coverage: ${books.length} books, ${totalOccurrences} total occurrences.`,
    };
    serialized = JSON.stringify(result);
  }

  return {
    content: [{ type: 'text', text: serialized }],
    structuredContent: result,
  };
}
