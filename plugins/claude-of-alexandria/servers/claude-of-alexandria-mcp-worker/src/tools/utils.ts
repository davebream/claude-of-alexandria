export function parseChapterRange(range?: string): { min?: number; max?: number } | { error: string } {
  if (!range) return {};
  const parts = range.split('-');
  if (parts.length === 1) {
    const n = parseInt(parts[0], 10);
    if (isNaN(n) || n <= 0) return { error: `Invalid chapter range: "${range}"` };
    return { min: n, max: n };
  }
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const max = parseInt(parts[1], 10);
    if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min > max) {
      return { error: `Invalid chapter range: "${range}"` };
    }
    return { min, max };
  }
  return { error: `Invalid chapter range: "${range}"` };
}
