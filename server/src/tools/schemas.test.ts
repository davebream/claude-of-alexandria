import { describe, it } from 'node:test';
import assert from 'node:assert';
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
    assert.strictEqual(result.success, true, 'Should accept native array');
    if (result.success) {
      assert.deepStrictEqual(result.data.lemmas, ['H2617a', 'H5315']);
    }
  });

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    // This is what XML-based tool callers send:
    // <parameter name="lemmas">["H2617a", "H5315"]</parameter>
    // The XML parser sends the content as a string literal.
    const result = schema.safeParse({
      lemmas: '["H2617a", "H5315"]',  // string, not array
      testament: 'ot',
    });
    assert.strictEqual(result.success, true, 'Should accept JSON-encoded string');
    if (result.success) {
      assert.deepStrictEqual(result.data.lemmas, ['H2617a', 'H5315']);
    }
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      lemmas: '[not valid json]',
      testament: 'ot',
    });
    assert.strictEqual(result.success, false, 'Should reject invalid JSON');
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      lemmas: '"this is just a string"',
      testament: 'ot',
    });
    assert.strictEqual(result.success, false, 'Should reject non-array JSON');
  });

  it('rejects empty arrays', () => {
    const result = schema.safeParse({
      lemmas: [],
      testament: 'ot',
    });
    assert.strictEqual(result.success, false, 'Should reject empty array');
  });

  it('rejects arrays exceeding max length (100)', () => {
    const tooMany = Array(101).fill('H0001');
    const result = schema.safeParse({
      lemmas: tooMany,
      testament: 'ot',
    });
    assert.strictEqual(result.success, false, 'Should reject >100 items');
  });
});

describe('LemmasInputSchema.lemmas', () => {
  const schema = schemaFromShape(LemmasInputSchema);

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      lemmas: ['H7462b', 'πατήρ'],
    });
    assert.strictEqual(result.success, true, 'Should accept native array');
    if (result.success) {
      assert.deepStrictEqual(result.data.lemmas, ['H7462b', 'πατήρ']);
    }
  });

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    const result = schema.safeParse({
      lemmas: '["H7462b", "πατήρ"]',  // string, not array
    });
    assert.strictEqual(result.success, true, 'Should accept JSON-encoded string');
    if (result.success) {
      assert.deepStrictEqual(result.data.lemmas, ['H7462b', 'πατήρ']);
    }
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      lemmas: '[broken',
    });
    assert.strictEqual(result.success, false, 'Should reject invalid JSON');
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      lemmas: '123',  // valid JSON, but not an array
    });
    assert.strictEqual(result.success, false, 'Should reject non-array JSON');
  });

  it('rejects empty arrays', () => {
    const result = schema.safeParse({
      lemmas: [],
    });
    assert.strictEqual(result.success, false, 'Should reject empty array');
  });

  it('rejects arrays exceeding max length (50)', () => {
    const tooMany = Array(51).fill('H0001');
    const result = schema.safeParse({
      lemmas: tooMany,
    });
    assert.strictEqual(result.success, false, 'Should reject >50 items');
  });
});

describe('DiscourseInputSchema.features', () => {
  const schema = schemaFromShape(DiscourseInputSchema);

  it('accepts a native JSON array', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: ['historical_present', 'left_dislocation'],
    });
    assert.strictEqual(result.success, true, 'Should accept native array');
    if (result.success) {
      assert.deepStrictEqual(result.data.features, ['historical_present', 'left_dislocation']);
    }
  });

  it('accepts a JSON-encoded string (XML tool call format)', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '["historical_present", "left_dislocation"]',  // string, not array
    });
    assert.strictEqual(result.success, true, 'Should accept JSON-encoded string');
    if (result.success) {
      assert.deepStrictEqual(result.data.features, ['historical_present', 'left_dislocation']);
    }
  });

  it('accepts omitted optional features', () => {
    const result = schema.safeParse({
      book: 'Mark',
    });
    assert.strictEqual(result.success, true, 'Should accept missing optional features');
  });

  it('rejects invalid JSON strings', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '[broken',
    });
    assert.strictEqual(result.success, false, 'Should reject invalid JSON');
  });

  it('rejects JSON strings that are not arrays', () => {
    const result = schema.safeParse({
      book: 'Mark',
      features: '"just a string"',  // valid JSON, but not an array
    });
    assert.strictEqual(result.success, false, 'Should reject non-array JSON');
  });
});
