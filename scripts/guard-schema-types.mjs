#!/usr/bin/env node
/**
 * Publish preflight for the generated Lovable Cloud database types.
 *
 * Default mode validates the generated file against the reviewed fingerprint
 * committed beside this guard. After an intentional schema migration and type
 * regeneration, review the diff and run with --write to accept the new schema.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fingerprintPath = path.resolve(scriptDir, 'schema-types.fingerprint.json');
const expected = JSON.parse(readFileSync(fingerprintPath, 'utf8'));
const typesPath = path.resolve(repoRoot, expected.file);
const raw = readFileSync(typesPath);
const source = raw.toString('utf8');
const actual = {
  algorithm: 'sha256',
  file: expected.file,
  sha256: createHash('sha256').update(raw).digest('hex'),
  bytes: raw.byteLength,
  lines: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
};

const structuralErrors = [];
if (!source.includes('export type Database = {')) structuralErrors.push('Database type export is missing');
for (const section of ['Tables:', 'Views:', 'Functions:', 'Enums:']) {
  if (!source.includes(section)) structuralErrors.push(`public schema section ${section} is missing`);
}
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(source)) structuralErrors.push('unresolved merge markers are present');
if (source.length < 1_000) structuralErrors.push('generated types file is unexpectedly small');

if (structuralErrors.length) {
  console.error('\n❌ Schema-types preflight failed: generated types are malformed.');
  for (const error of structuralErrors) console.error(`  • ${error}`);
  console.error(`  file: ${expected.file}\n`);
  process.exit(1);
}

if (process.argv.includes('--write')) {
  writeFileSync(fingerprintPath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`[schema-types] accepted ${actual.file} sha256=${actual.sha256} (${actual.lines} lines, ${actual.bytes} bytes)`);
  process.exit(0);
}

const differences = ['algorithm', 'file', 'sha256', 'bytes', 'lines']
  .filter((key) => actual[key] !== expected[key]);

if (differences.length) {
  console.error('\n❌ Schema-types preflight BLOCKED publish.');
  console.error('The regenerated database types differ from the reviewed schema fingerprint.');
  for (const key of differences) console.error(`  • ${key}: expected=${expected[key]} actual=${actual[key]}`);
  console.error('\nIf this follows an intentional migration: review the types diff, then run');
  console.error('  npm run schema:accept-types');
  console.error('and commit the updated fingerprint before publishing.\n');
  process.exit(1);
}

console.log(`[schema-types] verified ${actual.file} sha256=${actual.sha256} (${actual.lines} lines, ${actual.bytes} bytes)`);