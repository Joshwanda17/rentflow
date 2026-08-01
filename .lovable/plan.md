# Branded short merchandise share links with product-image WhatsApp previews

## Goal
When an agent taps Share on a merchandise item, WhatsApp shows a short `welileapp.com/m/<code>` URL and still renders the item's photo, title and price.

## Current state (verified)
- `src/pages/MerchandiseStore.tsx` builds a share URL that points directly to the `og-merchandise` Supabase Edge Function. This gives a rich preview, but the URL is long and shows the Supabase function domain.
- `supabase/functions/og-merchandise/index.ts` returns Open Graph HTML for crawlers and 302-redirects humans to `welileapp.com/merchandise?item=<id>`.
- `src/lib/createShortLink.ts` already produces branded `welileapp.com/r/<code>` links, but those are resolved by the React component `src/pages/ResolveRLink.tsx`. WhatsApp's crawler does not execute JS, so it only sees the static `index.html` and gets a generic Welile preview.
- Lovable static hosting does not support server-side rewrites or proxies such as `_redirects`, `vercel.json` or per-path edge rules. The frontend host alone cannot return different HTML to crawlers.

## Answer to the question
A URL rewrite/proxy on the Lovable frontend host is **not enough** to make WhatsApp show a shorter link while keeping the product image. The short URL itself must be a server-side endpoint that returns the product's Open Graph tags. The practical way to do this on your own domain is a thin proxy/worker in front of the Lovable site (for example a Cloudflare Worker) that routes `/m/<code>` to a new merchandise short-code Edge Function.

## Proposed implementation

### 1. Database: merchandise short-code table
Create a dedicated table and resolver RPCs.

```text
merchandise_share_codes
  id uuid pk
  code text unique
  item_id uuid -> merchandise_catalog(id)
  source text
  created_by uuid -> profiles(id)
  created_at timestamptz
```

- Add required `GRANT`s and enable RLS.
- RPC `create_merchandise_share_code(item_id, source)` returns a new short code (idempotent: reuse existing code for the same user+item+source).
- RPC `resolve_merchandise_share_code(p_code)` returns the item id; used by the Edge Function.

### 2. Edge Function: `og-merchandise-short`
Create `supabase/functions/og-merchandise-short/index.ts`.

- Accept `GET /og-merchandise-short/<code>` and `?code=`.
- Resolve the code to an item via `resolve_merchandise_share_code`.
- Reuse the OG HTML generation from `og-merchandise` (title, price, 1200x630 image stream via `img=1`).
- Set `og:url` to the branded short URL passed in `X-Forwarded-Path` or a `canonical` query param.
- Record the open in `merchandise_share_opens`, preserving the original `User-Agent` and `Referer`.
- For direct human hits, 302 to `https://welileapp.com/merchandise?item=<id>`.

### 3. Cloudflare Worker proxy (external to Lovable, code kept in repo)
Add `infrastructure/welile-m-og-worker.js`.

- Route: `welileapp.com/m/*`.
- For every request, forward to `https://<project>.supabase.co/functions/v1/og-merchandise-short/<code>` with:
  - original `User-Agent`
  - original `Referer`
  - `X-Forwarded-Host: welileapp.com`
  - `X-Forwarded-Path: /m/<code>`
- Return the Edge Function response unchanged. Crawlers get OG HTML; humans get the 302 to the store.
- Include deployment instructions: add the Worker route in Cloudflare, ensure the `welileapp.com` DNS is proxied (orange cloud), and configure the route pattern.

### 4. Frontend: update share flow
Modify `src/pages/MerchandiseStore.tsx`.

- On share, call `create_merchandise_share_code(item_id, source)`.
- Build the share URL as `https://welileapp.com/m/<code>`.
- Keep the existing Supabase OG URL as a fallback when the worker is not configured.
- Pass `source` through so analytics still distinguishes native share, copy, etc.

### 5. Verification
- Use the existing `/admin/merchandise-share-preview` page to confirm the short-code endpoint returns the correct title, price and image.
- Test with the Facebook Sharing Debugger and a real WhatsApp message.
- Confirm that tapping the link on a phone opens the product in the app.

## Open decisions
1. Do you have a Cloudflare account (or another edge-worker/proxy provider) to run the `/m/*` route, or should we evaluate a third-party shortener with OG metadata support (e.g., Short.io, Rebrandly) instead?
2. Should short codes expire after a fixed period, or remain valid indefinitely?
