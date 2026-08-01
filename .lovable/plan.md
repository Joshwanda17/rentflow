# Branded merchandise share links

## Why the URL currently shows "supabase"
The share card is served by the `og-merchandise` Supabase Edge Function so that WhatsApp/Facebook/Telegram crawlers receive dynamic Open Graph tags (product title, price, product photo). The function lives at `https://<project-ref>.supabase.co/functions/v1/og-merchandise/...`, so that domain is what users see in the share dialog and in copied links.

## What we can change in code
We can replace the raw Supabase URL that is shown/copied with a short, branded `welileapp.com` link. The project already has a `short_links` table and a `/r/:code` resolver, so the cleanest path is to create a dedicated `/m/:code` route for merchandise shares.

### Proposed implementation
1. Add a new client route `/m/:code` in `src/App.tsx`.
2. Create a small resolver page `src/pages/ResolveMerchandiseLink.tsx` that:
   - Looks up the code in `short_links` via `resolve_short_link` (or a merchandise-specific resolver);
   - Redirects to `/merchandise?item=<id>` inside the app.
3. Update `buildShare` in `src/pages/MerchandiseStore.tsx` to:
   - Create a short link via `createShortLink(user!.id, '/merchandise', { item: item.id })`;
   - Display the resulting `https://welileapp.com/m/<code>` URL in the dialog box and copy action.
4. Keep the existing `og-merchandise` Supabase URL as the `og:url` target and the image source inside the Edge Function, so the rich product card still works when the link is pasted in WhatsApp/Facebook.

## Important trade-off
The branded `welileapp.com/m/<code>` link is a client-side SPA redirect. When a user copies and pastes that short link into WhatsApp, the WhatsApp crawler will hit `welileapp.com`, receive the React app shell, and will **not** see the dynamic product Open Graph tags. The product image preview will only appear if the shared URL is the Supabase Edge Function URL (the current one).

Options:
- **Option A (recommended)**: Show the branded short URL in the dialog/copy action, but keep the social-share buttons and native share sheet using the Supabase OG URL. Users get a clean URL to copy; group chats still get the rich product card.
- **Option B**: Share only the branded short URL everywhere. The URL is clean, but WhatsApp/Facebook previews will fall back to a generic Welile card instead of the product photo.
- **Option C**: Get a custom domain attached to the Supabase Edge Function (e.g. `og.welileapp.com` or `api.welileapp.com`) so the OG function can serve from a branded domain. This requires DNS changes and Lovable Cloud/Supabase configuration outside the app code; it cannot be done by editing files alone.

## Files to change
- `src/App.tsx` — add `/m/:code` route.
- `src/pages/ResolveMerchandiseLink.tsx` — new resolver page.
- `src/pages/MerchandiseStore.tsx` — update `buildShare` to create and display the short link.
- Optionally `supabase/functions/og-merchandise/index.ts` — no changes needed for Option A/B, but if Option C is pursued later the function already reads `SITE_URL` from a constant.

## Question before building
Which option do you want?
- **A**: clean copied URL + rich previews via Supabase OG URL in share buttons.
- **B**: clean URL everywhere, but lose the product-photo preview on WhatsApp/Facebook.
- **C**: investigate setting up a custom domain for the Edge Function (requires DNS and platform support, not just code).
