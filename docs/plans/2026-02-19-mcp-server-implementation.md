# Claude of Alexandria MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server that exposes four biblical data query tools, replacing Python script dependencies and enabling Claude Desktop users to access reference data.

**Architecture:** Single TypeScript package (`claude-of-alexandria-mcp`) with sql.js WASM SQLite. ETL script compiles 139MB of reference JSON/YAML into SQLite. Four MCP tools mirror the four Python parsers 1:1. Server lives inside the plugin directory so `${CLAUDE_PLUGIN_ROOT}` paths resolve automatically.

**Tech Stack:** TypeScript 5+, @modelcontextprotocol/sdk, sql.js (WASM), js-yaml, Node.js ≥ 18

**Design doc:** `docs/plans/2026-02-19-claude-of-alexandria-mcp-design.md`

---

## Reference Data Quick Facts

Before coding, know these source formats:

**Levinsohn** (`reference/levinsohn/Historical_Present.json`):
```json
{ "feature": "Historical Present", "description": "...", "references": [{"verse": "Matt 2:13", "word": "φαίνεται", "type": "Historical Present"}] }
```
One file per feature, references span all NT books, verse format is "BookAbbrev Chapter:Verse".

**Masoretic** (`reference/masoretic/genesis.json`):
```json
{"book": "Genesis", "petuchot": ["1:2", "1:5", ...], "setumot": ["2:11", ...]}
```
One file per OT book (filenames use hyphens: `1-chronicles.json`), verse format is "Chapter:Verse".

**Vocabulary** (`reference/vocabulary/nt_lemmas.yaml`):
```yaml
books:
  Philippians:
    total_lemmas: 105
    lemmas:
      χαίρω: {total: 9, by_chapter: {1: 2, 2: 3, 3: 1, 4: 3}}
```
Chapter keys are integers. OT uses Strong's numbers as lemma keys.

**Morphology** (`reference/morphology/nt/jude.json`):
```json
{
  "verses": {
    "1:1": [
      {"text": "Ἰούδας", "normalized": "Ἰούδας", "lemma": "Ἰούδας", "pos": "noun", "parsing": {"case": "nominative", "number": "singular", "gender": "masculine"}}
    ]
  }
}
```
One file per book, verse keys are "Chapter:Verse" strings, word position = array index + 1.

**Semantic groups** (`reference/vocabulary/semantic_groups.yaml`):
```yaml
semantic_groups:
  joy:
    nt_lemmas: {χαρά: 'joy, gladness', χαίρω: 'rejoice, be glad'}
    ot_strongs: {H8057: {hebrew: 'שִׂמְחָה', gloss: 'joy, gladness'}}
```

---

## Phase 1: Build MCP Server

### Task 1: Initialize TypeScript Package

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/package.json`
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/tsconfig.json`
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/index.ts` (stub)
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts` (stub)
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/data/.gitkeep`

**Step 1: Create the directory structure**

```bash
mkdir -p plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/{src/tools,src/db,scripts,data,dist}
touch plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/data/.gitkeep
```

**Step 2: Write package.json**

```json
{
  "name": "claude-of-alexandria-mcp",
  "version": "1.0.0",
  "description": "MCP server for Claude of Alexandria biblical reference tools",
  "main": "dist/index.js",
  "bin": {
    "claude-of-alexandria-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "build:db": "npx ts-node --project tsconfig.json scripts/build-db.ts",
    "prepublishOnly": "npm run build:db && npm run build",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "js-yaml": "^4.1.0",
    "sql.js": "^1.12.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.0.0",
    "@types/sql.js": "^1.4.9",
    "ts-node": "^10.9.2",
    "typescript": "^5.0.0"
  },
  "files": ["dist/", "data/biblical.sqlite"],
  "engines": {"node": ">=18"},
  "license": "MIT"
}
```

**Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "scripts"]
}
```

Note: `scripts/` is excluded from tsconfig because build-db.ts is not a server source file. ts-node runs it separately.

**Step 4: Write stub src/index.ts**

```typescript
#!/usr/bin/env node
// MCP server entry point — implemented in Task 9
console.log('claude-of-alexandria-mcp stub');
```

**Step 5: Write stub scripts/build-db.ts**

```typescript
// ETL script — implemented in Tasks 4-7
console.log('build-db stub');
```

**Step 6: Install dependencies**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
npm install
```

Expected: `node_modules/` created, no errors.

**Step 7: Verify TypeScript compiles**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
npm run build
```

Expected: `dist/index.js` created, no TypeScript errors.

**Step 8: Commit**

```bash
git add plugins/claude-of-alexandria/servers/
git commit -m "feat(mcp): initialize claude-of-alexandria-mcp TypeScript package"
```

---

### Task 2: SQLite Schema Creation

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/schema.sql`
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/create-schema.ts`

The schema runs at the start of build-db.ts. Separating it into a `.sql` file makes it readable.

**Step 1: Write schema.sql**

```sql
CREATE TABLE IF NOT EXISTS discourse_features (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  feature TEXT NOT NULL,
  feature_description TEXT,
  word TEXT
);
CREATE INDEX IF NOT EXISTS idx_discourse_book ON discourse_features(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_discourse_feature ON discourse_features(feature);

CREATE TABLE IF NOT EXISTS paragraph_markers (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  marker_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_markers_book ON paragraph_markers(book, chapter, verse);

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  lemma TEXT NOT NULL,
  frequency INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocab_book_lemma ON vocabulary(book, lemma);
CREATE INDEX IF NOT EXISTS idx_vocab_book_chapter ON vocabulary(book, chapter);
CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);

CREATE TABLE IF NOT EXISTS vocabulary_clusters (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  lemma TEXT NOT NULL,
  concentration REAL NOT NULL,
  chapter_start INTEGER NOT NULL,
  chapter_end INTEGER NOT NULL,
  total_occurrences INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_book ON vocabulary_clusters(book, lemma);

CREATE TABLE IF NOT EXISTS thematic_keywords (
  theme TEXT NOT NULL,
  lemma TEXT NOT NULL,
  testament TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);

CREATE TABLE IF NOT EXISTS morphology (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  word_position INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalized TEXT,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  parsing TEXT
);
CREATE INDEX IF NOT EXISTS idx_morph_range ON morphology(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_morph_lemma ON morphology(lemma);
```

**Step 2: Write create-schema.ts**

```typescript
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function createDatabase(dbPath: string): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  // Execute each statement separately
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    db.run(stmt);
  }

  return db;
}

export function saveDatabase(db: Database, dbPath: string): void {
  const { writeFileSync, mkdirSync } = require('fs');
  const { dirname } = require('path');
  mkdirSync(dirname(dbPath), { recursive: true });
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}
```

Note: `__dirname` in `create-schema.ts` points to `scripts/`. The sql.js `Database` constructor with no args creates an in-memory database.

**Step 3: Verify schema.sql parses correctly**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
python3 -c "
import sqlite3, tempfile, os
tmp = tempfile.mktemp(suffix='.db')
conn = sqlite3.connect(tmp)
schema = open('scripts/schema.sql').read()
conn.executescript(schema)
tables = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()
print('Tables:', [t[0] for t in tables])
conn.close(); os.unlink(tmp)
"
```

Expected: `Tables: ['discourse_features', 'paragraph_markers', 'vocabulary', 'vocabulary_clusters', 'thematic_keywords', 'morphology']`

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/
git commit -m "feat(mcp): add SQLite schema for biblical reference data"
```

---

### Task 3: Book Name Normalization

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/db/books.ts`

This module maps all common book name variants to a canonical form (lowercase with underscores) and provides reverse lookup. It also handles Levinsohn-style abbreviations like "Matt", "1Cor".

**Step 1: Write books.ts**

The canonical form is `lowercase_with_underscores` (e.g., `1_corinthians`, `song_of_songs`).

```typescript
export type Testament = 'nt' | 'ot';

interface BookInfo {
  canonical: string;
  displayName: string;
  testament: Testament;
  // File name pattern used in reference data
  morphologyFile: string;  // e.g., '1_corinthians' (nt/) or 'genesis' (ot/)
  masoreticsFile?: string; // e.g., 'genesis' or '1-chronicles' (masoretic/)
}

// All entries map normalized input → BookInfo
// Keys are lowercase, spaces/hyphens stripped, for lookup
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
  // OT Books (masoreticsFile uses hyphens matching actual filenames)
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
  'songofsongsongs': { canonical: 'song_of_songs', displayName: 'Song of Songs', testament: 'ot', morphologyFile: 'song_of_songs', masoreticsFile: 'song-of-songs' },
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
    .replace(/[\s\-_]+/g, '');  // strip spaces, hyphens, underscores
}

export function lookupBook(input: string): BookInfo | null {
  const key = normalizeKey(input);
  return BOOK_MAP[key] ?? null;
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

export { BookInfo };
```

**Step 2: Write a quick manual test**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
node -e "
const { lookupBook, suggestBooks } = require('./dist/db/books');
// Test after build - first compile
"
# Can't test without compiling, so use ts-node
npx ts-node -e "
import { lookupBook, suggestBooks } from './src/db/books';
console.log(lookupBook('Mark'));
console.log(lookupBook('1 Cor'));
console.log(lookupBook('Gen'));
console.log(lookupBook('Philippians'));
console.log(suggestBooks('Markk'));
"
```

Expected:
```
{ canonical: 'mark', displayName: 'Mark', testament: 'nt', morphologyFile: 'mark' }
{ canonical: '1_corinthians', displayName: '1 Corinthians', ... }
{ canonical: 'genesis', displayName: 'Genesis', testament: 'ot', ... }
{ canonical: 'philippians', displayName: 'Philippians', ... }
[ 'Mark' ]
```

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/db/books.ts
git commit -m "feat(mcp): add book name normalization lookup table"
```

---

### Task 4: ETL — Levinsohn Discourse Features

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts`

The Levinsohn directory has ~30 JSON files. Each file contains references for one feature type across all NT books. Verse format: "Matt 2:13" → parse book abbreviation + chapter:verse.

**Step 1: Write the Levinsohn ETL function in build-db.ts**

```typescript
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { lookupBook } from '../src/db/books';

// Path from scripts/ to reference data
const REFERENCE_DIR = join(__dirname, '../../../skills/biblical-segmentation/reference');
const LEVINSOHN_DIR = join(REFERENCE_DIR, 'levinsohn');

interface LevinsohnRef {
  verse: string;  // "Matt 2:13"
  word: string;
  type: string;
}

interface LevinsohnFile {
  feature: string;
  description: string;
  references: LevinsohnRef[];
}

function parseLevisohnVerse(verseStr: string): { book: string; chapter: number; verse: number } | null {
  // Format: "Matt 2:13" or "1Cor 3:1"
  const spaceIdx = verseStr.lastIndexOf(' ');
  if (spaceIdx === -1) return null;

  const bookAbbrev = verseStr.slice(0, spaceIdx).trim();
  const chVerse = verseStr.slice(spaceIdx + 1).trim();
  const [chStr, vStr] = chVerse.split(':');

  const bookInfo = lookupBook(bookAbbrev);
  if (!bookInfo) {
    // Try without space (e.g., "1Cor")
    const bookInfo2 = lookupBook(verseStr.split(' ')[0]);
    if (!bookInfo2) return null;
  }

  const chapter = parseInt(chStr, 10);
  const verse = parseInt(vStr, 10);
  if (isNaN(chapter) || isNaN(verse)) return null;

  return { book: bookInfo?.canonical ?? lookupBook(verseStr.split(' ')[0])!.canonical, chapter, verse };
}

export function loadLevinsohn(db: Database): void {
  const files = readdirSync(LEVINSOHN_DIR).filter(f => f.endsWith('.json'));
  let totalRows = 0;
  let skipped = 0;

  const stmt = db.prepare(`
    INSERT INTO discourse_features (book, chapter, verse, feature, feature_description, word)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const filename of files) {
    const filePath = join(LEVINSOHN_DIR, filename);
    const data: LevinsohnFile = JSON.parse(readFileSync(filePath, 'utf-8'));
    const featureName = data.feature.toLowerCase().replace(/[\s\-]+/g, '_');
    const description = data.description ?? null;

    for (const ref of data.references ?? []) {
      const parsed = parseLevisohnVerse(ref.verse);
      if (!parsed) {
        skipped++;
        continue;
      }
      stmt.run([parsed.book, parsed.chapter, parsed.verse, featureName, description, ref.word ?? null]);
      totalRows++;
    }
  }

  stmt.free();
  console.log(`  Levinsohn: ${totalRows} rows, ${skipped} skipped`);
}
```

**Step 2: Run a dry-run check**

Add temporary `main()` to build-db.ts:

```typescript
async function main() {
  console.log('Testing Levinsohn ETL...');
  const { createDatabase } = await import('./create-schema');
  const db = await createDatabase('/tmp/test-levinsohn.sqlite');
  loadLevinsohn(db);
  const result = db.exec("SELECT feature, COUNT(*) as cnt FROM discourse_features GROUP BY feature ORDER BY cnt DESC LIMIT 5");
  console.log(result[0]?.values);
  db.close();
}
main().catch(console.error);
```

Run:
```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
npx ts-node scripts/build-db.ts
```

Expected: Levinsohn row count (~10k rows), top 5 features by count printed, no crash.

**Step 3: Remove the temporary main()**

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/
git commit -m "feat(mcp): add Levinsohn ETL to build-db"
```

---

### Task 5: ETL — Masoretic Paragraph Markers

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts`

One file per OT book. Filename (without `.json`) is the masoreticsFile key in books.ts. Verse format: "1:2" (chapter:verse, no book prefix).

**Step 1: Add masoretic ETL function**

```typescript
const MASORETIC_DIR = join(REFERENCE_DIR, 'masoretic');

interface MasoreticFile {
  book: string;      // "Genesis" (human-readable, use for display only)
  petuchot: string[]; // ["1:2", "1:5", ...]
  setumot: string[];  // ["2:11", ...]
}

export function loadMasoretic(db: Database): void {
  const files = readdirSync(MASORETIC_DIR).filter(f => f.endsWith('.json'));
  let totalRows = 0;

  const stmt = db.prepare(`
    INSERT INTO paragraph_markers (book, chapter, verse, marker_type)
    VALUES (?, ?, ?, ?)
  `);

  for (const filename of files) {
    // Normalize filename to canonical book name
    // e.g., "1-chronicles.json" → lookup "1chronicles" → canonical "1_chronicles"
    const stem = filename.replace('.json', ''); // "1-chronicles"
    const bookInfo = lookupBook(stem);
    if (!bookInfo) {
      console.warn(`  WARN: Unknown book file: ${filename}`);
      continue;
    }

    const data: MasoreticFile = JSON.parse(readFileSync(join(MASORETIC_DIR, filename), 'utf-8'));

    const insertMarkers = (refs: string[], markerType: string) => {
      for (const ref of refs ?? []) {
        const [chStr, vStr] = ref.split(':');
        const chapter = parseInt(chStr, 10);
        const verse = parseInt(vStr, 10);
        if (isNaN(chapter) || isNaN(verse)) continue;
        stmt.run([bookInfo.canonical, chapter, verse, markerType]);
        totalRows++;
      }
    };

    insertMarkers(data.petuchot, 'petuchah');
    insertMarkers(data.setumot, 'setumah');
  }

  stmt.free();
  console.log(`  Masoretic: ${totalRows} rows`);
}
```

**Step 2: Test with dry run**

```bash
# Quick test: check Genesis loaded correctly
npx ts-node -e "
import initSqlJs from 'sql.js';
import { createDatabase } from './scripts/create-schema';
import { loadMasoretic } from './scripts/build-db';

async function run() {
  const db = await createDatabase('/tmp/test.sqlite');
  loadMasoretic(db);
  const r = db.exec(\"SELECT COUNT(*), marker_type FROM paragraph_markers WHERE book='genesis' GROUP BY marker_type\");
  console.log(r[0]?.values);
  db.close();
}
run().catch(console.error);
"
```

Expected: Two rows showing petuchot/setumah counts for Genesis (should be ~800+ petuchot, ~500+ setumot based on the data we saw).

**Step 3: Commit**

```bash
git commit -am "feat(mcp): add Masoretic ETL to build-db"
```

---

### Task 6: ETL — Vocabulary, Clustering & Thematic Keywords

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts`

Three tables: `vocabulary`, `vocabulary_clusters`, `thematic_keywords`.

Source files:
- `vocabulary/nt_lemmas.yaml` → `vocabulary` (testament='nt')
- `vocabulary/ot_lemmas.yaml` → `vocabulary` (testament='ot')
- `vocabulary/semantic_groups.yaml` → `thematic_keywords`
- Clustering computed from lemma YAML using the analyze_clusters.py algorithm

**Step 1: Add vocabulary ETL**

```typescript
import yaml from 'js-yaml';

const VOCAB_DIR = join(REFERENCE_DIR, 'vocabulary');

// Clustering constants from analyze_clusters.py
const MIN_OCCURRENCES = 5;
const MIN_CHAPTERS = 2;
const MAX_CHAPTERS = 4;
const CLUSTERING_THRESHOLD = 0.6;

interface LemmaData {
  total: number;
  by_chapter: Record<number, number>;
}

interface VocabFile {
  books: Record<string, {
    total_lemmas: number;
    lemmas: Record<string, LemmaData>;
  }>;
}

function findBestCluster(
  byChapter: Record<number, number>
): { start: number; end: number; concentration: number } | null {
  const chapters = Object.keys(byChapter).map(Number).sort((a, b) => a - b);
  const total = Object.values(byChapter).reduce((a, b) => a + b, 0);

  if (total < MIN_OCCURRENCES || chapters.length < MIN_CHAPTERS) return null;

  let best = { start: 0, end: 0, concentration: 0 };

  for (let size = MIN_CHAPTERS; size <= MAX_CHAPTERS; size++) {
    for (let i = 0; i <= chapters.length - size; i++) {
      const start = chapters[i];
      const end = chapters[i + size - 1];
      // Sum all occurrences in chapters[i..i+size-1]
      const inRange = chapters.slice(i, i + size).reduce(
        (sum, ch) => sum + (byChapter[ch] ?? 0), 0
      );
      const concentration = inRange / total;
      if (concentration > best.concentration) {
        best = { start, end, concentration };
      }
    }
  }

  return best.concentration >= CLUSTERING_THRESHOLD ? best : null;
}

export function loadVocabulary(db: Database): void {
  const vocabStmt = db.prepare(`
    INSERT INTO vocabulary (book, testament, chapter, lemma, frequency)
    VALUES (?, ?, ?, ?, ?)
  `);
  const clusterStmt = db.prepare(`
    INSERT INTO vocabulary_clusters (book, testament, lemma, concentration, chapter_start, chapter_end, total_occurrences)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let vocabRows = 0;
  let clusterRows = 0;

  for (const testament of ['nt', 'ot'] as const) {
    const filePath = join(VOCAB_DIR, `${testament}_lemmas.yaml`);
    const data = yaml.load(readFileSync(filePath, 'utf-8')) as VocabFile;

    for (const [bookDisplayName, bookData] of Object.entries(data.books ?? {})) {
      const bookInfo = lookupBook(bookDisplayName);
      if (!bookInfo) {
        console.warn(`  WARN: Unknown book in ${testament}_lemmas.yaml: ${bookDisplayName}`);
        continue;
      }
      const canonical = bookInfo.canonical;

      for (const [lemma, lemmaData] of Object.entries(bookData.lemmas ?? {})) {
        // Insert per-chapter rows
        const byChapter = lemmaData.by_chapter ?? {};
        for (const [chStr, freq] of Object.entries(byChapter)) {
          vocabStmt.run([canonical, testament, parseInt(chStr, 10), lemma, freq]);
          vocabRows++;
        }

        // Compute cluster
        const cluster = findBestCluster(byChapter);
        if (cluster) {
          clusterStmt.run([
            canonical, testament, lemma,
            cluster.concentration, cluster.start, cluster.end,
            lemmaData.total
          ]);
          clusterRows++;
        }
      }
    }
  }

  vocabStmt.free();
  clusterStmt.free();
  console.log(`  Vocabulary: ${vocabRows} rows, ${clusterRows} clusters`);
}

export function loadThematicKeywords(db: Database): void {
  const filePath = join(VOCAB_DIR, 'semantic_groups.yaml');
  const data = yaml.load(readFileSync(filePath, 'utf-8')) as {
    semantic_groups: Record<string, {
      nt_lemmas: Record<string, string>;
      ot_strongs: Record<string, unknown>;
    }>;
  };

  const stmt = db.prepare(`
    INSERT INTO thematic_keywords (theme, lemma, testament) VALUES (?, ?, ?)
  `);

  let rows = 0;
  for (const [theme, group] of Object.entries(data.semantic_groups ?? {})) {
    for (const lemma of Object.keys(group.nt_lemmas ?? {})) {
      stmt.run([theme, lemma, 'nt']);
      rows++;
    }
    for (const strongsNum of Object.keys(group.ot_strongs ?? {})) {
      stmt.run([theme, strongsNum, 'ot']);
      rows++;
    }
  }

  stmt.free();
  console.log(`  Thematic keywords: ${rows} rows`);
}
```

**Step 2: Test with dry run**

```bash
npx ts-node -e "
import { createDatabase } from './scripts/create-schema';
import { loadVocabulary, loadThematicKeywords } from './scripts/build-db';

async function run() {
  const db = await createDatabase('/tmp/test-vocab.sqlite');
  loadVocabulary(db);
  loadThematicKeywords(db);

  // Check Philippians joy cluster
  const r = db.exec(\"SELECT lemma, concentration, chapter_start, chapter_end FROM vocabulary_clusters WHERE book='philippians' AND lemma='χαίρω'\");
  console.log('Phil joy cluster:', r[0]?.values);

  // Check themes
  const t = db.exec(\"SELECT theme, COUNT(*) FROM thematic_keywords GROUP BY theme\");
  console.log('Themes:', t[0]?.values);
  db.close();
}
run().catch(console.error);
"
```

Expected: Phil χαίρω cluster showing concentration ~0.67, chapters 1-4. Themes showing ~13 entries.

**Step 3: Commit**

```bash
git commit -am "feat(mcp): add vocabulary, clustering, and thematic keyword ETL"
```

---

### Task 7: ETL — Morphology

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts`

Morphology is the largest table (122MB source, potentially 50-90MB in SQLite). One file per book in `morphology/nt/` and `morphology/ot/`. Verse key format: "1:1". Word position = array index + 1.

**Step 1: Add morphology ETL**

```typescript
const MORPH_DIR = join(REFERENCE_DIR, 'morphology');

interface WordEntry {
  text: string;
  normalized?: string;
  lemma: string;
  pos: string;
  parsing?: Record<string, string>;
}

interface MorphologyFile {
  verses: Record<string, WordEntry[]>;
}

export function loadMorphology(db: Database): void {
  const stmt = db.prepare(`
    INSERT INTO morphology
      (book, testament, chapter, verse, word_position, text, normalized, lemma, pos, parsing)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalRows = 0;

  for (const testament of ['nt', 'ot'] as const) {
    const dir = join(MORPH_DIR, testament);
    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      console.warn(`  WARN: morphology/${testament}/ not found, skipping`);
      continue;
    }

    for (const filename of files) {
      // Filename is like "luke.json" or "1_corinthians.json"
      const stem = filename.replace('.json', '');
      const bookInfo = lookupBook(stem);
      if (!bookInfo) {
        console.warn(`  WARN: Unknown book file: morphology/${testament}/${filename}`);
        continue;
      }

      const data: MorphologyFile = JSON.parse(
        readFileSync(join(dir, filename), 'utf-8')
      );

      for (const [verseKey, words] of Object.entries(data.verses ?? {})) {
        const [chStr, vStr] = verseKey.split(':');
        const chapter = parseInt(chStr, 10);
        const verse = parseInt(vStr, 10);
        if (isNaN(chapter) || isNaN(verse)) continue;

        words.forEach((word, idx) => {
          stmt.run([
            bookInfo.canonical,
            testament,
            chapter,
            verse,
            idx + 1,  // 1-indexed word position
            word.text,
            word.normalized ?? null,
            word.lemma,
            word.pos,
            word.parsing ? JSON.stringify(word.parsing) : null,
          ]);
          totalRows++;
        });
      }

      if (totalRows % 100_000 === 0) {
        process.stdout.write(`\r  Morphology: ${totalRows} rows...`);
      }
    }
  }

  stmt.free();
  console.log(`\n  Morphology: ${totalRows} rows total`);
}
```

**Step 2: Quick NT-only test (skip OT for speed)**

Temporarily comment out the `ot` iteration and test with just NT:

```bash
npx ts-node -e "
import { createDatabase } from './scripts/create-schema';
import { loadMorphology } from './scripts/build-db';

async function run() {
  const db = await createDatabase('/tmp/test-morph-nt.sqlite');
  loadMorphology(db);
  const r = db.exec(\"SELECT COUNT(*) FROM morphology WHERE testament='nt'\");
  console.log('NT word count:', r[0]?.values);
  const sample = db.exec(\"SELECT text, lemma, pos FROM morphology WHERE book='philippians' AND chapter=1 AND verse=6 LIMIT 5\");
  console.log('Phil 1:6:', sample[0]?.values);
  db.close();
}
run().catch(console.error);
"
```

Expected: NT word count ~140k, Phil 1:6 shows Greek words including the aorist participle.

**Step 3: Restore OT iteration**

**Step 4: Commit**

```bash
git commit -am "feat(mcp): add morphology ETL to build-db"
```

---

### Task 8: Build Database & Validate Size (HARD GATE)

**This is the most critical step. Do not implement any tools until this gate passes.**

**Step 1: Write the complete build-db.ts main function**

```typescript
import { join } from 'path';

const DB_PATH = join(__dirname, '../data/biblical.sqlite');

async function main() {
  console.log('Building biblical.sqlite...');
  const start = Date.now();

  const { createDatabase, saveDatabase } = await import('./create-schema');
  const db = await createDatabase(DB_PATH);

  console.log('Loading Levinsohn discourse features...');
  loadLevinsohn(db);

  console.log('Loading Masoretic paragraph markers...');
  loadMasoretic(db);

  console.log('Loading vocabulary and clusters...');
  loadVocabulary(db);
  loadThematicKeywords(db);

  console.log('Loading morphology (this takes a while)...');
  loadMorphology(db);

  console.log('Saving database...');
  saveDatabase(db, DB_PATH);
  db.close();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

**Step 2: Run the full build**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
time npm run build:db
```

Expected: Completes in under 60 seconds. If it takes longer than 3 minutes, something is wrong.

**Step 3: Measure database file size**

```bash
ls -lh data/biblical.sqlite
du -sh data/biblical.sqlite
```

**Step 4: Measure Node.js RSS with sql.js loading the database**

```bash
node -e "
const initSqlJs = require('sql.js');
const { readFileSync } = require('fs');
const path = require('path');

initSqlJs().then(SQL => {
  const buf = readFileSync(path.join(__dirname, 'data/biblical.sqlite'));
  const db = new SQL.Database(buf);
  console.log('RSS after loading:', process.memoryUsage().rss / 1024 / 1024, 'MB');
  // Run a simple query to ensure fully loaded
  db.exec('SELECT COUNT(*) FROM morphology');
  console.log('RSS after query:', process.memoryUsage().rss / 1024 / 1024, 'MB');
  db.close();
});
"
```

**Step 5: Evaluate results**

| Result | Action |
|--------|--------|
| File ≤ 60MB AND RSS ≤ 200MB | ✅ Proceed to Task 9 |
| File 60-80MB but RSS ≤ 200MB | ⚠️ Discuss with user before proceeding |
| File > 80MB OR RSS > 200MB | 🛑 Implement Option B first (compact parsing column) |

**Option B: Compact parsing column (if needed)**

If the database is too large, change the `parsing` column from JSON to a compact string. Map morphological categories to single-letter codes:

```typescript
// In loadMorphology(), replace:
word.parsing ? JSON.stringify(word.parsing) : null,

// With:
word.parsing ? compactParsing(word.parsing) : null,

// Add helper:
function compactParsing(p: Record<string, string>): string {
  // Expand at query time in morphology.ts tool
  return JSON.stringify(p); // placeholder — implement compaction if needed
}
```

The actual compaction scheme would map `{tense: "aorist", voice: "middle", mood: "participle"}` to `"A-M-P"`. This is only needed if the gate fails.

**Step 6: Commit after gate passes**

```bash
git add data/biblical.sqlite
git commit -am "feat(mcp): build biblical.sqlite ETL complete — size validated"
```

Add `data/biblical.sqlite` to tracking (it's a build artifact shipped with the package, not excluded by .gitignore).

---

### Task 9: MCP Server Entry Point

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/index.ts`

**Step 1: Write the MCP server entry point**

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { queryDiscourseFeatures } from './tools/discourse.js';
import { queryParagraphBreaks } from './tools/paragraphs.js';
import { queryVocabulary } from './tools/vocabulary.js';
import { queryMorphology } from './tools/morphology.js';

const TOOLS: Tool[] = [
  {
    name: 'query_discourse_features',
    description: 'Query Levinsohn NT discourse features (historical present, left dislocation, etc.) for a given book and chapter range. NT books only.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'NT book name (any common form)' },
        features: { type: 'array', items: { type: 'string' }, description: 'Feature names to filter (default: 6 segmentation features)' },
        chapter_range: { type: 'string', description: 'Chapter range: "3", "3-7", or omit for all' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_paragraph_breaks',
    description: 'Query Masoretic paragraph markers (petuchah/setumah) for an OT book. OT books only.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'OT book name (any common form)' },
        chapter_range: { type: 'string', description: 'Chapter range: "3", "3-7", or omit for all' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_vocabulary',
    description: 'Query vocabulary frequencies, thematic keyword matches, and clustering for any biblical book.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'Book name (any common form)' },
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: nt)' },
        theme: { type: 'string', description: 'Thematic keyword group (e.g., "joy", "faith")' },
        check_clustering: { type: 'boolean', description: 'Include precomputed vocabulary clusters' },
        min_frequency: { type: 'number', description: 'Minimum lemma frequency (default: 1)' },
        limit: { type: 'number', description: 'Max lemmas returned (default: 200)' },
      },
      required: ['book'],
    },
  },
  {
    name: 'query_morphology',
    description: 'Query morphological parsing data for a verse range.',
    inputSchema: {
      type: 'object',
      properties: {
        book: { type: 'string', description: 'Book name (any common form)' },
        range: { type: 'string', description: 'Verse range: "1:1-1:11" or "1:6"' },
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: nt)' },
        pos_filter: { type: 'string', description: 'Filter by part of speech' },
        word_filter: { type: 'string', description: 'Filter by word form (matches text, normalized, lemma)' },
      },
      required: ['book', 'range'],
    },
  },
];

const server = new Server(
  { name: 'claude-of-alexandria-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_discourse_features':
        return { content: [{ type: 'text', text: JSON.stringify(await queryDiscourseFeatures(args)) }] };
      case 'query_paragraph_breaks':
        return { content: [{ type: 'text', text: JSON.stringify(await queryParagraphBreaks(args)) }] };
      case 'query_vocabulary':
        return { content: [{ type: 'text', text: JSON.stringify(await queryVocabulary(args)) }] };
      case 'query_morphology':
        return { content: [{ type: 'text', text: JSON.stringify(await queryMorphology(args)) }] };
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` } }) }] };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: msg } }) }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until killed
}

main().catch(e => { console.error(e); process.exit(1); });
```

**Step 2: Create stub tool files**

```typescript
// src/tools/discourse.ts
export async function queryDiscourseFeatures(args: unknown): Promise<unknown> {
  return { error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Task 11' } };
}
```

Create identical stubs for `paragraphs.ts`, `vocabulary.ts`, `morphology.ts`.

**Step 3: Build and verify server starts**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

Expected: JSON response listing all 4 tools, then server waits (Ctrl+C to exit).

**Step 4: Commit**

```bash
git commit -am "feat(mcp): add MCP server entry point with 4 tool stubs"
```

---

### Task 10: SQLite Query Layer

**Files:**
- Create: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/db/query.ts`

Lazy-loads the database on first use. All tools call through this layer.

**Step 1: Write query.ts**

```typescript
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

function getDbPath(): string {
  if (process.env.DATA_DIR) {
    return join(process.env.DATA_DIR, 'biblical.sqlite');
  }
  // Fallback: relative to dist/
  return join(__dirname, '../../data/biblical.sqlite');
}

async function getDb(): Promise<Database> {
  if (db) return db;

  const dbPath = getDbPath();
  let dbBuffer: Buffer;
  try {
    dbBuffer = readFileSync(dbPath);
  } catch {
    throw new Error(`Database not found at ${dbPath}. Run 'npm run build:db' first.`);
  }

  const SQL = await initSqlJs();
  db = new SQL.Database(dbBuffer);
  return db;
}

export type QueryResult = Record<string, unknown>[];

export async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: QueryResult = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export async function queryFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}
```

**Step 2: Test the query layer**

```bash
npx ts-node -e "
import { query } from './src/db/query';

async function run() {
  // Should find Phil 1:6 morphology
  const rows = await query(
    'SELECT text, lemma, pos FROM morphology WHERE book=? AND chapter=? AND verse=? LIMIT 3',
    ['philippians', 1, 6]
  );
  console.log(rows);

  // Should find joy theme keywords
  const themes = await query('SELECT theme, lemma, testament FROM thematic_keywords WHERE theme=?', ['joy']);
  console.log(themes);
}
run().catch(console.error);
"
```

Expected: Phil 1:6 words, joy theme lemmas.

**Step 3: Commit**

```bash
git commit -am "feat(mcp): add lazy-loading SQLite query layer"
```

---

### Task 11: Tool — query_discourse_features

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/tools/discourse.ts`

**Step 1: Write discourse.ts**

```typescript
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

const DEFAULT_FEATURES = [
  'historical_present', 'left_dislocation', 'referential_pod',
  'situational_pod', 'reported_speech', 'tail_head_linkage',
];

function parseChapterRange(range?: string): { min?: number; max?: number } | { error: string } {
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

export async function queryDiscourseFeatures(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }
  if (bookInfo.testament !== 'nt') {
    return { error: { code: 'TESTAMENT_MISMATCH', message: `Discourse features are NT only. '${bookInfo.displayName}' is an OT book.` } };
  }

  const chapterRange = args.chapter_range as string | undefined;
  const rangeResult = parseChapterRange(chapterRange);
  if ('error' in rangeResult) {
    return { error: { code: 'INVALID_RANGE', message: rangeResult.error } };
  }

  const requestedFeatures = (args.features as string[] | undefined) ?? DEFAULT_FEATURES;

  // Build query with optional chapter filter
  let sql = 'SELECT chapter, verse, feature, feature_description, word FROM discourse_features WHERE book = ?';
  const params: unknown[] = [bookInfo.canonical];

  if ('min' in rangeResult && rangeResult.min !== undefined) {
    sql += ' AND chapter >= ? AND chapter <= ?';
    params.push(rangeResult.min, rangeResult.max);
  }

  if (requestedFeatures.length > 0) {
    sql += ` AND feature IN (${requestedFeatures.map(() => '?').join(',')})`;
    params.push(...requestedFeatures);
  }

  sql += ' ORDER BY chapter, verse';

  const rows = await query(sql, params);

  // Get all available features for this book
  const allFeaturesRows = await query(
    'SELECT DISTINCT feature FROM discourse_features WHERE book = ? ORDER BY feature',
    [bookInfo.canonical]
  );
  const availableFeatures = allFeaturesRows.map(r => r.feature as string);

  // Group by feature
  const features: Record<string, { chapter: number; verse: number; word: string | null; feature_description: string | null }[]> = {};
  const summary: Record<string, number> = {};

  for (const row of rows) {
    const feature = row.feature as string;
    if (!features[feature]) features[feature] = [];
    features[feature].push({
      chapter: row.chapter as number,
      verse: row.verse as number,
      word: row.word as string | null,
      feature_description: row.feature_description as string | null,
    });
    summary[feature] = (summary[feature] ?? 0) + 1;
  }

  return {
    book: bookInfo.displayName,
    chapter_range: chapterRange ?? 'all',
    features,
    summary,
    available_features: availableFeatures,
  };
}
```

**Step 2: Test against Python output**

```bash
# Get Python output
cd plugins/claude-of-alexandria/skills/biblical-segmentation/scripts
python3 levinsohn_parser.py Philippians --output json > /tmp/py-discourse-phil.json

# Get MCP tool output
cd ../../../servers/claude-of-alexandria-mcp
npx ts-node -e "
import { queryDiscourseFeatures } from './src/tools/discourse';
queryDiscourseFeatures({ book: 'Philippians' }).then(r => console.log(JSON.stringify(r, null, 2)));
" > /tmp/mcp-discourse-phil.json

# Compare summaries
python3 -c "
import json
py = json.load(open('/tmp/py-discourse-phil.json'))
mcp = json.load(open('/tmp/mcp-discourse-phil.json'))
print('Python summary:', py.get('summary'))
print('MCP summary:', mcp.get('summary'))
"
```

Expected: Counts match. Acceptable differences: key formatting, ordering.

**Step 3: Commit**

```bash
git commit -am "feat(mcp): implement query_discourse_features tool"
```

---

### Task 12: Tool — query_paragraph_breaks

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/tools/paragraphs.ts`

**Step 1: Write paragraphs.ts**

```typescript
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseChapterRange } from './utils.js'; // extract parseChapterRange to shared utils

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
```

Note: Extract `parseChapterRange` to `src/tools/utils.ts` and import it in both discourse.ts and paragraphs.ts.

**Step 2: Test against Python output**

```bash
# Python
python3 sefaria_paragraphs.py Genesis --chapter-range 37-50 --output json > /tmp/py-para-gen.json

# MCP
npx ts-node -e "
import { queryParagraphBreaks } from './src/tools/paragraphs';
queryParagraphBreaks({ book: 'Genesis', chapter_range: '37-50' }).then(r => console.log(JSON.stringify(r.summary)));
"
```

Expected: Totals match.

**Step 3: Commit**

```bash
git commit -am "feat(mcp): implement query_paragraph_breaks tool"
```

---

### Task 13: Tool — query_vocabulary

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/tools/vocabulary.ts`

**Step 1: Write vocabulary.ts**

```typescript
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

export async function queryVocabulary(args: Record<string, unknown>): Promise<unknown> {
  const bookInput = args.book as string;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return { error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) } };
  }

  const testament = (args.testament as string | undefined) ?? (bookInfo.testament);
  if (testament !== 'nt' && testament !== 'ot') {
    return { error: { code: 'INVALID_TESTAMENT', message: `Invalid testament: '${testament}'. Use 'nt' or 'ot'.` } };
  }

  const theme = args.theme as string | undefined;
  const checkClustering = args.check_clustering as boolean | undefined;
  const minFrequency = (args.min_frequency as number | undefined) ?? 1;
  const limit = (args.limit as number | undefined) ?? 200;

  // Validate theme if provided
  if (theme) {
    const themeCheck = await query(
      'SELECT DISTINCT theme FROM thematic_keywords WHERE theme = ? AND testament = ?',
      [theme, testament]
    );
    if (themeCheck.length === 0) {
      const allThemes = await query(
        'SELECT DISTINCT theme FROM thematic_keywords WHERE testament = ? ORDER BY theme',
        [testament]
      );
      return {
        error: {
          code: 'INVALID_THEME',
          message: `Theme '${theme}' not found for ${testament.toUpperCase()}.`,
          available_themes: allThemes.map(r => r.theme),
        },
      };
    }
  }

  const canonical = bookInfo.canonical;

  // Get lemma totals per book (sum across chapters)
  let sql: string;
  let params: unknown[];

  if (theme) {
    // Join with thematic_keywords to filter
    sql = `
      SELECT v.lemma, SUM(v.frequency) as total
      FROM vocabulary v
      JOIN thematic_keywords tk ON tk.lemma = v.lemma AND tk.testament = v.testament
      WHERE v.book = ? AND v.testament = ? AND tk.theme = ? AND SUM(v.frequency) >= ?
      GROUP BY v.lemma
      ORDER BY total DESC
      LIMIT ?
    `;
    // Can't use HAVING with alias in some SQLite versions, use subquery:
    sql = `
      SELECT lemma, total FROM (
        SELECT v.lemma, SUM(v.frequency) as total
        FROM vocabulary v
        JOIN thematic_keywords tk ON tk.lemma = v.lemma AND tk.testament = v.testament
        WHERE v.book = ? AND v.testament = ? AND tk.theme = ?
        GROUP BY v.lemma
      ) WHERE total >= ?
      ORDER BY total DESC
      LIMIT ?
    `;
    params = [canonical, testament, theme, minFrequency, limit];
  } else {
    sql = `
      SELECT lemma, total FROM (
        SELECT lemma, SUM(frequency) as total
        FROM vocabulary
        WHERE book = ? AND testament = ?
        GROUP BY lemma
      ) WHERE total >= ?
      ORDER BY total DESC
      LIMIT ?
    `;
    params = [canonical, testament, minFrequency, limit];
  }

  const lemmaRows = await query(sql, params);

  // Get by_chapter data for each returned lemma
  const lemmaNames = lemmaRows.map(r => r.lemma as string);
  const byChapterRows = lemmaNames.length > 0
    ? await query(
        `SELECT lemma, chapter, frequency FROM vocabulary
         WHERE book = ? AND testament = ? AND lemma IN (${lemmaNames.map(() => '?').join(',')})
         ORDER BY lemma, chapter`,
        [canonical, testament, ...lemmaNames]
      )
    : [];

  // Build by_chapter map
  const byChapterMap: Record<string, Record<string, number>> = {};
  for (const row of byChapterRows) {
    const lemma = row.lemma as string;
    const chapter = String(row.chapter);
    if (!byChapterMap[lemma]) byChapterMap[lemma] = {};
    byChapterMap[lemma][chapter] = row.frequency as number;
  }

  const lemmaList = lemmaRows.map(r => ({
    lemma: r.lemma as string,
    total: r.total as number,
    by_chapter: byChapterMap[r.lemma as string] ?? {},
  }));

  // Clustering
  let clustering = null;
  if (checkClustering) {
    const clusterRows = await query(
      'SELECT lemma, concentration, chapter_start, chapter_end, total_occurrences FROM vocabulary_clusters WHERE book = ? AND testament = ? ORDER BY concentration DESC',
      [canonical, testament]
    );

    if (clusterRows.length === 0 && testament === 'ot') {
      clustering = { has_clustering: false, clusters: [] };
    } else {
      clustering = {
        has_clustering: clusterRows.length > 0,
        notable_count: clusterRows.length,
        clusters: clusterRows.map(r => ({
          lemma: r.lemma,
          concentration: r.concentration,
          chapter_range: `${r.chapter_start}-${r.chapter_end}`,
          total_occurrences: r.total_occurrences,
        })),
      };
    }
  }

  if (theme) {
    return {
      book: bookInfo.displayName,
      testament,
      theme,
      thematic_matches: lemmaList,
      clustering,
    };
  }

  // Get total lemma count for the book
  const totalResult = await query(
    'SELECT COUNT(DISTINCT lemma) as cnt FROM vocabulary WHERE book = ? AND testament = ?',
    [canonical, testament]
  );
  const totalLemmas = (totalResult[0]?.cnt as number) ?? 0;

  return {
    book: bookInfo.displayName,
    testament,
    lemmas: lemmaList,
    total_lemmas: totalLemmas,
    returned: lemmaList.length,
    clustering,
  };
}
```

**Step 2: Test against Python output**

```bash
# Python
python3 vocabulary_parser.py Philippians --theme joy --check-clustering --output json > /tmp/py-vocab-phil.json

# MCP
npx ts-node -e "
import { queryVocabulary } from './src/tools/vocabulary';
queryVocabulary({ book: 'Philippians', testament: 'nt', theme: 'joy', check_clustering: true })
  .then(r => console.log(JSON.stringify(r, null, 2)));
" > /tmp/mcp-vocab-phil.json

python3 -c "
import json
py = json.load(open('/tmp/py-vocab-phil.json'))
mcp = json.load(open('/tmp/mcp-vocab-phil.json'))
print('Python thematic:', py.get('thematic_matches', py.get('themes')))
print('MCP thematic:', mcp.get('thematic_matches'))
"
```

**Step 3: Commit**

```bash
git commit -am "feat(mcp): implement query_vocabulary tool"
```

---

### Task 14: Tool — query_morphology

**Files:**
- Modify: `plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/src/tools/morphology.ts`

**Step 1: Write morphology.ts**

```typescript
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

interface VerseRange {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

function parseVerseRange(range: string): VerseRange | { error: string } {
  // Formats: "1:6" or "1:1-1:11"
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
    parsing: r.parsing ? JSON.parse(r.parsing as string) : null,
  }));

  // Summary
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
```

**Step 2: Test against Python output**

```bash
# Python
python3 morphology_parser.py Philippians --range 1:1-1:11 --output json > /tmp/py-morph-phil.json

# MCP
npx ts-node -e "
import { queryMorphology } from './src/tools/morphology';
queryMorphology({ book: 'Philippians', range: '1:1-1:11', testament: 'nt' })
  .then(r => console.log(JSON.stringify(r.summary)));
"
```

Expected: Word counts match.

**Step 3: Commit**

```bash
git commit -am "feat(mcp): implement query_morphology tool"
```

---

### Task 15: Parity Testing

**Goal:** For each tool, compare output against Python scripts for 3-5 representative books. Counts must match exactly.

**Step 1: Run parity test script**

Create `scripts/parity-test.sh`:

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_DIR="$SCRIPT_DIR/../../../skills/biblical-segmentation/scripts"
PASS=0; FAIL=0

check() {
  local name="$1" py_count="$2" mcp_count="$3"
  if [ "$py_count" = "$mcp_count" ]; then
    echo "  ✓ $name: $py_count"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name: Python=$py_count MCP=$mcp_count"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Discourse Features ==="
for book in Mark John Philippians Romans; do
  py=$(cd "$PY_DIR" && python3 levinsohn_parser.py "$book" --output json | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(d['summary'].values()))")
  mcp=$(npx ts-node -e "import {queryDiscourseFeatures} from './src/tools/discourse'; queryDiscourseFeatures({book:'$book'}).then(r=>console.log(Object.values(r.summary||{}).reduce((a,b)=>a+b,0)))" 2>/dev/null)
  check "$book" "$py" "$mcp"
done

echo "=== Paragraph Markers ==="
for book in Genesis Psalms Isaiah Jeremiah; do
  py=$(cd "$PY_DIR" && python3 sefaria_paragraphs.py "$book" --output json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['summary']['total'])")
  mcp=$(npx ts-node -e "import {queryParagraphBreaks} from './src/tools/paragraphs'; queryParagraphBreaks({book:'$book'}).then(r=>console.log(r.summary?.total))" 2>/dev/null)
  check "$book" "$py" "$mcp"
done

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
```

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
bash scripts/parity-test.sh
```

Expected: All checks pass.

**Step 2: Fix any discrepancies**

Common issues:
- Book name normalization mismatch (Levinsohn abbreviations vs lookup keys)
- Off-by-one in verse parsing
- Missing feature files not counted

**Step 3: Commit**

```bash
git commit -am "test(mcp): parity testing complete — all tools match Python output"
```

---

## Phase 2: Integrate with Plugin

### Task 16: Add .mcp.json to Plugin

**Files:**
- Create: `plugins/claude-of-alexandria/.mcp.json`

**Step 1: Write .mcp.json**

```json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/servers/claude-of-alexandria-mcp/dist/index.js"],
      "env": {
        "DATA_DIR": "${CLAUDE_PLUGIN_ROOT}/servers/claude-of-alexandria-mcp/data"
      }
    }
  }
}
```

**Step 2: Verify dist/index.js is built**

```bash
ls plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/dist/index.js
```

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/.mcp.json
git commit -m "feat(mcp): add .mcp.json plugin MCP server configuration"
```

---

### Task 17: Update biblical-segmentation/SKILL.md

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md`

**Step 1: Read the current SKILL.md**

Look for all `python scripts/` invocations.

**Step 2: Update the allowed-tools frontmatter**

Change:
```yaml
allowed-tools: Read, Write, Glob, WebSearch, Bash
```
To:
```yaml
allowed-tools: Read, Write, Glob, WebSearch, Bash, mcp__claude-of-alexandria-mcp__query_discourse_features, mcp__claude-of-alexandria-mcp__query_paragraph_breaks, mcp__claude-of-alexandria-mcp__query_vocabulary, mcp__claude-of-alexandria-mcp__query_morphology
```

**Step 3: Replace each Python script invocation**

Replace all 4 patterns:

| Before | After |
|--------|-------|
| `python scripts/levinsohn_parser.py {book}` | `mcp__claude-of-alexandria-mcp__query_discourse_features` with `{"book": "{book}"}` |
| `python scripts/sefaria_paragraphs.py {book}` | `mcp__claude-of-alexandria-mcp__query_paragraph_breaks` with `{"book": "{book}"}` |
| `python scripts/vocabulary_parser.py {book}` | `mcp__claude-of-alexandria-mcp__query_vocabulary` with `{"book": "{book}", "testament": "{nt|ot}"}` |
| `python scripts/morphology_parser.py {book}` | `mcp__claude-of-alexandria-mcp__query_morphology` with `{"book": "{book}", "range": "{range}"}` |

**Step 4: Verify no `python scripts/` remain**

```bash
grep -n "python scripts/" plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md
```

Expected: No output.

**Step 5: Commit**

```bash
git add plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md
git commit -m "feat(mcp): update biblical-segmentation SKILL.md to use MCP tools"
```

---

### Task 18: Update exegetical-notes/SKILL.md

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md`

**Step 1: Read current SKILL.md**

```bash
grep -n "python\|morphology_parser\|vocabulary_parser" plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
```

**Step 2: Update frontmatter and replace Python invocations**

Same pattern as Task 17. The exegetical-notes skill uses `morphology_parser.py` and possibly `vocabulary_parser.py`.

**Step 3: Verify**

```bash
grep -n "python scripts/" plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
```

Expected: No output.

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
git commit -m "feat(mcp): update exegetical-notes SKILL.md to use MCP tools"
```

---

### Task 19: End-to-End Test in Claude Code

**Goal:** Confirm the MCP server starts and tools work within Claude Code.

**Step 1: Verify dist is built**

```bash
npm run build --prefix plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
```

**Step 2: Test server manually with MCP CLI (if available)**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/dist/index.js
```

Expected: Returns JSON with all 4 tools listed.

**Step 3: Test a tool call manually**

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_discourse_features","arguments":{"book":"Mark","chapter_range":"1-5"}}}' | node plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/dist/index.js
```

Expected: Returns JSON with discourse feature data for Mark 1-5.

**Step 4: Reload Claude Code and invoke biblical-segmentation skill**

In Claude Code, run `/biblical-segmentation` and test with a book. Verify tool calls succeed and return data.

---

## Phase 3: Publish & Distribute

### Task 20: Publish to npm

**Step 1: Verify package.json is complete**

Check: `name`, `version`, `main`, `bin`, `files`, `engines` all set correctly.

**Step 2: Log in to npm**

```bash
npm login
```

**Step 3: Dry run to verify package contents**

```bash
cd plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp
npm pack --dry-run
```

Expected: Lists `dist/` and `data/biblical.sqlite`. Total size should be ≤ 60MB.

**Step 4: Publish**

```bash
npm publish
```

**Step 5: Verify installable**

```bash
npx -y claude-of-alexandria-mcp &
sleep 2
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx -y claude-of-alexandria-mcp
```

Expected: Tool list returned.

**Step 6: Commit**

```bash
git commit -am "feat(mcp): publish claude-of-alexandria-mcp to npm"
```

---

### Task 21: Update package-desktop.yml

**Files:**
- Modify: `.github/workflows/package-desktop.yml`

**Step 1: Read current workflow**

```bash
cat .github/workflows/package-desktop.yml
```

**Step 2: Remove data exclusion hacks**

The current workflow likely has exclusions like `--exclude reference/morphology`. Since data is now in SQLite (in the MCP server package, not in the skill ZIP), these exclusions are no longer needed.

Remove any `--exclude reference/` or `--exclude "*.json"` flags from the ZIP creation commands.

**Step 3: Verify ZIP still fits under 30MB**

The biblical-segmentation ZIP now contains only SKILL.md, templates, and small YAML files (no JSON reference data). It should be well under 30MB.

**Step 4: Commit**

```bash
git add .github/workflows/package-desktop.yml
git commit -m "ci: remove reference data exclusions from skill ZIPs (data now in MCP package)"
```

---

### Task 22: Update README and CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Add Desktop installation instructions to README**

Add a new section:

```markdown
## Claude Desktop Setup

Add to your MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

\`\`\`json
{
  "mcpServers": {
    "claude-of-alexandria-mcp": {
      "command": "npx",
      "args": ["-y", "claude-of-alexandria-mcp"]
    }
  }
}
\`\`\`

**First run:** Downloads ~40-60MB of biblical reference data (cached after first use).
```

**Step 2: Update CHANGELOG.md**

Add under new version heading:

```markdown
## [X.Y.Z] - 2026-02-19

### Added
- MCP server (`claude-of-alexandria-mcp`) replacing Python script dependencies
- Claude Desktop support via `npx claude-of-alexandria-mcp`
- Four query tools: `query_discourse_features`, `query_paragraph_breaks`, `query_vocabulary`, `query_morphology`

### Changed
- `biblical-segmentation` and `exegetical-notes` skills now call MCP tools instead of Python scripts
- Skill ZIPs no longer bundle 139MB of reference data (moved to npm package)
```

**Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add Desktop MCP setup instructions and CHANGELOG entry"
```

---

## Phase 4: Cleanup

### Task 23: Archive Python Scripts

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/levinsohn_parser.py` (add header comment)
- Same for `sefaria_paragraphs.py`, `vocabulary_parser.py`, `morphology_parser.py`

**Step 1: Add archive notice to each Python script**

Add at the top of each file, after the docstring:

```python
# ARCHIVED: This script has been superseded by the claude-of-alexandria-mcp MCP server.
# Retained as reference for the data format and ETL validation baseline.
# See: plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts
```

**Step 2: Commit**

```bash
git add plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/
git commit -m "chore: mark Python parser scripts as archived (superseded by MCP server)"
```

---

## Final Verification Checklist

Before marking complete:

- [ ] `data/biblical.sqlite` builds successfully (`npm run build:db`)
- [ ] Database size ≤ 60MB, process RSS ≤ 200MB
- [ ] All 4 tools pass parity testing against Python scripts
- [ ] `npm run build` produces clean `dist/index.js` (no TypeScript errors)
- [ ] MCP server responds to `tools/list` and `tools/call`
- [ ] `biblical-segmentation` SKILL.md has no `python scripts/` references
- [ ] `exegetical-notes` SKILL.md has no `python scripts/` references
- [ ] End-to-end test in Claude Code passes
- [ ] npm package published and installable via `npx`
- [ ] CHANGELOG.md updated
- [ ] Python scripts marked as archived

---

**Plan complete. Recommended next step:** Invoke `/review-plan` to validate before execution.

**After review, execution options:**

1. **Subagent-Driven (this session)** — dispatch fresh subagent per task, review between tasks
2. **Parallel Session (separate)** — open new session with `kombajn-dev:build`, batch execution with checkpoints

Which approach?
