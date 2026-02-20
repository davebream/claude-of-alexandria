import type { D1Database } from '@cloudflare/workers-types';

export type QueryResult = Record<string, unknown>[];

let _db: D1Database;

export function setDb(db: D1Database) {
  _db = db;
}

export async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const stmt = _db.prepare(sql);
  const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
  return result.results as QueryResult;
}

export async function queryFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const stmt = _db.prepare(sql);
  const result = params.length > 0 ? await stmt.bind(...params).first() : await stmt.first();
  return result as Record<string, unknown> | null;
}
