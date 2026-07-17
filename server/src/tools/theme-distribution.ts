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
  // Parallel lookup map — { lemma → transliteration|null } — keyed over the
  // SAME Greek lemma that appears as a KEY in each book's `by_lemma` above.
  // `by_lemma` cannot be restructured to carry transliteration inline
  // without changing an existing field's type (forbidden by AC-11), so this
  // sibling map covers `theme_lemmas`, a superset of every `by_lemma` key
  // across every book. Present-and-null when unpopulated, never omitted
  // (AC-10) — same uniform rule as the value-shaped tools' siblings.
  lemma_translit: z.record(z.string(), z.string().nullable()),
};

// ─── Lexicon transliteration lookup ───────────────────────────────────────────
// lemma → lexicon_lsj.original_word_nfc → transliteration, with a deterministic
// lowest-strongs_id tie-break (a lemma can map to multiple Strong's numbers,
// original_word_nfc is NOT unique — see idx_lsj_original_word_nfc, migration
// 0011). `theme_lemmas` is not size-bounded (it is however many lemmas a
// theme has), so the IN (…) operand is a subquery reproducing the exact
// theme_lemmas query rather than a literal list — the bind count stays fixed
// at (theme, testament) regardless of how many lemmas that set contains.
//
// Wrapped so a lexicon failure degrades every key to lemma_translit: null
// rather than failing the whole call — the primary distribution data
// already succeeded.
async function lookupLemmaTranslit(theme: string, testament: string): Promise<Record<string, string | null>> {
  try {
    const rows = await query(
      `SELECT original_word_nfc, transliteration FROM (
         SELECT original_word_nfc, transliteration,
                ROW_NUMBER() OVER (PARTITION BY original_word_nfc ORDER BY strongs_id) AS rn
         FROM lexicon_lsj
         WHERE original_word_nfc IN (
           SELECT DISTINCT lemma FROM thematic_keywords WHERE theme = ? AND testament = ?
         )
       ) WHERE rn = 1`,
      [theme, testament]
    );

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.original_word_nfc as string] = row.transliteration as string | null;
    }
    return map;
  } catch {
    return {};
  }
}

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
            report_gap: 'If this theme should exist, report it: https://github.com/davebream/claude-of-alexandria/issues/new?template=data-gap.md',
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

  // lemma_translit — one bounded lexicon statement covering theme_lemmas,
  // a superset of every by_lemma key across every book (AC-10 present-and-
  // null; AC-12 bounded — fixed at (theme, testament) regardless of size).
  const translitLookup = await lookupLemmaTranslit(theme, testament);
  const lemmaTranslit: Record<string, string | null> = {};
  for (const lemma of themeLemmas) {
    lemmaTranslit[lemma] = translitLookup[lemma] ?? null;
  }

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
    lemma_translit: lemmaTranslit,
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
      lemma_translit: lemmaTranslit,
    };
    serialized = JSON.stringify(result);
  }

  return {
    content: [{ type: 'text', text: serialized }],
    structuredContent: result,
  };
}
