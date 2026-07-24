import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';

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
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Expand a compact parenthetical gloss into all spelled-out variant forms.
 *
 * Examples:
 *   "when(-ever)"          → ["when", "whenever"]
 *   "where(-ever)"         → ["where", "whereever", "wherever"]
 *   "where(-ever, -fore)"  → ["where", "whereever", "wherever", "wherefore"]
 *   "love"                 → ["love"]
 *   "God (the Almighty)"   → ["God (the Almighty)"]  (first inner element not '-')
 *
 * Architecture Invariant: returns [gloss] unchanged when there is no parenthetical
 * group whose first inner element starts with '-'. Never mutates the displayed gloss.
 *
 * Dual-form elision rule: when base's last char equals the suffix's first char,
 * emit both the naive concatenation (base + suffix) AND the single-char-elided
 * form (base + suffix.slice(1)), to handle e.g. "where(-ever)" → "whereever" + "wherever".
 *
 * Note: any text trailing the parenthetical group is ignored. Trailing-remainder
 * forms like "over(-flow)ing" are out of scope.
 */
export function expandParentheticalGloss(gloss: string): string[] {
  const match = gloss.match(/^(.+?)\((-[^)]+)\)/);
  if (!match) return [gloss];

  const base = match[1];
  const inner = match[2];

  // Split on comma, trim whitespace
  const parts = inner.split(',').map(p => p.trim());

  // If the first part does not start with '-', this is not an abbreviation group
  if (!parts[0].startsWith('-')) return [gloss];

  const expandedForms: string[] = [];

  for (const part of parts) {
    if (part.startsWith('-')) {
      // Naive concatenation: drop the hyphen
      const naive = base + part.slice(1);
      expandedForms.push(naive);

      // Dual-form elision: if base's last char equals suffix's first char (part[1]),
      // also emit the single-char-elided form
      if (base[base.length - 1] === part[1]) {
        const elided = base + part.slice(2);
        expandedForms.push(elided);
      }
    } else {
      // Part does not start with '-': append as-is
      expandedForms.push(part);
    }
  }

  return [base, ...expandedForms];
}

/**
 * Returns true if the gloss directly contains the term OR any expanded form
 * (from expandParentheticalGloss) contains the term. Case-insensitive.
 *
 * Used as a post-filter after the broadened SQL fetch to keep only rows that
 * genuinely match the user's search term — either directly or via expansion.
 * Never mutates the gloss; the displayed gloss stays verbatim.
 */
export function glossMatchesTerm(gloss: string, term: string): boolean {
  return expandParentheticalGloss(gloss).some(form => form.toLowerCase().includes(term));
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const LexiconCommonInput = {
  ...PaginationInputShape,
  compact: z.boolean().default(false).describe('Return compact entries without source definitions.'),
};

export const LexiconInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...LexiconCommonInput, mode: z.literal('strongs').describe('Look up Strong numbers.'), strongs_ids: z.array(z.string()).min(1).max(20).describe('Native array of 1 to 20 Strong numbers.'), lemmas: z.never().optional(), search: z.never().optional() }),
  z.strictObject({ ...LexiconCommonInput, mode: z.literal('lemmas').describe('Look up original-language lemmas.'), strongs_ids: z.never().optional(), lemmas: z.array(z.string()).min(1).max(20).describe('Native array of 1 to 20 Greek or Hebrew lemmas.'), search: z.never().optional() }),
  z.strictObject({ ...LexiconCommonInput, mode: z.literal('search').describe('Search English glosses and definitions.'), strongs_ids: z.never().optional(), lemmas: z.never().optional(), search: z.string().min(2).max(100).describe('English search text, 2 to 100 characters.') }),
]);

export type LexiconInput = z.output<typeof LexiconInputSchema>;

const CompactLexiconEntrySchema = z.strictObject({
  strongs_id: z.string(),
  gloss: z.string(),
  transliteration: z.string().nullable(),
});
const FullLexiconEntrySchema = z.strictObject({
  strongs_id: z.string(),
  gloss: z.string(),
  original_word: z.string().optional(),
  transliteration: z.string().nullable(),
  lsj_definition: z.string().nullable(),
  abbott_smith_definition: z.string().nullable(),
  bdb_definition: z.string().nullable(),
  ubs_semantic_domains: z.array(z.strictObject({ code: z.string(), name: z.string() })),
  sources: z.array(z.string()),
  source_ids: z.array(z.string()).min(1),
});

const LexiconOutputCommon = {
  provenance: ProvenanceSchema,
  page: PageSchema,
  errors: z.array(z.string()),
};
const notFound = { not_found: z.array(z.string()) };

export const LexiconOutputSchema = z.discriminatedUnion('response_type', [
  z.strictObject({ ...LexiconOutputCommon, ...notFound, response_type: z.literal('strongs_compact'), mode: z.literal('strongs'), detail_level: z.literal('compact'), entries: z.array(CompactLexiconEntrySchema) }),
  z.strictObject({ ...LexiconOutputCommon, ...notFound, response_type: z.literal('strongs_full'), mode: z.literal('strongs'), detail_level: z.literal('full'), entries: z.array(FullLexiconEntrySchema) }),
  z.strictObject({ ...LexiconOutputCommon, ...notFound, response_type: z.literal('lemmas_compact'), mode: z.literal('lemmas'), detail_level: z.literal('compact'), entries: z.array(CompactLexiconEntrySchema) }),
  z.strictObject({ ...LexiconOutputCommon, ...notFound, response_type: z.literal('lemmas_full'), mode: z.literal('lemmas'), detail_level: z.literal('full'), entries: z.array(FullLexiconEntrySchema) }),
  z.strictObject({ ...LexiconOutputCommon, response_type: z.literal('search_compact'), mode: z.literal('search'), detail_level: z.literal('compact'), entries: z.array(CompactLexiconEntrySchema) }),
  z.strictObject({ ...LexiconOutputCommon, response_type: z.literal('search_full'), mode: z.literal('search'), detail_level: z.literal('full'), entries: z.array(FullLexiconEntrySchema) }),
]);

// ─── Internal types ───────────────────────────────────────────────────────────

interface SourceRow {
  strongs_id: string;
  gloss: string;
  original_word?: string;
  transliteration?: string | null;
  lsj_definition?: string | null;
  abbott_smith_definition?: string | null;
  bdb_definition?: string | null;
  ubs_semantic_domains?: Array<{ code: string; name: string }>;
  sources?: string[];
}

// ─── Formatter ───────────────────────────────────────────────────────────────

function formatEntry(row: SourceRow, compact: boolean) {
  if (compact) {
    return {
      strongs_id: row.strongs_id,
      gloss: row.gloss,
      transliteration: row.transliteration ?? null,
    };
  }
  return {
    strongs_id: row.strongs_id,
    gloss: row.gloss,
    original_word: row.original_word,
    transliteration: row.transliteration ?? null,
    lsj_definition: row.lsj_definition ?? null,
    abbott_smith_definition: row.abbott_smith_definition ?? null,
    bdb_definition: row.bdb_definition ?? null,
    ubs_semantic_domains: row.ubs_semantic_domains ?? [],
    sources: row.sources ?? [],
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function queryLexicon(args: LexiconInput): Promise<CallToolResult> {
  const errors: string[] = [];

  // Validate: at least one parameter required
  if (!args.strongs_ids && !args.lemmas && !args.search) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'MISSING_INPUT', message: "At least one of 'strongs_ids', 'lemmas', or 'search' is required." }
      }) }],
      isError: true,
    };
  }

  // Validate: mutual exclusivity — exactly one of the three inputs allowed
  const inputCount = [args.strongs_ids, args.lemmas, args.search].filter(Boolean).length;
  if (inputCount > 1) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'INVALID_INPUT', message: "Provide exactly one of: 'strongs_ids', 'lemmas', or 'search'." }
      }) }],
      isError: true,
    };
  }

  // Validate: search length (Zod handles this at the schema level when invoked via MCP,
  // but we also guard here for direct programmatic calls with `as any` casts in tests)
  if (args.search !== undefined) {
    if (args.search.length < 2) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          error: { code: 'INVALID_INPUT', message: 'Search term must be at least 2 characters.' }
        }) }],
        isError: true,
      };
    }
    if (args.search.length > 100) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          error: { code: 'INVALID_INPUT', message: 'Search term must be 100 characters or fewer.' }
        }) }],
        isError: true,
      };
    }
  }

  const compact = args.compact ?? false;

  let entries: SourceRow[] = [];
  let notFound: string[] = [];

  if (args.strongs_ids) {
    // ─── Strong's ID lookup ───────────────────────────────────────────────
    const normalized = args.strongs_ids.map(normalizeStrongs);

    // Split by testament prefix
    const greekIds = normalized.filter(id => id.startsWith('G'));
    const hebrewIds = normalized.filter(id => id.startsWith('H'));

    const entryMap = new Map<string, SourceRow>();

    // Query LSJ for Greek IDs
    if (greekIds.length > 0) {
      const ph = greekIds.map(() => '?').join(', ');
      const lsjRows = await query(
        `SELECT l.strongs_id, l.gloss, l.original_word, l.transliteration, l.definition as lsj_definition,
                a.definition as abbott_smith_definition
         FROM lexicon_lsj l
         LEFT JOIN lexicon_abbott_smith a ON l.strongs_id = a.strongs_id
         WHERE l.strongs_id IN (${ph})`,
        greekIds
      );
      for (const row of lsjRows) {
        const sources = ['lsj'];
        if (row.abbott_smith_definition) sources.push('abbott-smith');
        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: row.lsj_definition as string | null,
          abbott_smith_definition: row.abbott_smith_definition as string | null,
          bdb_definition: null,
          ubs_semantic_domains: [],
          sources,
        });
      }
      // Check Abbott-Smith for Greek IDs not found in LSJ
      const foundGreek = new Set(lsjRows.map(r => r.strongs_id as string));
      const missingGreek = greekIds.filter(id => !foundGreek.has(id));
      if (missingGreek.length > 0) {
        const ph2 = missingGreek.map(() => '?').join(', ');
        const asRows = await query(
          `SELECT strongs_id, gloss, original_word, transliteration, definition as abbott_smith_definition
           FROM lexicon_abbott_smith WHERE strongs_id IN (${ph2})`,
          missingGreek
        );
        for (const row of asRows) {
          entryMap.set(row.strongs_id as string, {
            strongs_id: row.strongs_id as string,
            gloss: row.gloss as string,
            original_word: row.original_word as string,
            transliteration: row.transliteration as string | null,
            lsj_definition: null,
            abbott_smith_definition: row.abbott_smith_definition as string | null,
            bdb_definition: null,
            ubs_semantic_domains: [],
            sources: ['abbott-smith'],
          });
        }
      }
    }

    // Query BDB for Hebrew IDs
    if (hebrewIds.length > 0) {
      const ph = hebrewIds.map(() => '?').join(', ');
      const bdbRows = await query(
        `SELECT strongs_id, gloss, original_word, transliteration, definition as bdb_definition
         FROM lexicon_bdb WHERE strongs_id IN (${ph})`,
        hebrewIds
      );
      for (const row of bdbRows) {
        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: null,
          abbott_smith_definition: null,
          bdb_definition: row.bdb_definition as string | null,
          ubs_semantic_domains: [],
          sources: ['bdb'],
        });
      }
    }

    // LEFT JOIN UBS domains for all found entries
    const allFoundIds = [...entryMap.keys()];
    if (allFoundIds.length > 0) {
      const ph = allFoundIds.map(() => '?').join(', ');
      const ubsRows = await query(
        `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph}) ORDER BY strongs_id, domain_code`,
        allFoundIds
      );
      for (const row of ubsRows) {
        const entry = entryMap.get(row.strongs_id as string);
        if (entry) {
          entry.ubs_semantic_domains!.push({
            code: row.domain_code as string,
            name: row.domain_name as string,
          });
          const ubsSource = (row.strongs_id as string).startsWith('G') ? 'ubs-sdgnt' : 'ubs-sdbh';
          if (!entry.sources!.includes(ubsSource)) {
            entry.sources!.push(ubsSource);
          }
        }
      }
    }

    entries = [...entryMap.values()].sort((a, b) => a.strongs_id.localeCompare(b.strongs_id));
    notFound = normalized.filter(id => !entryMap.has(id));

  } else if (args.lemmas) {
    // ─── Lemma lookup with 3-form fallback ───────────────────────────────
    const entryMap = new Map<string, SourceRow>();

    // Build 3-form variants for each lemma
    const allVariants: string[] = [];
    for (const lemma of args.lemmas) {
      const nfc = lemma.normalize('NFC');
      const stripped = stripDiacritics(lemma);
      allVariants.push(nfc, nfc, stripped);
    }

    const conditions = args.lemmas.map(() =>
      '(original_word = ? OR original_word_nfc = ? OR original_word_stripped = ?)'
    ).join(' OR ');

    // Query LSJ (Greek lemmas)
    const lsjRows = await query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as lsj_definition
       FROM lexicon_lsj WHERE ${conditions}`,
      allVariants
    );
    for (const row of lsjRows) {
      entryMap.set(row.strongs_id as string, {
        strongs_id: row.strongs_id as string,
        gloss: row.gloss as string,
        original_word: row.original_word as string,
        transliteration: row.transliteration as string | null,
        lsj_definition: row.lsj_definition as string | null,
        abbott_smith_definition: null,
        bdb_definition: null,
        ubs_semantic_domains: [],
        sources: ['lsj'],
      });
    }

    // Query Abbott-Smith (Greek lemmas — catches NT-specific vocabulary absent from LSJ)
    const asRows = await query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as abbott_smith_definition
       FROM lexicon_abbott_smith WHERE ${conditions}`,
      allVariants
    );
    for (const row of asRows) {
      const existing = entryMap.get(row.strongs_id as string);
      if (existing) {
        existing.abbott_smith_definition = row.abbott_smith_definition as string | null;
        if (!existing.sources!.includes('abbott-smith')) existing.sources!.push('abbott-smith');
      } else {
        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: null,
          abbott_smith_definition: row.abbott_smith_definition as string | null,
          bdb_definition: null,
          ubs_semantic_domains: [],
          sources: ['abbott-smith'],
        });
      }
    }

    // Query BDB (Hebrew lemmas)
    const bdbRows = await query(
      `SELECT strongs_id, gloss, original_word, transliteration, definition as bdb_definition
       FROM lexicon_bdb WHERE ${conditions}`,
      allVariants
    );
    for (const row of bdbRows) {
      entryMap.set(row.strongs_id as string, {
        strongs_id: row.strongs_id as string,
        gloss: row.gloss as string,
        original_word: row.original_word as string,
        transliteration: row.transliteration as string | null,
        lsj_definition: null,
        abbott_smith_definition: null,
        bdb_definition: row.bdb_definition as string | null,
        ubs_semantic_domains: [],
        sources: ['bdb'],
      });
    }

    // LEFT JOIN UBS domains
    const allFoundIds = [...entryMap.keys()];
    if (allFoundIds.length > 0) {
      const ph = allFoundIds.map(() => '?').join(', ');
      const ubsRows = await query(
        `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph}) ORDER BY strongs_id, domain_code`,
        allFoundIds
      );
      for (const row of ubsRows) {
        const entry = entryMap.get(row.strongs_id as string);
        if (entry) {
          entry.ubs_semantic_domains!.push({ code: row.domain_code as string, name: row.domain_name as string });
          const ubsSource = (row.strongs_id as string).startsWith('G') ? 'ubs-sdgnt' : 'ubs-sdbh';
          if (!entry.sources!.includes(ubsSource)) entry.sources!.push(ubsSource);
        }
      }
    }

    // Track which input lemmas were found (check all 3 match columns)
    const foundLemmas = new Set<string>();
    for (const entry of entryMap.values()) {
      for (const lemma of args.lemmas) {
        const nfc = lemma.normalize('NFC');
        const stripped = stripDiacritics(lemma);
        if (
          entry.original_word === nfc ||
          entry.original_word === stripped ||
          (entry.original_word && stripDiacritics(entry.original_word) === stripped)
        ) {
          foundLemmas.add(lemma);
        }
      }
    }
    notFound = args.lemmas.filter(l => !foundLemmas.has(l));
    entries = [...entryMap.values()].sort((a, b) => a.strongs_id.localeCompare(b.strongs_id));

  } else if (args.search) {
    // ─── Meaning search via LIKE queries ─────────────────────────────────
    // NOTE: LIKE '%term%' defeats B-tree indexes (full-table scan). This is
    // intentional and acceptable: ~31,400 total rows across three lexicon tables
    // is well within D1 SQLite response time bounds for an interactive tool.
    // If table size grows significantly, consider a partial index on LOWER(gloss)
    // or FTS5 once cloudflare/workers-sdk#9519 is resolved.

    // Sanitize: strip SQL wildcard characters to prevent unintended broadening.
    // This is NOT a security issue (parameterized queries prevent injection),
    // but '%' or '_' in user input would make the pattern unintentionally broad.
    const term = args.search.trim().toLowerCase().replace(/[%_]/g, '');
    const pattern = `%${term}%`;

    const entryMap = new Map<string, SourceRow>();

    // Run all three table queries concurrently. Use Promise.allSettled so a
    // failure on one source does not abort results from the others.
    const [lsjResult, asResult, bdbResult] = await Promise.allSettled([
      query(
        `SELECT strongs_id, gloss, original_word, transliteration, definition as lsj_definition
         FROM lexicon_lsj
         WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? OR LOWER(gloss) LIKE '%(-%'
         ORDER BY CASE WHEN LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? THEN 0 ELSE 1 END, strongs_id`,
        [pattern, pattern, pattern, pattern]
      ),
      query(
        `SELECT strongs_id, gloss, original_word, transliteration, definition as abbott_smith_definition
         FROM lexicon_abbott_smith
         WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? OR LOWER(gloss) LIKE '%(-%'
         ORDER BY CASE WHEN LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? THEN 0 ELSE 1 END, strongs_id`,
        [pattern, pattern, pattern, pattern]
      ),
      query(
        `SELECT strongs_id, gloss, original_word, transliteration, definition as bdb_definition
         FROM lexicon_bdb
         WHERE LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? OR LOWER(gloss) LIKE '%(-%'
         ORDER BY CASE WHEN LOWER(gloss) LIKE ? OR LOWER(definition) LIKE ? THEN 0 ELSE 1 END, strongs_id`,
        [pattern, pattern, pattern, pattern]
      ),
    ]);

    // Collect errors from rejected promises
    if (lsjResult.status === 'rejected') {
      errors.push(`LSJ search failed: ${lsjResult.reason}`);
    }
    if (asResult.status === 'rejected') {
      errors.push(`Abbott-Smith search failed: ${asResult.reason}`);
    }
    if (bdbResult.status === 'rejected') {
      errors.push(`BDB search failed: ${bdbResult.reason}`);
    }

    // Merge LSJ results (primary Greek source — wins precedence over Abbott-Smith)
    if (lsjResult.status === 'fulfilled') {
      for (const row of lsjResult.value) {
        // Post-filter: discard broadened-fetch candidates that don't match the user's term
        // (either directly via gloss/definition LIKE, or via parenthetical expansion).
        const directMatch =
          (row.gloss as string)?.toLowerCase().includes(term) ||
          ((row.lsj_definition as string | null) ?? '').toLowerCase().includes(term);
        if (!directMatch && !glossMatchesTerm(row.gloss as string, term)) continue;

        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: row.lsj_definition as string | null,
          abbott_smith_definition: null,
          bdb_definition: null,
          ubs_semantic_domains: [],
          sources: ['lsj'],
        });
      }
    }

    // Merge Abbott-Smith results — merge into existing LSJ entry if present
    if (asResult.status === 'fulfilled') {
      for (const row of asResult.value) {
        // Post-filter: discard broadened-fetch candidates that don't match the user's term
        const directMatch =
          (row.gloss as string)?.toLowerCase().includes(term) ||
          ((row.abbott_smith_definition as string | null) ?? '').toLowerCase().includes(term);
        if (!directMatch && !glossMatchesTerm(row.gloss as string, term)) continue;

        const existing = entryMap.get(row.strongs_id as string);
        if (existing) {
          existing.abbott_smith_definition = row.abbott_smith_definition as string | null;
          if (!existing.sources!.includes('abbott-smith')) existing.sources!.push('abbott-smith');
        } else {
          entryMap.set(row.strongs_id as string, {
            strongs_id: row.strongs_id as string,
            gloss: row.gloss as string,
            original_word: row.original_word as string,
            transliteration: row.transliteration as string | null,
            lsj_definition: null,
            abbott_smith_definition: row.abbott_smith_definition as string | null,
            bdb_definition: null,
            ubs_semantic_domains: [],
            sources: ['abbott-smith'],
          });
        }
      }
    }

    // Merge BDB results (Hebrew — no Strong's ID collision with Greek)
    if (bdbResult.status === 'fulfilled') {
      for (const row of bdbResult.value) {
        // Post-filter: discard broadened-fetch candidates that don't match the user's term
        const directMatch =
          (row.gloss as string)?.toLowerCase().includes(term) ||
          ((row.bdb_definition as string | null) ?? '').toLowerCase().includes(term);
        if (!directMatch && !glossMatchesTerm(row.gloss as string, term)) continue;

        entryMap.set(row.strongs_id as string, {
          strongs_id: row.strongs_id as string,
          gloss: row.gloss as string,
          original_word: row.original_word as string,
          transliteration: row.transliteration as string | null,
          lsj_definition: null,
          abbott_smith_definition: null,
          bdb_definition: row.bdb_definition as string | null,
          ubs_semantic_domains: [],
          sources: ['bdb'],
        });
      }
    }

    // Deterministic ordering: Greek entries (G prefix) before Hebrew (H prefix),
    // then lexicographic by Strong's ID within each group.
    const allEntries = [...entryMap.values()].sort((a, b) => {
      const aPrefix = a.strongs_id.startsWith('G') ? 0 : 1;
      const bPrefix = b.strongs_id.startsWith('G') ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.strongs_id.localeCompare(b.strongs_id);
    });

    entries = allEntries;

    // Fetch UBS domains for matched entries
    if (entries.length > 0) {
      try {
        const allFoundIds = entries.map(e => e.strongs_id);
        for (let index = 0; index < allFoundIds.length; index += 90) {
          const ids = allFoundIds.slice(index, index + 90);
          const ph = ids.map(() => '?').join(', ');
          const ubsRows = await query(
            `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph}) ORDER BY strongs_id, domain_code`,
            ids
          );
          for (const row of ubsRows) {
            const entry = entryMap.get(row.strongs_id as string);
            if (entry) {
              entry.ubs_semantic_domains!.push({ code: row.domain_code as string, name: row.domain_name as string });
              const ubsSource = (row.strongs_id as string).startsWith('G') ? 'ubs-sdgnt' : 'ubs-sdbh';
              if (!entry.sources!.includes(ubsSource)) entry.sources!.push(ubsSource);
            }
          }
        }
      } catch (e) {
        errors.push(`UBS domains lookup failed: ${e}`);
      }
    }

    // Build search-specific result (no not_found field)
    const searchResult = {
      mode: 'search' as const,
      detail_level: compact ? 'compact' as const : 'full' as const,
      response_type: compact ? 'search_compact' as const : 'search_full' as const,
      entries: entries.map(e => formatEntry(e, compact)),
      errors,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(searchResult) }],
      structuredContent: searchResult,
    };
  }

  const result = {
    mode: args.mode,
    detail_level: compact ? 'compact' as const : 'full' as const,
    response_type: `${args.mode}_${compact ? 'compact' : 'full'}` as const,
    entries: entries.map(e => formatEntry(e, compact)),
    not_found: notFound,
    errors,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
