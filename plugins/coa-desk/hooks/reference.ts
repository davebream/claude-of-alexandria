// Parses "/passage" arguments and suggests book names. A leaf module: the
// book table is passed in, so tests can import this file on its own.

export type Book = { name: string; testament: string; aliases: readonly string[] }
export type Reference = { book: string; range: string; translations: string[] }
export type Suggestion = { text: string; label: string; description: string }

export const TRANSLATIONS = ['BSB', 'WEB', 'KJV', 'ASV', 'YLT', 'DBY']
export const USAGE = 'Usage: /passage <book> <chapter:verse[-verse]> [translations], for example /passage Rom 8:1-4 BSB,KJV'

const REFERENCE = /^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z .]*?)\s*(\d+:\d+(?:-\d+(?::\d+)?)?)\s*(.*)$/

export function normalizeBook(text: string): string {
  return text.toLowerCase().replace(/[\s._-]+/g, '')
}

export function findBook(text: string, books: readonly Book[]): Book | undefined {
  const key = normalizeBook(text)
  return books.find((book) => book.aliases.includes(key) || normalizeBook(book.name) === key)
}

export function parseReference(text: string, books: readonly Book[]): Reference | { error: string } {
  if (!text.trim()) return { error: USAGE }
  const match = REFERENCE.exec(text)
  if (!match) {
    return { error: `Give a chapter:verse range after the book. ${USAGE}` }
  }
  const [, bookText, range, rest] = match
  const book = findBook(bookText, books)
  if (!book) return { error: `Unknown book "${bookText.trim()}". ${USAGE}` }
  const translations = rest.split(/[\s,]+/).filter(Boolean).map((item) => item.toUpperCase())
  const unknown = translations.filter((item) => !TRANSLATIONS.includes(item))
  if (unknown.length > 0) {
    return { error: `Unknown translation ${unknown.join(', ')}. Available: ${TRANSLATIONS.join(', ')}.` }
  }
  return { book: book.name, range, translations }
}

export function suggestBooks(token: string, books: readonly Book[], limit = 5): Suggestion[] {
  const key = normalizeBook(token)
  if (key.length < 2 || !/^[1-3]?[a-z]/.test(key)) return []
  return books
    .filter((book) => book.aliases.some((alias) => alias.startsWith(key)) || normalizeBook(book.name).startsWith(key))
    .slice(0, limit)
    .map((book) => ({
      text: book.name,
      label: book.name,
      description: book.testament === 'ot' ? 'Old Testament' : 'New Testament',
    }))
}
