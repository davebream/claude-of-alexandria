# Add D1 Schema and ETL for Confessional Documents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Create migration `0013_add_confessional.sql`, a TypeScript ETL script `seed-confessional.ts` with an exported proof-text parser, Vitest tests for the parser, and integration into `seed-d1.sh` — seeding ~43 documents, ~2,500 sections, and ~20,000 proof-text verse rows from Creeds.json (Unlicense) into D1.

**Architecture:** A single TypeScript ETL script fetches Creeds.json, transforms confession and catechism documents into a unified superset-column sections table (NULL columns for format-incompatible fields), expands proof-text reference ranges to individual verse rows at ingestion time using the existing `lookupBook()` utility and a bundled static verse-count map, and writes SQL INSERT statements to a file applied by `wrangler d1 execute`. The migration defines three tables (`confessional_documents`, `confessional_sections`, `confessional_proof_texts`) and their indexes. The parser function is exported and independently tested with Vitest before the ETL script consumes it.

**Tech Stack:** TypeScript (ESM, `tsx` runner), Vitest 4.x, Wrangler CLI (`wrangler d1 execute`), Creeds.json (`@NonlinearFruit/creeds` npm package or raw GitHub URL), existing `lookupBook()` from `server/src/db/books.ts`.

---

## Context Files

> Pre-load these files at the start of each build phase. Derived from design components.

| File | Source | Confidence |
|------|--------|-----------|
| `server/scripts/seed-d1.sh` | design: C4 affected component | design |
| `server/scripts/generate-cross-references.ts` | design: C2/C3 pattern reference | design |
| `server/src/db/books.ts` | design: C2 lookupBook dependency | design |
| `server/src/tools/utils.test.ts` | design: test pattern reference | design |
| `server/package.json` | design: test runner / tsx runner config | design |
| `server/migrations/0011_add_lexicon_sources.sql` | design: C1 migration style reference | design |
| `server/migrations/0012_drop_old_lexicon.sql` | design: C1 migration numbering reference | design |

---

## Phase 1 — Research and Schema

### Task 1: Research Creeds.json Source Format (C5)

**Implements:** C5 (design)
**Depends on:** none
**Phase:** 1 — Research

**Files:**
- Read: Creeds.json README at `https://raw.githubusercontent.com/NonlinearFruit/creeds/master/README.md`
- Read: Sample document JSON from npm package or GitHub raw URL
- Create: `server/scripts/creeds-research-notes.txt` (scratch file — gitignored, local only)

**Step 1: Check if npm package exists and is accessible**

```bash
cd server && npm info @NonlinearFruit/creeds 2>/dev/null | head -20
```

Expected: Either package info (version, dist-tags) or "npm error 404". If 404, the script will use the raw GitHub URL.

**Step 2: Fetch the Creeds.json README to identify copyright-restricted documents**

```bash
curl -s https://raw.githubusercontent.com/NonlinearFruit/creeds/master/README.md | head -200
```

Read carefully. The README lists which documents are in the repository and notes any copyright restrictions. Identify all 20th/21st-century documents that are NOT under a permissive license (Unlicense, CC0, or public domain). These become the copyright exclusion list.

**Step 3: Fetch a confession document to verify the JSON structure**

```bash
# Westminster Confession of Faith is a safe reference document
curl -s https://raw.githubusercontent.com/NonlinearFruit/creeds/master/data/westminster-confession-of-faith.json | python3 -m json.tool | head -80
```

Confirm the presence of these fields:
- Top level: `Slug`, `Name`, `Year`, `Type` (or `Format`), `Chapters` or `Questions`
- Chapter level: `Chapter`, `Title`, `Sections`
- Section level: `Section`, `Content`, `ContentWithProofs`, `ProofTexts`
- ProofTexts level: array of objects with `Id` (proof group number) and `References` (array of citation strings)

**Step 4: Fetch a catechism document to compare structure**

```bash
curl -s https://raw.githubusercontent.com/NonlinearFruit/creeds/master/data/westminster-shorter-catechism.json | python3 -m json.tool | head -80
```

Confirm catechism fields: `Questions` array with `Number`, `Question`, `Answer`, `AnswerWithProofs`, `ProofTexts`.

**Step 5: Verify Thirty-Nine Articles is present**

```bash
curl -s https://raw.githubusercontent.com/NonlinearFruit/creeds/master/data/thirty-nine-articles.json | python3 -m json.tool | head -20
```

If 404: note it is absent and exclude from tradition map.

**Step 6: Confirm proof-text citation format**

Look at ProofTexts `References` array from Step 3. Examples to verify:
- Single verse format: `"Ps.19.1"` or `"Gen.1.1"`
- Range format: `"Gen.1.1-Gen.1.5"` or `"1Cor.15.1-1Cor.15.4"`
- Note whether the dash separator `-` is always between two full `Book.Ch.V` endpoints (not abbreviated ranges like `Gen.1.1-5`)

**Step 7: Record research findings**

Write `server/scripts/creeds-research-notes.txt` with:
```
DATE: <today>
NPM_PACKAGE: exists | 404
SOURCE_URL: <URL used>
COPYRIGHT_EXCLUSIONS: <comma-separated list of document slugs to exclude>
CONFESSION_FIELDS: <actual field names confirmed>
CATECHISM_FIELDS: <actual field names confirmed>
PROOF_TEXT_FORMAT: <describe the citation format with one real example>
THIRTY_NINE_ARTICLES: present | absent
NOTES: <anything unexpected>
```

This file gates Tasks 3 and 4. Do not proceed to Task 3 until this file exists and contains the copyright exclusion list.

**Done when:** `creeds-research-notes.txt` exists with all fields filled in.

---

### Task 2: Write the D1 Migration (C1)

**Implements:** C1 (design)
**Depends on:** none (can run in parallel with Task 1)
**Phase:** 1 — Schema

**Files:**
- Create: `server/migrations/0013_add_confessional.sql`

**Step 1: Verify the next migration number**

```bash
ls /path/to/server/migrations/ | sort | tail -5
```

Confirm `0012_drop_old_lexicon.sql` is the latest. The new file is `0013_add_confessional.sql`.

**Step 2: Write the migration file**

Create `server/migrations/0013_add_confessional.sql`:

```sql
-- 0013_add_confessional.sql
-- Adds three tables for confessional documents sourced from Creeds.json (Unlicense).
-- Confession sections use chapter_number/section_number/content fields.
-- Catechism sections use question_number/question/answer fields.
-- Columns not applicable to a format are NULL.

CREATE TABLE IF NOT EXISTS confessional_documents (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL,
  year      INTEGER,
  tradition TEXT NOT NULL,
  format    TEXT NOT NULL CHECK(format IN ('confession', 'catechism')),
  authors   TEXT,
  source    TEXT NOT NULL DEFAULT 'Creeds.json'
);

CREATE TABLE IF NOT EXISTS confessional_sections (
  id                   INTEGER PRIMARY KEY,
  document_id          INTEGER NOT NULL REFERENCES confessional_documents(id),
  -- Confession fields (NULL for catechisms)
  chapter_number       INTEGER,
  chapter_title        TEXT,
  section_number       INTEGER,
  content              TEXT,
  content_with_proofs  TEXT,
  -- Catechism fields (NULL for confessions)
  question_number      INTEGER,
  question             TEXT,
  answer               TEXT,
  answer_with_proofs   TEXT
);

CREATE INDEX IF NOT EXISTS idx_conf_sections_document
  ON confessional_sections(document_id);

CREATE INDEX IF NOT EXISTS idx_conf_sections_chapter
  ON confessional_sections(document_id, chapter_number, section_number);

CREATE INDEX IF NOT EXISTS idx_conf_sections_question
  ON confessional_sections(document_id, question_number);

CREATE TABLE IF NOT EXISTS confessional_proof_texts (
  id          INTEGER PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES confessional_sections(id),
  proof_group INTEGER NOT NULL,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conf_proof_scripture
  ON confessional_proof_texts(book, chapter, verse);

CREATE INDEX IF NOT EXISTS idx_conf_proof_section
  ON confessional_proof_texts(section_id, proof_group);
```

**Step 3: Validate the migration locally**

```bash
cd server && npx wrangler d1 migrations apply claude-of-alexandria --local
```

Expected output: `✅ Applied 1 migrations` (or similar). If it says `No migrations to apply`, run:

```bash
npx wrangler d1 execute claude-of-alexandria --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'confessional%';"
```

Expected: 3 rows (`confessional_documents`, `confessional_sections`, `confessional_proof_texts`).

**Step 4: Smoke-test a manual INSERT against the local DB**

```bash
npx wrangler d1 execute claude-of-alexandria --local --command="
INSERT INTO confessional_documents (id, slug, title, tradition, format, source)
  VALUES (1, 'test-doc', 'Test Document', 'reformed', 'confession', 'Creeds.json');
INSERT INTO confessional_sections (id, document_id, chapter_number, section_number, content)
  VALUES (1, 1, 1, 1, 'Test content.');
INSERT INTO confessional_proof_texts (id, section_id, proof_group, book, chapter, verse)
  VALUES (1, 1, 1, 'psalms', 19, 1);
SELECT p.book, p.chapter, p.verse FROM confessional_proof_texts p WHERE p.section_id = 1;
"
```

Expected: one row `psalms | 19 | 1`.

**Step 5: Commit**

```bash
git add server/migrations/0013_add_confessional.sql
git commit -m "feat(db): add migration 0013 for confessional documents schema"
```

**Done when:** migration applies cleanly locally and all three tables exist with correct columns.

---

## Phase 2 — Proof-Text Parser (TDD)

### Task 3: Write Parser Tests First (C2 — Red phase)

**Implements:** C2 (design) — test file
**Depends on:** Task 1 (need confirmed proof-text citation format)
**Phase:** 2 — Parser TDD

**Files:**
- Create: `server/scripts/seed-confessional.test.ts`

**Context note:** The test runner is Vitest (`npm test` in `server/`). Tests use `.js` import extensions (ESM). The parser function will live in `server/scripts/seed-confessional.ts` and be imported in the test file.

**Step 1: Create the test file**

Create `server/scripts/seed-confessional.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseProofTextRef } from './seed-confessional.js';

describe('parseProofTextRef', () => {
  it('parses a single-verse reference', () => {
    const result = parseProofTextRef('Ps.19.1');
    expect(result).toEqual([{ book: 'psalms', chapter: 19, verse: 1 }]);
  });

  it('parses a same-chapter range', () => {
    const result = parseProofTextRef('Gen.1.1-Gen.1.5');
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 1 });
    expect(result[4]).toEqual({ book: 'genesis', chapter: 1, verse: 5 });
  });

  it('parses a cross-chapter range within the same book', () => {
    // Gen 1 has 31 verses; Gen 2 starts at verse 1
    const result = parseProofTextRef('Gen.1.28-Gen.2.3');
    // Expects Gen 1:28-31 (4 verses) + Gen 2:1-3 (3 verses) = 7 verses
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 28 });
    expect(result[6]).toEqual({ book: 'genesis', chapter: 2, verse: 3 });
  });

  it('returns empty array and does not throw for an unresolvable abbreviation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseProofTextRef('Unkn.1.1');
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('parses an NT book with digit prefix (1Cor)', () => {
    const result = parseProofTextRef('1Cor.15.3');
    expect(result).toEqual([{ book: '1_corinthians', chapter: 15, verse: 3 }]);
  });

  it('parses a reference with no range (Rom.8.28)', () => {
    const result = parseProofTextRef('Rom.8.28');
    expect(result).toEqual([{ book: 'romans', chapter: 8, verse: 28 }]);
  });

  it('clamps verse exceeding chapter length and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Gen 1 has 31 verses; asking for verse 99 should clamp to 31
    const result = parseProofTextRef('Gen.1.99');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ book: 'genesis', chapter: 1, verse: 31 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

**Step 2: Run the tests to confirm they fail (Red phase)**

```bash
cd server && npm test -- scripts/seed-confessional.test.ts
```

Expected: all tests fail with `Cannot find module './seed-confessional.js'` or similar. This is correct — the implementation does not exist yet.

**Done when:** test file exists and tests fail for the right reason (missing implementation).

---

### Task 4: Implement the Proof-Text Parser (C2 — Green phase)

**Implements:** C2 (design) — implementation
**Depends on:** Task 3 (tests must exist and fail first)
**Phase:** 2 — Parser TDD

**Files:**
- Create: `server/scripts/seed-confessional.ts` (parser section only — full ETL body comes in Task 5)

**Context note:** `lookupBook` from `server/src/db/books.ts` normalizes input to lowercase before lookup, so `Ps` → `ps` → `psalms`, `1Cor` → `1cor` → `1_corinthians`. The function returns `BookInfo | null`. The ETL script imports it as `import { lookupBook } from '../src/db/books.js'` (relative path from `scripts/`).

**Step 1: Create the file with the static verse-count map and parser**

Create `server/scripts/seed-confessional.ts` with the following structure. Write the entire file — the ETL `main()` function is a stub for now (implemented in Task 5).

```typescript
/**
 * seed-confessional.ts
 * ETL script: fetches Creeds.json, transforms confessional documents,
 * and emits SQL INSERT statements for D1 ingestion.
 *
 * Usage:
 *   cd server && npx tsx scripts/seed-confessional.ts --output /tmp/confessional-seed.sql
 *   cd server && npx tsx scripts/seed-confessional.ts --local <path-to-creeds-dir>
 *
 * Source: Creeds.json (Unlicense) — https://github.com/NonlinearFruit/creeds
 */

import { lookupBook } from '../src/db/books.js';

// ─── Static verse-count map ────────────────────────────────────────────────
// Maps canonical book name → array of verse counts indexed by chapter (1-based,
// index 0 is unused). Derived from the standard Protestant canon.
// Used for cross-chapter range expansion only — not queried from D1 at ETL time.
export const VERSE_COUNTS: Record<string, number[]> = {
  genesis:        [0,31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  exodus:         [0,22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  leviticus:      [0,17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,24,8,12,14,44,16,33,24,33,44],
  numbers:        [0,54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  deuteronomy:    [0,46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  joshua:         [0,18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  judges:         [0,36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  ruth:           [0,22,23,18,22],
  '1_samuel':     [0,28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  '2_samuel':     [0,27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  '1_kings':      [0,53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  '2_kings':      [0,18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  '1_chronicles': [0,54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  '2_chronicles': [0,17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  ezra:           [0,11,70,13,24,17,22,28,36,15,44],
  nehemiah:       [0,11,20,32,23,19,19,73,18,38,39,36,47,31],
  esther:         [0,22,23,15,17,14,14,10,17,32,3],
  job:            [0,22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  psalms:         [0,6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  proverbs:       [0,33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
  ecclesiastes:   [0,18,26,22,16,20,12,29,17,18,20,10,14],
  song_of_songs:  [0,17,17,11,16,16,13,13,14],
  isaiah:         [0,31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  jeremiah:       [0,19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  lamentations:   [0,22,22,66,22,22],
  ezekiel:        [0,28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  daniel:         [0,21,49,30,37,31,28,28,27,27,21,45,13],
  hosea:          [0,11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  joel:           [0,20,32,21],
  amos:           [0,15,16,15,13,27,14,17,14,15],
  obadiah:        [0,21],
  jonah:          [0,17,10,10,11],
  micah:          [0,16,13,12,13,15,16,20],
  nahum:          [0,15,13,19],
  habakkuk:       [0,17,20,19],
  zephaniah:      [0,18,15,20],
  haggai:         [0,15,23],
  zechariah:      [0,21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  malachi:        [0,14,17,18,6],
  matthew:        [0,25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  mark:           [0,45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  luke:           [0,80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  john:           [0,51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  acts:           [0,26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  romans:         [0,32,29,31,25,21,23,25,39,33,21,36,21,14,26,33,24],
  '1_corinthians':[0,31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
  '2_corinthians':[0,24,17,18,18,21,18,16,24,15,18,33,21,14],
  galatians:      [0,24,21,29,31,26,18],
  ephesians:      [0,23,22,21,28,30,14],
  philippians:    [0,30,30,21,23],
  colossians:     [0,29,23,25,18],
  '1_thessalonians':[0,10,20,13,18,28],
  '2_thessalonians':[0,12,17,18],
  '1_timothy':    [0,20,15,16,16,25,21],
  '2_timothy':    [0,18,26,17,22],
  titus:          [0,16,15,15],
  philemon:       [0,25],
  hebrews:        [0,14,18,19,16,14,20,28,13,28,39,40,29,25],
  james:          [0,27,26,18,17,20],
  '1_peter':      [0,25,25,22,19,14],
  '2_peter':      [0,21,22,18],
  '1_john':       [0,10,29,24,21,21],
  '2_john':       [0,13],
  '3_john':       [0,14],
  jude:           [0,25],
  revelation:     [0,20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21],
};

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * Parse a single Creeds.json proof-text citation into individual verse rows.
 *
 * Citation formats:
 *   Single verse: "Ps.19.1"
 *   Range:        "Gen.1.1-Gen.1.5"  or  "1Cor.15.1-1Cor.15.4"
 *
 * Returns an array of { book, chapter, verse } objects (one per verse).
 * Returns [] and logs a warning for unresolvable book abbreviations.
 * Clamps verses exceeding chapter length and logs a warning.
 */
export function parseProofTextRef(citation: string): VerseRef[] {
  // Split on '-' only between two full Book.Ch.V endpoints.
  // A range dash appears between digits (end of first V) and a letter (start of second Book).
  // Simple strategy: find the index of '-' that is preceded by a digit and followed by a letter or digit.
  // Since book abbreviations can start with a digit (1Cor), we split on the LAST '-' that is
  // preceded by a digit — this handles "1Cor.15.1-1Cor.15.4" correctly.
  const dashIndex = findRangeDash(citation);

  if (dashIndex === -1) {
    // Single reference
    return parseSingleRef(citation);
  }

  const startStr = citation.slice(0, dashIndex);
  const endStr = citation.slice(dashIndex + 1);
  return expandRange(startStr, endStr);
}

/**
 * Find the index of the range-separating dash in a citation like "Gen.1.1-Gen.1.5".
 * Returns -1 if no range dash exists (single reference).
 *
 * The range dash sits between two verse numbers (digit) and a book abbreviation (letter or digit).
 * We locate the dash that follows a digit AND precedes a letter — this excludes negative numbers
 * and matches the standard Creeds.json dot-notation format.
 */
function findRangeDash(citation: string): number {
  for (let i = citation.length - 1; i >= 0; i--) {
    if (citation[i] === '-' && i > 0) {
      const before = citation[i - 1];
      const after = citation[i + 1] ?? '';
      if (/\d/.test(before) && /[A-Za-z0-9]/.test(after)) {
        return i;
      }
    }
  }
  return -1;
}

function parseSingleRef(ref: string): VerseRef[] {
  const parsed = parseEndpoint(ref);
  if (!parsed) return [];
  const { book, chapter, verse } = parsed;
  const clamped = clampVerse(book, chapter, verse);
  return [{ book, chapter, verse: clamped }];
}

function parseEndpoint(ref: string): { book: string; chapter: number; verse: number } | null {
  // Format: BookAbbrev.chapter.verse  (e.g. "Ps.19.1", "1Cor.15.3")
  const dotCount = (ref.match(/\./g) || []).length;
  if (dotCount < 2) {
    console.warn(`[seed-confessional] Cannot parse ref endpoint: "${ref}" (expected 2 dots)`);
    return null;
  }

  // Split on the LAST two dots to get chapter and verse
  const lastDot = ref.lastIndexOf('.');
  const secondLastDot = ref.lastIndexOf('.', lastDot - 1);

  const bookAbbrev = ref.slice(0, secondLastDot);
  const chapter = parseInt(ref.slice(secondLastDot + 1, lastDot), 10);
  const verse = parseInt(ref.slice(lastDot + 1), 10);

  if (isNaN(chapter) || isNaN(verse)) {
    console.warn(`[seed-confessional] Cannot parse chapter/verse in: "${ref}"`);
    return null;
  }

  const bookInfo = lookupBook(bookAbbrev);
  if (!bookInfo) {
    console.warn(`[seed-confessional] Unresolvable book abbreviation: "${bookAbbrev}" in ref "${ref}"`);
    return null;
  }

  return { book: bookInfo.canonical, chapter, verse };
}

function clampVerse(book: string, chapter: number, verse: number): number {
  const counts = VERSE_COUNTS[book];
  if (!counts || chapter < 1 || chapter >= counts.length) return verse;
  const max = counts[chapter];
  if (verse > max) {
    console.warn(`[seed-confessional] Verse ${verse} exceeds chapter length for ${book} ${chapter} (max ${max}) — clamping`);
    return max;
  }
  return verse;
}

function expandRange(startStr: string, endStr: string): VerseRef[] {
  const start = parseEndpoint(startStr);
  const end = parseEndpoint(endStr);

  if (!start || !end) return [];

  const results: VerseRef[] = [];

  if (start.book !== end.book) {
    // Cross-book range: expand start book through end of its last chapter, then end book from beginning.
    // In practice, genuine cross-book ranges are rare in Creeds.json. Treat conservatively:
    // expand start ref through end of start book's last chapter, then expand end book from 1:1 to end ref.
    const startBookCounts = VERSE_COUNTS[start.book];
    if (startBookCounts) {
      for (let ch = start.chapter; ch < startBookCounts.length; ch++) {
        const startV = ch === start.chapter ? start.verse : 1;
        const endV = startBookCounts[ch];
        for (let v = startV; v <= endV; v++) {
          results.push({ book: start.book, chapter: ch, verse: v });
        }
      }
    } else {
      results.push({ book: start.book, chapter: start.chapter, verse: start.verse });
    }

    const endBookCounts = VERSE_COUNTS[end.book];
    if (endBookCounts) {
      for (let ch = 1; ch <= end.chapter; ch++) {
        const endV = ch === end.chapter ? end.verse : endBookCounts[ch];
        for (let v = 1; v <= endV; v++) {
          results.push({ book: end.book, chapter: ch, verse: v });
        }
      }
    } else {
      results.push({ book: end.book, chapter: end.chapter, verse: end.verse });
    }

    return results;
  }

  // Same book — expand from start to end
  const bookCounts = VERSE_COUNTS[start.book];

  for (let ch = start.chapter; ch <= end.chapter; ch++) {
    const startV = ch === start.chapter ? start.verse : 1;
    const endV = ch === end.chapter
      ? end.verse
      : (bookCounts ? bookCounts[ch] : end.verse);
    const clampedEndV = bookCounts ? Math.min(endV, bookCounts[ch] ?? endV) : endV;
    for (let v = startV; v <= clampedEndV; v++) {
      results.push({ book: start.book, chapter: ch, verse: v });
    }
  }

  return results;
}

// ─── ETL main (stub — implemented in Task 5) ──────────────────────────────
async function main(): Promise<void> {
  console.log('seed-confessional: ETL stub — not yet implemented.');
  process.exit(0);
}

// Only run main() when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

**Step 2: Run the tests (Green phase)**

```bash
cd server && npm test -- scripts/seed-confessional.test.ts
```

Expected: all 7 tests pass.

If any test fails, debug the specific failing assertion. Common issues:
- `Gen.1.28-Gen.2.3`: verify the `VERSE_COUNTS.genesis` array has index 1 = 31 (Gen 1 has 31 verses) and index 2 = 25 (Gen 2 has 25 verses). Expected result: Gen 1:28-31 = 4 rows + Gen 2:1-3 = 3 rows = 7 total.
- Clamping test: `Gen.1.99` should clamp to verse 31 (the max for Gen 1).
- `1Cor.15.3` — `lookupBook('1Cor')` normalizes to `'1cor'` which maps to canonical `'1_corinthians'`.

**Step 3: Run the full server test suite to check for regressions**

```bash
cd server && npm test
```

Expected: all pre-existing tests pass, plus the 7 new parser tests.

**Step 4: Commit**

```bash
git add server/scripts/seed-confessional.ts server/scripts/seed-confessional.test.ts
git commit -m "feat(etl): add proof-text reference parser with Vitest tests (C2)"
```

**Done when:** all 7 parser tests pass and no regressions in the full suite.

---

## Phase 3 — ETL Script Body

### Task 5: Implement the ETL Main Function (C3)

**Implements:** C3 (design)
**Depends on:** Task 1 (copyright exclusion list confirmed), Task 4 (parser implemented and tested)
**Phase:** 3 — ETL

**Files:**
- Modify: `server/scripts/seed-confessional.ts` (replace the stub `main()` with full implementation)

**Context note:** Before writing, open `server/scripts/creeds-research-notes.txt` from Task 1 to get the confirmed field names, source URL, and copyright exclusion list. The implementation below uses the field names from the design doc (`Chapters`, `Sections`, `Questions`, `ProofTexts`) — adjust to the actual field names found during research.

**Step 1: Install or verify access to the Creeds.json source**

Check whether the npm package exists (from Task 1 research):

```bash
cd server && npm info @NonlinearFruit/creeds version 2>/dev/null
```

If it exists, install it as a dev dependency:
```bash
cd server && npm install --save-dev @NonlinearFruit/creeds
```

If not, the script will fetch from the raw GitHub URL — no installation needed.

**Step 2: Replace the stub `main()` in `seed-confessional.ts`**

Replace the `// ─── ETL main (stub)` section with the full implementation. Add new imports at the top and the hardcoded maps after the verse counts:

Add to imports section (top of file, after existing imports):
```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

Add the copyright exclusion set and tradition map after `VERSE_COUNTS` (before the `VerseRef` interface):

```typescript
// ─── Copyright exclusion list ──────────────────────────────────────────────
// Documents in Creeds.json that are NOT under the Unlicense or public domain.
// UPDATE this list based on creeds-research-notes.txt from Task 1 research.
// Slugs must exactly match the document's slug key in the Creeds.json source.
const COPYRIGHT_EXCLUDED_SLUGS = new Set<string>([
  'chicago-statement-on-biblical-inerrancy',
  'chicago-statement-on-biblical-hermeneutics',
  'chicago-statement-on-biblical-application',
  'lausanne-covenant',
  'amsterdam-declaration',
  // ADD any additional slugs found during C5 research
]);

// ─── Tradition classification map ─────────────────────────────────────────
// Maps document slug → tradition string. Covers all ~43 documents in Creeds.json.
// 'other' is the fallback for any slug not explicitly listed.
const TRADITION_MAP: Record<string, string> = {
  // Reformed / Presbyterian
  'westminster-confession-of-faith':          'reformed',
  'westminster-shorter-catechism':            'reformed',
  'westminster-larger-catechism':             'reformed',
  'belgic-confession':                        'reformed',
  'heidelberg-catechism':                     'reformed',
  'canons-of-dort':                           'reformed',
  'london-baptist-confession-1689':           'reformed',
  'second-london-baptist-confession':         'reformed',
  'savoy-declaration':                        'reformed',
  'abstract-of-principles':                   'reformed',
  'new-hampshire-confession':                 'reformed',
  // Ancient
  'apostles-creed':                           'ancient',
  'nicene-creed':                             'ancient',
  'athanasian-creed':                         'ancient',
  'chalcedonian-definition':                  'ancient',
  'definition-of-chalcedon':                  'ancient',
  // Lutheran
  'augsburg-confession':                      'lutheran',
  'luthers-small-catechism':                  'lutheran',
  'luthers-large-catechism':                  'lutheran',
  'formula-of-concord':                       'lutheran',
  // Anglican
  'thirty-nine-articles':                     'anglican',
  // Anabaptist
  'schleitheim-confession':                   'anabaptist',
  'dordrecht-confession':                     'anabaptist',
  // ADD slugs found during C5 research; unknown slugs default to 'other'
};

function getTradition(slug: string): string {
  return TRADITION_MAP[slug] ?? 'other';
}
```

Now replace the stub `main()` with the full ETL implementation:

```typescript
// ─── SQL helpers ──────────────────────────────────────────────────────────
function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

// ─── Creeds.json type definitions ─────────────────────────────────────────
// Adjust field names based on research in creeds-research-notes.txt
interface ProofTextEntry {
  Id: number;
  References: string[];
}

interface ConfessionSection {
  Section: number;
  Content: string;
  ContentWithProofs: string;
  ProofTexts: ProofTextEntry[];
}

interface ConfessionChapter {
  Chapter: number;
  Title: string;
  Sections: ConfessionSection[];
}

interface CatechismQuestion {
  Number: number;
  Question: string;
  Answer: string;
  AnswerWithProofs: string;
  ProofTexts: ProofTextEntry[];
}

interface CreedsDocument {
  Slug: string;
  Name: string;
  Year?: number;
  Type?: string;
  Chapters?: ConfessionChapter[];
  Questions?: CatechismQuestion[];
}

// ─── ETL main ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const localIndex = args.indexOf('--local');
  const outputIndex = args.indexOf('--output');

  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : '/tmp/confessional-seed.sql';
  const localPath = localIndex !== -1 ? args[localIndex + 1] : null;

  console.log(`[seed-confessional] Output: ${outputPath}`);

  // ── Phase 1: Fetch source ──
  let documents: CreedsDocument[];

  if (localPath) {
    console.log(`[seed-confessional] Loading from local path: ${localPath}`);
    const raw = readFileSync(localPath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Handle both array format and object format
    documents = Array.isArray(parsed) ? parsed : Object.values(parsed);
  } else {
    console.log('[seed-confessional] Fetching Creeds.json from GitHub...');
    // Try npm package data first, fall back to raw GitHub
    let sourceUrl: string;
    try {
      // @NonlinearFruit/creeds exports individual document files
      // Fetch the index or the aggregated JSON from the GitHub releases/raw URL
      sourceUrl = 'https://raw.githubusercontent.com/NonlinearFruit/creeds/master/dist/creeds.json';
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        // Fallback: fetch individual files via the API listing
        throw new Error(`HTTP ${response.status} from ${sourceUrl}`);
      }
      const raw = await response.text();
      const parsed = JSON.parse(raw);
      documents = Array.isArray(parsed) ? parsed : Object.values(parsed);
      console.log(`[seed-confessional] Fetched from ${sourceUrl}`);
    } catch (err) {
      console.error(`[seed-confessional] Fatal: cannot fetch Creeds.json: ${err}`);
      console.error('Tip: Use --local <path> to load from a local file.');
      process.exit(1);
    }
  }

  console.log(`[seed-confessional] Loaded ${documents.length} documents.`);

  // ── Phase 2: Transform and emit SQL ──
  const lines: string[] = [
    '-- confessional-seed.sql',
    '-- Generated by seed-confessional.ts — do not edit manually.',
    '-- Apply with: npx wrangler d1 execute <DB_NAME> --file=<this-file> --remote',
    '',
    '-- Documents',
  ];

  let docId = 0;
  let sectionId = 0;
  let proofId = 0;
  let skippedCopyright = 0;
  let skippedSections = 0;
  const unresolvedRefs: string[] = [];

  for (const doc of documents) {
    const slug = doc.Slug;
    if (!slug) {
      console.warn('[seed-confessional] Document without Slug — skipping');
      continue;
    }

    if (COPYRIGHT_EXCLUDED_SLUGS.has(slug)) {
      console.log(`[seed-confessional] Skipping copyright-excluded document: ${slug}`);
      skippedCopyright++;
      continue;
    }

    docId++;
    const tradition = getTradition(slug);
    const format = doc.Questions ? 'catechism' : 'confession';
    const year = doc.Year ?? null;
    const authors = null; // Creeds.json does not provide structured author data

    lines.push(
      `INSERT OR REPLACE INTO confessional_documents (id, slug, title, year, tradition, format, authors, source) VALUES (${docId}, ${escapeSQL(slug)}, ${escapeSQL(doc.Name)}, ${escapeNum(year)}, ${escapeSQL(tradition)}, ${escapeSQL(format)}, ${escapeSQL(authors)}, 'Creeds.json');`
    );

    if (format === 'confession' && doc.Chapters) {
      lines.push('');
      lines.push(`-- Sections: ${slug}`);
      for (const chapter of doc.Chapters) {
        for (const section of chapter.Sections ?? []) {
          if (!section.Content) {
            console.warn(`[seed-confessional] Section missing Content in ${slug} ch${chapter.Chapter} s${section.Section} — skipping`);
            skippedSections++;
            continue;
          }
          sectionId++;
          lines.push(
            `INSERT INTO confessional_sections (id, document_id, chapter_number, chapter_title, section_number, content, content_with_proofs) VALUES (${sectionId}, ${docId}, ${chapter.Chapter}, ${escapeSQL(chapter.Title)}, ${section.Section}, ${escapeSQL(section.Content)}, ${escapeSQL(section.ContentWithProofs)});`
          );

          for (const pt of section.ProofTexts ?? []) {
            for (const ref of pt.References ?? []) {
              const verses = parseProofTextRef(ref);
              if (verses.length === 0) {
                unresolvedRefs.push(`${slug}:ch${chapter.Chapter}s${section.Section}:${ref}`);
                continue;
              }
              for (const v of verses) {
                proofId++;
                lines.push(
                  `INSERT OR IGNORE INTO confessional_proof_texts (id, section_id, proof_group, book, chapter, verse) VALUES (${proofId}, ${sectionId}, ${pt.Id}, ${escapeSQL(v.book)}, ${v.chapter}, ${v.verse});`
                );
              }
            }
          }
        }
      }
    } else if (format === 'catechism' && doc.Questions) {
      lines.push('');
      lines.push(`-- Questions: ${slug}`);
      for (const q of doc.Questions) {
        if (!q.Question || !q.Answer) {
          console.warn(`[seed-confessional] Question missing Question/Answer in ${slug} Q${q.Number} — skipping`);
          skippedSections++;
          continue;
        }
        sectionId++;
        lines.push(
          `INSERT INTO confessional_sections (id, document_id, question_number, question, answer, answer_with_proofs) VALUES (${sectionId}, ${docId}, ${q.Number}, ${escapeSQL(q.Question)}, ${escapeSQL(q.Answer)}, ${escapeSQL(q.AnswerWithProofs)});`
        );

        for (const pt of q.ProofTexts ?? []) {
          for (const ref of pt.References ?? []) {
            const verses = parseProofTextRef(ref);
            if (verses.length === 0) {
              unresolvedRefs.push(`${slug}:Q${q.Number}:${ref}`);
              continue;
            }
            for (const v of verses) {
              proofId++;
              lines.push(
                `INSERT OR IGNORE INTO confessional_proof_texts (id, section_id, proof_group, book, chapter, verse) VALUES (${proofId}, ${sectionId}, ${pt.Id}, ${escapeSQL(v.book)}, ${v.chapter}, ${v.verse});`
              );
            }
          }
        }
      }
    }
  }

  // ── Phase 3: Write output ──
  const sql = lines.join('\n') + '\n';
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n[seed-confessional] Written to: ${outputPath}`);

  // ── Validation report ──
  console.log('\n=== Validation Report ===');
  console.log(`Documents ingested:          ${docId}`);
  console.log(`Sections ingested:           ${sectionId}`);
  console.log(`Proof-text rows emitted:     ${proofId}`);
  console.log(`Copyright-excluded docs:     ${skippedCopyright}`);
  console.log(`Skipped sections (errors):   ${skippedSections}`);
  console.log(`Unresolvable proof refs:     ${unresolvedRefs.length}`);
  if (unresolvedRefs.length > 0) {
    console.warn('\nUnresolvable proof-text references:');
    for (const r of unresolvedRefs) {
      console.warn(`  ${r}`);
    }
    console.warn('\nNote: unresolvable refs are WARNINGS, not failures. Ingestion continues with partial data.');
  }
}
```

**Step 3: Run the ETL script against a local Creeds.json to validate**

First, download a single document to test locally:
```bash
mkdir -p /tmp/creeds-test
curl -s https://raw.githubusercontent.com/NonlinearFruit/creeds/master/data/westminster-shorter-catechism.json > /tmp/creeds-test/wsc.json
```

Run with `--local` flag:
```bash
cd server && npx tsx scripts/seed-confessional.ts --local /tmp/creeds-test/wsc.json --output /tmp/confessional-seed-test.sql
```

Expected output:
```
[seed-confessional] Output: /tmp/confessional-seed-test.sql
[seed-confessional] Loading from local path: /tmp/creeds-test/wsc.json
[seed-confessional] Loaded 1 documents.

=== Validation Report ===
Documents ingested:          1
Sections ingested:           107
Proof-text rows emitted:     <some number>
...
Unresolvable proof refs:     0
```

If field names don't match (you get 0 sections), open the JSON and adjust the type definitions (`Chapters`, `Questions`, etc.) to match the actual field names.

**Step 4: Apply the test SQL to the local D1 and verify counts**

```bash
cd server && npx wrangler d1 execute claude-of-alexandria --local --file=/tmp/confessional-seed-test.sql
npx wrangler d1 execute claude-of-alexandria --local --command="SELECT COUNT(*) as doc_count FROM confessional_documents;"
npx wrangler d1 execute claude-of-alexandria --local --command="SELECT COUNT(*) as section_count FROM confessional_sections;"
npx wrangler d1 execute claude-of-alexandria --local --command="SELECT COUNT(*) as proof_count FROM confessional_proof_texts;"
```

Expected: `doc_count = 1`, `section_count = 107` (Westminster Shorter Catechism has 107 questions), `proof_count > 0`.

**Step 5: Run the parser tests again to confirm nothing broke**

```bash
cd server && npm test -- scripts/seed-confessional.test.ts
```

Expected: all 7 tests still pass.

**Step 6: Commit**

```bash
git add server/scripts/seed-confessional.ts
git commit -m "feat(etl): implement ETL main function for confessional documents (C3)"
```

**Done when:** ETL runs against a real Creeds.json document without errors, validation report shows correct counts, local D1 insert succeeds.

---

## Phase 4 — Integration and Full Run

### Task 6: Integrate into seed-d1.sh and Run Full ETL (C4)

**Implements:** C4 (design)
**Depends on:** Task 5 (ETL script fully implemented)
**Phase:** 4 — Integration

**Files:**
- Modify: `server/scripts/seed-d1.sh`

**Step 1: Add the confessional seeding step to seed-d1.sh**

Open `server/scripts/seed-d1.sh`. Find the `# Phase 7: Commentaries` section (currently the last phase). Add the confessional step AFTER commentaries and BEFORE the post-seed verification block.

Insert before the `# Post-seed verification` comment:
```bash
# Phase 8: Confessional documents (Creeds.json, Unlicense)
echo "Seeding confessional documents..."
npx tsx "$(dirname "$0")/seed-confessional.ts" --output /tmp/confessional-seed.sql
npx wrangler d1 execute "$DB_NAME" --file=/tmp/confessional-seed.sql --remote
echo "  Confessional documents seeded."
echo ""
```

**Step 2: Add confessional tables to the verification block**

In the `# Post-seed verification` section, add after the existing `SELECT commentary, COUNT(*)` query:
```bash
npx wrangler d1 execute "$DB_NAME" --command="SELECT tradition, COUNT(*) as count FROM confessional_documents GROUP BY tradition;" --remote
```

**Step 3: Run a dry-run of the ETL against the full Creeds.json source**

Do this before touching the remote DB — test the full SQL generation locally:

```bash
cd server && npx tsx scripts/seed-confessional.ts --output /tmp/confessional-seed-full.sql
```

Inspect the validation report. Acceptable thresholds:
- Documents: 30–50 (depending on copyright exclusions)
- Sections: 2,000–3,000
- Proof-text rows: 15,000–30,000
- Unresolvable refs: < 50 (a few odd abbreviations is acceptable)

If unresolvable refs are numerous (> 50), open the list and identify patterns — likely abbreviation mapping gaps. Fix in `parseProofTextRef` or in the `lookupBook` fallback before proceeding.

**Step 4: Apply the full SQL to the local D1 DB**

```bash
cd server && npx wrangler d1 execute claude-of-alexandria --local --file=/tmp/confessional-seed-full.sql
npx wrangler d1 execute claude-of-alexandria --local --command="
SELECT tradition, format, COUNT(*) as docs FROM confessional_documents GROUP BY tradition, format;
SELECT COUNT(*) as total_sections FROM confessional_sections;
SELECT COUNT(*) as total_proofs FROM confessional_proof_texts;
SELECT book, COUNT(*) as refs FROM confessional_proof_texts GROUP BY book ORDER BY refs DESC LIMIT 10;
"
```

Verify the top books referenced make sense (Psalms and Romans should be near the top for reformed documents).

**Step 5: Run a spot-check query simulating F2 usage**

This verifies that the data model works for the downstream `confessional_lookup` MCP tool:

```bash
npx wrangler d1 execute claude-of-alexandria --local --command="
-- Simulate: 'Which confessional sections cite Romans 8:28?'
SELECT d.slug, d.title, s.question_number, s.question
FROM confessional_proof_texts p
JOIN confessional_sections s ON s.id = p.section_id
JOIN confessional_documents d ON d.id = s.document_id
WHERE p.book = 'romans' AND p.chapter = 8 AND p.verse = 28
LIMIT 10;
"
```

Expected: several rows from Westminster catechisms and possibly others.

**Step 6: Commit the seed-d1.sh change**

```bash
git add server/scripts/seed-d1.sh
git commit -m "feat(etl): integrate confessional ETL into seed-d1.sh (C4)"
```

**Step 7: Apply migration and seed to remote D1 (when ready)**

This step is done manually when deploying — not automated by the plan. Run:

```bash
cd server && npx wrangler d1 migrations apply claude-of-alexandria --remote
npx tsx scripts/seed-confessional.ts --output /tmp/confessional-seed.sql
npx wrangler d1 execute claude-of-alexandria --file=/tmp/confessional-seed.sql --remote
```

Verify:
```bash
npx wrangler d1 execute claude-of-alexandria --remote --command="SELECT COUNT(*) FROM confessional_documents;"
npx wrangler d1 execute claude-of-alexandria --remote --command="SELECT COUNT(*) FROM confessional_sections;"
npx wrangler d1 execute claude-of-alexandria --remote --command="SELECT COUNT(*) FROM confessional_proof_texts;"
```

**Done when:** `seed-d1.sh` has the Phase 8 step, local D1 seeding validates correctly, and the F2 simulation query returns results.

---

## Stage Handoff

### Decisions Made
- Migration number is `0013` (not `0011` as stated in the original issue — `0011` and `0012` already exist on disk; confirmed by listing `server/migrations/`)
- ETL imports `lookupBook` from `../src/db/books.js` — the function has no Cloudflare Worker runtime dependencies and is safe to import from a `tsx`/Node context
- No separate `BOOK_MAP` in the seed script — `lookupBook` covers all 66 books with all known abbreviations including `1Cor`, `2Tim`, `Ps`, etc.
- Proof-text range dash detection uses reverse-scan for the last `-` preceded by a digit (verse number) and followed by a letter or digit (start of next book abbreviation)
- Unified superset-column sections table: confession and catechism share one table with NULL for format-incompatible columns — avoids UNION queries in F2
- Proof-text ranges expanded at ingestion to individual verse rows (not at query time)
- Static `VERSE_COUNTS` map bundled in the ETL script (66 books × chapters × verse counts — Protestant canon)
- `INSERT OR REPLACE` on `confessional_documents` (slug-keyed), `INSERT OR IGNORE` on `confessional_proof_texts` — re-seeding safe
- `ContentWithProofs` / `AnswerWithProofs` stored alongside plain content fields — F2 can expose either
- Vitest test file lives at `server/scripts/seed-confessional.test.ts` (matching the project's test file co-location pattern)

### Rejected Approaches
- Separate `BOOK_MAP` in seed script — `lookupBook` already covers all 66 books; DRY violation
- Parser in `server/src/db/` — YAGNI; only needed at ETL time, would require worker-test scaffolding
- D1 REST API streaming inserts — diverges from project seed pattern; over-engineered for 20k rows
- Separate confession/catechism tables — UNION queries in F2 tool; unified superset was the design decision

### Open Questions
- **Creeds.json actual field names:** The type definitions in Task 5 use assumed field names (`Chapters`, `Sections`, `Questions`, etc.). Task 1 research MUST confirm these before Task 5 implementation — adjust type definitions if they differ.
- **Copyright exclusion complete list:** The list in Task 5's `COPYRIGHT_EXCLUDED_SLUGS` is tentative. Add/remove slugs based on Task 1's README research.
- **Thirty-Nine Articles slug:** If the document is absent from Creeds.json, remove from `TRADITION_MAP`.
- **Remote ETL timing:** The remote seeding step (Task 6 Step 7) is a manual deployment action. Coordinate with F2 (confessional_lookup tool) deployment so tables exist before the tool is wired up.

### Constraints Carried Forward
- F2 must query sections using `document_id + chapter_number/section_number` or `document_id + question_number` — no UNION needed
- F2 reverse lookup: `SELECT DISTINCT section_id FROM confessional_proof_texts WHERE book = ? AND chapter = ? AND verse = ?` — simple equality, no range overlap logic needed
- F2 must filter by `tradition` and `format` columns on the `confessional_documents` table (both indexed via the document table's `slug` unique index and FK)
- `confessional_documents.slug` is the stable external identifier for document filtering in F2 tool input
- `content_with_proofs` / `answer_with_proofs` use `[1]`, `[2]` bracket notation — F2 must document this in tool output
- The static `VERSE_COUNTS` map lives only in the ETL script; if F2 ever needs dynamic range parsing, it must extract or duplicate this constant

<!-- critic-findings
critic-rating: ADEQUATE
findings:
Domain 1 — Ordering inversions:
- Task 3 (write tests) depends on Task 1 (research, to confirm citation format) — this dependency is explicit in the task header. Task 4 (parser implementation) depends on Task 3. Task 5 (ETL body) depends on Task 1 and Task 4. Task 6 (integration) depends on Task 5. Order is: 1 → 2 (parallel) → 3 → 4 → 5 → 6. No ordering inversions.
- Task 2 (migration) is correctly marked as independent — it can run in parallel with Task 1. No inversion.

Domain 2 — Verification gaps:
- Task 2 Step 3 verifies migration applies locally AND queries the table list. Step 4 smoke-tests INSERT + SELECT. Adequate.
- Task 4 Step 2 runs tests; Step 3 runs the full suite for regressions. Adequate.
- Task 5 Step 3 runs the ETL locally; Step 4 applies SQL to local D1 and checks counts; Step 5 re-runs parser tests. Adequate.
- Task 6 Step 3 validates dry-run counts; Step 4 applies to local D1 and verifies; Step 5 runs an F2 simulation query. Adequate.
- One gap: Task 6 Step 7 (remote apply) has no explicit count verification embedded in the step — it shows the commands but the expected counts are not stated. Added verification commands to Step 7.

Domain 3 — Hidden dependencies:
- Tasks 1 and 2 are marked parallel and are genuinely independent (migration DDL doesn't depend on research findings; research doesn't touch the migration). No hidden dependency.
- The `VERSE_COUNTS` map is used by the parser (Task 4) and the ETL (Task 5). Both are in the same file — no hidden state sharing across files.
- The `lookupBook` import path `'../src/db/books.js'` is relative from `scripts/` to `src/db/` — confirmed correct by the project structure (`server/scripts/` → `server/src/db/`).

Domain 4 — Completeness:
- C1 (migration) → Task 2. Covered.
- C2 (parser + tests) → Tasks 3 + 4. Covered.
- C3 (ETL body) → Task 5. Covered.
- C4 (seed-d1.sh integration) → Task 6. Covered.
- C5 (research) → Task 1. Covered.
- All design components have at least one implementing task. Adequate.

Domain 5 — Code accuracy:
- The `parseProofTextRef` test for cross-chapter range `Gen.1.28-Gen.2.3` expects 7 rows (4 from Gen 1:28-31 + 3 from Gen 2:1-3). The `VERSE_COUNTS.genesis` map has index 1 = 31 and index 2 = 25 — consistent with the expectation.
- The `findRangeDash` function uses a reverse scan for the last `-` preceded by a digit and followed by `[A-Za-z0-9]`. This correctly handles `1Cor.15.1-1Cor.15.4` (dash at index 10, preceded by `1`, followed by `1`). Edge case: `Gen.1.28-Gen.2.3` — dash at index 8, preceded by `8`, followed by `G`. Correct.
- `lookupBook('Ps')` normalizes to `'ps'` (lowercased) — present in `BOOK_MAP` as `'ps'` → canonical `'psalms'`. Verified.
- `lookupBook('1Cor')` normalizes to `'1cor'` — present as `'1cor'` → canonical `'1_corinthians'`. Verified.
- The `escapeSQL` helper matches the pattern in `export-d1.ts`. Adequate.
critic-findings -->
