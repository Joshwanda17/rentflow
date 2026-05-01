#!/usr/bin/env node
/**
 * CI guard — fails the build if any file under src/ writes
 * `deposit_purpose: <expr>` into a `deposit_requests` payload without
 * routing the value through `safeDepositPurpose(...)` from
 * `@/lib/depositPurposeGuard`.
 *
 * Background: an empty string for the Postgres `deposit_purpose` enum
 * raises `invalid input value for enum deposit_purpose: ""` and leaves
 * the user staring at a dead Confirm button. Centralising the coercion
 * through `safeDepositPurpose()` makes that failure mode structurally
 * impossible — this script enforces that.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;

// Files that legitimately reference deposit_purpose without writing it
// (read paths, type definitions, the guard itself).
const ALLOWLIST_FILES = new Set([
  'lib/depositPurposeGuard.ts',
  'integrations/supabase/types.ts',
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST_FILES.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  if (!src.includes('deposit_purpose')) continue;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match `deposit_purpose:` assignments (object property in an insert/update payload)
    const m = line.match(/^\s*deposit_purpose\s*:\s*(.+?),?\s*$/);
    if (!m) continue;
    const value = m[1];
    // Allowed: explicit call to safeDepositPurpose(...)
    if (/safeDepositPurpose\s*\(/.test(value)) continue;
    // Allowed: type-only context (e.g. inside an interface or `as { ... }`)
    // Detect by looking at the surrounding line — TS type members usually
    // end with `;` or use `?` markers, e.g. `deposit_purpose?: string;`.
    if (/[?:]\s*[A-Za-z_<][\w<>\[\]| ]*\s*;?\s*$/.test(line) && !line.includes(',')) continue;

    violations.push(`${rel}:${i + 1}  ${line.trim()}`);
  }
}

if (violations.length > 0) {
  console.error('\n❌ guard-deposit-purpose: forbidden direct deposit_purpose assignment(s):');
  for (const v of violations) console.error('  ' + v);
  console.error('\nRoute every value through safeDepositPurpose() from @/lib/depositPurposeGuard.');
  process.exit(1);
}

console.log('✓ guard-deposit-purpose: all deposit_purpose writes go through safeDepositPurpose()');