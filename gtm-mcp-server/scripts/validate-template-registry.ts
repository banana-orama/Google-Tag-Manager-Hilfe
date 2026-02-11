#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const REGISTRY_PATH = path.resolve(process.cwd(), 'config/template-registry.json');

const CONTAINER_CONTEXTS = new Set(['WEB', 'SERVER', 'AMP', 'IOS', 'ANDROID', 'UNKNOWN']);
const ENTITY_KINDS = new Set(['tag', 'variable', 'client', 'transformation', 'unknown']);
const STATUSES = new Set(['verified', 'candidate', 'broken', 'unknown']);

function fail(message: string): never {
  throw new Error(message);
}

function validateEntry(entry: any, index: number): void {
  const prefix = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') fail(`${prefix} must be an object`);
  if (!entry.owner || typeof entry.owner !== 'string') fail(`${prefix}.owner must be a non-empty string`);
  if (!entry.repository || typeof entry.repository !== 'string') fail(`${prefix}.repository must be a non-empty string`);
  if (!CONTAINER_CONTEXTS.has(entry.containerContext)) fail(`${prefix}.containerContext invalid`);
  if (!ENTITY_KINDS.has(entry.entityKind)) fail(`${prefix}.entityKind invalid`);
  if (!Array.isArray(entry.requiredParameters)) fail(`${prefix}.requiredParameters must be an array`);
  if (!Array.isArray(entry.optionalParameters)) fail(`${prefix}.optionalParameters must be an array`);
  if (!entry.defaults || typeof entry.defaults !== 'object' || Array.isArray(entry.defaults)) {
    fail(`${prefix}.defaults must be an object`);
  }
  if (!entry.examplePayload || typeof entry.examplePayload !== 'object' || Array.isArray(entry.examplePayload)) {
    fail(`${prefix}.examplePayload must be an object`);
  }
  if (!STATUSES.has(entry.status)) fail(`${prefix}.status invalid`);
  if (typeof entry.lastVerifiedAt !== 'string') fail(`${prefix}.lastVerifiedAt must be a string`);
  if (typeof entry.verificationNote !== 'string') fail(`${prefix}.verificationNote must be a string`);
}

async function main() {
  const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
  const doc = JSON.parse(raw);
  if (!doc || typeof doc !== 'object') fail('Registry root must be an object');
  if (typeof doc.version !== 'number') fail('version must be a number');
  if (typeof doc.updatedAt !== 'string') fail('updatedAt must be a string');
  if (!Array.isArray(doc.entries)) fail('entries must be an array');
  doc.entries.forEach((entry: any, index: number) => validateEntry(entry, index));
  console.log(`Template registry is valid: ${doc.entries.length} entries`);
}

main().catch((error) => {
  console.error(`Template registry validation failed: ${(error as Error).message}`);
  process.exit(1);
});
