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
