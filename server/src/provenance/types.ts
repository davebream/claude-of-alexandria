import { z } from 'zod';

export const ATTRIBUTION_URL = 'https://coa.davebream.com/legal/datasets';

export const RightsStatusSchema = z.enum([
  'public-domain',
  'open-license',
  'custom-license',
  'project-owned',
]);

export type RightsStatus = z.infer<typeof RightsStatusSchema>;

export const DatasetRightsSchema = z.strictObject({
  status: RightsStatusSchema,
  name: z.string(),
  url: z.string().nullable(),
});

export const ProvenanceDatasetSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  creator: z.string(),
  creator_url: z.string().nullable(),
  attribution: z.string(),
  source_url: z.string(),
  rights: DatasetRightsSchema,
  version: z.string().nullable(),
});

export const ProvenanceSchema = z.strictObject({
  attribution_url: z.string(),
  datasets: z.array(ProvenanceDatasetSchema).min(1),
});

export type ProvenanceDataset = z.infer<typeof ProvenanceDatasetSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Registry entry: full metadata used for MCP responses, legal page, and NOTICE. */
export interface DatasetRegistryEntry {
  id: string;
  title: string;
  creator: string;
  creator_url: string | null;
  attribution: string;
  source_url: string;
  rights: {
    status: RightsStatus;
    name: string;
    url: string | null;
  };
  version: string | null;
  /** Human-readable description of how CoA modified or derived from the source. */
  modifications: string;
  /** MCP tool names that may return this dataset. */
  mcp_tools: string[];
  /** Extra conditions shown on the legal page (commercial clauses, jurisdiction caveats, etc.). */
  special_conditions: string[];
  /** Surfaces that consume this dataset outside the MCP (plugins, benchmarks, etc.). */
  project_surfaces: string[];
  /** When false, omitted from MCP NOTICE section but kept for repo-only notices. */
  mcp_published: boolean;
}

export const LGNTDF_ATTRIBUTION =
  'LGNTDF references marked "LGNTDF" are from Levinsohn Greek New Testament Discourse Features, '
  + 'Copyright 2016 SIL International®. With online or electronic quotations, link "LGNTDF" to '
  + 'https://github.com/biblicalhumanities/levinsohn and "SIL International®" to http://sil.org. '
  + 'Greek text referenced is from the Greek New Testament NA27/UBS4';

export function toPublicDataset(entry: DatasetRegistryEntry): ProvenanceDataset {
  return {
    id: entry.id,
    title: entry.title,
    creator: entry.creator,
    creator_url: entry.creator_url,
    attribution: entry.attribution,
    source_url: entry.source_url,
    rights: { ...entry.rights },
    version: entry.version,
  };
}
