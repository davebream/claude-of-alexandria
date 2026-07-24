import { ATTRIBUTION_URL, type DatasetRegistryEntry } from './types.js';
import { mcpDatasets } from './registry.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderList(items: string[]): string {
  if (items.length === 0) return '<p><em>None</em></p>';
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderDataset(entry: DatasetRegistryEntry): string {
  const version = entry.version
    ? escapeHtml(entry.version)
    : '<em>Not pinned at import (unversioned)</em>';
  const rightsUrl = entry.rights.url
    ? ` (<a href="${escapeHtml(entry.rights.url)}">${escapeHtml(entry.rights.url)}</a>)`
    : '';
  const creatorUrl = entry.creator_url
    ? ` — <a href="${escapeHtml(entry.creator_url)}">${escapeHtml(entry.creator_url)}</a>`
    : '';
  return `
<section id="${escapeHtml(entry.id)}">
  <h2>${escapeHtml(entry.title)}</h2>
  <dl>
    <dt>Dataset ID</dt><dd><code>${escapeHtml(entry.id)}</code></dd>
    <dt>Creator</dt><dd>${escapeHtml(entry.creator)}${creatorUrl}</dd>
    <dt>Rights status</dt><dd>${escapeHtml(entry.rights.status)}</dd>
    <dt>Rights</dt><dd>${escapeHtml(entry.rights.name)}${rightsUrl}</dd>
    <dt>Source</dt><dd><a href="${escapeHtml(entry.source_url)}">${escapeHtml(entry.source_url)}</a></dd>
    <dt>Version</dt><dd>${version}</dd>
    <dt>Attribution</dt><dd><p>${escapeHtml(entry.attribution)}</p></dd>
    <dt>Modifications</dt><dd><p>${escapeHtml(entry.modifications)}</p></dd>
    <dt>Affected MCP tools</dt><dd>${renderList(entry.mcp_tools)}</dd>
    <dt>Project surfaces</dt><dd>${renderList(entry.project_surfaces)}</dd>
    <dt>Special conditions</dt><dd>${renderList(entry.special_conditions)}</dd>
  </dl>
</section>`;
}

export function renderLegalDatasetsHtml(datasets: DatasetRegistryEntry[] = mcpDatasets()): string {
  const sorted = [...datasets].sort((a, b) => a.id.localeCompare(b.id));
  const index = sorted
    .map(entry => `<li><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</a> (<code>${escapeHtml(entry.id)}</code>)</li>`)
    .join('');
  const body = sorted.map(renderDataset).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude of Alexandria — Dataset Attribution</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
    h1, h2 { line-height: 1.2; }
    code { font-size: 0.95em; }
    dt { font-weight: 600; margin-top: 0.75rem; }
    dd { margin-left: 0; }
    section { border-top: 1px solid color-mix(in srgb, CanvasText 20%, transparent); padding-top: 1rem; margin-top: 1.5rem; }
    a { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>Dataset Attribution</h1>
    <p>
      Claude of Alexandria MCP responses include a <code>provenance</code> object identifying
      every dataset used on that page. This document expands those entries with modification notes,
      special conditions, and source-chain detail. Canonical URL:
      <a href="${escapeHtml(ATTRIBUTION_URL)}">${escapeHtml(ATTRIBUTION_URL)}</a>.
    </p>
    <p>
      Software is licensed under GPLv3. Datasets retain separate rights. Unpinned imports are
      disclosed as unversioned rather than assigned an invented revision.
    </p>
    <h2>Datasets</h2>
    <ol>
      ${index}
    </ol>
    ${body}
  </main>
</body>
</html>`;
}

export const LEGAL_DATASETS_CACHE_CONTROL = 'public, max-age=86400';
export const LEGAL_DATASETS_CONTENT_TYPE = 'text/html; charset=utf-8';
