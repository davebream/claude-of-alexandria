export const ENTITY_ATTRIBUTION = 'Entity data: Theographic (CC BY-SA 4.0) / TIPNR by Tyndale House (CC BY 4.0). Entity identifications per TIPNR — verify contested identifications against critical commentaries.';

/**
 * Derive a canonical season slug from a display name.
 * Single source of truth for season slugs — used by both seed ETL and the tool.
 * Examples: 'Christmas / Christmastide' → 'christmas-christmastide', 'Advent' → 'advent'
 */
export function slugifySeason(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Encode a chapter + verse position as a single integer sort key.
 * This is the SINGLE SOURCE OF TRUTH for start_enc / end_enc values.
 * Both the seed ETL (buildReadingRow) and the tool (handlePassage) MUST use this.
 * Formula: chapter * 1000 + verse
 * Examples: (9, 6) → 9006, (23, 1) → 23001, (23, 999) → 23999
 */
export function encodePosition(chapter: number, verse: number): number {
  return chapter * 1000 + verse;
}

/**
 * Sentinel verse used for chapter-only upper bounds.
 * A chapter-only ref like "Psalm 23" encodes to [23001, 23999].
 * Both seed and tool use this constant to stay in sync.
 */
export const CHAPTER_ONLY_MAX_VERSE = 999;

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
    if (isNaN(sCh) || isNaN(sV)) return { error: `Invalid verse range: "${range}"` };

    // Abbreviated form: "8:28-30" (no colon in end part → same chapter)
    if (!parts[1].includes(':')) {
      const eV = Number(parts[1]);
      if (isNaN(eV) || eV <= 0) return { error: `Invalid verse range: "${range}"` };
      if (eV < sV) return { error: `Invalid verse range: "${range}" — end verse (${eV}) is before start verse (${sV})` };
      return { startChapter: sCh, startVerse: sV, endChapter: sCh, endVerse: eV };
    }

    // Full form: "8:28-8:30"
    const [eCh, eV] = parts[1].split(':').map(Number);
    if (isNaN(eCh) || isNaN(eV)) return { error: `Invalid verse range: "${range}"` };
    if (eCh < sCh || (eCh === sCh && eV < sV)) return { error: `Invalid verse range: "${range}" — end is before start` };
    return { startChapter: sCh, startVerse: sV, endChapter: eCh, endVerse: eV };
  }
  return { error: `Invalid verse range: "${range}"` };
}
