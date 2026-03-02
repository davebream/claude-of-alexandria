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

// ─── RMAC expansion maps (Robinson Morphological Analysis Codes) ────────────
const RMAC_TENSE: Record<string, string> = {
  P: 'present', I: 'imperfect', F: 'future', A: 'aorist',
  X: 'perfect', Y: 'pluperfect', R: 'perfect',
};
const RMAC_VOICE: Record<string, string> = {
  A: 'active', M: 'middle', P: 'passive', E: 'middle/passive',
  D: 'middle deponent', O: 'passive deponent', N: 'middle/passive deponent',
};
const RMAC_MOOD: Record<string, string> = {
  I: 'indicative', S: 'subjunctive', O: 'optative',
  M: 'imperative', N: 'infinitive', P: 'participle',
};
const RMAC_PERSON: Record<string, string> = {
  '1': '1st', '2': '2nd', '3': '3rd',
};
const RMAC_NUMBER: Record<string, string> = {
  S: 'singular', P: 'plural',
};
const RMAC_CASE: Record<string, string> = {
  N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative',
};
const RMAC_GENDER: Record<string, string> = {
  M: 'masculine', F: 'feminine', N: 'neuter',
};
const RMAC_NOUN_EXTRA: Record<string, string> = {
  I: 'indeclinable', // N-PRI = proper indeclinable
  C: 'contracted',
};

function expandRMACParsing(rmac: string): Record<string, string> {
  const out: Record<string, string> = {};

  // Bare POS codes without dashes: CONJ, PRT, PREP, INJ, etc.
  if (!rmac.includes('-')) {
    return out; // POS already captured in the `pos` column
  }

  const parts = rmac.split('-');
  const posCode = parts[0];

  if (posCode === 'V') {
    // Verb: V-{tense}{voice}{mood}-{person}{number} or V-2{tense}{voice}{mood}-{person}{number}
    let morphPart = parts[1];
    // Handle second aorist/perfect prefix "2"
    if (morphPart.startsWith('2')) {
      out['form'] = 'second';
      morphPart = morphPart.slice(1);
    }
    if (morphPart.length >= 3) {
      out['tense'] = RMAC_TENSE[morphPart[0]] ?? morphPart[0];
      out['voice'] = RMAC_VOICE[morphPart[1]] ?? morphPart[1];
      out['mood'] = RMAC_MOOD[morphPart[2]] ?? morphPart[2];
    }
    // Third segment depends on mood
    if (parts.length >= 3) {
      const seg = parts[2];
      const mood = RMAC_MOOD[morphPart[2]];
      if (mood === 'participle') {
        // Participle: case-number-gender (e.g., V-PAP-NSM → N=nominative, S=singular, M=masculine)
        if (seg.length >= 1) out['case'] = RMAC_CASE[seg[0]] ?? seg[0];
        if (seg.length >= 2) out['number'] = RMAC_NUMBER[seg[1]] ?? seg[1];
        if (seg.length >= 3) out['gender'] = RMAC_GENDER[seg[2]] ?? seg[2];
      } else if (mood !== 'infinitive') {
        // Finite verb: person-number (e.g., V-PAI-3S → 3=3rd, S=singular)
        if (seg.length >= 1) out['person'] = RMAC_PERSON[seg[0]] ?? seg[0];
        if (seg.length >= 2) out['number'] = RMAC_NUMBER[seg[1]] ?? seg[1];
      }
    }
  } else if (posCode === 'N' || posCode === 'A' || posCode === 'R' ||
             posCode === 'C' || posCode === 'D' || posCode === 'T' ||
             posCode === 'S' || posCode === 'F' || posCode === 'I' ||
             posCode === 'X' || posCode === 'P') {
    // Nominal/adjectival: {POS}-{case}{number}{gender} or {POS}-{extra}{extra}{extra}
    const morph = parts[1];
    if (morph.length >= 3) {
      // Check for indeclinable forms like N-PRI
      if (RMAC_NOUN_EXTRA[morph[2]]) {
        out['noun_type'] = morph.slice(0, 2); // e.g., "PR" (proper)
        out['declension'] = RMAC_NOUN_EXTRA[morph[2]];
      } else {
        out['case'] = RMAC_CASE[morph[0]] ?? morph[0];
        out['number'] = RMAC_NUMBER[morph[1]] ?? morph[1];
        out['gender'] = RMAC_GENDER[morph[2]] ?? morph[2];
      }
    } else if (morph.length === 2) {
      // Short forms like comparative/superlative adjectives: A-NS
      out['case'] = RMAC_CASE[morph[0]] ?? morph[0];
      out['number'] = RMAC_NUMBER[morph[1]] ?? morph[1];
    }
    // Degree suffix for adjectives: A-NSM-C (comparative), A-NSM-S (superlative)
    if (parts.length >= 3) {
      if (parts[2] === 'C') out['degree'] = 'comparative';
      else if (parts[2] === 'S') out['degree'] = 'superlative';
    }
  }

  return out;
}

// ─── Unified expansion function ─────────────────────────────────────────────
// Detects format:
//   RMAC strings: start with capital letter, not JSON (e.g., V-PAI-3S, N-NSM, CONJ)
//   Hebrew compact JSON: has keys st, cj, s, nt, sf, pg
//   Greek compact JSON: has keys c, t, v, m, d
const HEBREW_KEYS = new Set(['st', 'cj', 's', 'nt', 'sf', 'pg']);

export function expandParsing(compact: string | null): Record<string, string> | null {
  if (!compact) return null;

  // RMAC strings: capital letter POS prefix, not JSON
  if (/^[A-Z]/.test(compact) && !compact.startsWith('{')) {
    return expandRMACParsing(compact);
  }

  // JSON format (OT Hebrew or legacy NT Greek)
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
