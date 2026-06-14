# Make listed houses more visible

Three goals, all selected: (1) Google/SEO discoverable, (2) more prominent in-app, (3) better-looking cards — for tenants, supporters, and the public.

## 1. Google / SEO discoverability (highest leverage)

Right now Google can find `/find-a-house` but not the individual `/house/:id` pages, so no single house ranks or gets a rich result.

- **Dynamic sitemap of every live house.** Add a sitemap generator (`scripts/generate-sitemap.ts`, wired to `predev`/`prebuild`) that keeps the static routes AND appends one `<loc>` per available, non-hidden, photographed listing (`/house/{short_code|id}`). This is what actually gets houses crawled. Uses the read-only public listing query (same filters as `PublicHousesPreview`).
- **Structured data on `/house/:id`.** Add JSON-LD (`Accommodation`/`Product` + `offers` with price in UGX, `BreadcrumbList`) inside the existing `<Helmet>`. Enables price + photo rich snippets in search.
- **Self-referencing canonical** on `/house/:id` and `/find-a-house` (currently missing canonical).
- Confirm `robots.txt` allows `/house/` and `/find-a-house` (it does today; will verify).

Note: social-preview crawlers (WhatsApp/Facebook) don't run JS, so per-house OG images only show for Google-class crawlers — full per-house social previews would need SSR (out of scope; called out honestly).

## 2. More prominent in-app

- **Tenant dashboard:** move the "Find a house" / available-houses entry above the lower-priority cards so it's one of the first things a tenant sees, with a live count ("128 houses available near you").
- **Supporter/Funder dashboard:** add a compact "Houses available to fund" preview strip linking into the browse sheet (supporters currently have no direct browse entry).
- Keep the existing `AvailableHousesSheet` as the shared destination.

## 3. Better-looking cards

Refresh `PublicHouseCard` (find-a-house) and the dashboard house cards:
- Stronger photo treatment, clear price (daily + monthly), location, key amenity chips (water/power/security), and a "New" badge for recently listed.
- Consistent card style across landing, find-a-house, and dashboards.

Since this is a visual-taste change, I'll show 3 rendered card design directions first and build the one you pick, rather than guessing.

## Technical notes
- Sitemap generator reuses the public listing filters; safe because listings are already public via RLS.
- No backend/schema changes. No financial or wallet code touched.
- JSON-LD price uses UGX per project currency standard.

## Suggested order
1. SEO (sitemap + structured data + canonical) — biggest discoverability win, fully deterministic.
2. In-app prominence (dashboard reordering + supporter strip).
3. Card redesign (after you pick a direction).

Want me to start with all three, or SEO first?