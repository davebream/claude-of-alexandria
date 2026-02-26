# Design: `query_lemmas` MCP Tool

**Date:** 2026-02-26
**Status:** Revised (post-review)
**Author:** Dawid + Claude

## Problem

`query_vocabulary` is book-scoped by design: it returns the top N lemmas for a single book, capped at 500. This works for "how does Paul use vocabulary in Romans" but fails the cross-book question: "where does H7462b (shepherd) appear across the entire OT?"

After `query_morphology` identifies the lemmas in a passage, the workflow needs vocabulary metadata (frequency, distribution) for *exactly those lemmas* across the canon — not a truncated sample of one book's vocabulary.

## Solution

A new `query_lemmas` tool that takes a list of lemma IDs and returns their cross-book distribution with chapter-level granularity.

**Design principle:** `query_vocabulary` answers "how does this author use vocabulary in this book." `query_lemmas` answers "where does this lemma appear across the canon."

## Lemma ID Format

The database uses **testament-dependent lemma representations**:

| Testament | Format | Examples |
|-----------|--------|----------|
| OT | Strong's numbers with H-prefix | `H1254a`, `H430`, `H7462b`, `H8064` |
| NT | Greek lexical forms (no prefix) | `πατήρ`, `κύριος`, `θεός`, `ἐπιτελέω` |

Testament detection: if a lemma starts with `H` followed by a digit, it is OT. All other lemmas are assumed NT (Greek lexical forms). There is no `G`-prefix convention in the data.

## Input Schema

```typescript
{
  lemmas: string[]  // Required. 1–50 lemma IDs.
                    // OT: Strong's numbers, e.g. ["H7462b", "H430"]
                    // NT: Greek lexical forms, e.g. ["πατήρ", "κύριος"]
                    // Mixed OK: ["H7462b", "πατήρ"]
}
```

- **No testament parameter.** Testament is auto-detected: `H` + digit prefix → OT, otherwise → NT.
- **Mixed-testament batches are supported.** Split into two sub-queries internally, merged transparently.
- **Max 50 lemmas.** D1's ~100 SQL parameter limit allows this comfortably. A passage rarely exceeds 25 unique lemmas.

### Validation Rules

| Condition | Behavior |
|-----------|----------|
| Empty array | Error `EMPTY_LEMMAS`: "At least one lemma required." |
| >50 lemmas | Error `LEMMA_LIMIT_EXCEEDED`: "Maximum 50 lemmas per query. Split into batches." `{ max: 50, received: N }` |
| All lemmas valid | Proceed (no format validation beyond testament detection — lemma strings are opaque IDs looked up against the DB; unmatched ones appear in `not_found`) |

**Rationale for no format validation:** NT lemmas are arbitrary Greek strings with no enforceable pattern. Rather than guess what "valid Greek" looks like, we pass all non-H-prefixed lemmas as NT lookups and let the DB decide. Lemmas not found simply appear in `not_found`.

## Query Strategy

Single query per testament:

```sql
SELECT v.lemma, v.book, v.chapter, v.frequency
FROM vocabulary v
WHERE v.testament = ? AND v.lemma IN (?, ?, ...)
ORDER BY v.lemma, v.book, v.chapter
```

Per-book totals and `books_count` are computed in JavaScript by summing chapter frequencies. This avoids a second D1 round-trip that would duplicate the same data at coarser granularity.

### Mixed-testament handling

If the input contains both OT and NT lemmas:
1. Partition into OT (H-prefix) and NT (non-H-prefix) sublists
2. Run the query for each testament in parallel (`Promise.all`)
3. Merge results into a single response array
4. `not_found` is computed per-testament: each lemma is checked against results from its own testament partition only

### Caching normalization

Before passing args to `cachedToolCall`, sort the `lemmas` array alphabetically. This ensures `["H7462b", "πατήρ"]` and `["πατήρ", "H7462b"]` share a cache entry, since `stableStringify` sorts object keys but not array elements.

## Response Shape

```json
{
  "lemmas": [
    {
      "lemma": "H7462b",
      "testament": "ot",
      "total_occurrences": 18,
      "books_count": 4,
      "distribution": {
        "Psalms":   { "23": 1, "78": 1, "80": 2, "100": 1 },
        "Ezekiel":  { "34": 5, "37": 2 },
        "Isaiah":   { "40": 2, "49": 1 },
        "Jeremiah": { "31": 2, "33": 1 }
      }
    },
    {
      "lemma": "πατήρ",
      "testament": "nt",
      "total_occurrences": 415,
      "books_count": 22,
      "distribution": {
        "Matthew": { "1": 2, "2": 3, "4": 1 },
        "John":    { "1": 5, "3": 4, "5": 7 }
      }
    }
  ],
  "not_found": ["H9999"],
  "total_requested": 3,
  "total_found": 2
}
```

Both `content` (JSON text) and `structuredContent` (raw object) are returned, consistent with all existing tools.

### Field definitions

| Field | Description |
|-------|-------------|
| `lemma` | The lemma ID as provided in the input |
| `testament` | `"ot"` or `"nt"` — derived from lemma format |
| `total_occurrences` | Sum of frequency across all books (computed from chapter data) |
| `books_count` | Number of distinct books the lemma appears in |
| `distribution` | Nested object: `book → chapter → frequency count`. Books use canonical display names. |
| `not_found` | Lemma IDs with zero occurrences in the database |
| `total_requested` | Count of input lemmas |
| `total_found` | Count of lemmas with at least one occurrence |

## Error Handling

All errors return `isError: true` with structured payloads, consistent with existing tools:

```typescript
// EMPTY_LEMMAS
{ error: { code: 'EMPTY_LEMMAS', message: 'At least one lemma required.' } }

// LEMMA_LIMIT_EXCEEDED
{ error: { code: 'LEMMA_LIMIT_EXCEEDED', message: 'Maximum 50 lemmas per query. Split into batches.', max: 50, received: N } }
```

No format validation error is needed — unrecognized lemmas pass through to the DB and appear in `not_found`.

## Truncation

Same 25,000-character limit as other tools (`CHARACTER_LIMIT = 25_000`). If exceeded:
1. Sort lemmas by `books_count` ascending (least-distributed first)
2. Remove lemmas from the bottom until under the limit
3. Set `truncated: true`
4. Include `truncation_message` suggesting smaller batches

Unlikely to hit with 50 lemmas unless they are all extremely common cross-book terms.

## Database Changes

### New index

```sql
CREATE INDEX idx_vocab_lemma_testament ON vocabulary(lemma, testament);
```

Column order is `(lemma, testament)`, not `(testament, lemma)`. Rationale: `testament` has cardinality 2 (terrible selectivity as a leading column). With `lemma` first, SQLite performs N separate index seeks directly into the high-selectivity column. Each seek lands on a small number of rows, and the `testament` filter narrows further. This also serves future `WHERE lemma = ?` queries without a testament constraint.

### No new tables

No schema changes beyond the index.

## Implementation Files

| File | Change |
|------|--------|
| `server/d1-seed/schema.sql` | Add `idx_vocab_lemma_testament` index |
| `server/scripts/d1-schema.sql` | Add `idx_vocab_lemma_testament` index (parallel schema copy) |
| `server/scripts/seed-d1.sh` | Add `CREATE INDEX` command after vocabulary table rebuild (after line 32) |
| `server/src/tools/lemmas.ts` | New file — `queryLemmas()` + input/output schemas |
| `server/src/index.ts` | Register `query_lemmas` tool with description, schema, annotations |
| `server/src/tools/list-books.ts` | Add `query_lemmas` to `AVAILABLE_TOOLS` array |
| D1 production | Run `CREATE INDEX` migration |

## Tool Description

```typescript
const DESC_LEMMAS = `Query cross-book distribution of specific lemma IDs across the biblical canon.

Unlike query_vocabulary (which shows vocabulary within one book), this tool shows where specific lemmas appear across ALL books in a testament. Use after query_morphology identifies lemmas of interest.

OT lemmas use Strong's numbers (H-prefix, e.g., "H7462b"). NT lemmas use Greek lexical forms (e.g., "πατήρ", "κύριος"). Get these from query_morphology output (the "lemma" field).

Args:
  - lemmas (string[], required): 1–50 lemma IDs. OT: Strong's numbers like "H7462b". NT: Greek forms like "πατήρ". Mixed allowed.

Returns: { lemmas: [{lemma, testament, total_occurrences, books_count, distribution: {Book: {chapter: count}}}], not_found: string[], total_requested, total_found }

Note: No lexeme/gloss field is included. The calling agent already has morphology context with normalized forms from a prior query_morphology call.

Examples:
  - OT shepherd lemma across the canon: lemmas=["H7462b"]
  - Multiple NT lemmas: lemmas=["πατήρ", "πίστις"]
  - Mixed OT/NT for covenant study: lemmas=["H1285", "διαθήκη"]`;
```

## Tool Registration

```typescript
server.registerTool('query_lemmas', {
  title: 'Query Lemma Distribution',
  description: DESC_LEMMAS,
  inputSchema: LemmasInputSchema,
  outputSchema: LemmasOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args, _extra) =>
  cachedToolCall('query_lemmas', args as unknown as Record<string, unknown>, () => queryLemmas(args))
);
```

## Caching

Same strategy as other tools:
- Cache key: `query_lemmas` + sorted args JSON (with `lemmas` array sorted before key generation)
- TTL: 24 hours
- Biblical data is static — no invalidation needed

## Implementation Notes

- **D1 parameter budget:** Each sub-query uses 1 (testament) + N (lemmas) params. With MAX_LEMMAS=50, that is 51 — well within D1's ~100 limit. Include a defensive constant (`D1_PARAM_LIMIT = 100`) and runtime guard to protect against future MAX_LEMMAS increases.
- **`structuredContent`:** Return both `content` (JSON text) and `structuredContent` (raw object) consistent with all existing tools.

## Workflow Integration

After implementation, update skills that would benefit from `query_lemmas`:
- `exegetical-notes`: After morphology step, call `query_lemmas` for cross-book distribution
- `consult-biblical-scholar`: Use distribution data for intertextual analysis
- Update `allowed-tools` in affected skill YAML frontmatter to include `mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__query_lemmas`

This is a **follow-up task**, not part of the initial implementation.

## Out of Scope

- English glosses (would require a dedicated glosses table)
- Verse-level granularity (chapter is sufficient for passage identification)
- Clustering data in cross-book response (chapter distribution makes it redundant)
- Changes to `query_vocabulary` (stays book-scoped as-is)
