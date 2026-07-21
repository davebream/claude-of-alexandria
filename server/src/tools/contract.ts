import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;
export const RESPONSE_CHARACTER_LIMIT = 25_000;

export const PaginationInputShape = {
  page_size: z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT)
    .describe(`Maximum records requested per page (default: ${PAGE_SIZE_DEFAULT}, max: ${PAGE_SIZE_MAX}). A response may contain fewer records to stay within the response-size budget.`),
  cursor: z.string().min(1).max(2048).optional()
    .describe('Opaque continuation cursor from page.next_cursor. It is valid only with the same tool and filters.'),
};

export const PageSchema = z.strictObject({
  returned: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  next_cursor: z.string().optional(),
});

export const ToolErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/**
 * SDK v1.29 only serializes object-root schemas during tools/list. Preserve a
 * discriminated union's validation while presenting its complete oneOf under
 * an object root; remove this adapter when the stable v2 SDK supports unions.
 */
export function mcpObjectSchema<T extends z.ZodType>(schema: T): T {
  const definition = (schema as z.ZodType & { _zod?: { def?: { type?: string } } })._zod?.def;
  if (definition?.type !== 'union') return schema;

  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const variants = (jsonSchema.oneOf ?? jsonSchema.anyOf) as Array<Record<string, unknown>> | undefined;
  if (!variants) return schema;

  const propertyNames = new Set<string>();
  const propertyVariants = new Map<string, Array<Record<string, unknown>>>();
  for (const variant of variants) {
    const properties = variant.properties as Record<string, unknown> | undefined;
    if (properties) {
      for (const [name, property] of Object.entries(properties)) {
        propertyNames.add(name);
        const candidates = propertyVariants.get(name) ?? [];
        if (!candidates.some(candidate => stableStringify(candidate) === stableStringify(property))) {
          candidates.push(property as Record<string, unknown>);
        }
        propertyVariants.set(name, candidates);
      }
    }
  }
  const shape = Object.fromEntries(
    [...propertyNames].map(name => [name, z.unknown().optional()]),
  );
  const properties = Object.fromEntries(
    [...propertyVariants].map(([name, candidates]) => {
      const description = candidates.find(candidate => typeof candidate.description === 'string')?.description;
      return [
        name,
        candidates.length === 1
          ? candidates[0]
          : { anyOf: candidates, ...(description ? { description } : {}) },
      ];
    }),
  );
  const compatible = z.strictObject(shape).superRefine((value, context) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
      }
    }
  }).meta({ properties, oneOf: variants });
  return compatible as unknown as T;
}

interface CursorPayload {
  v: 1;
  tool: string;
  cache_version: string;
  query_hash: string;
  offset: number;
  last_sort_key: string;
  signature: string;
}

export interface PaginationConfig {
  tool: string;
  args: Record<string, unknown>;
  cacheVersion: string;
  result: CallToolResult;
  getRecords: (data: Record<string, unknown>) => unknown[];
  replaceRecords: (
    data: Record<string, unknown>,
    records: unknown[],
  ) => Record<string, unknown>;
}

class CursorError extends Error {
  constructor(readonly code: 'INVALID_CURSOR' | 'CURSOR_FILTER_MISMATCH' | 'CURSOR_EXPIRED', message: string) {
    super(message);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cursorFilters(args: Record<string, unknown>): Record<string, unknown> {
  const { cursor: _cursor, page_size: _pageSize, ...filters } = args;
  return filters;
}

async function decodeCursor(
  cursor: string,
  expected: { tool: string; cacheVersion: string; queryHash: string; records: unknown[] },
): Promise<CursorPayload> {
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(cursor));
  } catch {
    throw new CursorError('INVALID_CURSOR', 'The cursor is malformed. Restart from the first page.');
  }

  const parsed = z.strictObject({
    v: z.literal(1),
    tool: z.string(),
    cache_version: z.string(),
    query_hash: z.string(),
    offset: z.number().int().nonnegative(),
    last_sort_key: z.string(),
    signature: z.string(),
  }).safeParse(payload);
  if (!parsed.success) {
    throw new CursorError('INVALID_CURSOR', 'The cursor is malformed. Restart from the first page.');
  }
  const { signature, ...unsigned } = parsed.data;
  if (signature !== await sha256(unsigned)) {
    throw new CursorError('INVALID_CURSOR', 'The cursor failed its integrity check. Restart from the first page.');
  }
  if (parsed.data.tool !== expected.tool || parsed.data.offset > expected.records.length) {
    throw new CursorError('INVALID_CURSOR', 'The cursor is invalid for this tool. Restart from the first page.');
  }
  if (parsed.data.cache_version !== expected.cacheVersion) {
    throw new CursorError('CURSOR_EXPIRED', 'The underlying dataset version changed. Restart from the first page.');
  }
  if (parsed.data.query_hash !== expected.queryHash) {
    throw new CursorError('CURSOR_FILTER_MISMATCH', 'The cursor was created with different filters. Reuse the original filters or restart.');
  }
  if (parsed.data.offset > 0) {
    const actualSortKey = await sha256(expected.records[parsed.data.offset - 1]);
    if (actualSortKey !== parsed.data.last_sort_key) {
      throw new CursorError('CURSOR_EXPIRED', 'The result ordering changed. Restart from the first page.');
    }
  }
  return parsed.data;
}

async function encodeCursor(
  tool: string,
  cacheVersion: string,
  queryHash: string,
  offset: number,
  afterRecord: unknown,
): Promise<string> {
  const unsigned = {
    v: 1,
    tool,
    cache_version: cacheVersion,
    query_hash: queryHash,
    offset,
    last_sort_key: await sha256(afterRecord),
  } as const;
  const payload: CursorPayload = { ...unsigned, signature: await sha256(unsigned) };
  return base64UrlEncode(JSON.stringify(payload));
}

export async function paginateCallResult(config: PaginationConfig): Promise<CallToolResult> {
  if (config.result.isError || !config.result.structuredContent) return config.result;

  const source = config.result.structuredContent as Record<string, unknown>;
  const records = config.getRecords(source);
  const pageSize = typeof config.args.page_size === 'number' ? config.args.page_size : PAGE_SIZE_DEFAULT;
  const queryHash = await sha256(cursorFilters(config.args));

  let offset = 0;
  try {
    if (typeof config.args.cursor === 'string') {
      offset = (await decodeCursor(config.args.cursor, {
        tool: config.tool,
        cacheVersion: config.cacheVersion,
        queryHash,
        records,
      })).offset;
    }
  } catch (error) {
    if (error instanceof CursorError) return toolError(error.code, error.message);
    throw error;
  }

  const upperBound = Math.min(offset + pageSize, records.length);
  let end = offset;
  for (let candidateEnd = offset + 1; candidateEnd <= upperBound; candidateEnd += 1) {
    const candidate = config.replaceRecords(source, records.slice(offset, candidateEnd));
    const probe = { ...candidate, page: { returned: candidateEnd - offset, total: records.length } };
    if (JSON.stringify(probe).length > RESPONSE_CHARACTER_LIMIT) break;
    end = candidateEnd;
  }

  if (end === offset && offset < records.length) {
    return toolError('RESULT_TOO_LARGE', 'One result record exceeds the response-size budget. Narrow the query or request a more compact detail level.');
  }

  let nextCursor: string | undefined;
  if (end < records.length) {
    nextCursor = await encodeCursor(config.tool, config.cacheVersion, queryHash, end, records[end - 1]);
  }
  const pageRecords = records.slice(offset, end);
  const data = {
    ...config.replaceRecords(source, pageRecords),
    page: {
      returned: pageRecords.length,
      total: records.length,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    },
  };

  if (JSON.stringify(data).length > RESPONSE_CHARACTER_LIMIT) {
    if (pageRecords.length > 1) {
      return paginateCallResult({ ...config, args: { ...config.args, page_size: pageRecords.length - 1 } });
    }
    return toolError('RESULT_TOO_LARGE', 'The fixed response metadata exceeds the response-size budget. Narrow the query or request a more compact detail level.');
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function successResult<T extends z.ZodType>(schema: T, value: unknown): CallToolResult {
  const data = schema.parse(value) as Record<string, unknown>;
  const text = JSON.stringify(data);
  return {
    content: [{ type: 'text', text }],
    structuredContent: data,
  };
}

export function toolError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): CallToolResult {
  const value = ToolErrorSchema.parse({
    error: { code, message, ...(details ? { details } : {}) },
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    isError: true,
  };
}
