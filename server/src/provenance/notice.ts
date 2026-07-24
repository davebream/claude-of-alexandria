import { DATASET_REGISTRY, mcpDatasets } from './registry.js';
import type { DatasetRegistryEntry } from './types.js';

const ROOT_HEADER = `Claude of Alexandria
Copyright 2026 davebream (https://github.com/davebream/claude-of-alexandria)

This project incorporates data from third-party sources under separate licenses:
`;

const SERVER_HEADER = `# Third-Party Data Attribution

This file's MCP dataset section is generated from \`server/src/provenance/registry.ts\`.
Do not edit the MCP section by hand — run \`npx tsx scripts/generate-notices.ts\`.
`;

function formatEntry(entry: DatasetRegistryEntry): string {
  const lines = [
    entry.title.toUpperCase(),
    `Source: ${entry.source_url}`,
    `License: ${entry.rights.name}`,
  ];
  if (entry.version) lines.push(`Version: ${entry.version}`);
  else lines.push('Version: not pinned at import (unversioned)');
  lines.push('');
  lines.push(`  Creator: ${entry.creator}`);
  if (entry.creator_url) lines.push(`  Creator URL: ${entry.creator_url}`);
  lines.push(`  Attribution: ${entry.attribution}`);
  if (entry.rights.url) lines.push(`  Rights URL: ${entry.rights.url}`);
  lines.push(`  Rights status: ${entry.rights.status}`);
  lines.push(`  Modifications: ${entry.modifications}`);
  if (entry.mcp_tools.length > 0) {
    lines.push(`  MCP tools: ${entry.mcp_tools.join(', ')}`);
  }
  for (const condition of entry.special_conditions) {
    lines.push(`  NOTE: ${condition}`);
  }
  return lines.join('\n');
}

function joinSections(entries: DatasetRegistryEntry[]): string {
  return entries
    .map(entry => `${'-'.repeat(79)}\n\n${formatEntry(entry)}\n`)
    .join('\n');
}

/** MCP-published datasets for the generated NOTICE sections. */
export function generateMcpNoticeBody(): string {
  const entries = mcpDatasets().sort((a, b) => a.id.localeCompare(b.id));
  return joinSections(entries);
}

/** Repository-only datasets preserved outside the MCP section. */
export function generateRepoOnlyNoticeBody(): string {
  const entries = Object.values(DATASET_REGISTRY)
    .filter(entry => !entry.mcp_published)
    .sort((a, b) => a.id.localeCompare(b.id));
  return joinSections(entries);
}

export function generateRootNotice(): string {
  return [
    ROOT_HEADER.trimEnd(),
    '',
    'MCP DATASETS',
    '',
    generateMcpNoticeBody().trimEnd(),
    '',
    'REPOSITORY-ONLY DATASETS (not published via MCP tools)',
    '',
    generateRepoOnlyNoticeBody().trimEnd(),
    '',
  ].join('\n');
}

export function generateServerNoticeMarkdown(): string {
  const entries = mcpDatasets().sort((a, b) => a.id.localeCompare(b.id));
  const sections = entries.map(entry => {
    const version = entry.version ?? '_not pinned at import (unversioned)_';
    const rightsLink = entry.rights.url ? ` ([license](${entry.rights.url}))` : '';
    const conditions = entry.special_conditions.length > 0
      ? entry.special_conditions.map(item => `- ${item}`).join('\n')
      : '- None';
    return [
      `## ${entry.title}`,
      '',
      `- **ID:** \`${entry.id}\``,
      `- **Creator:** ${entry.creator}${entry.creator_url ? ` (${entry.creator_url})` : ''}`,
      `- **Source:** ${entry.source_url}`,
      `- **Rights:** ${entry.rights.status} — ${entry.rights.name}${rightsLink}`,
      `- **Version:** ${version}`,
      `- **Attribution:** ${entry.attribution}`,
      `- **Modifications:** ${entry.modifications}`,
      `- **MCP tools:** ${entry.mcp_tools.join(', ') || '_none_'}`,
      `- **Special conditions:**`,
      conditions,
      '',
    ].join('\n');
  });

  return [
    SERVER_HEADER.trimEnd(),
    '',
    ...sections,
    '## Repository-only datasets',
    '',
    'See the root `NOTICE` file for Kline Torah units, Sefaria audit fixtures, and other non-MCP corpora.',
    '',
  ].join('\n');
}

export const MCP_NOTICE_BEGIN = '<!-- BEGIN GENERATED MCP NOTICE -->';
export const MCP_NOTICE_END = '<!-- END GENERATED MCP NOTICE -->';
