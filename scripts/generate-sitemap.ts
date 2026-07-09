// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
// Includes static marketing routes AND one entry per live, photographed house listing
// so individual /house/:id pages are discoverable by Google.

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'https://welileapp.com';

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: string;
}

// Static, indexable marketing/public routes.
const staticEntries: SitemapEntry[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/welcome', changefreq: 'weekly', priority: '0.95' },
  { path: '/find-a-house', changefreq: 'daily', priority: '0.95' },
  { path: '/rent-money', changefreq: 'weekly', priority: '0.9' },
  { path: '/become-supporter', changefreq: 'weekly', priority: '0.8' },
  { path: '/funder-onboarding', changefreq: 'weekly', priority: '0.8' },
  { path: '/partner-onboarding', changefreq: 'weekly', priority: '0.7' },
  { path: '/opportunities', changefreq: 'weekly', priority: '0.7' },
  { path: '/internship', changefreq: 'monthly', priority: '0.6' },
  { path: '/careers', changefreq: 'weekly', priority: '0.6' },
  { path: '/landlord-signup', changefreq: 'weekly', priority: '0.7' },
  { path: '/rent-calculator', changefreq: 'monthly', priority: '0.7' },
  { path: '/guides/pay-rent-in-installments-uganda', changefreq: 'monthly', priority: '0.7' },
  { path: '/ai', changefreq: 'weekly', priority: '0.7' },
  { path: '/terms', changefreq: 'monthly', priority: '0.3' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
  { path: '/auth', changefreq: 'monthly', priority: '0.4' },
  { path: '/onboarding', changefreq: 'monthly', priority: '0.4' },
  { path: '/unsubscribe', changefreq: 'yearly', priority: '0.2' },
  { path: '/stop-sms', changefreq: 'yearly', priority: '0.2' },
  { path: '/resume-sms', changefreq: 'yearly', priority: '0.2' },
];

/** Minimal .env reader so the standalone script picks up Supabase creds. */
function readEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string),
  );
}

async function fetchLiveHouses(): Promise<SitemapEntry[]> {
  const url = readEnv('VITE_SUPABASE_URL');
  const key = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) {
    console.warn('sitemap: Supabase env missing — skipping house listings');
    return [];
  }
  // Same public-visibility filters as PublicHousesPreview: available, not hidden,
  // not yet tenanted, has photos. Select id, short_code, updated_at.
  const endpoint =
    `${url}/rest/v1/house_listings` +
    `?select=id,short_code,updated_at,image_urls` +
    `&status=eq.available&is_hidden=eq.false&tenant_id=is.null` +
    `&image_urls=not.is.null&order=updated_at.desc&limit=5000`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn(`sitemap: house fetch failed (${res.status}) — skipping`);
      return [];
    }
    const rows = (await res.json()) as Array<{
      id: string;
      short_code: string | null;
      updated_at: string | null;
      image_urls: string[] | null;
    }>;
    return rows
      .filter((r) => Array.isArray(r.image_urls) && r.image_urls.some((u) => typeof u === 'string' && u.trim().length > 0))
      .map((r) => ({
        path: `/house/${r.short_code || r.id}`,
        lastmod: r.updated_at ? r.updated_at.slice(0, 10) : undefined,
        changefreq: 'weekly' as const,
        priority: '0.8',
      }));
  } catch (err) {
    console.warn('sitemap: house fetch error — skipping', err);
    return [];
  }
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      '  <url>',
      `    <loc>${BASE_URL}${xmlEscape(e.path)}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

async function main() {
  const houses = await fetchLiveHouses();
  const entries = [...staticEntries, ...houses];
  writeFileSync(resolve('public/sitemap.xml'), generateSitemap(entries));
  console.log(`sitemap.xml written (${entries.length} entries, ${houses.length} houses)`);
}

main();
