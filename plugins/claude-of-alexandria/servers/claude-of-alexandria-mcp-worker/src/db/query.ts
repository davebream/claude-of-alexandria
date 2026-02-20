import type { D1Database } from '@cloudflare/workers-types';

export type QueryResult = Record<string, unknown>[];

let _db: D1Database;

export function setDb(db: D1Database) {
  _db = db;
}

export async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const result = await _db.prepare(sql).bind(...params).all();
  return result.results as QueryResult;
}

export async function queryFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const result = await _db.prepare(sql).bind(...params).first();
  return result as Record<string, unknown> | null;
}
