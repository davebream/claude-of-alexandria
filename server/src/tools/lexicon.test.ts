import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryLexicon, expandParentheticalGloss, glossMatchesTerm } from './lexicon.js';
import * as queryModule from '../db/query.js';

// Mock the query() function so tests don't need a real D1 database.
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('queryLexicon search — input validation', () => {
  it('rejects search term shorter than 2 characters', async () => {
    const result = await queryLexicon({ search: 'a' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search term longer than 100 characters', async () => {
    const result = await queryLexicon({ search: 'a'.repeat(101) } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search combined with strongs_ids', async () => {
    const result = await queryLexicon({ search: 'love', strongs_ids: ['G26'] } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects search combined with lemmas', async () => {
    const result = await queryLexicon({ search: 'love', lemmas: ['ἀγάπη'] } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects empty input (no search, no strongs_ids, no lemmas)', async () => {
    const result = await queryLexicon({} as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe('MISSING_INPUT');
    // Error message should mention all three options including 'search'
    expect(body.error.message).toMatch(/search/i);
  });
});

// ── Wildcard stripping ────────────────────────────────────────────────────────

describe('queryLexicon search — wildcard stripping', () => {
  it('strips % and _ wildcards before building LIKE pattern', async () => {
    // search="%love%" should behave as if user searched for "love"
    mockQuery.mockResolvedValue([
      { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love' },
    ]);

    const result = await queryLexicon({ search: '%love%' } as any);
    expect(result.isError).toBeFalsy();

    // Verify the actual SQL pattern passed to query() was '%love%' (LIKE pattern),
    // not '%%love%%' (which would happen if wildcards weren't stripped first).
    const calls = mockQuery.mock.calls;
    const likePatterns = calls.flatMap(c => c[1] as string[]).filter(v => String(v).startsWith('%'));
    expect(likePatterns.every(p => !p.includes('%%'))).toBe(true);
  });
});

// ── Search results ────────────────────────────────────────────────────────────

describe('queryLexicon search — result shape', () => {
  it('returns Greek entries matching "love"', async () => {
    // Three sequential calls: LSJ, Abbott-Smith, BDB — then UBS domains
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love, affection' },
      ])
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', abbott_smith_definition: 'love' },
      ])
      .mockResolvedValueOnce([]) // BDB — no Hebrew matches
      .mockResolvedValueOnce([]); // UBS domains

    const result = await queryLexicon({ search: 'love' } as any);
    expect(result.isError).toBeFalsy();

    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].strongs_id).toBe('G26');
    // Both LSJ and Abbott-Smith definitions merged into one entry
    expect(body.entries[0].lsj_definition).toMatch(/love/i);
    expect(body.entries[0].abbott_smith_definition).toMatch(/love/i);
    // No not_found field in search responses
    expect(body.not_found).toBeUndefined();
    // results_capped field present
    expect(typeof body.results_capped).toBe('boolean');
  });

  it('deduplicates when LSJ and Abbott-Smith match the same Strong ID', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love (LSJ)' },
      ])
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', abbott_smith_definition: 'love (AS)' },
      ])
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'love' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1); // deduplicated — not two entries for G26
    expect(body.entries[0].lsj_definition).toMatch(/LSJ/);
    expect(body.entries[0].abbott_smith_definition).toMatch(/AS/);
  });

  it('returns Hebrew entries for "covenant"', async () => {
    mockQuery
      .mockResolvedValueOnce([]) // LSJ — no Greek matches
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([
        { strongs_id: 'H1285', gloss: 'covenant', original_word: 'בְּרִית', transliteration: 'berit', bdb_definition: 'covenant, treaty' },
      ])
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'covenant' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries.some((e: any) => e.strongs_id === 'H1285')).toBe(true);
  });

  it('sets results_capped=true when combined results reach 20', async () => {
    // Simulate 20 LSJ results — cap should fire
    const lsjRows = Array.from({ length: 20 }, (_, i) => ({
      strongs_id: `G${String(i + 1).padStart(4, '0')}`,
      gloss: `word${i}`,
      original_word: `word${i}`,
      transliteration: `w${i}`,
      lsj_definition: `definition${i}`,
    }));

    mockQuery
      .mockResolvedValueOnce(lsjRows) // LSJ hits cap
      .mockResolvedValueOnce([{ strongs_id: 'G9999', gloss: 'word-extra', original_word: 'extra', transliteration: null, abbott_smith_definition: 'word-extra' }])
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'word' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.results_capped).toBe(true);
    expect(body.entries.length).toBeLessThanOrEqual(20);
  });

  it('is compatible with compact=true', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await queryLexicon({ search: 'love', compact: true } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries[0]).toHaveProperty('strongs_id');
    expect(body.entries[0]).toHaveProperty('gloss');
    expect(body.entries[0]).toHaveProperty('transliteration');
    // compact mode: no definition fields
    expect(body.entries[0].lsj_definition).toBeUndefined();
    expect(body.entries[0].abbott_smith_definition).toBeUndefined();
  });

  it('handles partial D1 failure gracefully (Promise.allSettled contract)', async () => {
    // LSJ fails, BDB succeeds — should return BDB results not an error
    mockQuery
      .mockRejectedValueOnce(new Error('D1 timeout on lsj')) // LSJ fails
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([
        { strongs_id: 'H1285', gloss: 'covenant', original_word: 'בְּרִית', transliteration: 'berit', bdb_definition: 'covenant' },
      ])
      .mockResolvedValueOnce([]); // UBS

    const result = await queryLexicon({ search: 'covenant' } as any);
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.entries.some((e: any) => e.strongs_id === 'H1285')).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0); // error recorded
  });
});

// ── expandParentheticalGloss ──────────────────────────────────────────────────

describe('expandParentheticalGloss', () => {
  const cases: [string, string[]][] = [
    // base ends 'n', suffix starts 'e' — no overlap, single naive form
    ['when(-ever)', ['when', 'whenever']],
    // base ends 's', suffix starts 'l' — no overlap
    ['thus(-ly)', ['thus', 'thusly']],
    // two suffixes, no overlaps
    ['light(-en, -ning)', ['light', 'lighten', 'lightning']],
    // two suffixes: -ever has overlap (e===e) → emit naive+elided; -fore no overlap
    ['where(-ever, -fore)', ['where', 'whereever', 'wherever', 'wherefore']],
    // single suffix with overlap: base ends 'e', suffix starts 'e'
    ['where(-ever)', ['where', 'whereever', 'wherever']],
    // no parens — returned unchanged
    ['love', ['love']],
    // no parens — long gloss unchanged
    ['Bel and the Dragon', ['Bel and the Dragon']],
    // parens present but first inner element does NOT start with '-' — returned unchanged
    ['God (the Almighty)', ['God (the Almighty)']],
  ];

  it.each(cases)('expandParentheticalGloss(%s) → %j', (gloss, expected) => {
    expect(expandParentheticalGloss(gloss)).toEqual(expected);
  });

  it('preserves case in output for mixed-case input', () => {
    expect(expandParentheticalGloss('When(-ever)')).toEqual(['When', 'Whenever']);
  });
});

// ── Predicate-level parenthetical expansion matching ─────────────────────────

describe('lexicon parenthetical expansion matching', () => {
  it('[RED] expansion-based matching surfaces "whenever" in gloss "when(-ever)" where raw substring fails', () => {
    // Raw substring match — the production miss this feature fixes:
    expect('when(-ever)'.toLowerCase().includes('whenever')).toBe(false);
    // Expansion-based match — the behaviour the fix introduces:
    expect(glossMatchesTerm('when(-ever)', 'whenever')).toBe(true);
  });

  it('case-insensitive match: mixed-case gloss "When(-ever)" matches term "whenever"', () => {
    expect(glossMatchesTerm('When(-ever)', 'whenever')).toBe(true);
  });
});

// ── SQL-pattern assertion (guards the '%(-%' literal) ────────────────────────

describe('queryLexicon search — SQL broadening clause', () => {
  it('broadens the gloss fetch with a contains-(- clause, not an ends-with clause', async () => {
    mockQuery.mockResolvedValue([]);
    await queryLexicon({ search: 'whenever' } as any);
    const sqlStrings = mockQuery.mock.calls.map(c => String(c[0]));
    const tableQueries = sqlStrings.filter(s => /FROM lexicon_/.test(s));
    expect(tableQueries.length).toBeGreaterThan(0);
    for (const sql of tableQueries) {
      expect(sql).toContain("LIKE '%(-%'"); // contains (- anywhere
      expect(sql).not.toMatch(/LIKE '%\(-'(?!%)/); // never the ends-with form
    }
  });
});

// ── GREEN integration tests for parenthetical expansion ──────────────────────

describe('queryLexicon search — parenthetical expansion (GREEN)', () => {
  it('[GREEN] search "whenever" matches gloss "when(-ever)" via expansion', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G3698', gloss: 'when(-ever)', original_word: 'ὁπότε', transliteration: 'hopote', lsj_definition: 'when' },
      ])
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS — fires because entries.length > 0
    const result = await queryLexicon({ search: 'whenever' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].strongs_id).toBe('G3698');
    expect(body.entries[0].gloss).toBe('when(-ever)'); // displayed gloss unchanged
  });

  it('[GREEN] search "thusly" matches gloss "thus(-ly)" via expansion', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G3779', gloss: 'thus(-ly)', original_word: 'οὕτως', transliteration: 'houtos', lsj_definition: 'thus' },
      ])
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS
    const result = await queryLexicon({ search: 'thusly' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].strongs_id).toBe('G3779');
    expect(body.entries[0].gloss).toBe('thus(-ly)'); // displayed gloss unchanged
  });

  it('non-parenthetical direct match "love" (G26) still returned after broadened fetch + post-filter', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { strongs_id: 'G26', gloss: 'love', original_word: 'ἀγάπη', transliteration: 'agape', lsj_definition: 'love' },
      ])
      .mockResolvedValueOnce([]) // Abbott-Smith
      .mockResolvedValueOnce([]) // BDB
      .mockResolvedValueOnce([]); // UBS
    const result = await queryLexicon({ search: 'love' } as any);
    const body = JSON.parse(result.content[0].text);
    expect(body.entries.some((e: any) => e.strongs_id === 'G26')).toBe(true);
    expect(body.entries.find((e: any) => e.strongs_id === 'G26').gloss).toBe('love');
  });
});
