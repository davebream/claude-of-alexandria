/**
 * Hebrew lemma transliteration SQL generator.
 *
 * Reads the emit TSV produced by emit-lemma-strongs.py (`lemma\tstrongs\tcount`
 * per line), transliterates each pointed lemma to SBL Academic (spirantized),
 * and writes chunked INSERT SQL for two D1 lookup tables plus a JSON counts
 * baseline sidecar:
 *
 *   lemma_translit_he(lemma PRIMARY KEY, transliteration NOT NULL)
 *       one row per distinct pointed lemma.
 *   lemma_translit_he_strongs(strongs PRIMARY KEY, transliteration NOT NULL)
 *       one row per distinct EXACT strongs (as attested) PLUS one row per
 *       distinct BASE strongs (single trailing lowercase letter stripped) that
 *       is not already an attested exact key.
 *
 * Load-bearing invariants:
 *   - NFC is applied to every transliteration VALUE (the library emits
 *     spirantized letters decomposed with combining U+0331; we store the
 *     precomposed form). NFC is NEVER applied to a lemma KEY — the lemma bytes
 *     must stay byte-identical to what emit produced, because the backfill
 *     joins morphology.lemma on exact bytes.
 *   - Unpointed lemmas (no niqqud) are EXCLUDED, never transliterated: a
 *     consonantal skeleton would otherwise transliterate to a guessed vowelless
 *     value. This implements the "never guess" rule.
 *   - Representative tie-break is total and deterministic: highest occurrence
 *     count first, ties broken by the lexicographically smallest lemma UTF-8
 *     byte sequence.
 *
 * Usage:
 *   cd server && npx tsx scripts/generate-lemma-translit.ts <in.tsv> <out-dir>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { transliterate } from 'hebrew-transliteration';
import { sblAcademicSpirantization } from 'hebrew-transliteration/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Column locks (arity: INSERT header vs value tuples must stay in sync) ────
export const LEMMA_COLUMNS = ['lemma', 'transliteration'] as const;
export const STRONGS_COLUMNS = ['strongs', 'transliteration'] as const;

// Per-INSERT-statement byte cap (mirrors the extractor's STAGING_STMT_MAX_BYTES).
export const STMT_MAX_BYTES = 100000;

// Installed library version, recorded in the baseline for provenance.
export const LIBRARY_VERSION: string = (() => {
  const require = createRequire(import.meta.url);
  return require('hebrew-transliteration/package.json').version as string;
})();

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Row {
  lemma: string;
  strongs: string;
  count: number;
}

export interface Entry {
  key: string;
  value: string;
}

export interface Baseline {
  lemma_rows: number;
  strongs_rows_exact: number;
  strongs_rows_base: number;
  // Safe-suffix alias rows (decisions/0008): sense-suffixed consumer keys whose
  // base attests exactly one pointed lemma. Folded into the gate's row-count oracle.
  strongs_rows_alias: number;
  excluded: { empty: number; unpointed: number; subsegment: number };
  // The exact alias keys emitted above — the gate treats a declared key that is
  // absent from the shipped table as a blocking regression, not an honest null.
  safe_recoverable_strongs: string[];
  library_version: string;
}

export interface Tables {
  lemmaEntries: Entry[];
  strongsEntries: Entry[];
  baseline: Baseline;
}

/** Per-base transliteration facts over a base strongs' pointed lemmas. */
export interface BaseInfo {
  /** Distinct SBL transliterations attested across the base's pointed lemmas. */
  translits: Set<string>;
  /** Highest-count representative (equals the sole translit when singleton). */
  representative: string;
}

/** Verdict for a sense-suffixed consumer key under the safe-recovery rule. */
export type SuffixVerdict =
  | { kind: 'not-suffixed' }
  | { kind: 'already-emitted' }
  | { kind: 'safe-recover'; value: string }
  | { kind: 'keep-null'; reason: 'homograph' | 'no-attested-base' };

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Transliterate a pointed Hebrew lemma to SBL Academic (spirantized), then
 * NFC-normalize the VALUE so spirantized letters are stored precomposed.
 */
export function transliterateLemma(lemma: string): string {
  return transliterate(lemma, sblAcademicSpirantization).normalize('NFC');
}

/**
 * Niqqud-presence predicate: true iff the lemma carries at least one Hebrew
 * vowel point (U+05B0–U+05BC) or qamats qatan / holam-like sof (U+05C7).
 * A lemma that FAILS this is a consonantal skeleton and is excluded upstream.
 */
export function hasNiqqud(lemma: string): boolean {
  for (const ch of lemma) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x05b0 && cp <= 0x05bc) || cp === 0x05c7) return true;
  }
  return false;
}

/**
 * Base strongs form: strip a single trailing lowercase letter (`H7225a` ->
 * `H7225`). A strongs with no trailing lowercase letter is its own base.
 */
export function baseStrongs(strongs: string): string {
  return strongs.replace(/[a-z]$/, '');
}

/**
 * Unpadded strongs spelling: strip leading zeros from the numeric portion,
 * preserving the `H` prefix and any single trailing lowercase suffix letter.
 *
 * This exists because the two OT consumers of lemma_translit_he_strongs disagree
 * on strongs spelling: morphology.strongs (and therefore this generator's emit,
 * which shares the extractor's derivation) is ZERO-PADDED to 4 digits (`H0001`,
 * `H0871a`), but vocabulary.lemma / thematic_keywords.lemma are UNPADDED (`H1`,
 * `H127`, `H1090a`). A 4-digit strongs already coincides; 1–3 digit strongs miss.
 * Emitting the unpadded spelling as an extra key (same representative value)
 * closes that gap.
 *
 * Examples: `H0001`->`H1`, `H0014`->`H14`, `H0871a`->`H871a`, `H0871`->`H871`,
 * `H1090a`->`H1090a` (already unpadded), `H430`->`H430`. A non-numeric strongs
 * (a raw upstream value) does not match and is returned unchanged.
 */
export function unpad(strongs: string): string {
  const m = /^H(\d+)([a-z])?$/.exec(strongs);
  if (!m) return strongs;
  const num = m[1].replace(/^0+/, '') || '0';
  return `H${num}${m[2] ?? ''}`;
}

/**
 * Classify a consumer OT Strong's key for safe-suffix recovery (decisions/0008).
 *
 * A sense-suffixed consumer key (e.g. `H1121a`, from the vocabulary namespace)
 * that has no exact/derived row already emitted resolves to its BASE strongs'
 * transliteration IFF the base attests exactly one distinct pointed lemma — a
 * singleton has no alternative sense to guess wrong, so serving it is the corpus
 * answer, not a guess. A homograph base (≥2 distinct romanizations), an
 * unattested base, or an already-emitted key all decline (the key stays null).
 *
 * Pure: no I/O. `baseInfo` is keyed by the UNPADDED base spelling; the lookup
 * unpads the consumer key's base so padded or unpadded consumer keys both match.
 */
export function classifySuffixedStrongs(
  consumerKey: string,
  baseInfo: Map<string, BaseInfo>,
  emittedKeys: ReadonlySet<string>,
): SuffixVerdict {
  if (!/[a-z]$/.test(consumerKey)) return { kind: 'not-suffixed' };
  if (emittedKeys.has(consumerKey)) return { kind: 'already-emitted' };
  const info = baseInfo.get(unpad(baseStrongs(consumerKey)));
  if (!info) return { kind: 'keep-null', reason: 'no-attested-base' };
  if (info.translits.size !== 1) return { kind: 'keep-null', reason: 'homograph' };
  return { kind: 'safe-recover', value: info.representative };
}

/**
 * Extract consumer Strong's keys from a wrangler `d1 execute --json` payload (or
 * a bare string array), plucking the `lemma` column — where OT Strong's numbers
 * live in vocabulary / thematic_keywords. Mirrors the coverage gate's extractKeys
 * so the generator and the gate consume the SAME consumer-key file. Order-
 * preserving dedupe; null/undefined dropped.
 */
export function extractConsumerKeys(jsonText: string): string[] {
  const json = JSON.parse(jsonText) as unknown;
  const values: unknown[] = [];
  if (Array.isArray(json)) {
    if (json.length === 0) return [];
    if (typeof json[0] === 'string') {
      values.push(...json);
    } else if (json[0] && Array.isArray((json[0] as { results?: unknown }).results)) {
      for (const stmt of json as Array<{ results?: Array<Record<string, unknown>> }>) {
        for (const row of stmt.results ?? []) values.push(row.lemma);
      }
    } else {
      for (const row of json as Array<Record<string, unknown>>) values.push(row?.lemma);
    }
  } else if (json && Array.isArray((json as { results?: unknown }).results)) {
    for (const row of (json as { results: Array<Record<string, unknown>> }).results) {
      values.push(row.lemma);
    }
  } else {
    throw new Error('Unrecognized consumer-key JSON shape');
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Escape a SQL string literal (double single quotes) and wrap in quotes. */
export function escapeSQL(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

/**
 * Parse the emit TSV. Each line MUST have exactly three tab fields
 * (`lemma\tstrongs\tcount`) and an integer count. A malformed line throws.
 * Trailing blank lines are ignored.
 */
export function parseInput(content: string): Row[] {
  const rows: Row[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue; // ignore blank / trailing newline
    const fields = line.split('\t');
    if (fields.length !== 3) {
      throw new Error(
        `Malformed TSV row ${i + 1}: expected 3 tab-separated fields, got ${fields.length}: ${JSON.stringify(line)}`,
      );
    }
    const [lemma, strongs, countStr] = fields;
    if (!/^\d+$/.test(countStr)) {
      throw new Error(
        `Malformed TSV row ${i + 1}: count is not a non-negative integer: ${JSON.stringify(countStr)}`,
      );
    }
    rows.push({ lemma, strongs, count: Number(countStr) });
  }
  return rows;
}

/**
 * Pick the representative lemma from a lemma->count map: highest count first,
 * ties broken by the smallest lemma UTF-8 byte sequence. Total and deterministic.
 */
function pickRepresentative(candidates: Map<string, number>): string {
  let best: string | null = null;
  let bestCount = -1;
  let bestBuf: Buffer | null = null;
  for (const [lemma, count] of candidates) {
    const buf = Buffer.from(lemma, 'utf8');
    if (
      count > bestCount ||
      (count === bestCount && Buffer.compare(buf, bestBuf!) < 0)
    ) {
      best = lemma;
      bestCount = count;
      bestBuf = buf;
    }
  }
  return best!;
}

/**
 * Build both lookup tables and the counts baseline from parsed emit rows.
 *
 * Exclusions (never transliterated): empty-lemma rows (defensive; emit already
 * drops them) and unpointed (consonants-only) lemmas. Excluded lemmas never
 * participate in the strongs representative pools.
 */
export function buildTables(rows: Row[], consumerKeys: Iterable<string> = []): Tables {
  // Distinct-lemma exclusion bookkeeping.
  const emptyLemmas = new Set<string>();
  const unpointedLemmas = new Set<string>();
  const excludedLemmas = new Set<string>();

  // Distinct non-excluded lemmas (source of the lemma table).
  const lemmaSet = new Set<string>();

  // exact strongs -> (lemma -> summed count); base strongs -> (lemma -> summed count).
  const exactGroups = new Map<string, Map<string, number>>();
  const baseGroups = new Map<string, Map<string, number>>();

  for (const { lemma, strongs, count } of rows) {
    if (lemma === '') {
      emptyLemmas.add(lemma);
      excludedLemmas.add(lemma);
      continue;
    }
    if (!hasNiqqud(lemma)) {
      unpointedLemmas.add(lemma);
      excludedLemmas.add(lemma);
      continue;
    }
    lemmaSet.add(lemma);

    if (strongs === '') continue; // no strongs key to emit

    const addTo = (map: Map<string, Map<string, number>>, key: string) => {
      let g = map.get(key);
      if (!g) {
        g = new Map<string, number>();
        map.set(key, g);
      }
      g.set(lemma, (g.get(lemma) ?? 0) + count);
    };
    addTo(exactGroups, strongs);
    addTo(baseGroups, baseStrongs(strongs));
  }

  // Lemma table: one entry per distinct non-excluded lemma, sorted by lemma bytes.
  const lemmaEntries: Entry[] = [...lemmaSet]
    .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
    .map((lemma) => {
      const value = transliterateLemma(lemma);
      if (value === '') {
        throw new Error(
          `Empty transliteration for non-excluded lemma ${JSON.stringify(lemma)}`,
        );
      }
      return { key: lemma, value };
    });

  // Cache lemma -> transliteration (already computed above).
  const translitOf = new Map(lemmaEntries.map((e) => [e.key, e.value]));
  const rep = (lemma: string): string => {
    const v = translitOf.get(lemma);
    if (v === undefined) {
      // Representative resolved to an excluded/unknown lemma — should never happen.
      throw new Error(`No transliteration for representative lemma ${JSON.stringify(lemma)}`);
    }
    return v;
  };

  // Strongs table (exact): every attested exact strongs.
  const exactEntries: Entry[] = [...exactGroups.entries()]
    .sort((a, b) => Buffer.compare(Buffer.from(a[0], 'utf8'), Buffer.from(b[0], 'utf8')))
    .map(([strongs, cands]) => ({ key: strongs, value: rep(pickRepresentative(cands)) }));

  // Strongs table (base): each distinct base NOT already attested as an exact key.
  const exactKeys = new Set(exactGroups.keys());
  const baseEntries: Entry[] = [...baseGroups.entries()]
    .filter(([base]) => !exactKeys.has(base))
    .sort((a, b) => Buffer.compare(Buffer.from(a[0], 'utf8'), Buffer.from(b[0], 'utf8')))
    .map(([base, cands]) => ({ key: base, value: rep(pickRepresentative(cands)) }));

  // Unpadded key variants: for each padded/as-attested key already emitted above,
  // ALSO emit its unpadded spelling pointing to the SAME representative value, so
  // the UNPADDED consumer keys (vocabulary.lemma / thematic_keywords.lemma =
  // 'H1', 'H127') resolve. First-writer-wins across the priority order
  // exact > base > exact-unpadded > base-unpadded, so a variant never shadows an
  // attested padded key or a higher-priority spelling. A key whose unpadded form
  // equals itself (already unpadded, e.g. a 4-digit strongs) contributes nothing.
  const emittedKeys = new Set<string>([...exactEntries, ...baseEntries].map((e) => e.key));
  const exactUnpadded: Entry[] = [];
  const baseUnpadded: Entry[] = [];
  const addUnpaddedVariants = (source: Entry[], sink: Entry[]): void => {
    for (const e of source) {
      const uk = unpad(e.key);
      if (uk === e.key || emittedKeys.has(uk)) continue;
      emittedKeys.add(uk);
      sink.push({ key: uk, value: e.value });
    }
  };
  addUnpaddedVariants(exactEntries, exactUnpadded);
  addUnpaddedVariants(baseEntries, baseUnpadded);

  // Per-base transliteration facts, keyed by the UNPADDED base (the consumer
  // namespace), over the base's pointed lemmas. Drives safe-suffix recovery.
  const baseInfo = new Map<string, BaseInfo>();
  for (const [base, cands] of baseGroups) {
    const translits = new Set<string>();
    for (const lemma of cands.keys()) translits.add(rep(lemma));
    const key = unpad(base);
    const existing = baseInfo.get(key);
    if (existing) {
      for (const t of translits) existing.translits.add(t);
    } else {
      baseInfo.set(key, { translits, representative: rep(pickRepresentative(cands)) });
    }
  }

  // Safe-suffix aliases (decisions/0008): a sense-suffixed consumer key with no
  // exact/derived spelling already emitted, whose base attests exactly one
  // pointed lemma, gets an alias row carrying that single transliteration.
  // Emitted LAST so the first-writer-wins `emittedKeys` guard forbids an alias
  // shadowing any attested exact/base/unpadded spelling. Iterated over sorted
  // distinct keys so the output is deterministic regardless of input order.
  const safeSuffixAliases: Entry[] = [];
  const safeRecoverable: string[] = [];
  const uniqueConsumerKeys = [...new Set(consumerKeys)].sort((a, b) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')),
  );
  for (const consumerKey of uniqueConsumerKeys) {
    const verdict = classifySuffixedStrongs(consumerKey, baseInfo, emittedKeys);
    if (verdict.kind !== 'safe-recover') continue;
    emittedKeys.add(consumerKey);
    safeSuffixAliases.push({ key: consumerKey, value: verdict.value });
    safeRecoverable.push(consumerKey);
  }

  const strongsEntries = [
    ...exactEntries,
    ...exactUnpadded,
    ...baseEntries,
    ...baseUnpadded,
    ...safeSuffixAliases,
  ];

  const baseline: Baseline = {
    lemma_rows: lemmaEntries.length,
    // Counts fold in the unpadded variants so their sum equals the emitted row
    // count (the gate's self-consistency oracle). exact-derived (as-attested +
    // its unpadded spellings) vs base-derived (base + its unpadded spellings) vs
    // safe-suffix aliases.
    strongs_rows_exact: exactEntries.length + exactUnpadded.length,
    strongs_rows_base: baseEntries.length + baseUnpadded.length,
    strongs_rows_alias: safeSuffixAliases.length,
    excluded: {
      empty: emptyLemmas.size,
      unpointed: unpointedLemmas.size,
      subsegment: 0, // emit already handles sub-segment finding; kept for schema parity
    },
    safe_recoverable_strongs: safeRecoverable,
    library_version: LIBRARY_VERSION,
  };

  return { lemmaEntries, strongsEntries, baseline };
}

/**
 * Assert no transliteration VALUE contains an ASCII apostrophe (U+0027). SBL
 * output uses modifier letters U+02BE/U+02BF, never the ASCII quote, so any
 * occurrence is anomalous — fail loudly listing the offenders.
 */
export function assertNoAsciiApostrophe(entries: Entry[]): void {
  const offenders = entries.filter((e) => e.value.includes("'"));
  if (offenders.length > 0) {
    const detail = offenders
      .map((e) => `${e.key} -> ${JSON.stringify(e.value)}`)
      .join('; ');
    throw new Error(
      `ASCII apostrophe (U+0027) found in ${offenders.length} transliteration value(s): ${detail}`,
    );
  }
}

/**
 * Chunk value tuples into INSERT statements, each with its trailing semicolon
 * kept ≤ STMT_MAX_BYTES encoded UTF-8 bytes. At least one tuple per statement.
 */
export function chunkInsertStatements(
  table: string,
  columns: readonly string[],
  tuples: string[],
): string[] {
  const prefix = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `;
  const statements: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    statements.push(prefix + current.join(',') + ';');
    current = [];
  };

  for (const tuple of tuples) {
    const candidate = prefix + [...current, tuple].join(',') + ';';
    if (current.length > 0 && Buffer.byteLength(candidate, 'utf8') > STMT_MAX_BYTES) {
      flush();
    }
    current.push(tuple);
  }
  flush();
  return statements;
}

/**
 * Build the full per-table SQL block: DELETE; chunked INSERTs.
 *
 * NO explicit BEGIN/COMMIT wrapper (decisions/0006): modern
 * `wrangler d1 execute --file --remote` routes through the atomic R2 bulk-import
 * path, which wraps its OWN transaction — an explicit BEGIN/COMMIT inside it is
 * redundant and can error. DELETE-then-INSERT idempotency is unaffected: the
 * importer's transaction still makes the file's DELETE + INSERTs atomic.
 */
export function buildTableSql(
  table: string,
  columns: readonly string[],
  entries: Entry[],
): string {
  const tuples = entries.map(
    (e) => `(${escapeSQL(e.key)}, ${escapeSQL(e.value)})`,
  );
  const statements = chunkInsertStatements(table, columns, tuples);
  const body = statements.length > 0 ? statements.join('\n') + '\n' : '';
  return `DELETE FROM ${table};\n${body}`;
}

// ─── Main (filesystem; excluded from unit tests via entry guard) ──────────────
function main(argv: string[]): number {
  if (argv.length < 2 || argv.length > 3) {
    console.error('usage: generate-lemma-translit.ts <in.tsv> <out-dir> [consumer-keys.json]');
    return 2;
  }
  const [inPath, outDir, consumerKeysPath] = argv;

  const rows = parseInput(readFileSync(inPath, 'utf8'));
  // Consumer keys (the sense-suffixed OT Strong's the vocabulary/lemmas/themes
  // tools query) drive safe-suffix alias recovery (decisions/0008). Optional: with
  // no file, no aliases are emitted (identical to the pre-0008 output).
  const consumerKeys = consumerKeysPath
    ? extractConsumerKeys(readFileSync(consumerKeysPath, 'utf8'))
    : [];
  const { lemmaEntries, strongsEntries, baseline } = buildTables(rows, consumerKeys);

  // Loud apostrophe guard over every emitted transliteration value.
  assertNoAsciiApostrophe(lemmaEntries);
  assertNoAsciiApostrophe(strongsEntries);

  mkdirSync(outDir, { recursive: true });

  const lemmaSql = buildTableSql('lemma_translit_he', LEMMA_COLUMNS, lemmaEntries);
  const strongsSql = buildTableSql(
    'lemma_translit_he_strongs',
    STRONGS_COLUMNS,
    strongsEntries,
  );

  writeFileSync(join(outDir, 'lemma_translit_he.sql'), lemmaSql, 'utf8');
  writeFileSync(join(outDir, 'lemma_translit_he_strongs.sql'), strongsSql, 'utf8');
  writeFileSync(
    join(outDir, 'lemma-translit-baseline.json'),
    JSON.stringify(baseline, null, 2) + '\n',
    'utf8',
  );

  console.error(`lemma_translit_he rows: ${baseline.lemma_rows}`);
  console.error(
    `lemma_translit_he_strongs rows: ${strongsEntries.length} ` +
      `(exact ${baseline.strongs_rows_exact}, base-only ${baseline.strongs_rows_base}, ` +
      `safe-suffix alias ${baseline.strongs_rows_alias})`,
  );
  console.error(
    `excluded: empty ${baseline.excluded.empty}, unpointed ${baseline.excluded.unpointed}, subsegment ${baseline.excluded.subsegment}`,
  );
  console.error(`library_version: ${baseline.library_version}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
