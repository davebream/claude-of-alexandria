// Pulls dataset ids out of a coa tool result. Every successful coa response
// carries provenance.datasets[].id; a tool.call result can hold it as an
// object, a JSON string, an MCP content block, or wrapped in { result, text }.

function fromValue(value: unknown, depth: number): string[] {
  if (depth > 4 || value === null || value === undefined) return []
  if (typeof value === 'string') {
    try {
      return fromValue(JSON.parse(value), depth + 1)
    } catch {
      return []
    }
  }
  if (typeof value !== 'object') return []
  const record = value as Record<string, any>
  const datasets = record.provenance?.datasets
  if (Array.isArray(datasets)) {
    return datasets.map((dataset) => dataset?.id).filter((id): id is string => typeof id === 'string')
  }
  for (const key of ['structuredContent', 'text', 'result']) {
    const ids = fromValue(record[key], depth + 1)
    if (ids.length > 0) return ids
  }
  if (Array.isArray(record.content)) {
    for (const block of record.content) {
      const ids = fromValue(block?.text, depth + 1)
      if (ids.length > 0) return ids
    }
  }
  return []
}

export function datasetIdsOf(value: unknown): string[] {
  return [...new Set(fromValue(value, 0))]
}
