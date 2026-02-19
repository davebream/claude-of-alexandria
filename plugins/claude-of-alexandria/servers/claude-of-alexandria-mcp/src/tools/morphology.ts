import { query, expandParsing } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

interface VerseRange {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

function parseVerseRange(range: string): VerseRange | { error: string } {
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

export async function queryMorphology(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }

  const rangeInput = args.range as string;
  const verseRange = parseVerseRange(rangeInput);
  if ('error' in verseRange) {
    return { error: { code: 'INVALID_RANGE', message: verseRange.error } };
  }

  const testament = (args.testament as string | undefined) ?? bookInfo.testament;
  const posFilter = args.pos_filter as string | undefined;
  const wordFilter = args.word_filter as string | undefined;

  let sql = `
    SELECT chapter, verse, word_position, text, normalized, lemma, pos, parsing
    FROM morphology
    WHERE book = ? AND testament = ?
    AND (chapter > ? OR (chapter = ? AND verse >= ?))
    AND (chapter < ? OR (chapter = ? AND verse <= ?))
  `;
  const params: unknown[] = [
    bookInfo.canonical, testament,
    verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
    verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
  ];

  if (posFilter) {
    sql += ' AND pos = ?';
    params.push(posFilter);
  }

  if (wordFilter) {
    sql += ' AND (text = ? OR normalized = ? OR lemma = ?)';
    params.push(wordFilter, wordFilter, wordFilter);
  }

  sql += ' ORDER BY chapter, verse, word_position';

  const rows = await query(sql, params);

  const words = rows.map(r => ({
    verse: `${r.chapter}:${r.verse}`,
    position: r.word_position as number,
    text: r.text as string,
    normalized: r.normalized as string | null,
    lemma: r.lemma as string,
    pos: r.pos as string,
    parsing: expandParsing(r.parsing as string | null),
  }));

  const byPos: Record<string, number> = {};
  for (const w of words) {
    byPos[w.pos] = (byPos[w.pos] ?? 0) + 1;
  }

  return {
    book: bookInfo.displayName,
    range: rangeInput,
    testament,
    words,
    summary: { total_words: words.length, by_pos: byPos },
  };
}
