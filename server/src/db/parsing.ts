// ─── NT Greek expansion maps (existing — CCAT compact JSON format) ──────────
const NT_KEY_EXPAND: Record<string, string> = {
  c: 'case', n: 'number', g: 'gender', t: 'tense',
  v: 'voice', m: 'mood', p: 'person', d: 'degree',
};
const NT_VAL_EXPAND: Record<string, string> = {
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

// ─── OT Hebrew expansion maps (new — morphhb compact JSON format) ───────────
const OT_KEY_EXPAND: Record<string, string> = {
  st: 'stem', cj: 'conjugation', p: 'person', g: 'gender',
  n: 'number', s: 'state', nt: 'noun_type', sf: 'suffix',
  pg: 'paragogic',
};
const OT_VAL_EXPAND: Record<string, string> = {
  mas: 'masculine', fem: 'feminine', com: 'common',
  sg: 'singular', pl: 'plural', du: 'dual',
  abs: 'absolute', cst: 'construct', det: 'determined',
  infinitive_construct: 'infinitive construct',
  infinitive_absolute: 'infinitive absolute',
  // Stems (Qal, Niphal, Piel, etc.) and conjugations (perfect, wayyiqtol, etc.)
  // pass through as-is — they are already human-readable
};

// ─── Unified expansion function ─────────────────────────────────────────────
// Detects format from non-overlapping key sets:
//   Hebrew uses: st, cj, s, nt, sf, pg (never in Greek)
//   Greek uses: c, t, v, m, d (never in Hebrew — 'n','g','p' overlap but direction is unambiguous)
const HEBREW_KEYS = new Set(['st', 'cj', 's', 'nt', 'sf', 'pg']);

export function expandParsing(compact: string | null): Record<string, string> | null {
  if (!compact) return null;
  try {
    const obj = JSON.parse(compact) as Record<string, string>;
    const keys = Object.keys(obj);
    const isHebrew = keys.some(k => HEBREW_KEYS.has(k));

    const keyMap = isHebrew ? OT_KEY_EXPAND : NT_KEY_EXPAND;
    const valMap = isHebrew ? OT_VAL_EXPAND : NT_VAL_EXPAND;

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object' && v !== null) {
        // Nested suffix object — expand recursively
        const nested: Record<string, string> = {};
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          nested[keyMap[sk] ?? sk] = valMap[sv] ?? sv;
        }
        out[keyMap[k] ?? k] = JSON.stringify(nested);
      } else {
        out[keyMap[k] ?? k] = valMap[v] ?? v;
      }
    }
    return out;
  } catch {
    return null;
  }
}
