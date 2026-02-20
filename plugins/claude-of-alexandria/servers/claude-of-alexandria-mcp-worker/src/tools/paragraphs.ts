import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js';

export async function queryParagraphBreaks(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }
  if (bookInfo.testament !== 'ot') {
    return { error: { code: 'TESTAMENT_MISMATCH', message: `Paragraph markers are OT only. '${bookInfo.displayName}' is an NT book.` } };
  }

  const chapterRange = args.chapter_range as string | undefined;
  const rangeResult = parseChapterRange(chapterRange);
  if ('error' in rangeResult) {
    return { error: { code: 'INVALID_RANGE', message: rangeResult.error } };
  }

  let sql = 'SELECT chapter, verse, marker_type FROM paragraph_markers WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
  }

  sql += ' ORDER BY chapter, verse';

  const rows = await query(sql, params);

  const markers = rows.map(r => ({
    chapter: r.chapter as number,
    verse: r.verse as number,
    type: r.marker_type as string,
  }));

  const petuchot = markers.filter(m => m.type === 'petuchah').length;
  const setumot = markers.filter(m => m.type === 'setumah').length;

  return {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    markers,
    summary: { petuchot, setumot, total: petuchot + setumot },
  };
}
