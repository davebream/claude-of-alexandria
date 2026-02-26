# Design: `query_themes_for_lemmas` MCP Tool

**Date:** 2026-02-26
**Status:** Approved (revised after design review)
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
  lemmas: string[],            // Required. 1–100 lemmas (Greek for NT, Strong's numbers for OT)
  testament: "nt" | "ot",     // Required. No auto-detect — pipeline always knows testament upstream.
  include_unmatched: boolean   // Optional. Include unmatched lemmas in response (default: true).
                               // Set false to suppress function-word noise in large passages.
}
```

**Validation:**
- `lemmas`: min 1, max 100
- `testament`: required Zod enum
- `include_unmatched`: optional boolean, defaults to `true`
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
  unmatched: ["καί", "δέ"],              // Omitted when include_unmatched is false
  total_lemmas: 5,                        // Post-dedup count (invariant: matched_count + unmatched_count)
  matched_count: 3,
  unmatched_count: 2
}
```

**Count semantics:** `total_lemmas` always reflects the deduplicated count (after server-side dedup), not the raw input length. The invariant `total_lemmas = matched_count + unmatched_count` always holds.

### Errors

- Empty lemmas array → Zod validation error
- Over 100 lemmas → validation error with message suggesting batching

## Tool Description

The `DESC_QUERY_THEMES_FOR_LEMMAS` constant in `index.ts`:

```
Resolve lemmas from query_morphology into thematic keyword groups for use with query_vocabulary's theme parameter.

Accepts lemmas in the format returned by query_morphology for the given testament (Greek lemmas for NT, Strong's numbers for OT). Returns themes sorted by the number of matching lemmas (most relevant first).

Use this tool in the pipeline: query_morphology → query_themes_for_lemmas → query_vocabulary(theme=...).

Args:
  - lemmas (string[], required): 1–100 lemmas to resolve (e.g., ["χαίρω", "χαρά", "εἰρήνη"] for NT, ["H2617a", "H6664"] for OT)
  - testament (string, required): "nt" or "ot" — must match the testament used in query_morphology
  - include_unmatched (boolean, optional): Include unmatched lemmas in response (default: true). Set false to reduce payload for large passages.

Returns: { testament, themes: string[], matches: {lemma: themes[]}, unmatched?: string[], total_lemmas, matched_count, unmatched_count }

Examples:
  - Resolve NT lemmas: lemmas=["χαίρω", "χαρά", "εἰρήνη"], testament="nt"
  - Resolve OT Strong's codes: lemmas=["H2617a", "H6664", "H4941"], testament="ot"
  - Pipeline use (suppress unmatched): lemmas=[...from morphology...], testament="nt", include_unmatched=false
```

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

**Defense in depth:** The handler must include an explicit runtime guard before query construction, matching the pattern in `vocabulary.ts:66-71`:

```typescript
if (testament !== 'nt' && testament !== 'ot') {
  return { content: [...], isError: true };
}
```

This ensures testament is validated at the query layer regardless of Zod schema behavior.

**Dynamic placeholder count:** The `IN` clause generates exactly `N` placeholders for the `N` deduplicated lemmas, not a fixed 100. If input deduplicates from 100 to 60, only 60 `?` placeholders are bound.

### Index Addition

The existing index `idx_theme(theme, testament)` is optimized for theme→lemma lookups. This tool reverses the direction (lemma→theme). Add a supporting index:

```sql
CREATE INDEX IF NOT EXISTS idx_thematic_lemma ON thematic_keywords(lemma, testament);
```

At ~500 rows the table scan is sub-millisecond regardless, but the index makes the query plan optimal and future-proofs the table if thematic keywords grow.

### Post-Processing (TypeScript)

1. Deduplicate + sort input lemmas
2. Execute query
3. Build `matches` map: `{ lemma → theme[] }` from rows
4. Count themes: `{ theme → matchCount }`
5. Sort `themes` array by match count desc, alphabetical tiebreaker (theme names are ASCII English labels — no Unicode sort concerns)
6. Derive `unmatched` from input lemmas not present in results
7. Omit `unmatched` from response if `include_unmatched` is `false`

### Caching

Same `cachedToolCall` wrapper as all other tools.

**Critical: dedup+sort must happen before `cachedToolCall`.** The `stableStringify` function sorts object keys but explicitly preserves array order (`!Array.isArray(v)` guard). If dedup+sort happened inside the handler, different orderings of the same lemma set would produce different cache keys and always miss.

The normalization must occur in the `index.ts` `registerTool` callback:

```typescript
async (args, _extra) => {
  const normalizedLemmas = [...new Set(args.lemmas)].sort();
  const normalizedArgs = { ...args, lemmas: normalizedLemmas };
  return cachedToolCall('query_themes_for_lemmas', normalizedArgs, () =>
    queryThemesForLemmas({ ...args, lemmas: normalizedLemmas })
  );
}
```

**Cache key length:** At 100 Greek lemmas with URL encoding, the cache key URI may approach Cloudflare's ~2000-character limit. If the key exceeds the limit, Cloudflare silently skips caching — the query still executes correctly, just without a cache hit. In practice, most passage lemma sets are 20–50 unique lemmas after dedup, well under the limit. No mitigation needed for v1; if cache miss rates for large passages become a concern, a hash-based key can be added later.

### Registration

Same pattern as existing 6 tools: `registerTool` in `index.ts` with read-only annotations, cached handler. The `AVAILABLE_TOOLS` array in `list-books.ts` gets a new entry:

```
'query_themes_for_lemmas — resolve lemmas to vocabulary themes (OT + NT)'
```

## Files Changed

| File | Change |
|------|--------|
| `server/src/tools/themes.ts` | **New.** Input schema, output schema, `queryThemesForLemmas` handler |
| `server/src/index.ts` | Import, description constant, `registerTool` call with lemma normalization |
| `server/src/tools/list-books.ts` | Add to `AVAILABLE_TOOLS` array |
| `server/scripts/d1-schema.sql` | Add `idx_thematic_lemma(lemma, testament)` index |

**Not changed:** `vocabulary.ts`, `morphology.ts`, skill files.

## Pipeline Integration

```
query_morphology(book, range)
  → extract unique lemmas from words[].lemma
  → query_themes_for_lemmas(lemmas, testament, include_unmatched=false)
  → pick top 1–2 themes (first entries in frequency-sorted themes array)
  → query_vocabulary(book, theme=X) for each selected theme
```

**Zero-themes guard:** If `themes` is empty (all lemmas are function words with no thematic matches, or the passage is too short/grammatical for any theme to match), the pipeline must not proceed to `query_vocabulary`. The empty `themes: []` response is a valid success, not an error. The pipeline should log the unmatched list for diagnostics and halt the vocabulary step gracefully.

Skills that use this pipeline will need `query_themes_for_lemmas` added to their `allowed-tools` (separate change, not part of this MCP server work).

## Rejected Alternatives

**Approach 2 — `lemmas` filter on `list_books`:** Overloads `list_books` with a second responsibility. Loses per-lemma mapping. Returns unnecessary book data.

**Approach 3 — Lemma resolution inside `query_vocabulary`:** Collapses two steps but significantly increases complexity. Mixed responsibility. Doesn't help if the pipeline needs themes for routing decisions before querying vocabulary.
