#!/usr/bin/env node
/**
 * Build-time prerendering for /house/:slug pages.
 *
 * Why:
 *   WhatsApp / Facebook / LinkedIn / Slack link scrapers do NOT execute JS,
 *   so they never see the react-helmet tags injected by HouseDetail.tsx —
 *   they only see the static <head> in dist/index.html. Without per-listing
 *   OG tags, every shared listing shows the same generic Welile preview.
 *
 * How:
 *   After `vite build`, fetch every currently-published, photographed house
 *   listing from Supabase (same filter as the sitemap generator), then for
 *   each listing write dist/house/<slug>/index.html — a copy of the built
 *   dist/index.html with the sitewide OG / twitter / canonical tags stripped
 *   and replaced by listing-specific ones plus JSON-LD (Accommodation +
 *   BreadcrumbList). We write one file per short_code AND per uuid so both
 *   URL shapes resolve directly to a prerendered shell.
 *
 *   The SPA still boots normally inside these files — users get the full
 *   React experience, scrapers get real per-listing metadata on first byte.
 *
 * Mirrors the head produced by src/pages/HouseDetail.tsx (SEO block ~L365-390).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const BASE_URL = 'https://welileapp.com';
const DIST = resolve('dist');
const TEMPLATE_PATH = resolve(DIST, 'index.html');

const CATEGORY_LABELS = {
  single_room: 'Single Room',
  double_room: 'Double Room',
  bedsitter: 'Bedsitter',
  one_bedroom: '1 Bedroom',
  two_bedroom: '2 Bedrooms',
  three_bedroom: '3 Bedrooms',
  studio: 'Studio',
  shop: 'Shop',
};

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return undefined;
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

function formatUGX(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'UGX 0';
  return `UGX ${Math.round(v).toLocaleString('en-US')}`;
}

function htmlEscape(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

async function fetchLiveHouses() {
  const url = readEnv('VITE_SUPABASE_URL');
  const key = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) {
    console.warn('prerender-houses: Supabase env missing — skipping');
    return [];
  }
  // Same public-visibility filters as the sitemap and PublicHousesPreview.
  const cols =
    'id,short_code,title,region,district,address,house_category,number_of_rooms,daily_rate,' +
    'image_urls,latitude,longitude,has_water,has_electricity,has_security,has_parking,is_furnished,updated_at';
  const endpoint =
    `${url}/rest/v1/house_listings?select=${cols}` +
    `&status=eq.available&is_hidden=eq.false&tenant_id=is.null` +
    `&image_urls=not.is.null&order=updated_at.desc&limit=5000`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.warn(`prerender-houses: fetch failed (${res.status}) — skipping`);
    return [];
  }
  const rows = await res.json();
  return rows.filter(
    (r) => Array.isArray(r.image_urls) && r.image_urls.some((u) => typeof u === 'string' && u.trim().length > 0),
  );
}

function buildHead(listing) {
  const slug = listing.short_code || listing.id;
  const shareUrl = `${BASE_URL}/house/${slug}`;
  const ogLocation = [listing.region, listing.district].filter(Boolean).join(', ');
  const roomWord = listing.number_of_rooms === 1 ? 'room' : 'rooms';
  const catLabel = CATEGORY_LABELS[listing.house_category] || String(listing.house_category || '').replace(/_/g, ' ');
  const ogTitle = `${listing.title} in ${listing.region} — ${formatUGX(listing.daily_rate)}/day | Welile`;
  const ogDescription =
    `${listing.title} — ${catLabel}, ${listing.number_of_rooms} ${roomWord} in ${ogLocation}. ` +
    `${formatUGX(listing.daily_rate)}/day. Pay as you stay with Welile!`;
  const ogImage = listing.image_urls?.[0] || `${BASE_URL}/og-image.png`;

  const amenityFeature = [
    listing.has_water && { '@type': 'LocationFeatureSpecification', name: 'Running Water', value: true },
    listing.has_electricity && { '@type': 'LocationFeatureSpecification', name: 'Electricity', value: true },
    listing.has_security && { '@type': 'LocationFeatureSpecification', name: 'Security', value: true },
    listing.has_parking && { '@type': 'LocationFeatureSpecification', name: 'Parking', value: true },
    listing.is_furnished && { '@type': 'LocationFeatureSpecification', name: 'Furnished', value: true },
  ].filter(Boolean);

  const houseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: listing.title,
    description: ogDescription,
    url: shareUrl,
    numberOfRooms: listing.number_of_rooms,
    ...(listing.image_urls?.length ? { image: listing.image_urls } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: listing.region,
      addressRegion: listing.district || listing.region,
      addressCountry: 'UG',
      streetAddress: listing.address,
    },
    ...(listing.latitude && listing.longitude
      ? { geo: { '@type': 'GeoCoordinates', latitude: listing.latitude, longitude: listing.longitude } }
      : {}),
    amenityFeature,
    offers: {
      '@type': 'Offer',
      price: listing.daily_rate,
      priceCurrency: 'UGX',
      availability: 'https://schema.org/InStock',
      priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      url: shareUrl,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Find a House', item: `${BASE_URL}/find-a-house` },
      { '@type': 'ListItem', position: 2, name: listing.title, item: shareUrl },
    ],
  };

  // Safe embedding in <script type="application/ld+json"> — escape closing tags.
  const jsonLdSafe = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

  return [
    `<title>${htmlEscape(ogTitle)}</title>`,
    `<meta name="description" content="${htmlEscape(ogDescription)}" />`,
    `<link rel="canonical" href="${htmlEscape(shareUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${htmlEscape(shareUrl)}" />`,
    `<meta property="og:title" content="${htmlEscape(ogTitle)}" />`,
    `<meta property="og:description" content="${htmlEscape(ogDescription)}" />`,
    `<meta property="og:image" content="${htmlEscape(ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:site_name" content="Welile" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(ogTitle)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(ogDescription)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(ogImage)}" />`,
    `<script type="application/ld+json">${jsonLdSafe(houseJsonLd)}</script>`,
    `<script type="application/ld+json">${jsonLdSafe(breadcrumbJsonLd)}</script>`,
  ].join('\n    ');
}

/**
 * Strip the sitewide tags that per-listing tags will override. Non-JS scrapers
 * read the FIRST occurrence for OG properties, so if we leave the sitewide
 * og:title behind, previews would still be generic — remove them cleanly.
 */
function stripSitewideMeta(html) {
  const REMOVE_PATTERNS = [
    /<title>[^<]*<\/title>\s*/i,
    /<meta\s+name="description"[^>]*>\s*/i,
    /<meta\s+property="og:title"[^>]*>\s*/i,
    /<meta\s+property="og:description"[^>]*>\s*/i,
    /<meta\s+property="og:type"[^>]*>\s*/i,
    /<meta\s+property="og:image"[^>]*>\s*/i,
    /<meta\s+property="og:image:width"[^>]*>\s*/i,
    /<meta\s+property="og:image:height"[^>]*>\s*/i,
    /<meta\s+property="og:url"[^>]*>\s*/i,
    /<link\s+rel="canonical"[^>]*>\s*/i,
  ];
  let out = html;
  for (const re of REMOVE_PATTERNS) out = out.replace(re, '');
  return out;
}

function renderListingHtml(template, listing) {
  const stripped = stripSitewideMeta(template);
  const headBlock = buildHead(listing);
  // Inject right before </head> so all base tags load first.
  return stripped.replace(/<\/head>/i, `    ${headBlock}\n  </head>`);
}

function writeShell(slug, html) {
  const dir = resolve(DIST, 'house', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), html);
}

async function main() {
  if (!existsSync(TEMPLATE_PATH)) {
    console.warn(`prerender-houses: ${TEMPLATE_PATH} missing — skip (build not complete?)`);
    return;
  }
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const listings = await fetchLiveHouses();
  if (!listings.length) {
    console.log('prerender-houses: no listings to prerender');
    return;
  }
  let files = 0;
  for (const listing of listings) {
    const html = renderListingHtml(template, listing);
    // Write per short_code AND per uuid so both URL shapes hit a prerendered shell.
    if (listing.short_code) {
      writeShell(listing.short_code, html);
      files += 1;
    }
    if (listing.id) {
      writeShell(listing.id, html);
      files += 1;
    }
  }
  console.log(`prerender-houses: wrote ${files} shells for ${listings.length} listings`);
}

main().catch((err) => {
  // Never fail the build — social previews are an enhancement, not a blocker.
  console.warn('prerender-houses: unexpected error, continuing build', err);
});