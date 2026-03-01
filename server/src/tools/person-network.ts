import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { ENTITY_ATTRIBUTION } from './utils.js';

const CHARACTER_LIMIT = 25_000;
const HIGH_FREQUENCY_THRESHOLD = 500;
const CO_APPEARANCE_LIMIT = 200;

export const PersonNetworkInputSchema = {
  person: z.string().describe('Person slug (e.g., "abraham_2") or name (e.g., "Abraham"). Slug is preferred for disambiguation.'),
  depth: z.number().min(1).max(3).optional().describe('Network depth: 1 = immediate family + co-appearances (default), 2-3 = expand network iteratively.'),
};

export type PersonNetworkInput = z.output<z.ZodObject<typeof PersonNetworkInputSchema>>;

export const PersonNetworkOutputSchema = {
  person: z.object({
    name: z.string(),
    slug: z.string(),
    display_title: z.string().optional(),
    gender: z.string().optional(),
    appearance_count: z.number(),
  }),
  relationships: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    relationship_type: z.string(),
  })),
  co_appearances: z.array(z.object({
    name: z.string(),
    slug: z.string(),
    shared_verses: z.number(),
  })).optional(),
  depth: z.number(),
  attribution: z.string(),
};

interface PersonRow {
  id: number;
  name: string;
  slug: string;
  display_title: string | null;
  gender: string | null;
  appearance_count: number;
}

async function resolvePerson(input: string): Promise<PersonRow | CallToolResult> {
  // 1. Exact slug match
  const bySlug = await query(
    'SELECT id, name, slug, display_title, gender, appearance_count FROM people WHERE slug = ?',
    [input]
  );
  if (bySlug.length === 1) return bySlug[0] as unknown as PersonRow;

  // 2. Exact name match (case-insensitive)
  const byName = await query(
    'SELECT id, name, slug, display_title, gender, appearance_count FROM people WHERE LOWER(name) = LOWER(?)',
    [input]
  );

  if (byName.length === 1) return byName[0] as unknown as PersonRow;

  // 3. Multiple matches → AMBIGUOUS_PERSON
  if (byName.length > 1) {
    const matches = byName.map(r => ({
      slug: r.slug as string,
      display_title: (r.display_title || r.name) as string,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: {
          code: 'AMBIGUOUS_PERSON',
          message: `${byName.length} people match '${input}'`,
          matches,
        }
      }) }],
      isError: true,
    };
  }

  // 4. No match → fuzzy suggestions
  const fuzzy = await query(
    `SELECT slug, display_title, name FROM people
     WHERE name LIKE ? OR slug LIKE ? OR aliases LIKE ?
     LIMIT 5`,
    [`%${input}%`, `%${input}%`, `%${input}%`]
  );

  const suggestions = fuzzy.map(r =>
    `${r.slug} (${r.display_title || r.name})`
  );

  return {
    content: [{ type: 'text', text: JSON.stringify({
      error: {
        code: 'PERSON_NOT_FOUND',
        message: `No person found for '${input}'`,
        suggestions,
      }
    }) }],
    isError: true,
  };
}

export async function queryPersonNetwork(args: PersonNetworkInput): Promise<CallToolResult> {
  const depth = args.depth ?? 1;

  const resolved = await resolvePerson(args.person);

  // If resolvePerson returned an error CallToolResult, return it directly
  if ('content' in resolved) return resolved;

  const person = resolved;

  // Get family relationships
  const relationshipsSql = `
    SELECT p.name, p.slug, pr.relationship_type
    FROM person_relationships pr
    JOIN people p ON p.id = pr.related_person_id
    WHERE pr.person_id = ?
    ORDER BY pr.relationship_type, p.name
  `;
  const relationshipsRows = await query(relationshipsSql, [person.id]);

  const relationships = relationshipsRows.map(r => ({
    name: r.name as string,
    slug: r.slug as string,
    relationship_type: r.relationship_type as string,
  }));

  // Co-appearances (skip for high-frequency entities)
  let coAppearances: { name: string; slug: string; shared_verses: number }[] | undefined;
  let highFrequencyNote: string | undefined;

  if (person.appearance_count <= HIGH_FREQUENCY_THRESHOLD) {
    const coAppSql = `
      SELECT p.name, p.slug, COUNT(*) as shared_verses
      FROM verse_people vp1
      JOIN verse_people vp2 ON vp1.book = vp2.book AND vp1.chapter = vp2.chapter AND vp1.verse = vp2.verse
      JOIN people p ON p.id = vp2.person_id
      WHERE vp1.person_id = ? AND vp2.person_id != ?
      GROUP BY vp2.person_id
      ORDER BY shared_verses DESC
      LIMIT ?
    `;
    const coAppRows = await query(coAppSql, [person.id, person.id, CO_APPEARANCE_LIMIT]);

    coAppearances = coAppRows.slice(0, 30).map(r => ({
      name: r.name as string,
      slug: r.slug as string,
      shared_verses: r.shared_verses as number,
    }));
  } else {
    highFrequencyNote = `Appears in ${person.appearance_count} verses — co-appearance analysis omitted for performance.`;
  }

  // Depth 2-3: expand network iteratively
  let expandedNetwork: Record<string, unknown>[] | undefined;
  if (depth >= 2) {
    const relatedSlugs = relationships.map(r => r.slug);
    const expansionResults: Record<string, unknown>[] = [];

    for (const slug of relatedSlugs.slice(0, 10)) { // cap at 10 related people per depth
      const relPerson = await resolvePerson(slug);
      if ('content' in relPerson) continue;

      const relRels = await query(
        `SELECT p.name, p.slug, pr.relationship_type
         FROM person_relationships pr
         JOIN people p ON p.id = pr.related_person_id
         WHERE pr.person_id = ? AND pr.related_person_id != ?
         ORDER BY pr.relationship_type, p.name`,
        [relPerson.id, person.id]
      );

      expansionResults.push({
        person: { name: relPerson.name, slug: relPerson.slug },
        relationships: relRels.map(r => ({
          name: r.name as string,
          slug: r.slug as string,
          relationship_type: r.relationship_type as string,
        })),
      });
    }

    if (depth >= 3 && expansionResults.length > 0) {
      // One more level of expansion
      for (const entry of expansionResults.slice(0, 5)) {
        const rels = entry.relationships as { slug: string }[];
        for (const rel of rels.slice(0, 5)) {
          const d3Person = await resolvePerson(rel.slug);
          if ('content' in d3Person) continue;

          const d3Rels = await query(
            `SELECT p.name, p.slug, pr.relationship_type
             FROM person_relationships pr
             JOIN people p ON p.id = pr.related_person_id
             WHERE pr.person_id = ?
             ORDER BY pr.relationship_type, p.name
             LIMIT 10`,
            [d3Person.id]
          );

          expansionResults.push({
            person: { name: d3Person.name, slug: d3Person.slug },
            relationships: d3Rels.map(r => ({
              name: r.name as string,
              slug: r.slug as string,
              relationship_type: r.relationship_type as string,
            })),
            depth_level: 3,
          });
        }
      }
    }

    expandedNetwork = expansionResults;
  }

  // Build response
  const result: Record<string, unknown> = {
    person: {
      name: person.name,
      slug: person.slug,
      display_title: person.display_title || person.name,
      gender: person.gender,
      appearance_count: person.appearance_count,
    },
    relationships,
    co_appearances: coAppearances,
    depth,
    attribution: ENTITY_ATTRIBUTION,
  };

  if (highFrequencyNote) {
    result.high_frequency_note = highFrequencyNote;
  }

  if (expandedNetwork && expandedNetwork.length > 0) {
    result.expanded_network = expandedNetwork;
  }

  // Character limit guard
  const jsonStr = JSON.stringify(result);
  if (jsonStr.length > CHARACTER_LIMIT) {
    // Trim co-appearances and expanded network
    if (coAppearances && coAppearances.length > 10) {
      result.co_appearances = coAppearances.slice(0, 10);
    }
    if (expandedNetwork) {
      result.expanded_network = expandedNetwork.slice(0, 5);
    }
    result.truncated = true;

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }

  return {
    content: [{ type: 'text', text: jsonStr }],
    structuredContent: result,
  };
}
