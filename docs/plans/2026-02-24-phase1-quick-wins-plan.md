# Phase 1: Quick Wins + Argument-Flow Skill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Add 56 semantic groups with genre tags, serve OT quotation data via a new MCP tool, document conjunction querying for epistles, and create the argument-flow skill using TDD.

**Architecture:** Cloudflare Workers MCP server (TypeScript + D1 SQLite) with Claude Code plugin skills (Markdown + YAML frontmatter). Skills are structured documentation files that direct agent behavior. MCP tools are registered via `McpServer.registerTool()` with Zod schemas.

**Tech Stack:** TypeScript (Cloudflare Workers), D1 SQLite, Zod v4, MCP SDK, Python 3 (merge script), YAML (reference data)

**Design doc:** `docs/plans/2026-02-24-phase1-quick-wins-design.md`

---

## Task 1: Add `primary_genres` to Existing 13 Semantic Groups

**Files:**
- Modify: `plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml`

**Step 1: Add `primary_genres` field to each existing group**

Add `primary_genres` as the second field (after `description`) in each of the 13 existing groups. Use exact values from design doc:

```yaml
semantic_groups:
  joy:
    description: Joy, rejoicing, gladness, delight - emotions of celebration and exultation
    primary_genres: [epistle, hebrew_poetry]
    nt_lemmas:
      # ... existing content unchanged
```

Genre assignments for all 13:

| Group | primary_genres |
|-------|---------------|
| joy | `[epistle, hebrew_poetry]` |
| faith | `[epistle, ot_narrative]` |
| love | `[epistle, hebrew_poetry, gospel_narrative]` |
| righteousness | `[epistle, prophetic]` |
| covenant | `[ot_narrative, prophetic]` |
| glory | `[hebrew_poetry, epistle]` |
| salvation | `[epistle, prophetic]` |
| holiness | `[epistle, prophetic]` |
| spirit | `[epistle, prophetic]` |
| wisdom | `[wisdom, epistle]` |
| peace | `[epistle, prophetic]` |
| grace | `[epistle]` |
| truth | `[epistle, wisdom]` |

**Step 2: Update metadata count**

```yaml
metadata:
  semantic_groups_count: 13  # will become 69 after Task 2
```

Leave count at 13 for now — Task 2 will set it to 69.

**Step 3: Validate YAML loads**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml')); print(f'{len(d[\"semantic_groups\"])} groups loaded'); assert all('primary_genres' in v for v in d['semantic_groups'].values()), 'Missing primary_genres'"`

Expected: `13 groups loaded` (no assertion error)

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml
git commit -m "feat(data): add primary_genres to existing 13 semantic groups"
```

---

## Task 2: Add 56 New Semantic Groups (Batch 1 — 28 groups)

**Files:**
- Modify: `plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml`

**Step 1: Append first 28 groups**

Add after the existing `truth` group. Follow the exact format of existing groups. Each group needs: `description`, `primary_genres`, and at least one of `nt_lemmas` / `ot_strongs`.

Add these groups in order (from the design doc complete group list):

1. **Proposed Original 8:** suffering, kingdom, death-life, sin, redemption, judgment, worship, creation
2. **Pauline Epistles 8:** flesh, reconciliation, body-church, adoption, hope, conscience, law, freedom
3. **General Epistles 6:** priesthood-sacrifice, testing, confession-witness, perfection, purification, deception
4. **Gospels 6:** discipleship, repentance, authority-power, parable-mystery, forgiveness, obedience

Use the Greek/Hebrew terms listed in the design doc. For each group, look up the correct Strong's numbers:

Example for `suffering`:
```yaml
  suffering:
    description: "Suffering, tribulation, affliction — the believer's participation in Christ's sufferings"
    primary_genres: [epistle, hebrew_poetry]
    nt_lemmas:
      πάσχω: suffer, experience
      θλῖψις: tribulation, affliction, distress
      παθήματα: sufferings, passions
      κακοπαθέω: suffer hardship, endure affliction
    ot_strongs:
      H6040:
        hebrew: עֳנִי
        gloss: affliction, poverty, misery
      H6862:
        hebrew: צָרָה
        gloss: distress, adversity, trouble
      H3510:
        hebrew: כָּאַב
        gloss: be in pain, suffer
```

**Step 2: Validate YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml')); print(f'{len(d[\"semantic_groups\"])} groups loaded')"`

Expected: `41 groups loaded`

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml
git commit -m "feat(data): add 28 new semantic groups (original, pauline, general, gospels)"
```

---

## Task 3: Add 56 New Semantic Groups (Batch 2 — 28 groups)

**Files:**
- Modify: `plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml`

**Step 1: Append remaining 28 groups**

Add the remaining groups:

1. **Hebrew Poetry 6:** refuge, enemies, lament, praise, desire, steadfastness
2. **Wisdom Literature 5:** folly, vanity, counsel, fear-of-the-lord, retribution
3. **Prophetic 6:** remnant, idolatry, oracle, return-restoration, messenger-servant, zion
4. **OT Narrative 5:** blessing-cursing, election, oath-promise, land, name
5. **Apocalyptic 6:** throne, victory, seal, beasts, time-urgency, new-renewal

**Step 2: Update metadata count to 69**

```yaml
metadata:
  semantic_groups_count: 69
```

**Step 3: Run full validation**

```bash
python3 -c "
import yaml
VALID_GENRES = {'epistle', 'gospel_narrative', 'ot_narrative', 'prophetic', 'apocalyptic', 'hebrew_poetry', 'wisdom', 'torah_law'}
d = yaml.safe_load(open('plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml'))
groups = d['semantic_groups']
print(f'{len(groups)} groups loaded')
assert len(groups) == 69, f'Expected 69, got {len(groups)}'
for key, val in groups.items():
    assert 'description' in val, f'{key}: missing description'
    assert 'primary_genres' in val, f'{key}: missing primary_genres'
    assert len(val['primary_genres']) > 0, f'{key}: empty primary_genres'
    for g in val['primary_genres']:
        assert g in VALID_GENRES, f'{key}: invalid genre {g}'
    assert 'nt_lemmas' in val or 'ot_strongs' in val, f'{key}: needs nt_lemmas or ot_strongs'
print('All 69 groups validated successfully')
"
```

Expected: `69 groups loaded` + `All 69 groups validated successfully`

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml
git commit -m "feat(data): add remaining 28 semantic groups, total 69 with genre tags"
```

---

## Task 4: Generate Thematic Keywords D1 Seed SQL

**Files:**
- Create: `server/d1-seed/thematic-keywords-expansion.sql`

**Step 1: Write a Python script to generate SQL from YAML**

Create `server/scripts/gen-thematic-keywords.py`:

```python
#!/usr/bin/env python3
"""Generate D1 seed SQL for thematic_keywords from semantic_groups.yaml."""
import yaml
import sys

YAML_PATH = "plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml"
OUTPUT_PATH = "server/d1-seed/thematic-keywords-expansion.sql"

with open(YAML_PATH) as f:
    data = yaml.safe_load(f)

groups = data["semantic_groups"]
lines = [f"-- Thematic keywords expansion: {len(groups)} groups"]
lines.append("-- Generated from semantic_groups.yaml\n")

count = 0
for theme, group in groups.items():
    if "nt_lemmas" in group:
        for lemma in group["nt_lemmas"]:
            escaped_lemma = lemma.replace("'", "''")
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{escaped_lemma}', 'nt');")
            count += 1
    if "ot_strongs" in group:
        for strong_id, info in group["ot_strongs"].items():
            escaped_hebrew = info["hebrew"].replace("'", "''")
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{escaped_hebrew}', 'ot');")
            count += 1

with open(OUTPUT_PATH, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Generated {count} INSERT statements for {len(groups)} themes → {OUTPUT_PATH}")
```

**Step 2: Run the generator**

Run: `python3 server/scripts/gen-thematic-keywords.py`

Expected: `Generated NNN INSERT statements for 69 themes → server/d1-seed/thematic-keywords-expansion.sql`

**Step 3: Verify the SQL file looks correct**

Run: `head -20 server/d1-seed/thematic-keywords-expansion.sql && echo "---" && wc -l server/d1-seed/thematic-keywords-expansion.sql`

Expected: Starts with `-- Thematic keywords expansion`, contains INSERT statements, line count matches expected.

**Step 4: Update seed script to include new file**

Add to `server/scripts/seed-d1.sh`, after the "Small tables" block (line 17):

```bash
# Thematic keywords expansion
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
echo "  Thematic keywords expansion imported."
```

**Step 5: Commit**

```bash
git add server/scripts/gen-thematic-keywords.py server/d1-seed/thematic-keywords-expansion.sql server/scripts/seed-d1.sh
git commit -m "feat(data): generate thematic keywords SQL for 69 semantic groups"
```

---

## Task 5: Extract `parseVerseRange()` to Shared Utils

**Files:**
- Modify: `server/src/tools/utils.ts`
- Modify: `server/src/tools/morphology.ts`

**Step 1: Add `VerseRange` type and `parseVerseRange()` to utils.ts**

Add to `server/src/tools/utils.ts` (after the existing `parseChapterRange` function):

```typescript
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
```

**Step 2: Update morphology.ts to import from utils**

In `server/src/tools/morphology.ts`:

1. Add import: `import { parseVerseRange, type VerseRange } from './utils.js';`
2. Delete the local `interface VerseRange` (lines 36-41)
3. Delete the local `function parseVerseRange` (lines 43-57)

**Step 3: Typecheck**

Run: `cd server && npm run typecheck`

Expected: No errors. The function signature is identical — this is a pure move refactor.

**Step 4: Commit**

```bash
git add server/src/tools/utils.ts server/src/tools/morphology.ts
git commit -m "refactor(server): extract parseVerseRange to shared utils"
```

---

## Task 6: Add `ot_quotes` + `ot_quote_sources` D1 Schema

**Files:**
- Modify: `server/d1-seed/schema.sql`

**Step 1: Append new table definitions**

Add to the end of `server/d1-seed/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS ot_quotes (
  id INTEGER PRIMARY KEY,
  nt_book TEXT NOT NULL,
  nt_chapter INTEGER NOT NULL,
  nt_verse INTEGER NOT NULL,
  greek_text TEXT NOT NULL,
  quote_type TEXT NOT NULL DEFAULT 'direct'
);
CREATE INDEX IF NOT EXISTS idx_ot_quotes_nt ON ot_quotes(nt_book, nt_chapter, nt_verse);

CREATE TABLE IF NOT EXISTS ot_quote_sources (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES ot_quotes(id),
  ot_book TEXT NOT NULL,
  ot_chapter INTEGER NOT NULL,
  ot_verse INTEGER NOT NULL,
  ot_verse_end INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ot_sources_quote ON ot_quote_sources(quote_id);
CREATE INDEX IF NOT EXISTS idx_ot_sources_book ON ot_quote_sources(ot_book, ot_chapter, ot_verse);
```

**Step 2: Commit**

```bash
git add server/d1-seed/schema.sql
git commit -m "feat(server): add ot_quotes and ot_quote_sources D1 schema"
```

---

## Task 7: Write OT Quotes Merge Script

**Files:**
- Create: `server/scripts/merge-ot-quotes.py`

This script merges Levinsohn OT_quotes.json with STEPBible ot_in_nt_refs.json and produces `server/d1-seed/ot-quotes.sql`.

**Step 1: Download STEPBible data**

Run: `curl -o server/scripts/ot_in_nt_refs.json "https://stepbible.org/html/json/ot_in_nt_refs.json"`

Verify: `python3 -c "import json; d=json.load(open('server/scripts/ot_in_nt_refs.json')); print(f'{len(d)} entries')" `

**Step 2: Examine STEPBible data format**

Run: `python3 -c "import json; d=json.load(open('server/scripts/ot_in_nt_refs.json')); print(json.dumps(d[:3], indent=2))"`

Understand the field names and format before writing the merge script. The script below may need adjustment based on actual STEPBible field names.

**Step 3: Write merge script**

Create `server/scripts/merge-ot-quotes.py`:

```python
#!/usr/bin/env python3
"""
Merge Levinsohn OT_quotes.json with STEPBible ot_in_nt_refs.json.
Outputs: server/d1-seed/ot-quotes.sql + merge-report.json
"""
import json
import re
import sys
from collections import defaultdict

LEVINSOHN_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/levinsohn/OT_quotes.json"
STEPBIBLE_PATH = "server/scripts/ot_in_nt_refs.json"
OUTPUT_SQL = "server/d1-seed/ot-quotes.sql"
OUTPUT_REPORT = "server/scripts/merge-report.json"

# Book name normalization (matches server/src/db/books.ts canonical names)
BOOK_ALIASES = {
    "Matt": "matthew", "Mark": "mark", "Luke": "luke", "John": "john",
    "Acts": "acts", "Rom": "romans", "1Cor": "1_corinthians", "2Cor": "2_corinthians",
    "Gal": "galatians", "Eph": "ephesians", "Phil": "philippians", "Col": "colossians",
    "1Thess": "1_thessalonians", "2Thess": "2_thessalonians",
    "1Tim": "1_timothy", "2Tim": "2_timothy", "Tit": "titus", "Phlm": "philemon",
    "Heb": "hebrews", "Jas": "james", "1Pet": "1_peter", "2Pet": "2_peter",
    "1John": "1_john", "2John": "2_john", "3John": "3_john",
    "Jude": "jude", "Rev": "revelation",
    # OT books for ot_quote_sources
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus", "Num": "numbers",
    "Deut": "deuteronomy", "Josh": "joshua", "Judg": "judges", "Ruth": "ruth",
    "1Sam": "1_samuel", "2Sam": "2_samuel", "1Kgs": "1_kings", "2Kgs": "2_kings",
    "1Chr": "1_chronicles", "2Chr": "2_chronicles", "Ezra": "ezra", "Neh": "nehemiah",
    "Esth": "esther", "Job": "job", "Ps": "psalms", "Prov": "proverbs",
    "Eccl": "ecclesiastes", "Song": "song_of_songs", "Isa": "isaiah", "Jer": "jeremiah",
    "Lam": "lamentations", "Ezek": "ezekiel", "Dan": "daniel", "Hos": "hosea",
    "Joel": "joel", "Amos": "amos", "Obad": "obadiah", "Jonah": "jonah",
    "Mic": "micah", "Nah": "nahum", "Hab": "habakkuk", "Zeph": "zephaniah",
    "Hag": "haggai", "Zech": "zechariah", "Mal": "malachi",
}


def normalize_book(name: str) -> str | None:
    """Normalize book name to canonical form."""
    # Try direct lookup
    if name in BOOK_ALIASES:
        return BOOK_ALIASES[name]
    # Try lowercase match
    lower = name.lower().replace(" ", "")
    for alias, canonical in BOOK_ALIASES.items():
        if alias.lower() == lower:
            return canonical
    return None


def parse_levinsohn_ref(verse: str) -> tuple[str, int, int] | None:
    """Parse 'Matt 1:23' → ('matthew', 1, 23)"""
    m = re.match(r"(\d?\s?\w+)\s+(\d+):(\d+)", verse)
    if not m:
        return None
    book_raw = m.group(1).strip()
    chapter = int(m.group(2))
    verse_num = int(m.group(3))
    canonical = normalize_book(book_raw)
    if not canonical:
        return None
    return (canonical, chapter, verse_num)


def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def main():
    # Load Levinsohn
    with open(LEVINSOHN_PATH) as f:
        lev_data = json.load(f)
    lev_refs = lev_data["references"]
    print(f"Levinsohn: {len(lev_refs)} entries")

    # Load STEPBible
    with open(STEPBIBLE_PATH) as f:
        step_data = json.load(f)
    print(f"STEPBible: {len(step_data)} entries")

    # NOTE: STEPBible format needs inspection.
    # Adjust field access based on actual data structure.
    # This is a template — the implementer MUST verify field names
    # after running Step 2 above.

    # Index STEPBible by normalized NT ref → OT sources
    step_by_ref: dict[tuple, list] = defaultdict(list)
    # TODO: Parse STEPBible entries and populate step_by_ref
    # Key: (canonical_book, chapter, verse)
    # Value: list of OT source dicts

    # Build ot_quotes rows from Levinsohn
    quote_id = 0
    source_id = 0
    quote_lines = ["-- OT Quotes seed data (merged Levinsohn + STEPBible)"]
    source_lines = []
    report = {"matched": 0, "levinsohn_only": 0, "stepbible_only": 0, "parse_errors": []}

    for entry in lev_refs:
        parsed = parse_levinsohn_ref(entry["verse"])
        if not parsed:
            report["parse_errors"].append(entry["verse"])
            continue

        book, chapter, verse = parsed
        greek = escape_sql(entry["word"])
        quote_id += 1

        quote_lines.append(
            f"INSERT INTO ot_quotes (id, nt_book, nt_chapter, nt_verse, greek_text, quote_type) "
            f"VALUES ({quote_id}, '{book}', {chapter}, {verse}, '{greek}', 'direct');"
        )

        # Check for STEPBible match
        key = (book, chapter, verse)
        if key in step_by_ref:
            report["matched"] += 1
            for ot_src in step_by_ref[key]:
                source_id += 1
                source_lines.append(
                    f"INSERT INTO ot_quote_sources (id, quote_id, ot_book, ot_chapter, ot_verse, ot_verse_end) "
                    f"VALUES ({source_id}, {quote_id}, '{ot_src['book']}', {ot_src['chapter']}, {ot_src['verse']}, {ot_src.get('verse_end', 'NULL')});"
                )
        else:
            report["levinsohn_only"] += 1

    # Write SQL
    all_lines = quote_lines + ["", "-- OT Quote Sources"] + source_lines
    with open(OUTPUT_SQL, "w") as f:
        f.write("\n".join(all_lines) + "\n")

    # Write report
    with open(OUTPUT_REPORT, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Output: {OUTPUT_SQL} ({quote_id} quotes, {source_id} sources)")
    print(f"Report: matched={report['matched']}, levinsohn_only={report['levinsohn_only']}, parse_errors={len(report['parse_errors'])}")


if __name__ == "__main__":
    main()
```

**Important:** This script is a working template. The STEPBible parsing section (marked `TODO`) must be completed after examining the actual STEPBible data format in Step 2. The implementer must:
1. Inspect the STEPBible JSON structure
2. Write the parser for STEPBible entries
3. Map STEPBible OT references to our canonical book names
4. Handle multi-source entries (one NT ref → multiple OT sources)

**Step 4: Run merge script**

Run: `python3 server/scripts/merge-ot-quotes.py`

Expected: SQL file generated, merge report showing match statistics.

**Step 5: Verify SQL output**

Run: `head -20 server/d1-seed/ot-quotes.sql && echo "---" && wc -l server/d1-seed/ot-quotes.sql`

**Step 6: Update seed script**

Add to `server/scripts/seed-d1.sh`, after the thematic keywords block:

```bash
# OT Quotes
echo "Importing OT quotes..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/ot-quotes.sql" --remote
echo "  OT quotes imported."
```

**Step 7: Commit**

```bash
git add server/scripts/merge-ot-quotes.py server/scripts/ot_in_nt_refs.json server/d1-seed/ot-quotes.sql server/scripts/merge-report.json server/scripts/seed-d1.sh
git commit -m "feat(data): merge Levinsohn + STEPBible OT quotation data"
```

---

## Task 8: Implement `query_ot_quotes` Tool

**Files:**
- Create: `server/src/tools/ot-quotes.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/tools/list-books.ts`

**Step 1: Create `server/src/tools/ot-quotes.ts`**

```typescript
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

export const OtQuotesInputSchema = {
  book: z.string().describe('NT book name (any common form, e.g., "Romans", "Matt", "Hebrews")'),
  range: z.string().optional().describe('Verse range: "8:28-8:39" or single verse "1:23". Omit for entire book.'),
  ot_book: z.string().optional().describe('Filter by OT source book (e.g., "Isaiah", "Isa", "Psalms")'),
};

export type OtQuotesInput = z.output<z.ZodObject<typeof OtQuotesInputSchema>>;

export const OtQuotesOutputSchema = {
  book: z.string(),
  range: z.string().optional(),
  quotes: z.array(z.object({
    nt_ref: z.string(),
    greek_text: z.string(),
    quote_type: z.string(),
    ot_sources: z.array(z.object({
      book: z.string(),
      chapter: z.number(),
      verse: z.number(),
      verse_end: z.number().nullable(),
      ref: z.string(),
    })),
  })),
  summary: z.object({
    total: z.number(),
    nt_books_covered: z.number(),
    ot_books_referenced: z.array(z.string()),
  }),
};

function formatOtRef(book: string, chapter: number, verse: number, verseEnd: number | null): string {
  const base = `${book} ${chapter}:${verse}`;
  return verseEnd ? `${base}-${verseEnd}` : base;
}

export async function queryOtQuotes(args: OtQuotesInput): Promise<CallToolResult> {
  const bookInfo = lookupBook(args.book);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.book}' not found.`, suggestions: suggestBooks(args.book) } }) }],
      isError: true,
    };
  }

  // Testament gate: OT quotes tool is NT-only
  if (bookInfo.testament === 'ot') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'WRONG_TESTAMENT', message: `query_ot_quotes is for NT books only. '${bookInfo.displayName}' is an OT book.` } }) }],
      isError: true,
    };
  }

  // Build query
  let sql = `
    SELECT q.id, q.nt_book, q.nt_chapter, q.nt_verse, q.greek_text, q.quote_type,
           s.ot_book, s.ot_chapter, s.ot_verse, s.ot_verse_end
    FROM ot_quotes q
    LEFT JOIN ot_quote_sources s ON s.quote_id = q.id
    WHERE q.nt_book = ?
  `;
  const params: unknown[] = [bookInfo.canonical];

  // Optional verse range filter
  if (args.range) {
    const verseRange = parseVerseRange(args.range);
    if ('error' in verseRange) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: verseRange.error } }) }],
        isError: true,
      };
    }
    sql += ' AND (q.nt_chapter > ? OR (q.nt_chapter = ? AND q.nt_verse >= ?))';
    sql += ' AND (q.nt_chapter < ? OR (q.nt_chapter = ? AND q.nt_verse <= ?))';
    params.push(
      verseRange.startChapter, verseRange.startChapter, verseRange.startVerse,
      verseRange.endChapter, verseRange.endChapter, verseRange.endVerse,
    );
  }

  // Optional OT book filter
  if (args.ot_book) {
    const otBookInfo = lookupBook(args.ot_book);
    if (!otBookInfo) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: `OT book '${args.ot_book}' not found.`, suggestions: suggestBooks(args.ot_book) } }) }],
        isError: true,
      };
    }
    sql += ' AND s.ot_book = ?';
    params.push(otBookInfo.canonical);
  }

  sql += ' ORDER BY q.nt_chapter, q.nt_verse, q.id';

  const rows = await query(sql, params);

  // Group flat rows by quote id
  const quotesMap = new Map<number, {
    nt_ref: string;
    greek_text: string;
    quote_type: string;
    ot_sources: { book: string; chapter: number; verse: number; verse_end: number | null; ref: string }[];
  }>();

  for (const row of rows) {
    const qid = row.id as number;
    if (!quotesMap.has(qid)) {
      quotesMap.set(qid, {
        nt_ref: `${bookInfo.displayName} ${row.nt_chapter}:${row.nt_verse}`,
        greek_text: row.greek_text as string,
        quote_type: row.quote_type as string,
        ot_sources: [],
      });
    }
    if (row.ot_book) {
      const otBook = row.ot_book as string;
      const otChapter = row.ot_chapter as number;
      const otVerse = row.ot_verse as number;
      const otVerseEnd = row.ot_verse_end as number | null;
      quotesMap.get(qid)!.ot_sources.push({
        book: otBook,
        chapter: otChapter,
        verse: otVerse,
        verse_end: otVerseEnd,
        ref: formatOtRef(otBook, otChapter, otVerse, otVerseEnd),
      });
    }
  }

  const quotes = [...quotesMap.values()];

  // Build summary
  const ntBooks = new Set(quotes.map(q => q.nt_ref.split(' ')[0]));
  const otBooks = new Set<string>();
  for (const q of quotes) {
    for (const s of q.ot_sources) {
      otBooks.add(s.book);
    }
  }

  const result = {
    book: bookInfo.displayName,
    range: args.range,
    quotes,
    summary: {
      total: quotes.length,
      nt_books_covered: ntBooks.size,
      ot_books_referenced: [...otBooks].sort(),
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
```

**Step 2: Register tool in `server/src/index.ts`**

Add import at top:
```typescript
import { queryOtQuotes, OtQuotesInputSchema, OtQuotesOutputSchema } from './tools/ot-quotes.js';
```

Add description constant (after `DESC_MORPHOLOGY`):
```typescript
const DESC_OT_QUOTES = `Query Old Testament quotations found within New Testament books.

Returns quotation data including the quoted Greek text, quote type (direct/allusion/echo), and the OT source passage(s). NT books only.

Args:
  - book (string, required): NT book name in any common form (e.g., "Romans", "Matt", "Hebrews")
  - range (string, optional): Verse range "8:28-8:39" or single verse "1:23". Omit for entire book.
  - ot_book (string, optional): Filter by OT source book (e.g., "Isaiah", "Isa", "Psalms")

Returns: { book, range?, quotes: [{nt_ref, greek_text, quote_type, ot_sources: [{book, chapter, verse, verse_end?, ref}]}], summary: {total, nt_books_covered, ot_books_referenced} }

Examples:
  - All OT quotes in Romans: book="Romans"
  - Isaiah quotes in Matthew: book="Matthew", ot_book="Isaiah"
  - Quotes in Romans 8: book="Romans", range="8:1-8:39"`;
```

Add registration (after `query_morphology` registration, before `return server`):
```typescript
  server.registerTool('query_ot_quotes', {
    title: 'Query OT Quotations in NT',
    description: DESC_OT_QUOTES,
    inputSchema: OtQuotesInputSchema,
    outputSchema: OtQuotesOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args, _extra) =>
    cachedToolCall('query_ot_quotes', args as unknown as Record<string, unknown>, () => queryOtQuotes(args))
  );
```

**Step 3: Update `AVAILABLE_TOOLS` in `server/src/tools/list-books.ts`**

Add to the `AVAILABLE_TOOLS` array:
```typescript
const AVAILABLE_TOOLS = [
  'query_morphology — word-level parsing for any book (OT + NT)',
  'query_vocabulary — lemma frequencies + thematic keywords (OT + NT)',
  'query_discourse_features — Levinsohn discourse markers (NT only)',
  'query_paragraph_breaks — Masoretic petuchah/setumah markers (OT only)',
  'query_ot_quotes — OT quotations in NT passages (NT only)',
] as const;
```

**Step 4: Typecheck**

Run: `cd server && npm run typecheck`

Expected: No errors.

**Step 5: Commit**

```bash
git add server/src/tools/ot-quotes.ts server/src/index.ts server/src/tools/list-books.ts
git commit -m "feat(server): add query_ot_quotes MCP tool with testament gate"
```

---

## Task 9: Update Skills with `query_ot_quotes`

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md`
- Modify: `plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`

**Step 1: Update exegetical-notes allowed-tools**

In `plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md`, line 4, add `query_ot_quotes` to the allowed-tools frontmatter:

```yaml
allowed-tools: Read, Write, Glob, WebSearch, Bash, mcp__claude-of-alexandria-mcp__query_discourse_features, mcp__claude-of-alexandria-mcp__query_paragraph_breaks, mcp__claude-of-alexandria-mcp__query_vocabulary, mcp__claude-of-alexandria-mcp__query_morphology, mcp__claude-of-alexandria-mcp__query_ot_quotes
```

**Step 2: Update Section 8 template**

Replace (around line 223):
```
[OT quotations or allusions (from OT_quotes.json for NT passages)]
```

With:
```
[OT quotations or allusions (call query_ot_quotes for NT passages)]
```

**Step 3: Update consult-biblical-scholar allowed-tools**

In `plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md`, add `query_ot_quotes` to the allowed-tools frontmatter in the same pattern.

**Step 4: Commit**

```bash
git add plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md plugins/claude-of-alexandria/skills/consult-biblical-scholar/SKILL.md
git commit -m "feat(skills): add query_ot_quotes to exegetical-notes and consult-biblical-scholar"
```

---

## Task 10: Add Conjunction Querying Pattern to Exegetical Notes (Q5)

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md`

**Step 1: Add epistle-specific sub-step to workflow step 3**

Find the "Gather data" step 3 section (around line 105-113). After the OT block, add:

```markdown
   Epistle-specific:
       query_morphology with pos_filter: "conjunction" for full passage range
       Map logical connectives to discourse function:
       | Connective | Greek | Function |
       |------------|-------|----------|
       | γάρ        | gar   | Grounds/reason ("for") |
       | οὖν        | oun   | Inference ("therefore") |
       | δέ         | de    | Contrast or continuation ("but/and") |
       | ἀλλά       | alla  | Strong contrast ("but rather") |
       | ἵνα        | hina  | Purpose ("in order that") |
       | ὥστε       | hōste | Result ("so that") |
       | εἰ         | ei    | Condition ("if") |
       | διότι      | dioti | Causal ("because") |
       | ὅτι        | hoti  | Content/causal ("that/because") |
       Use in Section 2 (Internal Structure) to map argument's logical flow
```

**Step 2: Add failure pattern**

Find the "Common Failure Patterns" table (around line 313). Add a new row:

```markdown
| No logical connectives in epistle analysis | For epistles: query_morphology pos_filter "conjunction", map γάρ/οὖν/δέ/ἀλλά/ἵνα flow |
```

**Step 3: Commit**

```bash
git add plugins/claude-of-alexandria/skills/exegetical-notes/SKILL.md
git commit -m "feat(skills): add conjunction querying pattern for epistle genre"
```

---

## Task 11: Deploy Server Changes

**Prerequisite:** Tasks 4-8 must be complete. Seed data must be ready.

**Step 1: Seed the expanded thematic keywords**

Run: `cd server && npx wrangler d1 execute claude-of-alexandria --file=d1-seed/thematic-keywords-expansion.sql --remote`

Expected: No errors.

**Step 2: Seed the OT quotes schema**

Run: `cd server && npx wrangler d1 execute claude-of-alexandria --file=d1-seed/schema.sql --remote`

Expected: No errors (IF NOT EXISTS guards prevent duplicates).

**Step 3: Seed the OT quotes data**

Run: `cd server && npx wrangler d1 execute claude-of-alexandria --file=d1-seed/ot-quotes.sql --remote`

Expected: No errors.

**Step 4: Deploy the Worker**

Run: `cd server && npm run deploy`

Expected: Successful deployment to `coa.davebream.com`.

**Step 5: Verify deployment**

Run: `curl -s https://coa.davebream.com/health | python3 -m json.tool`

Expected: `{"status": "ok", "version": "...", "db": "connected"}`

**Step 6: Bump server version**

Update version in `server/package.json` and `server/src/index.ts` (McpServer constructor + health check) to `1.7.0`.

**Step 7: Commit and deploy**

```bash
git add server/package.json server/src/index.ts
git commit -m "chore(release): bump server version to 1.7.0"
cd server && npm run deploy
```

---

## Task 12: Write `argument-flow` Test Scenarios (TDD RED Phase — Part 1)

> **REQUIRED:** Invoke `superpowers:writing-skills` before starting this task.

**Files:**
- Create: `tests/skills/argument-flow/scenarios.md`

**Step 1: Write 8 test scenarios**

Create `tests/skills/argument-flow/scenarios.md` with the following test cases, per the design doc:

```markdown
# Argument Flow — Test Scenarios

## Scenario 1: Standard Epistle (Romans 8:28-39)
**Input:** `/argument-flow Romans 8:28-39`
**Expected:**
- Pericope check passes (valid unit)
- Genre check passes (epistle)
- Connective inventory table with: ὅτι (8:29), οὖν (8:31), εἰ (8:31), γάρ (8:38), ἀλλά (8:37)
- Proposition map with tree structure showing main claim → grounds → inference → conclusion
- Every connective cited with verse reference
- OT quotation at 8:36 (Ps 44:22) identified via query_ot_quotes
- Sorites chain at 8:29-30 marked as asyndeton
- Rhetorical questions at 8:31-35 with expected answer annotations

## Scenario 2: Asyndeton / Sorites (Romans 8:29-30)
**Input:** `/argument-flow Romans 8:28-30` (narrower range)
**Expected:**
- Asyndeton pattern at 8:29-30 identified and labeled `[asyndeton: sorites chain]`
- NOT treated as missing data or error
- Chain structure: foreknew → predestined → called → justified → glorified

## Scenario 3: Rhetorical Questions (Romans 8:31-35)
**Input:** `/argument-flow Romans 8:31-35`
**Expected:**
- Each rhetorical question labeled with expected answer (μή → no, οὐ → yes)
- Questions treated as propositions, not dismissed
- A fortiori argument structure at 8:32 identified

## Scenario 4: Non-Epistle Warning (Psalm 23)
**Input:** `/argument-flow Psalm 23`
**Expected:**
- Genre check identifies `hebrew_poetry`, NOT epistle
- Warning issued: suggest `exegetical-notes` or future `poetic-analysis`
- Does NOT proceed without user confirmation
- Does NOT produce argument-flow output for poetry without explicit override

## Scenario 5: Embedded OT Quotation (Romans 8:36)
**Input:** `/argument-flow Romans 8:35-37`
**Expected:**
- query_ot_quotes called for the range
- Ps 44:22 identified as OT source
- Labeled `OT EVIDENCE` in proposition map
- Role noted: serves as warrant for "we are being killed all day long"

## Scenario 6: Hymnic Fragment (Philippians 2:1-11)
**Input:** `/argument-flow Philippians 2:1-11`
**Expected:**
- Phil 2:6-11 identified as embedded hymn/confessional fragment
- Labeled `EMBEDDED HYMN` in proposition map
- Internal logic analyzed separately from surrounding argument
- Surrounding argument (2:1-5 exhortation → 2:6-11 hymnic ground) mapped

## Scenario 7: Secondary Conjunction Functions (Galatians 3:1-14)
**Input:** `/argument-flow Galatians 3:1-14`
**Expected:**
- ὅτι distinguished as content marker vs. causal marker depending on context
- γάρ chain at 3:6-9 mapped correctly
- Scripture quotations (Gen 15:6, Deut 27:26, Hab 2:4, Deut 21:23) from query_ot_quotes
- Purpose clause (ἵνα) at 3:14 correctly identified

## Scenario 8: Non-Epistle Override (Genesis 22:1-19)
**Input:** `/argument-flow Genesis 22:1-19` → user says "yes, proceed anyway"
**Expected:**
- Genre check warns: ot_narrative, not epistle
- After user confirmation, proceeds with caveat
- Output includes prominent disclaimer about genre mismatch
- Tool still queries available MCP data (morphology, paragraph breaks)
- Connective inventory attempts Hebrew conjunctions (וְ, כִּי, etc.)
```

**Step 2: Commit**

```bash
mkdir -p tests/skills/argument-flow
git add tests/skills/argument-flow/scenarios.md
git commit -m "test(argument-flow): write 8 test scenarios for RED phase"
```

---

## Task 13: Run Baseline Tests (TDD RED Phase — Part 2)

> **REQUIRED:** `superpowers:writing-skills` must still be active.

**Files:**
- Create: `tests/skills/argument-flow/baseline.md`

**Step 1: Test without the skill**

Run each scenario (1, 4, 6 at minimum) against the model without the argument-flow skill loaded. Document exactly what goes wrong. Use a fresh Claude Code session without the plugin installed, or test by directly prompting without skill instructions.

For each scenario, document:
- What the model produced
- What failure mode it exhibited
- Classification (e.g., "no connective inventory", "moralistic application", "skipped MCP tools", "no genre gate")

**Step 2: Write baseline.md**

Create `tests/skills/argument-flow/baseline.md` documenting failures:

```markdown
# Argument Flow — Baseline (RED Phase)

## Test Date: YYYY-MM-DD
## Model: Claude (no argument-flow skill)

## Scenario 1: Romans 8:28-39
**Prompt:** "Map the logical argument flow of Romans 8:28-39"
**Result:** [Document actual output]
**Failures:**
- [ ] No connective inventory table
- [ ] Connectives not cited with verse references
- [ ] No query_morphology call for conjunctions
- [ ] OT quotation at 8:36 not identified via data
- [ ] Sorites chain not labeled as asyndeton
- [ ] Rhetorical questions not annotated with expected answers
**Failure Classification:** [Missing data grounding, prose-only analysis]

## Scenario 4: Psalm 23
**Prompt:** "Map the logical argument flow of Psalm 23"
**Result:** [Document actual output]
**Failures:**
- [ ] No genre warning issued
- [ ] Produced argument-flow for poetry without caveat
**Failure Classification:** [Missing genre gate]

## Scenario 6: Philippians 2:1-11
**Prompt:** "Map the logical argument flow of Philippians 2:1-11"
**Result:** [Document actual output]
**Failures:**
- [ ] Hymnic fragment not identified
- [ ] No separate analysis of hymn's internal logic
**Failure Classification:** [Missing special pattern handling]
```

**Step 3: Commit**

```bash
git add tests/skills/argument-flow/baseline.md
git commit -m "test(argument-flow): document baseline failures (RED phase)"
```

---

## Task 14: Write `argument-flow` Skill (TDD GREEN Phase)

> **REQUIRED:** `superpowers:writing-skills` must still be active.

**Files:**
- Create: `plugins/claude-of-alexandria/skills/argument-flow/SKILL.md`
- Create: `plugins/claude-of-alexandria/skills/argument-flow/README.md`

**Step 1: Create SKILL.md**

Write `plugins/claude-of-alexandria/skills/argument-flow/SKILL.md` implementing the full design from the design doc. The YAML frontmatter must include:

```yaml
---
name: argument-flow
description: Use when mapping clause-level logical flow in epistolary passages. Use when user asks for argument structure, logical flow, proposition diagram, or connective analysis of an epistle. Always English output. Saves to file.
allowed-tools: Read, Write, Glob, WebSearch, Bash, mcp__claude-of-alexandria-mcp__query_discourse_features, mcp__claude-of-alexandria-mcp__query_paragraph_breaks, mcp__claude-of-alexandria-mcp__query_vocabulary, mcp__claude-of-alexandria-mcp__query_morphology, mcp__claude-of-alexandria-mcp__query_ot_quotes
---
```

The body must include (all from the design doc):
- Iron Rules (5 rules)
- Workflow (10 steps)
- Output Format (with Connective Inventory + Proposition Map)
- Connective Function Reference table (16 connectives)
- Special Patterns (asyndeton, rhetorical questions, embedded OT quotations, hymnic fragments)
- "What This Skill Does NOT Do" section
- Common Failure Patterns / Red Flags table

Address each failure documented in baseline.md with a specific constraint.

**Step 2: Create README.md**

Write `plugins/claude-of-alexandria/skills/argument-flow/README.md`:

```markdown
# argument-flow

Standalone analytical tool for mapping clause-level logical flow in epistolary passages.

## Development

- **Design:** `docs/plans/2026-02-24-phase1-quick-wins-design.md` (S2 section)
- **TDD:** `tests/skills/argument-flow/`
- **Dependencies:** query_morphology, query_discourse_features, query_ot_quotes MCP tools

## What it does

Produces structured proposition diagrams showing main claims, grounds, inferences, conditions, purposes, and subordination. Every connective must be cited from query_morphology data with verse reference.

## What it doesn't do

- Full 10-section exegetical notes (use `exegetical-notes`)
- Hebrew poetry analysis (future `poetic-analysis`)
- Word studies beyond proposition labeling
- Application or devotional content
```

**Step 3: Commit**

```bash
mkdir -p plugins/claude-of-alexandria/skills/argument-flow
git add plugins/claude-of-alexandria/skills/argument-flow/SKILL.md plugins/claude-of-alexandria/skills/argument-flow/README.md
git commit -m "feat(skills): add argument-flow skill (GREEN phase)"
```

---

## Task 15: Verify and Refactor `argument-flow` Skill (TDD REFACTOR Phase)

> **REQUIRED:** `superpowers:writing-skills` must still be active.

**Files:**
- Create: `tests/skills/argument-flow/verification.md`
- Modify: `plugins/claude-of-alexandria/skills/argument-flow/SKILL.md` (if rationalizations found)

**Step 1: Test GREEN-phase skill against all scenarios**

Run scenarios 1, 4, 6, and 7 (at minimum) with the skill loaded. Document results.

**Step 2: Document rationalizations**

For each scenario, note any rationalizations the agent attempts to bypass constraints:
- "The connective inventory is implied by the prose" → Counter: explicit table required
- "This passage is epistolary enough" → Counter: genre check must use book-genres.yaml
- "I'll note the OT quotation from my knowledge" → Counter: query_ot_quotes call required

**Step 3: Write verification.md**

Create `tests/skills/argument-flow/verification.md`:

```markdown
# Argument Flow — Verification (GREEN Phase)

## Test Date: YYYY-MM-DD
## Model: Claude (with argument-flow skill)

## Scenario 1: Romans 8:28-39
**Result:** [Document actual output]
**Baseline failures fixed:**
- [x] Connective inventory table present
- [x] Connectives cited with verse references
- [x] query_morphology called for conjunctions
- [x] OT quotation at 8:36 identified via query_ot_quotes
...

## Rationalizations Observed
| Rationalization | Counter Added |
|----------------|---------------|
| [Document any] | [How addressed] |
```

**Step 4: Update SKILL.md with rationalization counters if needed**

If any rationalizations were observed, add explicit counters to the skill's Red Flags / Common Rationalizations section.

**Step 5: Commit**

```bash
git add tests/skills/argument-flow/verification.md plugins/claude-of-alexandria/skills/argument-flow/SKILL.md
git commit -m "test(argument-flow): verification and refactor (GREEN/REFACTOR phase)"
```

---

## Task 16: Final Cleanup and Integration Commit

**Files:**
- Modify: `server/scripts/merge-ot-quotes.py` (cleanup, remove if generated data is committed)

**Step 1: Verify all files are committed**

Run: `git status`

Expected: Clean working tree.

**Step 2: Verify file structure matches design**

Confirm these exist:
```
plugins/claude-of-alexandria/reference/vocabulary/semantic_groups.yaml  (69 groups)
server/d1-seed/schema.sql                (includes ot_quotes + ot_quote_sources)
server/d1-seed/ot-quotes.sql             (seed data)
server/d1-seed/thematic-keywords-expansion.sql  (56 new themes)
server/src/tools/utils.ts                (parseVerseRange exported)
server/src/tools/morphology.ts           (imports from utils)
server/src/tools/ot-quotes.ts            (new tool)
server/src/index.ts                      (6 tools registered)
server/src/tools/list-books.ts           (5 tools listed)
plugins/.../skills/exegetical-notes/SKILL.md      (updated)
plugins/.../skills/consult-biblical-scholar/SKILL.md  (updated)
plugins/.../skills/argument-flow/SKILL.md          (new)
plugins/.../skills/argument-flow/README.md         (new)
tests/skills/argument-flow/scenarios.md            (new)
tests/skills/argument-flow/baseline.md             (new)
tests/skills/argument-flow/verification.md         (new)
```

**Step 3: Run final typecheck**

Run: `cd server && npm run typecheck`

Expected: No errors.

---

## Dependency Graph

```
Task 1 ─→ Task 2 ─→ Task 3 ─→ Task 4 (Q2: semantic groups)
                                  │
Task 5 ─→ Task 6 ─→ Task 7 ─→ Task 8 ─→ Task 9 (Q1: ot_quotes tool)
                                              │
                                   Task 10 ───┤  (Q5: conjunction pattern)
                                              │
                                   Task 11 ───┤  (Deploy)
                                              │
                      Task 12 ─→ Task 13 ─→ Task 14 ─→ Task 15 (S2: TDD cycle)
                                                            │
                                                     Task 16 (Cleanup)
```

**Parallelizable:** Tasks 1-4 (Q2) and Tasks 5-6 (Q1 schema) can run in parallel since they touch different files.
