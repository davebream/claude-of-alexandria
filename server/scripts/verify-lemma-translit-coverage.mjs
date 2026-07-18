#!/usr/bin/env node
/**
 * Hebrew lemma-transliteration coverage gate.
 *
 * This is the AUTHORITATIVE, BLOCKING guard that stands between the generated
 * lemma_translit SQL and a production D1 apply. It exists to catch the one
 * failure the downstream consumers cannot report on their own: silently
 * shipping an all-null (or partial) Hebrew lemma_translit, where every OT
 * vocabulary / themes / morphology lookup degrades to `lemma_translit: null`
 * with no error. The consumer tables' EXISTS-guarded joins make a coverage hole
 * indistinguishable from a legitimately-absent value, so nothing but an explicit
 * anti-join can detect it — hence this gate.
 *
 * Mechanism: load the generated SQL into a LOCAL scratch sqlite (sql.js, WASM,
 * no native binary, no prod contact), then run three checks. It NEVER touches
 * production; the workflow fetches the consumer keys from prod and hands them in
 * as JSON files so this script stays a pure, unit-testable function of its inputs.
 *
 *   (a) self-consistency  — scratch row counts equal the baseline JSON's
 *                           lemma_rows / (strongs_rows_exact + strongs_rows_base).
 *   (b) strongs-space      — every distinct OT vocabulary.lemma / thematic_keywords.lemma
 *                           (these columns hold Strong's numbers for OT — see
 *                           server/src/tools/vocabulary.ts) resolves to a row in
 *                           scratch lemma_translit_he_strongs. Any miss → gap.
 *   (c) lemma-space        — every distinct non-empty OT morphology.lemma (pointed
 *                           Hebrew) resolves to a row in scratch lemma_translit_he,
 *                           EXCEPT keys that fall into an enumerated baseline
 *                           exclusion (empty, or unpointed/consonantal — which are
 *                           deliberately never transliterated). Any UNexplained
 *                           miss → gap.
 *
 * Exit non-zero if (a), (b), or (c) shows a gap. On empty consumer input the
 * anti-joins pass trivially (count 0).
 *
 * Usage:
 *   node scripts/verify-lemma-translit-coverage.mjs \
 *     --sql-dir <dir with lemma_translit_he.sql + lemma_translit_he_strongs.sql> \
 *     --baseline <lemma-translit-baseline.json> \
 *     --strongs-keys <consumer strongs keys JSON (wrangler --json or array)> \
 *     --lemma-keys <consumer lemma keys JSON (wrangler --json or array)> \
 *     [--migration <0021 migration .sql; default: ../migrations/0021_add_hebrew_lemma_translit.sql>] \
 *     [--strongs-column <name; default: lemma>] [--lemma-column <name; default: lemma>]
 */

import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Niqqud-presence predicate — MIRRORS hasNiqqud() in generate-lemma-translit.ts.
 * A lemma failing this is a consonantal skeleton, deliberately never
 * transliterated (the "never guess" rule), so its absence from lemma_translit_he
 * is EXPECTED, not a gap. The Unicode vowel-point ranges are a fixed fact; if the
 * generator's predicate ever changes, change it here too.
 */
export function hasNiqqud(lemma) {
  for (const ch of lemma) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x05b0 && cp <= 0x05bc) || cp === 0x05c7) return true;
  }
  return false;
}

/**
 * Unpadded strongs spelling — MIRRORS unpad() in generate-lemma-translit.ts.
 * Strip leading zeros from the numeric portion, preserving H + trailing suffix.
 * `H0001`->`H1`, `H0871a`->`H871a`, `H1090a`->`H1090a`. Non-numeric: unchanged.
 */
export function unpad(strongs) {
  const m = /^H(\d+)([a-z])?$/.exec(strongs);
  if (!m) return strongs;
  const num = m[1].replace(/^0+/, '') || '0';
  return `H${num}${m[2] ?? ''}`;
}

/**
 * Padded strongs spelling — the inverse of unpad, zero-padding the numeric
 * portion to at least 4 digits (matching morphology.strongs / the emit).
 * `H1`->`H0001`, `H14`->`H0014`, `H871a`->`H0871a`, `H1090a`->`H1090a`. A number
 * already >= 4 digits, or a non-numeric strongs, is returned unchanged.
 */
export function pad(strongs) {
  const m = /^H(\d+)([a-z])?$/.exec(strongs);
  if (!m) return strongs;
  const num = m[1].length >= 4 ? m[1] : m[1].padStart(4, '0');
  return `H${num}${m[2] ?? ''}`;
}

/**
 * Normalize consumer-key JSON into a deduped array of string keys.
 * Accepts, in order:
 *   - an array of strings                       → used directly
 *   - the `wrangler d1 execute --json` shape    → [{ results: [{col: val}, …] }, …]
 *   - a bare { results: [...] } object          → single-statement result
 *   - an array of row objects                   → [{col: val}, …]
 * `column` selects the field to pluck from row objects (default "lemma").
 * null/undefined values are dropped; order-preserving dedupe.
 */
export function extractKeys(json, column = 'lemma') {
  let rows;
  if (Array.isArray(json)) {
    if (json.length === 0) return [];
    if (typeof json[0] === 'string') return dedupe(json);
    if (json[0] && Array.isArray(json[0].results)) {
      rows = json.flatMap((stmt) => stmt.results ?? []);
    } else {
      rows = json;
    }
  } else if (json && Array.isArray(json.results)) {
    rows = json.results;
  } else {
    throw new Error('Unrecognized consumer-key JSON shape');
  }
  return dedupe(rows.map((r) => r[column]));
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ─── Scratch DB ───────────────────────────────────────────────────────────────

/**
 * Build a fresh in-memory scratch DB: apply the migration CREATE statements,
 * then load the generated table SQL (each a self-contained
 * BEGIN; DELETE; INSERT…; COMMIT; block). SQL args are strings so this is
 * directly unit-testable without touching the filesystem.
 */
export function buildScratchDb(SQL, { migrationSql, lemmaSql, strongsSql }) {
  const db = new SQL.Database();
  db.run(migrationSql);
  if (lemmaSql) db.run(lemmaSql);
  if (strongsSql) db.run(strongsSql);
  return db;
}

/** Return a single scalar (first column of first row) from a query. */
function scalar(db, sql) {
  const res = db.exec(sql);
  if (res.length === 0 || res[0].values.length === 0) return undefined;
  return res[0].values[0][0];
}

/** Return the set of first-column values for a query. */
export function columnSet(db, sql) {
  const res = db.exec(sql);
  const set = new Set();
  if (res.length === 0) return set;
  for (const row of res[0].values) set.add(String(row[0]));
  return set;
}

// ─── Gate checks ──────────────────────────────────────────────────────────────

/** (a) scratch row counts equal the baseline's declared counts. */
export function checkSelfConsistency(db, baseline) {
  const lemmaActual = Number(scalar(db, 'SELECT COUNT(*) FROM lemma_translit_he'));
  const strongsActual = Number(scalar(db, 'SELECT COUNT(*) FROM lemma_translit_he_strongs'));
  const lemmaExpected = baseline.lemma_rows;
  const strongsExpected = baseline.strongs_rows_exact + baseline.strongs_rows_base;
  const ok = lemmaActual === lemmaExpected && strongsActual === strongsExpected;
  return { ok, lemmaActual, lemmaExpected, strongsActual, strongsExpected };
}

/**
 * (b) Attestation-aware strongs-space check. An unresolved consumer strongs is
 * classified against the generated table's key set:
 *
 *   - would-be-bug (BLOCKS): a padding-sibling of the consumer key (its `pad`
 *     or `unpad` spelling) IS a table key, yet the consumer's exact spelling is
 *     not. The table has both a padded and an unpadded spelling for EVERY
 *     attested strongs (a pointed lemma exists to serve), so a sibling being
 *     present while the exact spelling is absent means a spelling the generator
 *     should have emitted was dropped — the real silent-null bug (this is what
 *     the padding mismatch was). After the generator fix this count is 0; a
 *     regression in the unpadded/padded emission would push it above 0.
 *
 *   - explained-absence (does NOT block, but is counted): NO spelling of the
 *     key is a table key — no pointed lemma is attested for this strongs under
 *     any spelling (unpointed-only, or a sense-suffix / Aramaic strongs MACULA
 *     does not attest). null is the correct honest answer here (never guess),
 *     so it is a known coverage boundary, not a bug.
 *
 * NOTE: a DOWNWARD base variant (base(H1004b)=H1004) is deliberately NOT treated
 * as a resolving sibling: H1004b is a distinct sense the corpus does not attest,
 * and serving it the base family's transliteration would be a guess. Only exact
 * padding-siblings (same digits + same suffix) count.
 */
export function checkStrongsSpace(db, consumerStrongsKeys) {
  const present = columnSet(db, 'SELECT strongs FROM lemma_translit_he_strongs');
  const wouldBeBug = [];
  const explainedAbsence = [];
  for (const k of consumerStrongsKeys) {
    if (present.has(k)) continue; // resolves directly
    const siblings = [pad(k), unpad(k)].filter((s) => s !== k);
    if (siblings.some((s) => present.has(s))) {
      wouldBeBug.push(k);
    } else {
      explainedAbsence.push(k);
    }
  }
  return {
    ok: wouldBeBug.length === 0,
    wouldBeBug,
    explainedAbsence,
    consumerCount: consumerStrongsKeys.length,
  };
}

/**
 * (c) every consumer lemma key resolves in lemma_translit_he, minus keys that
 * fall into an enumerated baseline exclusion (empty or unpointed). Only an
 * UNexplained miss is a gap.
 */
export function checkLemmaSpace(db, consumerLemmaKeys) {
  const present = columnSet(db, 'SELECT lemma FROM lemma_translit_he');
  const missing = consumerLemmaKeys.filter((k) => !present.has(k));
  const explained = [];
  const unexplained = [];
  for (const k of missing) {
    if (k === '' || !hasNiqqud(k)) explained.push(k);
    else unexplained.push(k);
  }
  return {
    ok: unexplained.length === 0,
    unexplained,
    explained,
    consumerCount: consumerLemmaKeys.length,
  };
}

/**
 * Run all three checks against an already-built scratch DB. Returns a structured
 * result; the caller decides how to render / exit.
 */
export function runChecks(db, { baseline, strongsConsumerKeys, lemmaConsumerKeys }) {
  const a = checkSelfConsistency(db, baseline);
  const b = checkStrongsSpace(db, strongsConsumerKeys);
  const c = checkLemmaSpace(db, lemmaConsumerKeys);
  return { pass: a.ok && b.ok && c.ok, a, b, c };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function sample(arr, n = 20) {
  return arr.length <= n ? arr : arr.slice(0, n).concat([`… (+${arr.length - n} more)`]);
}

export function formatReport(result) {
  const { a, b, c } = result;
  const lines = [];
  lines.push('=== Hebrew lemma-translit coverage gate ===');
  lines.push(
    `(a) self-consistency: ${a.ok ? 'PASS' : 'FAIL'} — ` +
      `lemma ${a.lemmaActual}/${a.lemmaExpected}, strongs ${a.strongsActual}/${a.strongsExpected}`,
  );
  lines.push(
    `(b) strongs-space anti-join: ${b.ok ? 'PASS' : 'FAIL'} — ` +
      `${b.consumerCount} consumer keys, ${b.wouldBeBug.length} would-be-bug (derivable but missing), ` +
      `${b.explainedAbsence.length} explained-absence (no pointed lemma — honest null)`,
  );
  if (!b.ok) lines.push(`    would-be-bug strongs: ${JSON.stringify(sample(b.wouldBeBug))}`);
  lines.push(
    `(c) lemma-space anti-join: ${c.ok ? 'PASS' : 'FAIL'} — ` +
      `${c.consumerCount} consumer keys, ${c.explained.length} explained (excluded), ` +
      `${c.unexplained.length} unexplained`,
  );
  if (!c.ok) lines.push(`    unexplained lemmas: ${JSON.stringify(sample(c.unexplained))}`);
  lines.push(result.pass ? 'GATE PASSED.' : 'GATE FAILED — refusing to apply to production D1.');
  return lines.join('\n');
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new Error(`Expected a --flag, got ${JSON.stringify(flag)}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    args[flag.slice(2)] = value;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const sqlDir = args['sql-dir'];
  const baselinePath = args.baseline;
  const strongsKeysPath = args['strongs-keys'];
  const lemmaKeysPath = args['lemma-keys'];
  if (!sqlDir || !baselinePath || !strongsKeysPath || !lemmaKeysPath) {
    console.error(
      'usage: verify-lemma-translit-coverage.mjs --sql-dir <dir> --baseline <json> ' +
        '--strongs-keys <json> --lemma-keys <json> [--migration <sql>] ' +
        '[--strongs-column <name>] [--lemma-column <name>]',
    );
    return 2;
  }
  const migrationPath =
    args.migration ?? join(__dirname, '..', 'migrations', '0021_add_hebrew_lemma_translit.sql');
  const strongsColumn = args['strongs-column'] ?? 'lemma';
  const lemmaColumn = args['lemma-column'] ?? 'lemma';

  const migrationSql = readFileSync(migrationPath, 'utf8');
  const lemmaSql = readFileSync(join(sqlDir, 'lemma_translit_he.sql'), 'utf8');
  const strongsSql = readFileSync(join(sqlDir, 'lemma_translit_he_strongs.sql'), 'utf8');
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const strongsConsumerKeys = extractKeys(
    JSON.parse(readFileSync(strongsKeysPath, 'utf8')),
    strongsColumn,
  );
  const lemmaConsumerKeys = extractKeys(
    JSON.parse(readFileSync(lemmaKeysPath, 'utf8')),
    lemmaColumn,
  );

  const SQL = await initSqlJs();
  const db = buildScratchDb(SQL, { migrationSql, lemmaSql, strongsSql });
  const result = runChecks(db, { baseline, strongsConsumerKeys, lemmaConsumerKeys });
  db.close();

  console.log(formatReport(result));
  return result.pass ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('Fatal error:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
