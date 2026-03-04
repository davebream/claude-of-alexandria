import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the schemas we're testing
import { ThemesInputSchema } from './themes.js';
import { LemmasInputSchema } from './lemmas.js';
import { DiscourseInputSchema } from './discourse.js';

// Helper to create a Zod object from the raw shape (matching what MCP SDK does)
function schemaFromShape(shape: Record<string, z.ZodTypeAny>) {
  return z.object(shape);
}

describe('ThemesInputSchema.lemmas', () => {
  const schema = schemaFromShape(ThemesInputSchema);

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

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    const result = schema.safeParse({
      lemmas: '["H2617a", "H5315"]',
      testament: 'ot',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lemmas).toEqual(['H2617a', 'H5315']);
    }
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

describe('LemmasInputSchema.lemmas', () => {
  const schema = schemaFromShape(LemmasInputSchema);

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      lemmas: ['H7462b', 'πατήρ'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lemmas).toEqual(['H7462b', 'πατήρ']);
    }
  });

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    const result = schema.safeParse({
      lemmas: '["H7462b", "πατήρ"]',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lemmas).toEqual(['H7462b', 'πατήρ']);
    }
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
  const schema = schemaFromShape(DiscourseInputSchema);

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

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '["historical_present", "left_dislocation"]',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features).toEqual(['historical_present', 'left_dislocation']);
    }
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
});
