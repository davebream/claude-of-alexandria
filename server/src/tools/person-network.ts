import { z } from 'zod';
import { ProvenanceSchema } from '../provenance/types.js';
import { PageSchema, PaginationInputShape } from './contract.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/query.js';
import { ENTITY_ATTRIBUTION } from './utils.js';

const HIGH_FREQUENCY_THRESHOLD = 500;

export const PersonNetworkInputSchema = z.strictObject({
  ...PaginationInputShape,
  person: z.string().describe('Person slug (e.g., "abraham_2") or name (e.g., "Abraham"). Slug is preferred for disambiguation.'),
  depth: z.number().int().min(1).max(3).default(1).describe('Network depth: 1 = immediate family + co-appearances (default), 2-3 = expand network iteratively.'),
});

export type PersonNetworkInput = z.output<typeof PersonNetworkInputSchema>;

export const PersonNetworkOutputSchema = z.strictObject({
  provenance: ProvenanceSchema,
  page: PageSchema,
  person: z.strictObject({
    name: z.string(),
    slug: z.string(),
    display_title: z.string().optional(),
    gender: z.string().nullable().optional(),
    appearance_count: z.number(),
  }),
  connections: z.array(z.discriminatedUnion('connection_type', [
    z.strictObject({
      connection_type: z.literal('relationship'),
      name: z.string(),
      slug: z.string(),
      relationship_type: z.string(),
      depth_level: z.literal(1),
    }),
    z.strictObject({
      connection_type: z.literal('co_appearance'),
      name: z.string(),
      slug: z.string(),
      shared_verses: z.number().int().nonnegative(),
      depth_level: z.literal(1),
    }),
    z.strictObject({
      connection_type: z.literal('expanded_relationship'),
      source_name: z.string(),
      source_slug: z.string(),
      name: z.string(),
      slug: z.string(),
      relationship_type: z.string(),
      depth_level: z.union([z.literal(2), z.literal(3)]),
    }),
  ])),
  depth: z.number().int().min(1).max(3),
  high_frequency_note: z.string().optional(),
  attribution: z.string(),
});

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
    ORDER BY pr.relationship_type, p.name, p.slug
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
      ORDER BY shared_verses DESC, p.slug
    `;
    const coAppRows = await query(coAppSql, [person.id, person.id]);

    coAppearances = coAppRows.map(r => ({
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

    for (const slug of relatedSlugs) {
      const relPerson = await resolvePerson(slug);
      if ('content' in relPerson) continue;

      const relRels = await query(
        `SELECT p.name, p.slug, pr.relationship_type
         FROM person_relationships pr
         JOIN people p ON p.id = pr.related_person_id
         WHERE pr.person_id = ? AND pr.related_person_id != ?
         ORDER BY pr.relationship_type, p.name, p.slug`,
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
      for (const entry of [...expansionResults]) {
        const rels = entry.relationships as { slug: string }[];
        for (const rel of rels) {
          const d3Person = await resolvePerson(rel.slug);
          if ('content' in d3Person) continue;

          const d3Rels = await query(
            `SELECT p.name, p.slug, pr.relationship_type
             FROM person_relationships pr
             JOIN people p ON p.id = pr.related_person_id
             WHERE pr.person_id = ?
             ORDER BY pr.relationship_type, p.name, p.slug`,
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

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
