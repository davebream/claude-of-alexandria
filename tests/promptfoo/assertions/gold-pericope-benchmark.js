/**
 * Source-derived Torah boundary benchmark and Promptfoo assertions.
 *
 * The benchmark is intentionally small. Literary boundaries come from
 * published, redistributable sources; Masoretic markers are a separate,
 * witness-relative evidence layer and never stand in for an authorial verdict.
 */

const EVIDENCE_KEYS = ['graphic', 'linguistic', 'genre', 'teaching_suitability'];
const ALLOWED_LICENSES = new Set(['CC BY 4.0', 'Public Domain']);

const sources = {
  kline_torah_units_v1: {
    author: 'Moshe Kline',
    title: 'Torah Literary Units Dataset',
    version: '1.0',
    url: 'https://chaver.com/torah-weave/data/torah-units.json',
    methodology_url: 'https://chaver.com/torah-weave/Woven-Torah-Method.html',
    license: 'CC BY 4.0',
    sha256: '7d95de4355d71bd96606b44ddc457763eef22f35ce8c61810fb17359ce76ada5',
  },
  oshb_wlc: {
    author: 'Open Scriptures',
    title: 'OpenScriptures Hebrew Bible / Westminster Leningrad Codex',
    url: 'https://github.com/openscriptures/morphhb',
    license: 'CC BY 4.0',
    revision: '3d15126fb1ef74867fc1434be1942e837932691f',
    sha256: {
      Genesis: '0526e5c9a5fb4d907847645f954ed3d1268fa69decbd872056cedd2668d86449',
      Leviticus: 'e21e70265c9ef500182f8ccb4f4e1186e5a79e1169d24cef23cc479baf07b191',
    },
    witness: 'WLC/OSHB@3d15126fb1ef74867fc1434be1942e837932691f',
    anchor_semantics: 'A marker supports a break after its anchor only when position is verse_end.',
    checksum_lock: 'plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/oshb-checksums.json',
  },
  skinner_genesis_1910: {
    author: 'John Skinner',
    title: 'A Critical and Exegetical Commentary on Genesis',
    version: '1910',
    url: 'https://www.gutenberg.org/ebooks/77363',
    snapshot_url: 'https://www.gutenberg.org/cache/epub/77363/pg77363.txt',
    license: 'Public Domain',
    sha256: 'b28117c8900adbd8b54ed8c20086a2266eabc1b7d466213f56a7e4998670560b',
  },
};

const parents = {
  'kline-leviticus-unit-1': {
    span: 'Leviticus 1:1-3:17',
    unit_level: 'literary_unit',
    source_ref: 'kline_torah_units_v1#serial-39',
  },
  'book-genesis': {
    span: 'Genesis',
    unit_level: 'book',
    source_ref: 'kline_torah_units_v1#genesis',
  },
  'kline-genesis-unit-5': {
    span: 'Genesis 11:10-13:4',
    unit_level: 'literary_unit',
    source_ref: 'kline_torah_units_v1#serial-5',
  },
  'kline-genesis-unit-11': {
    span: 'Genesis 25:12-25:34',
    unit_level: 'literary_unit',
    source_ref: 'kline_torah_units_v1#serial-11',
  },
};

const annotations = [
  {
    id: 'leviticus-1-herd-burnt-offering',
    span: 'Leviticus 1:1-1:9',
    unit_level: 'prime_pericope',
    parent: { id: 'kline-leviticus-unit-1', span: 'Leviticus 1:1-3:17' },
    alternatives: [],
    confidence: { label: 'source_attested', basis: 'Kline cell 1A and a matching verse-end OSHB marker.' },
    rationale: 'Kline identifies the herd offering as the first prime pericope in Leviticus Unit 1.',
    evidence: {
      graphic: ['oshb_wlc#Leviticus.1.9-setumah-verse_end'],
      linguistic: ['kline_torah_units_v1#serial-39-cell-1A'],
      genre: ['kline_torah_units_v1#serial-39-sacrificial-law'],
      teaching_suitability: ['kline_torah_units_v1#serial-39-prime-pericope-1A'],
    },
  },
  {
    id: 'leviticus-1-flock-burnt-offering',
    span: 'Leviticus 1:10-1:13',
    unit_level: 'prime_pericope',
    parent: { id: 'kline-leviticus-unit-1', span: 'Leviticus 1:1-3:17' },
    alternatives: [],
    confidence: { label: 'source_attested', basis: 'Kline cell 1B and a matching verse-end OSHB marker.' },
    rationale: 'Kline identifies the flock offering as the second prime pericope in Leviticus Unit 1.',
    evidence: {
      graphic: ['oshb_wlc#Leviticus.1.13-petuchah-verse_end'],
      linguistic: ['kline_torah_units_v1#serial-39-cell-1B'],
      genre: ['kline_torah_units_v1#serial-39-sacrificial-law'],
      teaching_suitability: ['kline_torah_units_v1#serial-39-prime-pericope-1B'],
    },
  },
  {
    id: 'leviticus-1-bird-burnt-offering',
    span: 'Leviticus 1:14-1:17',
    unit_level: 'prime_pericope',
    parent: { id: 'kline-leviticus-unit-1', span: 'Leviticus 1:1-3:17' },
    alternatives: [],
    confidence: { label: 'source_attested', basis: 'Kline cell 1C and a matching verse-end OSHB marker.' },
    rationale: 'Kline identifies the bird offering as the third prime pericope in Leviticus Unit 1.',
    evidence: {
      graphic: ['oshb_wlc#Leviticus.1.17-setumah-verse_end'],
      linguistic: ['kline_torah_units_v1#serial-39-cell-1C'],
      genre: ['kline_torah_units_v1#serial-39-sacrificial-law'],
      teaching_suitability: ['kline_torah_units_v1#serial-39-prime-pericope-1C'],
    },
  },
  {
    id: 'genesis-11-tower-of-babel',
    span: 'Genesis 11:1-11:9',
    unit_level: 'literary_unit',
    parent: { id: 'book-genesis', span: 'Genesis' },
    alternatives: [],
    confidence: { label: 'source_attested', basis: 'Kline Genesis Unit 4 with OSHB breaks at both outer edges.' },
    rationale: 'Kline identifies Genesis 11:1-9 as the complete Tower of Babel literary unit.',
    evidence: {
      graphic: [
        'oshb_wlc#Genesis.10.32-petuchah-verse_end',
        'oshb_wlc#Genesis.11.9-petuchah-verse_end',
      ],
      linguistic: ['kline_torah_units_v1#serial-4-complete-unit'],
      genre: ['kline_torah_units_v1#serial-4-narrative'],
      teaching_suitability: ['kline_torah_units_v1#serial-4-self-contained-unit'],
    },
  },
  {
    id: 'genesis-11-27-toledot-level-disagreement',
    span: 'Genesis 11:27-11:32',
    unit_level: 'disputed_major_section_or_internal_cell',
    parent: { id: 'kline-genesis-unit-5', span: 'Genesis 11:10-13:4' },
    alternatives: [
      {
        classification: 'majority',
        benchmark_role: 'published_alternative',
        boundary_before: 'Genesis 11:27',
        unit_level: 'major_toledot_section',
        rationale: 'Skinner records the commonly held toledot-heading division and treats 11:27-32 as the Genealogy of Terah.',
        source_refs: ['skinner_genesis_1910#introduction-toledot-scheme', 'skinner_genesis_1910#section-XI-27-32'],
      },
      {
        classification: 'minority',
        benchmark_role: 'primary',
        boundary_before: 'Genesis 11:27',
        unit_level: 'internal_cell_boundary',
        rationale: 'Kline places 11:27-32 in cell 1B inside the larger Genesis Unit 5.',
        source_refs: ['kline_torah_units_v1#serial-5-cell-1B'],
      },
    ],
    confidence: { label: 'published_disagreement', basis: 'Compatible published sources agree on the location but disagree on its hierarchical level.' },
    rationale: 'The disagreement is preserved instead of promoting either hierarchy to consensus.',
    evidence: {
      graphic: [],
      linguistic: ['skinner_genesis_1910#introduction-toledot-scheme'],
      genre: ['kline_torah_units_v1#serial-5-patriarchal-narrative'],
      teaching_suitability: [],
    },
  },
  {
    id: 'genesis-25-19-toledot-level-disagreement',
    span: 'Genesis 25:19-25:34',
    unit_level: 'disputed_major_section_or_internal_cell',
    parent: { id: 'kline-genesis-unit-11', span: 'Genesis 25:12-25:34' },
    alternatives: [
      {
        classification: 'majority',
        benchmark_role: 'published_alternative',
        boundary_before: 'Genesis 25:19',
        unit_level: 'major_toledot_section',
        rationale: 'Skinner records the commonly held toledot-heading scheme, in which 25:19 opens a major division.',
        source_refs: ['skinner_genesis_1910#introduction-toledot-scheme'],
      },
      {
        classification: 'minority',
        benchmark_role: 'primary',
        boundary_before: 'Genesis 25:19',
        unit_level: 'internal_cell_boundary',
        rationale: 'Kline places 25:19 in cell 1B inside Genesis Unit 11, which begins at 25:12.',
        source_refs: ['kline_torah_units_v1#serial-11-cell-1B'],
      },
    ],
    confidence: { label: 'published_disagreement', basis: 'Compatible published sources disagree on the boundary hierarchy.' },
    rationale: 'Both the common toledot scheme and Kline hierarchy remain available to downstream evaluation.',
    evidence: {
      graphic: [],
      linguistic: ['skinner_genesis_1910#introduction-toledot-scheme'],
      genre: ['kline_torah_units_v1#serial-11-patriarchal-narrative'],
      teaching_suitability: [],
    },
  },
];

const literaryCases = {
  leviticus_1: {
    book: 'Leviticus',
    expected_ranges: ['1:1-1:9', '1:10-1:13', '1:14-1:17'],
    relevant_chapters: [1],
    ordered_anchors: [
      '1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7', '1:8', '1:9',
      '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '2:1',
    ],
    markers: [
      { type: 'setumah', anchor: '1:9', position: 'verse_end' },
      { type: 'petuchah', anchor: '1:13', position: 'verse_end' },
      { type: 'setumah', anchor: '1:17', position: 'verse_end' },
    ],
  },
  genesis_11_1_9: {
    book: 'Genesis',
    expected_ranges: ['11:1-11:9'],
    relevant_chapters: [10, 11],
    ordered_anchors: [
      '10:31', '10:32', '11:1', '11:2', '11:3', '11:4', '11:5',
      '11:6', '11:7', '11:8', '11:9', '11:10',
    ],
    markers: [
      { type: 'petuchah', anchor: '10:32', position: 'verse_end' },
      { type: 'petuchah', anchor: '11:9', position: 'verse_end' },
    ],
  },
};

const cases = {
  leviticus_1_segmentation: { literary_case: 'leviticus_1', mode: 'segmentation' },
  genesis_11_1_9_segmentation: { literary_case: 'genesis_11_1_9', mode: 'segmentation' },
  leviticus_1_pericope: { literary_case: 'leviticus_1', mode: 'pericope', required_verdict: 'CONTRACT' },
  genesis_11_1_9_pericope: { literary_case: 'genesis_11_1_9', mode: 'pericope', required_verdict: 'VALID' },
};

function sourceId(ref) {
  return ref.split('#', 1)[0];
}

function validateBenchmark(value = benchmark) {
  const ids = new Set();
  for (const [id, source] of Object.entries(value.sources)) {
    const hashes = typeof source.sha256 === 'string' ? [source.sha256] : Object.values(source.sha256 || {});
    if (!source.url || !hashes.length || !hashes.every(hash => /^[a-f0-9]{64}$/.test(hash))
      || !ALLOWED_LICENSES.has(source.license)) {
      throw new Error(`Invalid or incompatible source metadata: ${id}`);
    }
  }

  for (const [id, parent] of Object.entries(value.parents)) {
    if (!parent.span || !parent.unit_level || !value.sources[sourceId(parent.source_ref)]) {
      throw new Error(`Invalid parent metadata: ${id}`);
    }
  }

  for (const annotation of value.annotations) {
    if (!annotation.id || ids.has(annotation.id)) throw new Error(`Duplicate or missing annotation id: ${annotation.id}`);
    ids.add(annotation.id);
    for (const field of ['span', 'unit_level', 'parent', 'alternatives', 'confidence', 'rationale', 'evidence']) {
      if (annotation[field] === undefined || annotation[field] === null) {
        throw new Error(`${annotation.id} is missing ${field}`);
      }
    }
    if (!annotation.confidence.label || !annotation.confidence.basis) {
      throw new Error(`${annotation.id} has invalid source-derived confidence`);
    }
    const parent = value.parents[annotation.parent.id];
    if (!parent || annotation.parent.span !== parent.span) throw new Error(`${annotation.id} has an invalid parent`);
    for (const key of EVIDENCE_KEYS) {
      if (!Array.isArray(annotation.evidence[key])) throw new Error(`${annotation.id} evidence.${key} must be an array`);
      for (const ref of annotation.evidence[key]) {
        if (!value.sources[sourceId(ref)]) throw new Error(`${annotation.id} cites unknown source ${ref}`);
      }
    }
    if (!EVIDENCE_KEYS.some(key => annotation.evidence[key].length > 0)) {
      throw new Error(`${annotation.id} has no source references`);
    }
    for (const alternative of annotation.alternatives) {
      if (!['majority', 'minority'].includes(alternative.classification)) {
        throw new Error(`${annotation.id} has an unclassified alternative`);
      }
      if (!alternative.source_refs?.length) throw new Error(`${annotation.id} has an uncited alternative`);
      for (const ref of alternative.source_refs) {
        if (!value.sources[sourceId(ref)]) throw new Error(`${annotation.id} cites unknown source ${ref}`);
      }
    }
    if (annotation.alternatives.length) {
      const classifications = new Set(annotation.alternatives.map(alternative => alternative.classification));
      if (!classifications.has('majority') || !classifications.has('minority')) {
        throw new Error(`${annotation.id} must preserve both majority and minority alternatives`);
      }
      const roles = new Set(annotation.alternatives.map(alternative => alternative.benchmark_role));
      if (!roles.has('primary') || !roles.has('published_alternative')) {
        throw new Error(`${annotation.id} must distinguish the primary source from the published alternative`);
      }
    }
  }

  for (const [id, testCase] of Object.entries(value.cases)) {
    const literaryCase = value.literary_cases[testCase.literary_case];
    if (!literaryCase) throw new Error(`${id} references unknown literary case`);
    if (!literaryCase.expected_ranges.length || !literaryCase.markers.length) throw new Error(`${id} has no gold boundaries`);
    if (!literaryCase.ordered_anchors.length || new Set(literaryCase.ordered_anchors).size !== literaryCase.ordered_anchors.length) {
      throw new Error(`${id} has invalid ordered anchors`);
    }
    for (const marker of literaryCase.markers) {
      if (marker.position !== 'verse_end') throw new Error(`${id} includes a non-boundary marker at ${marker.anchor}`);
      if (!['petuchah', 'setumah'].includes(marker.type)) throw new Error(`${id} has unknown marker type`);
    }
  }
  return true;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const benchmark = { sources, parents, annotations, literary_cases: literaryCases, cases };
validateBenchmark(benchmark);
deepFreeze(benchmark);

function selectedCase(context) {
  const caseId = context?.config?.caseId;
  const testCase = benchmark.cases[caseId];
  if (!testCase) throw new Error(`Unknown gold benchmark caseId: ${caseId}`);
  return { testCase, literaryCase: benchmark.literary_cases[testCase.literary_case] };
}

function parseRef(value) {
  const match = /^(\d+):(\d+)$/.exec(value);
  return match ? { chapter: Number(match[1]), verse: Number(match[2]) } : null;
}

function parseRange(value) {
  const normalized = value.replace(/[\u2012-\u2015]/g, '-');
  const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(normalized);
  return match
    ? {
        start: { chapter: Number(match[1]), verse: Number(match[2]) },
        end: { chapter: Number(match[3]), verse: Number(match[4]) },
      }
    : null;
}

function verseDistance(left, right, literaryCase) {
  const leftIndex = literaryCase.ordered_anchors.indexOf(`${left.chapter}:${left.verse}`);
  const rightIndex = literaryCase.ordered_anchors.indexOf(`${right.chapter}:${right.verse}`);
  return leftIndex === -1 || rightIndex === -1 ? Number.POSITIVE_INFINITY : Math.abs(leftIndex - rightIndex);
}

function rangesIn(output) {
  const normalized = String(output).replace(/[\u2012-\u2015]/g, '-');
  const regex = /(?:\b(?:Genesis|Gen|Leviticus|Lev)\.?\s+)?(\d{1,3}):(\d{1,3})\s*-\s*(?:(\d{1,3}):)?(\d{1,3})/gi;
  return [...normalized.matchAll(regex)].map(match => ({
    start: { chapter: Number(match[1]), verse: Number(match[2]) },
    end: { chapter: Number(match[3] || match[1]), verse: Number(match[4]) },
    raw: match[0],
  }));
}

function rangeMatches(actual, expected, literaryCase) {
  return verseDistance(actual.start, expected.start, literaryCase) <= 1
    && verseDistance(actual.end, expected.end, literaryCase) <= 1;
}

function containsCompleteRangeSet(section, literaryCase) {
  const actual = rangesIn(section);
  const expected = literaryCase.expected_ranges.map(parseRange);
  const used = new Set();
  return expected.every(gold => {
    const index = actual.findIndex((candidate, candidateIndex) =>
      !used.has(candidateIndex) && rangeMatches(candidate, gold, literaryCase));
    if (index === -1) return false;
    used.add(index);
    return true;
  });
}

function assertProposedBoundaries(output, context) {
  const { testCase, literaryCase } = selectedCase(context);
  const text = String(output);

  if (testCase.required_verdict) {
    const verdict = text.match(/\*\*Verdict:\*\*\s*([A-Z]+)/i)?.[1]?.toUpperCase();
    if (verdict !== testCase.required_verdict) {
      return {
        pass: false,
        score: 0,
        reason: `Expected ${testCase.required_verdict} verdict for ${literaryCase.book}; found ${verdict || 'none'}.`,
      };
    }
  }

  const optionSections = text.split(/(?=^###\s+Option\s+\d+)/gim);
  const candidates = optionSections.length > 1 ? optionSections.slice(1) : [text];
  const proposalCandidates = testCase.mode === 'segmentation'
    ? candidates.map(section => section.split(/\r?\n/).filter(line => /^\s*\|/.test(line)).join('\n'))
    : candidates;
  const matched = proposalCandidates.some(section => containsCompleteRangeSet(section, literaryCase));
  return {
    pass: matched,
    score: matched ? 1 : 0,
    reason: matched
      ? `Found a complete gold-aligned range set for ${literaryCase.book}.`
      : `No single proposal contains all expected ranges: ${literaryCase.expected_ranges.join(', ')} (±1 verse).`,
  };
}

function standaloneGlyph(line, glyph) {
  const escaped = glyph === 'פ' ? '\\u05e4' : '\\u05e1';
  return new RegExp(`(?:^|[\\s(\\[{'\"\u201c\u2018])${escaped}(?=$|[\\s)\\]},.;:\"'\u201d\u2019])`, 'u').test(line);
}

function markerClaims(output, literaryCase) {
  const claims = [];
  const refRegex = /\b(\d{1,3}:\d{1,3})\b/g;
  for (const line of String(output).split(/\r?\n/)) {
    const segments = line.includes('|') ? line.split('|') : [line];
    for (const segment of segments) {
      const lower = segment.toLowerCase();
      const types = [];
      if (/\bpetuch(?:ah|a|ot)\b/.test(lower) || standaloneGlyph(segment, 'פ')) types.push('petuchah');
      if (/\bsetum(?:ah|a|ot)\b/.test(lower) || standaloneGlyph(segment, 'ס')) types.push('setumah');
      if (!types.length) continue;
      const withoutRanges = segment.replace(/\b\d{1,3}:\d{1,3}\s*[\u2012-\u2015-]\s*(?:\d{1,3}:)?\d{1,3}\b/g, '');
      for (const match of withoutRanges.matchAll(refRegex)) {
        const ref = parseRef(match[1]);
        if (!literaryCase.ordered_anchors.includes(match[1])) continue;
        const position = /\b(?:mid[- ]verse|within (?:the )?verse|inside (?:the )?verse)\b/.test(lower)
          ? 'mid_verse'
          : 'unspecified';
        for (const type of types) claims.push({ type, ref: match[1], position, line: line.trim() });
      }
    }
  }
  return claims;
}

function assertMarkerLocations(output, context) {
  const { literaryCase } = selectedCase(context);
  const claims = markerClaims(output, literaryCase);
  const fabricated = claims.filter(claim => claim.position === 'mid_verse' || !literaryCase.markers.some(marker =>
    marker.position === 'verse_end' && marker.type === claim.type
      && verseDistance(parseRef(claim.ref), parseRef(marker.anchor), literaryCase) <= 1
  ));
  if (fabricated.length) {
    return {
      pass: false,
      score: 0,
      reason: `Unsupported marker claim(s): ${fabricated.map(claim => `${claim.type} at ${claim.ref}`).join(', ')}.`,
    };
  }

  const missing = literaryCase.markers.filter(marker => !claims.some(claim =>
    claim.position !== 'mid_verse' && marker.position === 'verse_end' && claim.type === marker.type
      && verseDistance(parseRef(claim.ref), parseRef(marker.anchor), literaryCase) <= 1
  ));
  return {
    pass: missing.length === 0,
    score: missing.length === 0 ? 1 : (literaryCase.markers.length - missing.length) / literaryCase.markers.length,
    reason: missing.length === 0
      ? `All ${literaryCase.markers.length} witness markers were cited at the correct type and location (±1 verse).`
      : `Missing marker citation(s): ${missing.map(marker => `${marker.type} after ${marker.anchor}`).join(', ')}.`,
  };
}

module.exports = {
  benchmark,
  validateBenchmark,
  assertProposedBoundaries,
  assertMarkerLocations,
};
