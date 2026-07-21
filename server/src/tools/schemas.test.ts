import { describe, it, expect } from 'vitest';

// Import the schemas we're testing
import { ThemesInputSchema } from './themes.js';
import { LemmasInputSchema } from './lemmas.js';
import { DiscourseInputSchema } from './discourse.js';
import { VocabularyInputSchema } from './vocabulary.js';
import { LexiconInputSchema, LexiconOutputSchema } from './lexicon.js';
import { ConfessionalLookupInputSchema } from './confessional-lookup.js';
import { LiturgicalLookupInputSchema } from './liturgical-lookup.js';
import { ControversiesInputSchema } from './controversies.js';
import { MorphologyOutputSchema } from './morphology.js';

describe('ThemesInputSchema.lemmas', () => {
  const schema = ThemesInputSchema;

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      lemmas: ['H2617a', 'H5315'],
      testament: 'ot',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lemmas).toEqual(['H2617a', 'H5315']);
    }
  });

  it('rejects a JSON-encoded string', () => {
    const result = schema.safeParse({
      lemmas: '["H2617a", "H5315"]',
      testament: 'ot',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      lemmas: '[not valid json]',
      testament: 'ot',
    });
    expect(result.success).toBe(false);
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      lemmas: '"this is just a string"',
      testament: 'ot',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty arrays', () => {
    const result = schema.safeParse({
      lemmas: [],
      testament: 'ot',
    });
    expect(result.success).toBe(false);
  });

  it('rejects arrays exceeding max length (100)', () => {
    const tooMany = Array(101).fill('H0001');
    const result = schema.safeParse({
      lemmas: tooMany,
      testament: 'ot',
    });
    expect(result.success).toBe(false);
  });
});

describe('strict mode contracts', () => {
  it('enforces vocabulary mode-specific fields', () => {
    expect(VocabularyInputSchema.safeParse({ mode: 'frequency', book: 'Romans' }).success).toBe(true);
    expect(VocabularyInputSchema.safeParse({ mode: 'theme', book: 'Romans', theme: 'joy' }).success).toBe(true);
    expect(VocabularyInputSchema.safeParse({ mode: 'frequency', book: 'Romans', theme: 'joy' }).success).toBe(false);
    expect(VocabularyInputSchema.safeParse({ mode: 'theme', book: 'Romans' }).success).toBe(false);
  });

  it('enforces lexicon selector modes and native arrays', () => {
    const parsed = LexiconInputSchema.parse({ mode: 'strongs', strongs_ids: ['G3056'] });
    expect(parsed.compact).toBe(false);
    expect(LexiconInputSchema.safeParse({ mode: 'strongs', strongs_ids: '["G3056"]' }).success).toBe(false);
    expect(LexiconInputSchema.safeParse({ mode: 'search', search: 'love', lemmas: ['ἀγάπη'] }).success).toBe(false);
  });

  it.each([
    [ConfessionalLookupInputSchema, { mode: 'list', document: 'westminster' }],
    [LiturgicalLookupInputSchema, { mode: 'list', season: 'advent' }],
    [ControversiesInputSchema, { mode: 'topic', topic: 'Daniel', category: 'dating' }],
  ])('rejects fields owned by a different mode', (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('enforces integer page bounds', () => {
    expect(DiscourseInputSchema.safeParse({ book: 'Mark', page_size: 0 }).success).toBe(false);
    expect(DiscourseInputSchema.safeParse({ book: 'Mark', page_size: 201 }).success).toBe(false);
    expect(DiscourseInputSchema.safeParse({ book: 'Mark', page_size: 1.5 }).success).toBe(false);
  });
});

describe('morphology output variants', () => {
  const common = {
    page: { returned: 0, total: 0 },
    book: 'John', range: '1:1', testament: 'nt' as const,
    summary: { total_words: 0, by_pos: {} },
  };

  it.each(['basic', 'syntax', 'full', 'lexical'] as const)('accepts the %s detail variant', detailLevel => {
    expect(MorphologyOutputSchema.safeParse({ ...common, detail_level: detailLevel, words: [] }).success).toBe(true);
  });

  it('rejects fields outside the selected detail variant', () => {
    const value = {
      ...common,
      detail_level: 'basic',
      words: [{
        verse: '1:1', position: 1, text: 'Ἐν', text_translit: 'En',
        normalized: 'ἐν', lemma: 'ἐν', pos: 'preposition', parsing: {}, strongs: 'G1722',
      }],
    };
    expect(MorphologyOutputSchema.safeParse(value).success).toBe(false);
  });
});

describe('lexicon output variants', () => {
  const common = { page: { returned: 1, total: 1 }, errors: [] };

  it('accepts a compact entry only in a compact response', () => {
    const compact = {
      ...common, response_type: 'search_compact', mode: 'search', detail_level: 'compact',
      entries: [{ strongs_id: 'G0026', gloss: 'love', transliteration: 'agape' }],
    };
    expect(LexiconOutputSchema.safeParse(compact).success).toBe(true);
    expect(LexiconOutputSchema.safeParse({
      ...compact, entries: [{ ...compact.entries[0], lsj_definition: 'love' }],
    }).success).toBe(false);
  });

  it('requires full fields in a full response', () => {
    expect(LexiconOutputSchema.safeParse({
      ...common, response_type: 'strongs_full', mode: 'strongs', detail_level: 'full',
      not_found: [], entries: [{
        strongs_id: 'G0026', gloss: 'love', transliteration: 'agape',
        lsj_definition: 'love', abbott_smith_definition: null, bdb_definition: null,
        ubs_semantic_domains: [], sources: ['lsj'],
      }],
    }).success).toBe(true);
  });
});

describe('LemmasInputSchema.lemmas', () => {
  const schema = LemmasInputSchema;

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      lemmas: ['H7462b', 'πατήρ'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lemmas).toEqual(['H7462b', 'πατήρ']);
    }
  });

  it('rejects a JSON-encoded string', () => {
    const result = schema.safeParse({
      lemmas: '["H7462b", "πατήρ"]',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      lemmas: '[broken',
    });
    expect(result.success).toBe(false);
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      lemmas: '123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty arrays', () => {
    const result = schema.safeParse({
      lemmas: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects arrays exceeding max length (50)', () => {
    const tooMany = Array(51).fill('H0001');
    const result = schema.safeParse({
      lemmas: tooMany,
    });
    expect(result.success).toBe(false);
  });
});

describe('DiscourseInputSchema.features', () => {
  const schema = DiscourseInputSchema;

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: ['historical_present', 'left_dislocation'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features).toEqual(['historical_present', 'left_dislocation']);
    }
  });

  it('rejects a JSON-encoded string', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '["historical_present", "left_dislocation"]',
    });
    expect(result.success).toBe(false);
  });

  it('accepts omitted optional features', () => {
    const result = schema.safeParse({
      book: 'Mark',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '[broken',
    });
    expect(result.success).toBe(false);
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '"just a string"',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown properties and applies the page-size default', () => {
    expect(schema.safeParse({ book: 'Mark', unexpected: true }).success).toBe(false);
    expect(schema.parse({ book: 'Mark' }).page_size).toBe(50);
  });
});
