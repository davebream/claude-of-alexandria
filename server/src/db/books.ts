export type Testament = 'nt' | 'ot';

export interface BookInfo {
  canonical: string;
  displayName: string;
  testament: Testament;
  morphologyFile: string;
  masoreticsFile?: string;
}

const BOOK_MAP: Record<string, BookInfo> = {
  // NT Books
  'matthew': { canonical: 'matthew', displayName: 'Matthew', testament: 'nt', morphologyFile: 'matthew' },
  'matt': { canonical: 'matthew', displayName: 'Matthew', testament: 'nt', morphologyFile: 'matthew' },
  'mark': { canonical: 'mark', displayName: 'Mark', testament: 'nt', morphologyFile: 'mark' },
  'luke': { canonical: 'luke', displayName: 'Luke', testament: 'nt', morphologyFile: 'luke' },
  'john': { canonical: 'john', displayName: 'John', testament: 'nt', morphologyFile: 'john' },
  'acts': { canonical: 'acts', displayName: 'Acts', testament: 'nt', morphologyFile: 'acts' },
  'romans': { canonical: 'romans', displayName: 'Romans', testament: 'nt', morphologyFile: 'romans' },
  'rom': { canonical: 'romans', displayName: 'Romans', testament: 'nt', morphologyFile: 'romans' },
  '1corinthians': { canonical: '1_corinthians', displayName: '1 Corinthians', testament: 'nt', morphologyFile: '1_corinthians' },
  '1cor': { canonical: '1_corinthians', displayName: '1 Corinthians', testament: 'nt', morphologyFile: '1_corinthians' },
  '2corinthians': { canonical: '2_corinthians', displayName: '2 Corinthians', testament: 'nt', morphologyFile: '2_corinthians' },
  '2cor': { canonical: '2_corinthians', displayName: '2 Corinthians', testament: 'nt', morphologyFile: '2_corinthians' },
  'galatians': { canonical: 'galatians', displayName: 'Galatians', testament: 'nt', morphologyFile: 'galatians' },
  'gal': { canonical: 'galatians', displayName: 'Galatians', testament: 'nt', morphologyFile: 'galatians' },
  'ephesians': { canonical: 'ephesians', displayName: 'Ephesians', testament: 'nt', morphologyFile: 'ephesians' },
  'eph': { canonical: 'ephesians', displayName: 'Ephesians', testament: 'nt', morphologyFile: 'ephesians' },
  'philippians': { canonical: 'philippians', displayName: 'Philippians', testament: 'nt', morphologyFile: 'philippians' },
  'phil': { canonical: 'philippians', displayName: 'Philippians', testament: 'nt', morphologyFile: 'philippians' },
  'colossians': { canonical: 'colossians', displayName: 'Colossians', testament: 'nt', morphologyFile: 'colossians' },
  'col': { canonical: 'colossians', displayName: 'Colossians', testament: 'nt', morphologyFile: 'colossians' },
  '1thessalonians': { canonical: '1_thessalonians', displayName: '1 Thessalonians', testament: 'nt', morphologyFile: '1_thessalonians' },
  '1thess': { canonical: '1_thessalonians', displayName: '1 Thessalonians', testament: 'nt', morphologyFile: '1_thessalonians' },
  '1th': { canonical: '1_thessalonians', displayName: '1 Thessalonians', testament: 'nt', morphologyFile: '1_thessalonians' },
  '2thessalonians': { canonical: '2_thessalonians', displayName: '2 Thessalonians', testament: 'nt', morphologyFile: '2_thessalonians' },
  '2thess': { canonical: '2_thessalonians', displayName: '2 Thessalonians', testament: 'nt', morphologyFile: '2_thessalonians' },
  '2th': { canonical: '2_thessalonians', displayName: '2 Thessalonians', testament: 'nt', morphologyFile: '2_thessalonians' },
  '1timothy': { canonical: '1_timothy', displayName: '1 Timothy', testament: 'nt', morphologyFile: '1_timothy' },
  '1tim': { canonical: '1_timothy', displayName: '1 Timothy', testament: 'nt', morphologyFile: '1_timothy' },
  '2timothy': { canonical: '2_timothy', displayName: '2 Timothy', testament: 'nt', morphologyFile: '2_timothy' },
  '2tim': { canonical: '2_timothy', displayName: '2 Timothy', testament: 'nt', morphologyFile: '2_timothy' },
  'titus': { canonical: 'titus', displayName: 'Titus', testament: 'nt', morphologyFile: 'titus' },
  'tit': { canonical: 'titus', displayName: 'Titus', testament: 'nt', morphologyFile: 'titus' },
  'philemon': { canonical: 'philemon', displayName: 'Philemon', testament: 'nt', morphologyFile: 'philemon' },
  'phlm': { canonical: 'philemon', displayName: 'Philemon', testament: 'nt', morphologyFile: 'philemon' },
  'phm': { canonical: 'philemon', displayName: 'Philemon', testament: 'nt', morphologyFile: 'philemon' },
  'hebrews': { canonical: 'hebrews', displayName: 'Hebrews', testament: 'nt', morphologyFile: 'hebrews' },
  'heb': { canonical: 'hebrews', displayName: 'Hebrews', testament: 'nt', morphologyFile: 'hebrews' },
  'james': { canonical: 'james', displayName: 'James', testament: 'nt', morphologyFile: 'james' },
  'jas': { canonical: 'james', displayName: 'James', testament: 'nt', morphologyFile: 'james' },
  '1peter': { canonical: '1_peter', displayName: '1 Peter', testament: 'nt', morphologyFile: '1_peter' },
  '1pet': { canonical: '1_peter', displayName: '1 Peter', testament: 'nt', morphologyFile: '1_peter' },
  '1pe': { canonical: '1_peter', displayName: '1 Peter', testament: 'nt', morphologyFile: '1_peter' },
  '2peter': { canonical: '2_peter', displayName: '2 Peter', testament: 'nt', morphologyFile: '2_peter' },
  '2pet': { canonical: '2_peter', displayName: '2 Peter', testament: 'nt', morphologyFile: '2_peter' },
  '2pe': { canonical: '2_peter', displayName: '2 Peter', testament: 'nt', morphologyFile: '2_peter' },
  '1john': { canonical: '1_john', displayName: '1 John', testament: 'nt', morphologyFile: '1_john' },
  '1jn': { canonical: '1_john', displayName: '1 John', testament: 'nt', morphologyFile: '1_john' },
  '2john': { canonical: '2_john', displayName: '2 John', testament: 'nt', morphologyFile: '2_john' },
  '2jn': { canonical: '2_john', displayName: '2 John', testament: 'nt', morphologyFile: '2_john' },
  '3john': { canonical: '3_john', displayName: '3 John', testament: 'nt', morphologyFile: '3_john' },
  '3jn': { canonical: '3_john', displayName: '3 John', testament: 'nt', morphologyFile: '3_john' },
  'jude': { canonical: 'jude', displayName: 'Jude', testament: 'nt', morphologyFile: 'jude' },
  'revelation': { canonical: 'revelation', displayName: 'Revelation', testament: 'nt', morphologyFile: 'revelation' },
  'rev': { canonical: 'revelation', displayName: 'Revelation', testament: 'nt', morphologyFile: 'revelation' },
  // OT Books
  'genesis': { canonical: 'genesis', displayName: 'Genesis', testament: 'ot', morphologyFile: 'genesis', masoreticsFile: 'genesis' },
  'gen': { canonical: 'genesis', displayName: 'Genesis', testament: 'ot', morphologyFile: 'genesis', masoreticsFile: 'genesis' },
  'exodus': { canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus', masoreticsFile: 'exodus' },
  'exod': { canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus', masoreticsFile: 'exodus' },
  'ex': { canonical: 'exodus', displayName: 'Exodus', testament: 'ot', morphologyFile: 'exodus', masoreticsFile: 'exodus' },
  'leviticus': { canonical: 'leviticus', displayName: 'Leviticus', testament: 'ot', morphologyFile: 'leviticus', masoreticsFile: 'leviticus' },
  'lev': { canonical: 'leviticus', displayName: 'Leviticus', testament: 'ot', morphologyFile: 'leviticus', masoreticsFile: 'leviticus' },
  'numbers': { canonical: 'numbers', displayName: 'Numbers', testament: 'ot', morphologyFile: 'numbers', masoreticsFile: 'numbers' },
  'num': { canonical: 'numbers', displayName: 'Numbers', testament: 'ot', morphologyFile: 'numbers', masoreticsFile: 'numbers' },
  'deuteronomy': { canonical: 'deuteronomy', displayName: 'Deuteronomy', testament: 'ot', morphologyFile: 'deuteronomy', masoreticsFile: 'deuteronomy' },
  'deut': { canonical: 'deuteronomy', displayName: 'Deuteronomy', testament: 'ot', morphologyFile: 'deuteronomy', masoreticsFile: 'deuteronomy' },
  'dt': { canonical: 'deuteronomy', displayName: 'Deuteronomy', testament: 'ot', morphologyFile: 'deuteronomy', masoreticsFile: 'deuteronomy' },
  'joshua': { canonical: 'joshua', displayName: 'Joshua', testament: 'ot', morphologyFile: 'joshua', masoreticsFile: 'joshua' },
  'josh': { canonical: 'joshua', displayName: 'Joshua', testament: 'ot', morphologyFile: 'joshua', masoreticsFile: 'joshua' },
  'judges': { canonical: 'judges', displayName: 'Judges', testament: 'ot', morphologyFile: 'judges', masoreticsFile: 'judges' },
  'judg': { canonical: 'judges', displayName: 'Judges', testament: 'ot', morphologyFile: 'judges', masoreticsFile: 'judges' },
  'ruth': { canonical: 'ruth', displayName: 'Ruth', testament: 'ot', morphologyFile: 'ruth', masoreticsFile: 'ruth' },
  '1samuel': { canonical: '1_samuel', displayName: '1 Samuel', testament: 'ot', morphologyFile: '1_samuel', masoreticsFile: '1-samuel' },
  '1sam': { canonical: '1_samuel', displayName: '1 Samuel', testament: 'ot', morphologyFile: '1_samuel', masoreticsFile: '1-samuel' },
  '2samuel': { canonical: '2_samuel', displayName: '2 Samuel', testament: 'ot', morphologyFile: '2_samuel', masoreticsFile: '2-samuel' },
  '2sam': { canonical: '2_samuel', displayName: '2 Samuel', testament: 'ot', morphologyFile: '2_samuel', masoreticsFile: '2-samuel' },
  '1kings': { canonical: '1_kings', displayName: '1 Kings', testament: 'ot', morphologyFile: '1_kings', masoreticsFile: '1-kings' },
  '1kgs': { canonical: '1_kings', displayName: '1 Kings', testament: 'ot', morphologyFile: '1_kings', masoreticsFile: '1-kings' },
  '2kings': { canonical: '2_kings', displayName: '2 Kings', testament: 'ot', morphologyFile: '2_kings', masoreticsFile: '2-kings' },
  '2kgs': { canonical: '2_kings', displayName: '2 Kings', testament: 'ot', morphologyFile: '2_kings', masoreticsFile: '2-kings' },
  '1chronicles': { canonical: '1_chronicles', displayName: '1 Chronicles', testament: 'ot', morphologyFile: '1_chronicles', masoreticsFile: '1-chronicles' },
  '1chr': { canonical: '1_chronicles', displayName: '1 Chronicles', testament: 'ot', morphologyFile: '1_chronicles', masoreticsFile: '1-chronicles' },
  '2chronicles': { canonical: '2_chronicles', displayName: '2 Chronicles', testament: 'ot', morphologyFile: '2_chronicles', masoreticsFile: '2-chronicles' },
  '2chr': { canonical: '2_chronicles', displayName: '2 Chronicles', testament: 'ot', morphologyFile: '2_chronicles', masoreticsFile: '2-chronicles' },
  'ezra': { canonical: 'ezra', displayName: 'Ezra', testament: 'ot', morphologyFile: 'ezra', masoreticsFile: 'ezra' },
  'nehemiah': { canonical: 'nehemiah', displayName: 'Nehemiah', testament: 'ot', morphologyFile: 'nehemiah', masoreticsFile: 'nehemiah' },
  'neh': { canonical: 'nehemiah', displayName: 'Nehemiah', testament: 'ot', morphologyFile: 'nehemiah', masoreticsFile: 'nehemiah' },
  'esther': { canonical: 'esther', displayName: 'Esther', testament: 'ot', morphologyFile: 'esther', masoreticsFile: 'esther' },
  'esth': { canonical: 'esther', displayName: 'Esther', testament: 'ot', morphologyFile: 'esther', masoreticsFile: 'esther' },
  'job': { canonical: 'job', displayName: 'Job', testament: 'ot', morphologyFile: 'job', masoreticsFile: 'job' },
  'psalms': { canonical: 'psalms', displayName: 'Psalms', testament: 'ot', morphologyFile: 'psalms', masoreticsFile: 'psalms' },
  'psalm': { canonical: 'psalms', displayName: 'Psalms', testament: 'ot', morphologyFile: 'psalms', masoreticsFile: 'psalms' },
  'ps': { canonical: 'psalms', displayName: 'Psalms', testament: 'ot', morphologyFile: 'psalms', masoreticsFile: 'psalms' },
  'proverbs': { canonical: 'proverbs', displayName: 'Proverbs', testament: 'ot', morphologyFile: 'proverbs', masoreticsFile: 'proverbs' },
  'prov': { canonical: 'proverbs', displayName: 'Proverbs', testament: 'ot', morphologyFile: 'proverbs', masoreticsFile: 'proverbs' },
  'ecclesiastes': { canonical: 'ecclesiastes', displayName: 'Ecclesiastes', testament: 'ot', morphologyFile: 'ecclesiastes', masoreticsFile: 'ecclesiastes' },
  'eccl': { canonical: 'ecclesiastes', displayName: 'Ecclesiastes', testament: 'ot', morphologyFile: 'ecclesiastes', masoreticsFile: 'ecclesiastes' },
  'qoh': { canonical: 'ecclesiastes', displayName: 'Ecclesiastes', testament: 'ot', morphologyFile: 'ecclesiastes', masoreticsFile: 'ecclesiastes' },
  'songofsolomon': { canonical: 'song_of_songs', displayName: 'Song of Songs', testament: 'ot', morphologyFile: 'song_of_songs', masoreticsFile: 'song-of-songs' },
  'songofsongs': { canonical: 'song_of_songs', displayName: 'Song of Songs', testament: 'ot', morphologyFile: 'song_of_songs', masoreticsFile: 'song-of-songs' },
  'canticles': { canonical: 'song_of_songs', displayName: 'Song of Songs', testament: 'ot', morphologyFile: 'song_of_songs', masoreticsFile: 'song-of-songs' },
  'ss': { canonical: 'song_of_songs', displayName: 'Song of Songs', testament: 'ot', morphologyFile: 'song_of_songs', masoreticsFile: 'song-of-songs' },
  'isaiah': { canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah', masoreticsFile: 'isaiah' },
  'isa': { canonical: 'isaiah', displayName: 'Isaiah', testament: 'ot', morphologyFile: 'isaiah', masoreticsFile: 'isaiah' },
  'jeremiah': { canonical: 'jeremiah', displayName: 'Jeremiah', testament: 'ot', morphologyFile: 'jeremiah', masoreticsFile: 'jeremiah' },
  'jer': { canonical: 'jeremiah', displayName: 'Jeremiah', testament: 'ot', morphologyFile: 'jeremiah', masoreticsFile: 'jeremiah' },
  'lamentations': { canonical: 'lamentations', displayName: 'Lamentations', testament: 'ot', morphologyFile: 'lamentations', masoreticsFile: 'lamentations' },
  'lam': { canonical: 'lamentations', displayName: 'Lamentations', testament: 'ot', morphologyFile: 'lamentations', masoreticsFile: 'lamentations' },
  'ezekiel': { canonical: 'ezekiel', displayName: 'Ezekiel', testament: 'ot', morphologyFile: 'ezekiel', masoreticsFile: 'ezekiel' },
  'ezek': { canonical: 'ezekiel', displayName: 'Ezekiel', testament: 'ot', morphologyFile: 'ezekiel', masoreticsFile: 'ezekiel' },
  'daniel': { canonical: 'daniel', displayName: 'Daniel', testament: 'ot', morphologyFile: 'daniel', masoreticsFile: 'daniel' },
  'dan': { canonical: 'daniel', displayName: 'Daniel', testament: 'ot', morphologyFile: 'daniel', masoreticsFile: 'daniel' },
  'hosea': { canonical: 'hosea', displayName: 'Hosea', testament: 'ot', morphologyFile: 'hosea', masoreticsFile: 'hosea' },
  'hos': { canonical: 'hosea', displayName: 'Hosea', testament: 'ot', morphologyFile: 'hosea', masoreticsFile: 'hosea' },
  'joel': { canonical: 'joel', displayName: 'Joel', testament: 'ot', morphologyFile: 'joel', masoreticsFile: 'joel' },
  'amos': { canonical: 'amos', displayName: 'Amos', testament: 'ot', morphologyFile: 'amos', masoreticsFile: 'amos' },
  'obadiah': { canonical: 'obadiah', displayName: 'Obadiah', testament: 'ot', morphologyFile: 'obadiah', masoreticsFile: 'obadiah' },
  'obad': { canonical: 'obadiah', displayName: 'Obadiah', testament: 'ot', morphologyFile: 'obadiah', masoreticsFile: 'obadiah' },
  'jonah': { canonical: 'jonah', displayName: 'Jonah', testament: 'ot', morphologyFile: 'jonah', masoreticsFile: 'jonah' },
  'jon': { canonical: 'jonah', displayName: 'Jonah', testament: 'ot', morphologyFile: 'jonah', masoreticsFile: 'jonah' },
  'micah': { canonical: 'micah', displayName: 'Micah', testament: 'ot', morphologyFile: 'micah', masoreticsFile: 'micah' },
  'mic': { canonical: 'micah', displayName: 'Micah', testament: 'ot', morphologyFile: 'micah', masoreticsFile: 'micah' },
  'nahum': { canonical: 'nahum', displayName: 'Nahum', testament: 'ot', morphologyFile: 'nahum', masoreticsFile: 'nahum' },
  'nah': { canonical: 'nahum', displayName: 'Nahum', testament: 'ot', morphologyFile: 'nahum', masoreticsFile: 'nahum' },
  'habakkuk': { canonical: 'habakkuk', displayName: 'Habakkuk', testament: 'ot', morphologyFile: 'habakkuk', masoreticsFile: 'habakkuk' },
  'hab': { canonical: 'habakkuk', displayName: 'Habakkuk', testament: 'ot', morphologyFile: 'habakkuk', masoreticsFile: 'habakkuk' },
  'zephaniah': { canonical: 'zephaniah', displayName: 'Zephaniah', testament: 'ot', morphologyFile: 'zephaniah', masoreticsFile: 'zephaniah' },
  'zeph': { canonical: 'zephaniah', displayName: 'Zephaniah', testament: 'ot', morphologyFile: 'zephaniah', masoreticsFile: 'zephaniah' },
  'haggai': { canonical: 'haggai', displayName: 'Haggai', testament: 'ot', morphologyFile: 'haggai', masoreticsFile: 'haggai' },
  'hag': { canonical: 'haggai', displayName: 'Haggai', testament: 'ot', morphologyFile: 'haggai', masoreticsFile: 'haggai' },
  'zechariah': { canonical: 'zechariah', displayName: 'Zechariah', testament: 'ot', morphologyFile: 'zechariah', masoreticsFile: 'zechariah' },
  'zech': { canonical: 'zechariah', displayName: 'Zechariah', testament: 'ot', morphologyFile: 'zechariah', masoreticsFile: 'zechariah' },
  'malachi': { canonical: 'malachi', displayName: 'Malachi', testament: 'ot', morphologyFile: 'malachi', masoreticsFile: 'malachi' },
  'mal': { canonical: 'malachi', displayName: 'Malachi', testament: 'ot', morphologyFile: 'malachi', masoreticsFile: 'malachi' },
};

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '');
}

export function lookupBook(input: string): BookInfo | null {
  const key = normalizeKey(input);
  const direct = BOOK_MAP[key];
  if (direct) return direct;

  // Strip trailing chapter/verse references agents may include
  // e.g. "psalm23" → "psalm", "1samuel3:15" → "1samuel"
  const stripped = key.replace(/[0-9:.,]+$/, '');
  if (stripped && stripped !== key) {
    return BOOK_MAP[stripped] ?? null;
  }

  return null;
}

export function getAllBooks(): BookInfo[] {
  const seen = new Set<string>();
  return Object.values(BOOK_MAP).filter(b => {
    if (seen.has(b.canonical)) return false;
    seen.add(b.canonical);
    return true;
  });
}

export function suggestBooks(input: string): string[] {
  const key = normalizeKey(input);
  return Object.entries(BOOK_MAP)
    .filter(([k]) => k.includes(key) || key.includes(k))
    .map(([, v]) => v.displayName)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);
}
