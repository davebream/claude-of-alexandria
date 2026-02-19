import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function createDatabase(dbPath: string): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  // Execute each statement separately
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    db.run(stmt);
  }

  return db;
}

export function saveDatabase(db: Database, dbPath: string): void {
  const { writeFileSync, mkdirSync } = require('fs');
  const { dirname } = require('path');
  mkdirSync(dirname(dbPath), { recursive: true });
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}
