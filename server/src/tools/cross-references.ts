import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';
import { parseVerseRange } from './utils.js';

const CHARACTER_LIMIT = 25_000;

// ─── trace_cross_reference_path schemas ──────────────────────────────────────

export const TraceCrossReferencePathInputSchema = {
  from_book: z.string().describe('Source book name in any common form (e.g., "Genesis", "Gen")'),
  from_range: z.string().describe('Source verse as a single verse (e.g., "3:15"). Multi-verse ranges are rejected.'),
  to_book: z.string().describe('Target book name in any common form (e.g., "Revelation", "Rev")'),
  to_range: z.string().describe('Target verse as a single verse (e.g., "12:1"). Multi-verse ranges are rejected.'),
  max_hops: z.number().optional().describe('Maximum number of hops to search (default: 4, clamped to 1–6)'),
  min_votes: z.number().optional().describe('Minimum vote count for edges (default: 1). Raising this value may reduce connectivity.'),
};

export type TraceCrossReferencePathInput = z.output<z.ZodObject<typeof TraceCrossReferencePathInputSchema>>;

const HopSchema = z.object({
  from_ref: z.string(),
  to_ref: z.string(),
  votes: z.number(),
  connecting_ref: z.string(),
});

export const TraceCrossReferencePathOutputSchema = {
  from_ref: z.string(),
  to_ref: z.string(),
  found: z.boolean(),
  truncated: z.boolean(),
  hops: z.number(),
  max_hops: z.number(),
  path: z.array(HopSchema),
  summary: z.object({
    nodes_visited: z.number(),
    edges_examined: z.number(),
    min_votes: z.number(),
  }),
  attribution: z.string(),
  note: z.string().optional(),
};

export const CrossReferencesInputSchema = {
  book: z.string().describe('Book name in any common form (e.g., "Romans", "Gen", "Psalms")'),
  range: z.string().optional().describe('Verse range: "8:28" (single verse) or "8:28-8:39" (range). Omit for entire book.'),
  min_votes: z.number().optional().describe('Minimum vote count to include (default: 2)'),
  limit: z.number().optional().describe('Maximum results returned (default: 100, max: 500)'),
  direction: z.enum(['from', 'to', 'both']).optional().describe(
    '"from" = references FROM this passage, "to" = references TO this passage, "both" = bidirectional (default)'
  ),
};

export type CrossReferencesInput = z.output<z.ZodObject<typeof CrossReferencesInputSchema>>;

export const CrossReferencesOutputSchema = {
  book: z.string(),
  range: z.string().optional(),
  cross_references: z.array(z.object({
    from_ref: z.string(),
    to_ref: z.string(),
    votes: z.number(),
    direction: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    avg_votes: z.number().optional(),
  }),
};

export async function queryCrossReferences(args: CrossReferencesInput): Promise<CallToolResult> {
  const bookInput = args.book;
  const bookInfo = lookupBook(bookInput);

  if (!bookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${bookInput}' not found.`, suggestions: suggestBooks(bookInput) }
      }) }],
      isError: true,
    };
  }

  const minVotes = args.min_votes ?? 2;
  const limit = Math.min(args.limit ?? 100, 500);
  const direction = args.direction ?? 'both';
  const bookName = bookInfo.displayName;

  // Parse verse range if provided
  let verseRange: { startChapter: number; startVerse: number; endChapter: number; endVerse: number } | null = null;
  if (args.range) {
    const parsed = parseVerseRange(args.range);
    if ('error' in parsed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: parsed.error } }) }],
        isError: true,
      };
    }
    verseRange = parsed;
  }

  // Build queries based on direction — two separate indexed queries, never OR
  interface RefRow {
    from_book: string;
    from_chapter: number;
    from_verse: number;
    to_book: string;
    to_chapter: number;
    to_verse_start: number;
    to_verse_end: number;
    votes: number;
    direction: 'from' | 'to';
  }

  const results: RefRow[] = [];

  if (direction === 'from' || direction === 'both') {
    let sql = "SELECT * FROM cross_references WHERE from_book = ? AND votes >= ? AND review_status = 'ok'";
    const params: unknown[] = [bookName, minVotes];

    if (verseRange) {
      sql += ' AND from_chapter >= ? AND from_chapter <= ?';
      params.push(verseRange.startChapter, verseRange.endChapter);

      if (verseRange.startChapter === verseRange.endChapter) {
        sql += ' AND from_verse >= ? AND from_verse <= ?';
        params.push(verseRange.startVerse, verseRange.endVerse);
      }
    }

    sql += ' ORDER BY votes DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    for (const r of rows) {
      results.push({ ...r as unknown as Omit<RefRow, 'direction'>, direction: 'from' });
    }
  }

  if (direction === 'to' || direction === 'both') {
    let sql = "SELECT * FROM cross_references WHERE to_book = ? AND votes >= ? AND review_status = 'ok'";
    const params: unknown[] = [bookName, minVotes];

    if (verseRange) {
      sql += ' AND to_chapter >= ? AND to_chapter <= ?';
      params.push(verseRange.startChapter, verseRange.endChapter);

      if (verseRange.startChapter === verseRange.endChapter) {
        sql += ' AND to_verse_start >= ? AND to_verse_start <= ?';
        params.push(verseRange.startVerse, verseRange.endVerse);
      }
    }

    sql += ' ORDER BY votes DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    for (const r of rows) {
      results.push({ ...r as unknown as Omit<RefRow, 'direction'>, direction: 'to' });
    }
  }

  // Deduplicate (same from+to pair) and sort by votes desc
  const seen = new Set<string>();
  const deduped: RefRow[] = [];
  for (const r of results) {
    const key = `${r.from_book}:${r.from_chapter}:${r.from_verse}→${r.to_book}:${r.to_chapter}:${r.to_verse_start}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Sort by votes descending, then cap at limit
  deduped.sort((a, b) => b.votes - a.votes);
  const capped = deduped.slice(0, limit);

  // Format output
  const crossRefs = capped.map(r => {
    const toEnd = r.to_verse_end !== r.to_verse_start ? `-${r.to_verse_end}` : '';
    return {
      from_ref: `${r.from_book} ${r.from_chapter}:${r.from_verse}`,
      to_ref: `${r.to_book} ${r.to_chapter}:${r.to_verse_start}${toEnd}`,
      votes: r.votes,
      direction: r.direction,
    };
  });

  // Character limit guard
  let finalRefs = crossRefs;
  let jsonStr = JSON.stringify(crossRefs);
  if (jsonStr.length > CHARACTER_LIMIT) {
    // Truncate
    while (finalRefs.length > 1 && JSON.stringify(finalRefs).length > CHARACTER_LIMIT) {
      finalRefs = finalRefs.slice(0, Math.floor(finalRefs.length * 0.8));
    }
  }

  const avgVotes = finalRefs.length > 0
    ? Math.round(finalRefs.reduce((sum, r) => sum + r.votes, 0) / finalRefs.length)
    : undefined;

  const result = {
    book: bookName,
    range: args.range,
    cross_references: finalRefs,
    summary: {
      total: finalRefs.length,
      avg_votes: avgVotes,
    },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

// ─── BFS constants ────────────────────────────────────────────────────────────

const NODE_BUDGET = 2000;
const EDGE_BUDGET = 20000;
const RANGE_EXPLODE_CAP = 8;

const ATTRIBUTION = 'Cross-reference edges reflect the OpenBible.info editorial tradition with community vote weights; each hop is an attributed association, not an asserted theological dependence.';

// ─── StoredEdge (row shape from D1) ──────────────────────────────────────────

interface StoredEdge {
  from_book: string;
  from_chapter: number;
  from_verse: number;
  to_book: string;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number;
  votes: number;
}

type NodeKey = string; // "book|chapter|verse"

function nodeKey(book: string, chapter: number, verse: number): NodeKey {
  return `${book}|${chapter}|${verse}`;
}

function formatRef(book: string, chapter: number, verseStart: number, verseEnd?: number): string {
  const rangeEnd = verseEnd !== undefined && verseEnd !== verseStart ? `-${verseEnd}` : '';
  return `${book} ${chapter}:${verseStart}${rangeEnd}`;
}

// ─── traceCrossReferencePath ──────────────────────────────────────────────────

export async function traceCrossReferencePath(args: TraceCrossReferencePathInput): Promise<CallToolResult> {
  // 1. Resolve books
  const fromBookInfo = lookupBook(args.from_book);
  if (!fromBookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.from_book}' not found.`, suggestions: suggestBooks(args.from_book) }
      }) }],
      isError: true,
    };
  }

  const toBookInfo = lookupBook(args.to_book);
  if (!toBookInfo) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: { code: 'BOOK_NOT_FOUND', message: `Book '${args.to_book}' not found.`, suggestions: suggestBooks(args.to_book) }
      }) }],
      isError: true,
    };
  }

  // 2. Parse and validate verse ranges (must be single verses)
  const fromParsed = parseVerseRange(args.from_range);
  if ('error' in fromParsed) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: fromParsed.error } }) }],
      isError: true,
    };
  }
  if (fromParsed.startChapter !== fromParsed.endChapter || fromParsed.startVerse !== fromParsed.endVerse) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: 'Source and target must each be a single verse (e.g., "3:15"). Multi-verse ranges are not supported.' } }) }],
      isError: true,
    };
  }

  const toParsed = parseVerseRange(args.to_range);
  if ('error' in toParsed) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: toParsed.error } }) }],
      isError: true,
    };
  }
  if (toParsed.startChapter !== toParsed.endChapter || toParsed.startVerse !== toParsed.endVerse) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INVALID_RANGE', message: 'Source and target must each be a single verse (e.g., "3:15"). Multi-verse ranges are not supported.' } }) }],
      isError: true,
    };
  }

  const fromBookName = fromBookInfo.displayName;
  const toBookName = toBookInfo.displayName;
  const maxHops = Math.max(1, Math.min(6, args.max_hops ?? 4));
  const minVotes = args.min_votes ?? 1;

  const sourceKey = nodeKey(fromBookName, fromParsed.startChapter, fromParsed.startVerse);
  const targetKey = nodeKey(toBookName, toParsed.startChapter, toParsed.startVerse);
  const fromRef = formatRef(fromBookName, fromParsed.startChapter, fromParsed.startVerse);
  const toRef = formatRef(toBookName, toParsed.startChapter, toParsed.startVerse);

  // 3. Short-circuit: same source and target
  if (sourceKey === targetKey) {
    const result = {
      from_ref: fromRef,
      to_ref: toRef,
      found: true,
      truncated: false,
      hops: 0,
      max_hops: maxHops,
      path: [],
      summary: { nodes_visited: 1, edges_examined: 0, min_votes: minVotes },
      attribution: ATTRIBUTION,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  // 4. BFS traversal — complete-up-to-budget bidirectional BFS
  try {
    type ParentEntry = { edge: StoredEdge; connectingVerse: NodeKey; prev: NodeKey };

    const visited = new Set<NodeKey>([sourceKey]);
    const parents = new Map<NodeKey, ParentEntry>();
    let frontier = new Set<NodeKey>([sourceKey]);

    let truncated = false;
    let foundKey: NodeKey | null = null;
    let nodesVisited = 1; // source counts
    let edgesExamined = 0;

    outer:
    for (let hop = 0; hop < maxHops; hop++) {
      if (frontier.size === 0) break;

      // Group frontier by (book, chapter)
      const byBookChapter = new Map<string, { book: string; chapter: number; verses: number[] }>();
      for (const key of frontier) {
        const [book, chStr, vStr] = key.split('|');
        const chapter = Number(chStr);
        const verse = Number(vStr);
        const groupKey = `${book}|${chapter}`;
        const existing = byBookChapter.get(groupKey);
        if (existing) {
          existing.verses.push(verse);
        } else {
          byBookChapter.set(groupKey, { book, chapter, verses: [verse] });
        }
      }

      const nextFrontier = new Set<NodeKey>();

      for (const { book, chapter, verses } of byBookChapter.values()) {
        // ── From-side query: edges whose from endpoint is a frontier verse ──
        const fromVerseParams = verses.map(() => '?').join(', ');
        const fromSql =
          `SELECT from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes ` +
          `FROM cross_references ` +
          `WHERE from_book = ? AND from_chapter = ? AND votes >= ? AND review_status = 'ok' ` +
          `AND from_verse IN (${fromVerseParams}) ` +
          `ORDER BY votes DESC`;
        const fromParams: unknown[] = [book, chapter, minVotes, ...verses];

        const fromRows = await query(fromSql, fromParams) as unknown as StoredEdge[];
        for (const row of fromRows) {
          edgesExamined++;
          if (edgesExamined > EDGE_BUDGET) { truncated = true; break outer; }

          // Expand to-side range into per-verse nodes
          const rangeSize = row.to_verse_end - row.to_verse_start + 1;
          let versesToEnqueue: number[];
          if (rangeSize > RANGE_EXPLODE_CAP) {
            truncated = true;
            versesToEnqueue = [row.to_verse_start]; // only start verse
          } else {
            versesToEnqueue = Array.from({ length: rangeSize }, (_, i) => row.to_verse_start + i);
          }

          for (const toVerse of versesToEnqueue) {
            const neighbourKey = nodeKey(row.to_book, row.to_chapter, toVerse);
            const connectingVerse = nodeKey(row.to_book, row.to_chapter, toVerse);
            if (!visited.has(neighbourKey)) {
              visited.add(neighbourKey);
              nodesVisited++;
              if (nodesVisited > NODE_BUDGET) { truncated = true; break outer; }
              parents.set(neighbourKey, {
                edge: row,
                connectingVerse,
                prev: nodeKey(book, chapter, row.from_verse),
              });
              if (neighbourKey === targetKey || connectingVerse === targetKey) {
                foundKey = neighbourKey === targetKey ? neighbourKey : connectingVerse;
                break outer;
              }
              nextFrontier.add(neighbourKey);
            }
          }
        }

        // ── To-side query: edges whose to range contains a frontier verse ──
        const toVerseParams = verses.map(() => '?').join(', ');
        const toSql =
          `SELECT from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes ` +
          `FROM cross_references ` +
          `WHERE to_book = ? AND to_chapter = ? AND votes >= ? AND review_status = 'ok' ` +
          `AND to_verse_start IN (${toVerseParams}) ` +
          `ORDER BY votes DESC`;
        const toParams: unknown[] = [book, chapter, minVotes, ...verses];

        const toRows = await query(toSql, toParams) as unknown as StoredEdge[];
        for (const row of toRows) {
          edgesExamined++;
          if (edgesExamined > EDGE_BUDGET) { truncated = true; break outer; }

          // from endpoint is always a single verse
          const neighbourKey = nodeKey(row.from_book, row.from_chapter, row.from_verse);
          // The connecting verse is the to-side verse that's in the frontier
          // (the verse that connected the prev node to this edge)
          const connectingVerse = nodeKey(row.to_book, row.to_chapter, row.to_verse_start);
          if (!visited.has(neighbourKey)) {
            visited.add(neighbourKey);
            nodesVisited++;
            if (nodesVisited > NODE_BUDGET) { truncated = true; break outer; }
            parents.set(neighbourKey, {
              edge: row,
              connectingVerse,
              prev: nodeKey(book, chapter, verses[0]),
            });
            if (neighbourKey === targetKey) {
              foundKey = neighbourKey;
              break outer;
            }
            nextFrontier.add(neighbourKey);
          }
        }
      }

      frontier = nextFrontier;
    }

    // If the loop completed normally (without break outer) with frontier non-empty,
    // we hit the max_hops budget — mark truncated.
    if (foundKey === null && frontier.size > 0) {
      truncated = true;
    }

    // 5. Path reconstruction
    let path: Array<{ from_ref: string; to_ref: string; votes: number; connecting_ref: string }> = [];
    let found = false;
    let hops = 0;

    if (foundKey !== null) {
      found = true;
      // Walk back from target to source using parents map
      const hopChain: Array<{ edge: StoredEdge; connectingVerse: NodeKey }> = [];
      let current = foundKey;
      while (parents.has(current)) {
        const entry = parents.get(current)!;
        hopChain.unshift({ edge: entry.edge, connectingVerse: entry.connectingVerse });
        current = entry.prev;
      }
      hops = hopChain.length;

      // connecting_ref semantics: the junction vertex shared between consecutive hops.
      // For hop N (N > 0): connecting_ref = hopChain[N-1].connectingVerse (the pivot from the prior hop).
      // For hop 0: connecting_ref = hopChain[0].connectingVerse (the to endpoint, shared with hop 1).
      path = hopChain.map(({ edge, connectingVerse: _cv }, i) => {
        const junctionKey = i === 0 ? hopChain[0].connectingVerse : hopChain[i - 1].connectingVerse;
        const [jBook, jChStr, jVStr] = junctionKey.split('|');
        const connectingRef = `${jBook} ${jChStr}:${jVStr}`;
        const edgeToRef = formatRef(edge.to_book, edge.to_chapter, edge.to_verse_start,
          edge.to_verse_end !== edge.to_verse_start ? edge.to_verse_end : undefined);
        const edgeFromRef = formatRef(edge.from_book, edge.from_chapter, edge.from_verse);
        return {
          from_ref: edgeFromRef,
          to_ref: edgeToRef,
          votes: edge.votes,
          connecting_ref: connectingRef,
        };
      });
    }

    // 6. Apply CHARACTER_LIMIT guard
    const summary = { nodes_visited: nodesVisited, edges_examined: edgesExamined, min_votes: minVotes };
    let note: string | undefined;
    if (minVotes > 1) {
      note = `min_votes=${minVotes} may have excluded low-vote edges that would connect the verses in the full graph.`;
    }

    const fullResult = {
      from_ref: fromRef,
      to_ref: toRef,
      found,
      truncated,
      hops,
      max_hops: maxHops,
      path,
      summary,
      attribution: ATTRIBUTION,
      note,
    };

    const jsonStr = JSON.stringify(fullResult);
    if (jsonStr.length > CHARACTER_LIMIT) {
      // Keep path intact (adjacency must not be broken), drop cosmetic fields
      const trimmedResult = {
        from_ref: fromRef,
        to_ref: toRef,
        found,
        truncated: true,
        hops,
        max_hops: maxHops,
        path,
        summary,
        attribution: ATTRIBUTION,
        // note omitted to save budget
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(trimmedResult) }],
        structuredContent: trimmedResult,
      };
    }

    // Remove undefined note from output
    if (note === undefined) {
      const { note: _n, ...resultWithoutNote } = fullResult;
      void _n;
      return {
        content: [{ type: 'text', text: JSON.stringify(resultWithoutNote) }],
        structuredContent: resultWithoutNote,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(fullResult) }],
      structuredContent: fullResult,
    };
  } catch {
    // Mid-traversal query failure: abort, discard partials, return isError
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TRAVERSAL_ERROR', message: 'A database query failed during traversal.' } }) }],
      isError: true,
    };
  }
}
