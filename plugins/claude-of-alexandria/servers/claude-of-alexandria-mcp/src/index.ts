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
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: derived from book)' },
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
        testament: { type: 'string', enum: ['nt', 'ot'], description: 'Testament (default: derived from book)' },
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
        return { content: [{ type: 'text', text: JSON.stringify(await queryDiscourseFeatures(args as Record<string, unknown>)) }] };
      case 'query_paragraph_breaks':
        return { content: [{ type: 'text', text: JSON.stringify(await queryParagraphBreaks(args as Record<string, unknown>)) }] };
      case 'query_vocabulary':
        return { content: [{ type: 'text', text: JSON.stringify(await queryVocabulary(args as Record<string, unknown>)) }] };
      case 'query_morphology':
        return { content: [{ type: 'text', text: JSON.stringify(await queryMorphology(args as Record<string, unknown>)) }] };
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
}

main().catch(e => { console.error(e); process.exit(1); });
