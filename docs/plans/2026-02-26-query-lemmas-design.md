# Design: `query_lemmas` MCP Tool

**Date:** 2026-02-26
**Status:** Approved
**Author:** Dawid + Claude

## Problem

`query_vocabulary` is book-scoped by design: it returns the top N lemmas for a single book, capped at 500. This works for "how does Paul use vocabulary in Romans" but fails the cross-book question: "where does H7462b (shepherd) appear across the entire OT?"

After `query_morphology` identifies the lemmas in a passage, the workflow needs vocabulary metadata (frequency, distribution, clustering context) for *exactly those lemmas* across the canon — not a truncated sample of one book's vocabulary.

## Solution

A new `query_lemmas` tool that takes a list of lemma IDs and returns their cross-book distribution with chapter-level granularity.

**Design principle:** `query_vocabulary` answers "how does this author use vocabulary in this book." `query_lemmas` answers "where does this lemma appear across the canon."

## Input Schema

```typescript
{
  lemmas: string[]  // Required. 1–50 lemma IDs. e.g. ["H7462b", "G0026"]
}
```

- **No testament parameter.** Testament is auto-detected from lemma prefix: `H` → OT, `G` → NT.
- **Mixed-testament batches are supported.** If both H- and G-prefixed lemmas are passed, the tool splits into two sub-queries internally and merges results transparently.
- **Max 50 lemmas.** D1's ~100 SQL parameter limit allows this comfortably. A passage rarely exceeds 25 unique lemmas.

### Validation Rules

| Condition | Behavior |
|-----------|----------|
| Empty array | Error: "At least one lemma required" |
| >50 lemmas | Error: "Maximum 50 lemmas per query. Split into batches." |
| Lemma without H/G prefix | Error: "Unrecognized lemma format. Expected H-prefix (OT) or G-prefix (NT)." |

## Query Strategy

Three-phase approach, consistent with existing tool patterns:

### Phase 1 — Aggregated totals per book

```sql
SELECT v.lemma, v.book, SUM(v.frequency) as total
FROM vocabulary v
WHERE v.testament = ? AND v.lemma IN (?, ?, ...)
GROUP BY v.lemma, v.book
ORDER BY v.lemma, total DESC
```

### Phase 2 — Chapter breakdown

```sql
SELECT v.lemma, v.book, v.chapter, v.frequency
FROM vocabulary v
WHERE v.testament = ? AND v.lemma IN (?, ?, ...)
ORDER BY v.lemma, v.book, v.chapter
```

Both queries use testament + lemma list as bound params. At most 51 params (1 testament + 50 lemmas) — well within D1's limit. No subquery workaround needed.

### Phase 3 — Lexeme derivation (best-effort)

```sql
SELECT DISTINCT lemma, normalized
FROM morphology
WHERE testament = ? AND lemma IN (?, ?, ...)
LIMIT 50
```

Returns one normalized form per lemma from the morphology table. Already indexed via `idx_morph_lemma`. This provides the Hebrew/Greek lexical form (e.g., רָעָה) without a dedicated glosses table.

### Mixed-testament handling

If the input contains both H- and G-prefixed lemmas:
1. Partition into OT and NT sublists
2. Run Phase 1–3 for each testament in parallel (Promise.all)
3. Merge results into a single response array

## Response Shape

```json
{
  "lemmas": [
    {
      "lemma": "H7462b",
      "lexeme": "רָעָה",
      "testament": "ot",
      "total_occurrences": 18,
      "books_count": 4,
      "distribution": {
        "Psalms":   { "23": 1, "78": 1, "80": 2, "100": 1 },
        "Ezekiel":  { "34": 5, "37": 2 },
        "Isaiah":   { "40": 2, "49": 1 },
        "Jeremiah": { "31": 2, "33": 1 }
      }
    }
  ],
  "not_found": ["H9999"],
  "total_requested": 3,
  "total_found": 2
}
```

### Field definitions

| Field | Description |
|-------|-------------|
| `lemma` | The lemma ID as provided in the input |
| `lexeme` | Normalized morphological form (Hebrew/Greek script). Best-effort from morphology table. |
| `testament` | `"ot"` or `"nt"` — derived from prefix |
| `total_occurrences` | Sum of frequency across all books |
| `books_count` | Number of distinct books the lemma appears in |
| `distribution` | Nested object: `book → chapter → frequency count` |
| `not_found` | Lemma IDs with zero occurrences in the database |
| `total_requested` | Count of input lemmas |
| `total_found` | Count of lemmas with at least one occurrence |

## Truncation

Same 25,000-character limit as other tools. If exceeded:
1. Trim lemmas with the fewest books (least-distributed first)
2. Set `truncated: true`
3. Include `truncation_message` suggesting smaller batches

Unlikely to hit with 50 lemmas unless they are all extremely common cross-book terms.

## Database Changes

### New index

```sql
CREATE INDEX idx_vocab_testament_lemma ON vocabulary(testament, lemma);
```

Required for efficient cross-book lookups. Without it, the query must scan the entire vocabulary table filtered only by testament.

### No new tables

Glosses derived from existing `morphology` table. No schema changes beyond the index.

## Implementation Files

| File | Change |
|------|--------|
| `server/d1-seed/schema.sql` | Add `idx_vocab_testament_lemma` index |
| `server/src/tools/lemmas.ts` | New file — `queryLemmas()` + input/output schemas |
| `server/src/index.ts` | Register `query_lemmas` tool with description, schema, annotations |
| D1 production | Run `CREATE INDEX` migration |

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
- Cache key: `query_lemmas` + sorted args JSON
- TTL: 24 hours
- Biblical data is static — no invalidation needed

## Workflow Integration

After implementation, update skills that would benefit from `query_lemmas`:
- `exegetical-notes`: After morphology step, call `query_lemmas` for cross-book distribution
- `consult-biblical-scholar`: Use distribution data for intertextual analysis

This is a **follow-up task**, not part of the initial implementation.

## Out of Scope

- English glosses (would require a dedicated glosses table)
- Verse-level granularity (chapter is sufficient for passage identification)
- Clustering data in cross-book response (chapter distribution makes it redundant)
- Changes to `query_vocabulary` (stays book-scoped as-is)
