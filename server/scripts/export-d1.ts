import { fileURLToPath } from 'url';
import { dirname } from 'path';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

// ESM-compatible __dirname (safe in both CJS and ESM/tsx contexts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_DIR = join(__dirname, '..');
const OLD_SERVER_DIR = join(WORKER_DIR, '../claude-of-alexandria-mcp');
const DB_PATH = join(OLD_SERVER_DIR, 'data/biblical.sqlite');
const SCHEMA_SRC = join(WORKER_DIR, 'scripts/d1-schema.sql');
const OUT_DIR = join(WORKER_DIR, 'd1-seed');

const BATCH_SIZE = 5000;

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  // Escape single quotes in strings
  return `'${String(val).replace(/'/g, "''")}'`;
}

function rowsToInsertStatements(table: string, rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return '';
  const colList = columns.join(', ');
  return rows.map(row => {
    const values = columns.map(c => escapeValue(row[c])).join(', ');
    return `INSERT INTO ${table} (${colList}) VALUES (${values});`;
  }).join('\n');
}

async function main() {
  console.log('Loading database from:', DB_PATH);
  const dbBuffer = readFileSync(DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(dbBuffer);

  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Copy schema
  copyFileSync(SCHEMA_SRC, join(OUT_DIR, 'schema.sql'));
  console.log('Wrote d1-seed/schema.sql');

  // 2. Export small tables to data.sql
  const smallTables = [
    { name: 'discourse_features', cols: ['id', 'book', 'chapter', 'verse', 'feature', 'feature_description', 'word'] },
    { name: 'vocabulary', cols: ['id', 'book', 'testament', 'chapter', 'lemma', 'frequency'] },
    { name: 'vocabulary_clusters', cols: ['id', 'book', 'testament', 'lemma', 'concentration', 'chapter_start', 'chapter_end', 'total_occurrences'] },
    { name: 'thematic_keywords', cols: ['theme', 'lemma', 'testament'] },
  ];

  // The OT marker table (see server/migrations/0022 + 0023) is intentionally
  // excluded from smallTables: it is migration-sourced, not reseed-sourced.
  // Including it here would let a `seed-d1.sh` reseed silently revert the
  // corrected corpus — see CLAUDE.md's "A reseed can silently wipe a backfill" note.
  let dataSql = '-- Small tables (discourse_features, vocabulary, vocabulary_clusters, thematic_keywords)\n';

  for (const { name, cols } of smallTables) {
    const stmt = db.prepare(`SELECT ${cols.join(', ')} FROM ${name}`);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    console.log(`  ${name}: ${rows.length} rows`);
    if (rows.length > 0) {
      dataSql += rowsToInsertStatements(name, rows, cols) + '\n\n';
    }
  }

  writeFileSync(join(OUT_DIR, 'data.sql'), dataSql);
  console.log('Wrote d1-seed/data.sql');

  // 3. Export morphology in batches
  const morphCols = ['id', 'book', 'testament', 'chapter', 'verse', 'word_position', 'text', 'normalized', 'lemma', 'pos', 'parsing'];
  const countRow = db.exec('SELECT COUNT(*) FROM morphology')[0];
  const totalRows = countRow.values[0][0] as number;
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
  console.log(`  morphology: ${totalRows} rows → ${totalBatches} batches of ${BATCH_SIZE}`);

  for (let i = 0; i < totalBatches; i++) {
    const offset = i * BATCH_SIZE;
    const stmt = db.prepare(
      `SELECT ${morphCols.join(', ')} FROM morphology ORDER BY id LIMIT ? OFFSET ?`
    );
    stmt.bind([BATCH_SIZE, offset]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();

    const batchNum = String(i + 1).padStart(3, '0');
    const filename = `morphology-${batchNum}.sql`;
    let sql = `-- Morphology batch ${i + 1}/${totalBatches} (rows ${offset + 1}-${offset + rows.length})\n`;
    sql += rowsToInsertStatements('morphology', rows, morphCols) + '\n';
    writeFileSync(join(OUT_DIR, filename), sql);
    process.stdout.write(`\r  Wrote ${filename} (${i + 1}/${totalBatches})`);
  }
  console.log('\nExport complete.');
  console.log(`Output: ${OUT_DIR}/`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
