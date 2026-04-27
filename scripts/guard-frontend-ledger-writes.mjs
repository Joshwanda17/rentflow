#!/usr/bin/env node
/**
 * CI guard — fails the build if any file under src/ contains a direct
 * mutation against the wallets or general_ledger tables.
 *
 * The frontend is intentionally locked out of all financial state changes.
 * Every money movement MUST go through a backend edge function which calls
 * the canonical create_ledger_transaction / apply_wallet_movement RPCs.
 *
 * Two zero-balance bootstrap inserts are the only allowed exceptions —
 * they create an empty wallet row (balance: 0) for a brand-new user and
 * cannot create drift.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;

// Patterns that are forbidden anywhere in src/.
const FORBIDDEN = [
  { re: /\.from\(\s*['"]wallets['"]\s*\)\s*\.update\s*\(/, label: "wallets.update(" },
  { re: /\.from\(\s*['"]wallets['"]\s*\)\s*\.upsert\s*\(/, label: "wallets.upsert(" },
  { re: /\.from\(\s*['"]wallets['"]\s*\)\s*\.delete\s*\(/, label: "wallets.delete(" },
  { re: /\.from\(\s*['"]general_ledger['"]\s*\)\s*\.insert\s*\(/, label: "general_ledger.insert(" },
  { re: /\.from\(\s*['"]general_ledger['"]\s*\)\s*\.update\s*\(/, label: "general_ledger.update(" },
  { re: /\.from\(\s*['"]general_ledger['"]\s*\)\s*\.delete\s*\(/, label: "general_ledger.delete(" },
  // Frontend MUST NOT do balance arithmetic — backend is the only authority.
  // Catches:  wallet.balance - amount,  w.withdrawable_balance += x,  etc.
  { re: /\bwallet\??\.(balance|withdrawable_balance|float_balance|advance_balance)\s*[-+]\s*\w/, label: "client-side wallet arithmetic" },
  // Common drift-prone helpers — must live in backend, not frontend.
  { re: /\brouteToFloat\s*\(/, label: "routeToFloat(" },
  { re: /\bvalidateBalance\s*\(/, label: "validateBalance(" },
];

// Allowlist: file path → reason. Bootstrapping a wallet row with balance 0 is
// inert — it cannot create drift. Both call sites guard against re-creation.
const ALLOWED_INSERTS = new Map([
  ['hooks/useWallet.ts', 'Bootstrap empty wallet row (balance: 0) on first load'],
  ['components/manager/AddBalanceDialog.tsx', 'Bootstrap empty wallet row (balance: 0) before deposit flow'],
]);

const WALLETS_INSERT_RE = /\.from\(\s*['"]wallets['"]\s*\)\s*\.insert\s*\(/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, idx) => {
    for (const { re, label } of FORBIDDEN) {
      if (re.test(line)) {
        violations.push({ file: rel, line: idx + 1, label, code: line.trim() });
      }
    }
    if (WALLETS_INSERT_RE.test(line) && !ALLOWED_INSERTS.has(rel)) {
      violations.push({
        file: rel, line: idx + 1, label: "wallets.insert(",
        code: line.trim(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error('\n❌ Frontend ledger-write guard failed.\n');
  console.error('The frontend MUST NEVER mutate wallets or general_ledger directly.');
  console.error('Every money movement must go through a backend edge function.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  → ${v.label}`);
    console.error(`     ${v.code}`);
  }
  console.error(`\n${violations.length} violation(s). Build aborted.\n`);
  process.exit(1);
}

console.log('✅ Frontend ledger-write guard passed — no direct wallet/ledger mutations found.');