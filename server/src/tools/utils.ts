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

export interface VerseRange {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

export function parseVerseRange(range: string): VerseRange | { error: string } {
  const parts = range.split('-');
  if (parts.length === 1) {
    const [ch, v] = parts[0].split(':').map(Number);
    if (isNaN(ch) || isNaN(v)) return { error: `Invalid verse range: "${range}"` };
    return { startChapter: ch, startVerse: v, endChapter: ch, endVerse: v };
  }
  if (parts.length === 2) {
    const [sCh, sV] = parts[0].split(':').map(Number);
    const [eCh, eV] = parts[1].split(':').map(Number);
    if ([sCh, sV, eCh, eV].some(isNaN)) return { error: `Invalid verse range: "${range}"` };
    return { startChapter: sCh, startVerse: sV, endChapter: eCh, endVerse: eV };
  }
  return { error: `Invalid verse range: "${range}"` };
}
