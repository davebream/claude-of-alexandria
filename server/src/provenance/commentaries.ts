/** Publication decisions and evidence: docs/data-provenance/commentary-source-audit.md. */
export interface CommentarySource {
  datasetId: string | null;
  unavailableReason: string | null;
}

export const COMMENTARY_CATALOG = {
  'adam-clarke': { datasetId: 'commentary_adam_clarke', unavailableReason: null },
  'ambrose-of-milan': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'ambrosiaster': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'augustine-of-hippo': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'basil-of-caesarea': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'bede': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'clement-of-alexandria': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'cyprian': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'cyril-of-alexandria': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'ephrem-the-syrian': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'eusebius-of-caesarea': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'gregory-the-dialogist': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'hilary-of-poitiers': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'hippolytus-of-rome': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'irenaeus': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'jamieson-fausset-brown': { datasetId: 'commentary_jfb', unavailableReason: null },
  'jerome': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'john-chrysostom': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'john-gill': { datasetId: 'commentary_john_gill', unavailableReason: null },
  'keil-delitzsch': { datasetId: 'commentary_keil_delitzsch', unavailableReason: null },
  'matthew-henry': { datasetId: 'commentary_matthew_henry', unavailableReason: null },
  'oecumenius': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'origen-of-alexandria': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'tertullian': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'theodore-of-mopsuestia': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'theodoret-of-cyrus': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'theophylact-of-ohrid': { datasetId: null, unavailableReason: 'The source collection is identified, but rights for every imported translation have not been verified.' },
  'tyndale': { datasetId: 'commentary_tyndale', unavailableReason: null },
  'unfoldingword': { datasetId: 'commentary_unfoldingword', unavailableReason: null },
} as const satisfies Record<string, CommentarySource>;

export type CommentaryId = keyof typeof COMMENTARY_CATALOG;
export const COMMENTARY_IDS = Object.keys(COMMENTARY_CATALOG) as [CommentaryId, ...CommentaryId[]];

export function commentarySource(id: string): CommentarySource | undefined {
  return Object.hasOwn(COMMENTARY_CATALOG, id) ? COMMENTARY_CATALOG[id as CommentaryId] : undefined;
}

export const COMMENTARY_ID_TO_DATASET: Record<string, string> = Object.fromEntries(
  Object.entries(COMMENTARY_CATALOG).flatMap(([id, source]) => source.datasetId ? [[id, source.datasetId]] : []),
);
