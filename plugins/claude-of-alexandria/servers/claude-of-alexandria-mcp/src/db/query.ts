import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

function getDbPath(): string {
  if (process.env.DATA_DIR) {
    return join(process.env.DATA_DIR, 'biblical.sqlite');
  }
  // Fallback: relative to dist/
  return join(__dirname, '../../data/biblical.sqlite');
}

async function getDb(): Promise<Database> {
  if (db) return db;

  const dbPath = getDbPath();
  let dbBuffer: Buffer;
  try {
    dbBuffer = readFileSync(dbPath);
  } catch {
    throw new Error(`Database not found at ${dbPath}. Run 'npm run build:db' first.`);
  }

  const SQL = await initSqlJs();
  db = new SQL.Database(dbBuffer);
  return db;
}

export type QueryResult = Record<string, unknown>[];

export async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params as Parameters<typeof stmt.bind>[0]);
  const rows: QueryResult = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
}

export async function queryFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

// Expand compact NT parsing back to full form for API responses
const KEY_EXPAND: Record<string, string> = {
  c: 'case', n: 'number', g: 'gender', t: 'tense',
  v: 'voice', m: 'mood', p: 'person', d: 'degree',
};
const VAL_EXPAND: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative',
  sg: 'singular', pl: 'plural', du: 'dual',
  mas: 'masculine', fem: 'feminine', neu: 'neuter',
  prs: 'present', aor: 'aorist', prf: 'perfect', ipf: 'imperfect',
  fut: 'future', plpf: 'pluperfect',
  act: 'active', mid: 'middle', pas: 'passive',
  ind: 'indicative', sub: 'subjunctive', opt: 'optative',
  imp: 'imperative', inf: 'infinitive', ptc: 'participle',
  cmp: 'comparative', sup: 'superlative',
};

export function expandParsing(compact: string | null): Record<string, string> | null {
  if (!compact) return null;
  try {
    const obj = JSON.parse(compact) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[KEY_EXPAND[k] ?? k] = VAL_EXPAND[v] ?? v;
    }
    return out;
  } catch {
    return null;
  }
}
