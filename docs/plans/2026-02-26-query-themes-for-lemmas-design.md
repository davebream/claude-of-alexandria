# Design: `query_themes_for_lemmas` MCP Tool

**Date:** 2026-02-26
**Status:** Approved
**Approach:** New dedicated tool (Approach 1 of 3 evaluated)

## Problem

The pipeline `query_morphology → query_vocabulary` has a gap: morphology returns lemmas per word, but `query_vocabulary` requires a theme name. There is no way to go from a set of lemmas back to matching themes. The `list_books` tool returns available theme names but provides no lemma→theme mapping.

This blocks the automated package-research pipeline, which needs to: get passage lemmas → discover relevant themes → query vocabulary by theme.

## Solution

A new MCP tool `query_themes_for_lemmas` that accepts an array of lemmas + testament and returns matching theme names with a per-lemma mapping.

## Interface

### Input

```typescript
{
  lemmas: string[],        // Required. 1–100 lemmas (Greek for NT, Strong's numbers for OT)
  testament: "nt" | "ot"   // Required. No auto-detect — pipeline always knows testament upstream.
}
```

**Validation:**
- `lemmas`: min 1, max 100
- `testament`: required Zod enum
- Server-side dedup and sort of input lemmas before querying

### Output

```typescript
{
  testament: "nt",
  themes: ["joy", "peace"],              // Ordered by match count desc, alphabetical tiebreaker
  matches: {                              // Lemma-as-key (matches morphology output direction)
    "χαίρω": ["joy"],
    "χαρά": ["joy"],
    "εἰρήνη": ["peace"]
  },
  unmatched: ["καί", "δέ"],              // Input lemmas with no theme match
  total_lemmas: 5,
  matched_count: 3,
  unmatched_count: 2
}
```

### Errors

- Empty lemmas array → Zod validation error
- Over 100 lemmas → validation error with message suggesting batching

## Implementation

### Query Strategy

Single query against existing `thematic_keywords` table:

```sql
SELECT lemma, theme
FROM thematic_keywords
WHERE lemma IN (?, ?, ...)
  AND testament = '${testament}'
ORDER BY lemma, theme
```

**D1 parameter limit:** Testament is a validated enum, so it is interpolated directly into the query string (safe — not user freeform text). This reserves all 100 D1 bind parameter slots for the lemma `IN` clause, matching the 100-lemma input cap exactly.

**No schema migration needed** — `thematic_keywords` already has the right structure with `UNIQUE(theme, lemma, testament)`.

### Post-Processing (TypeScript)

1. Deduplicate + sort input lemmas
2. Execute query
3. Build `matches` map: `{ lemma → theme[] }` from rows
4. Count themes: `{ theme → matchCount }`
5. Sort `themes` array by match count desc, alphabetical tiebreaker
6. Derive `unmatched` from input lemmas not present in results

### Caching

Same `cachedToolCall` wrapper as all other tools. Input lemmas are deduped and sorted before the handler runs, so different orderings of the same lemma set produce the same cache key via `stableStringify`.

### Registration

Same pattern as existing 6 tools: `registerTool` in `index.ts` with read-only annotations, cached handler.

## Files Changed

| File | Change |
|------|--------|
| `server/src/tools/themes.ts` | **New.** Input schema, output schema, `queryThemesForLemmas` handler |
| `server/src/index.ts` | Import, description constant, `registerTool` call |
| `server/src/tools/list-books.ts` | Add to `AVAILABLE_TOOLS` array |

**Not changed:** `vocabulary.ts`, `morphology.ts`, `d1-schema.sql`, skill files.

## Pipeline Integration

```
query_morphology(book, range)
  → extract unique lemmas from words[].lemma
  → query_themes_for_lemmas(lemmas, testament)
  → pick top 1–2 themes (first entries in frequency-sorted themes array)
  → query_vocabulary(book, theme=X) for each selected theme
```

Skills that use this pipeline will need `query_themes_for_lemmas` added to their `allowed-tools` (separate change, not part of this MCP server work).

## Rejected Alternatives

**Approach 2 — `lemmas` filter on `list_books`:** Overloads `list_books` with a second responsibility. Loses per-lemma mapping. Returns unnecessary book data.

**Approach 3 — Lemma resolution inside `query_vocabulary`:** Collapses two steps but significantly increases complexity. Mixed responsibility. Doesn't help if the pipeline needs themes for routing decisions before querying vocabulary.
