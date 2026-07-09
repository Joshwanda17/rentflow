#!/usr/bin/env node
/**
 * CI guard — fails the build if any shipping file still references the legacy
 * domains `welilereceipts.com` or the misspelled `welilereciept.com`.
 *
 * The canonical, public-facing domain is welileapp.com. No link, canonical
 * URL, og:url, sitemap entry, email link, or receipt URL may point at the old
 * domains — old links break SEO and land users on a parked page.
 *
 * The ONLY allowed occurrences are lines explicitly marked with the comment
 * `legacy-domain-guard-allow` (e.g. the index.html host-redirect guard, which
 * must name the legacy hosts in order to redirect them away).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const REPO_ROOT = new URL('../', import.meta.url).pathname;

// Only scan files that actually ship or produce public URLs.
const SCAN_TARGETS = [
  'src',
  'public',
  'supabase/functions',
  'index.html',
];

const SCANNABLE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.htm', '.xml', '.txt', '.json', '.css', '.webmanifest',
]);

// Matches the legacy hostnames (with optional www.), NOT welileapp.com.
// Also catches the lovable staging subdomain `welilereceipts-com.lovable.app`.
const LEGACY_RE = /\b(?:www\.)?welilereceipts?\.com\b|welilereceipts-com\.lovable\.app/i;
const ALLOW_MARKER = 'legacy-domain-guard-allow';

// Files whose entire purpose is to reference the legacy domain (redirect
// monitors, change-of-address tooling, and the legacy-domain sitemap that is
// submitted to Search Console so old URLs get a proper 301 to welileapp.com).
const ALLOW_FILES = new Set([
  'public/sitemap-welilereceipts.xml',
  'supabase/functions/change-of-address-monitor/index.ts',
  'supabase/functions/redirect-health-monitor/index.ts',
  'supabase/functions/verify-redirects/index.ts',
  'supabase/functions/seo-redirect-audit/index.ts',
  'supabase/functions/sitemap-resubmit/index.ts',
  'supabase/functions/seo-index-monitor/index.ts',
  'supabase/functions/seo-coverage-dashboard/index.ts',
]);

function* walk(target) {
  const st = statSync(target);
  if (st.isFile()) { yield target; return; }
  for (const entry of readdirSync(target)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(target, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (SCANNABLE_EXT.has(extname(entry))) yield full;
  }
}

const violations = [];

for (const rel of SCAN_TARGETS) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    if (ALLOW_FILES.has(relative(REPO_ROOT, file))) continue;
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, idx) => {
      if (!LEGACY_RE.test(line)) return;
      if (line.includes(ALLOW_MARKER)) return;
      violations.push({
        file: relative(REPO_ROOT, file),
        line: idx + 1,
        code: line.trim().slice(0, 200),
      });
    });
  }
}

if (violations.length > 0) {
  console.error('\n❌ Legacy-domain guard failed.\n');
  console.error('Shipping code must reference welileapp.com — never welilereceipts.com /');
  console.error('welilereciept.com / welilereceipts-com.lovable.app.\n');
  console.error('Fix the URL, or if the reference is intentional (e.g. a redirect');
  console.error(`guard), append the comment "${ALLOW_MARKER}" to that line.\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`     ${v.code}`);
  }
  console.error(`\n${violations.length} violation(s). Build aborted.\n`);
  process.exit(1);
}

console.log('✅ Legacy-domain guard passed — no welilereceipts.com references in shipping code.');
