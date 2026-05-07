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
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
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
    gloss: z.string(),
    original_word: z.string().optional(),
    transliteration: z.string().nullable().optional(),
    lsj_definition: z.string().nullable().optional(),
    abbott_smith_definition: z.string().nullable().optional(),
    bdb_definition: z.string().nullable().optional(),
    ubs_semantic_domains: z.array(z.object({
      code: z.string(),
      name: z.string(),
    })).optional(),
    sources: z.array(z.string()).optional(),
  })),
  not_found: z.array(z.string()),
  errors: z.array(z.string()),
};

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
        `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph})`,
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

    entries = [...entryMap.values()];
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
        `SELECT strongs_id, domain_code, domain_name FROM lexicon_ubs_domains WHERE strongs_id IN (${ph})`,
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
    entries = [...entryMap.values()];
  }

  const result = {
    entries: entries.map(e => formatEntry(e, compact)),
    not_found: notFound,
    errors,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
