#!/usr/bin/env npx tsx
/**
 * Generate root NOTICE and server/NOTICE.md from the provenance registry.
 *
 * Usage:
 *   npx tsx scripts/generate-notices.ts          # write files
 *   npx tsx scripts/generate-notices.ts --check  # exit 1 if files differ
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRootNotice, generateServerNoticeMarkdown } from '../src/provenance/notice.js';
import { assertRegistryIntegrity } from '../src/provenance/resolve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const rootNoticePath = join(repoRoot, 'NOTICE');
const serverNoticePath = join(repoRoot, 'server', 'NOTICE.md');

assertRegistryIntegrity();

const rootNotice = generateRootNotice();
const serverNotice = generateServerNoticeMarkdown();
const check = process.argv.includes('--check');

function compareOrWrite(path: string, expected: string): boolean {
  if (check) {
    let actual = '';
    try {
      actual = readFileSync(path, 'utf8');
    } catch {
      console.error(`Missing ${path}`);
      return false;
    }
    if (actual !== expected) {
      console.error(`Out of date: ${path}`);
      return false;
    }
    console.log(`OK ${path}`);
    return true;
  }
  writeFileSync(path, expected);
  console.log(`Wrote ${path}`);
  return true;
}

const okRoot = compareOrWrite(rootNoticePath, rootNotice);
const okServer = compareOrWrite(serverNoticePath, serverNotice);
if (!okRoot || !okServer) process.exit(1);
