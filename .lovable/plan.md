

## Diagnosis

The screenshot shows the **general** "Something went wrong" fallback from `ChunkErrorBoundary` — not the chunk-specific "Updating..." UI. That means an unhandled JS error fired during render on `welilereceipts.com/record-rent`, and the error message did NOT contain any of the chunk-loading keywords we look for.

### Most likely causes (in order)

1. **WhatsApp in-app browser hostility (iOS especially).** When a user taps the link inside WhatsApp, iOS opens it in an in-app WebView that blocks third-party cookies and sometimes restricts `localStorage`. The public `RecordRent` page is wrapped in the full app shell (`AuthProvider`, `CombinedSettingsProvider`, Supabase realtime init, theme provider, etc.). If Supabase auth init throws inside that WebView (storage access denied), **the whole tree crashes** — even though the rent recorder itself doesn't need auth.

2. **Stale service worker from a previous version** still serving an old `index.html` that references chunk hashes that no longer exist after a deploy. The new SW is network-first for navigation, but the *old* one installed on the user's device may not be — and the error it produces (`TypeError: Failed to fetch`) doesn't always match our chunk-keyword list.

3. **No remote logging** on this public page, so we're blind to what the actual error is.

## Plan (4 small, safe fixes)

### 1. Make `/record-rent` truly standalone (skip the heavy app shell)
Render `RecordRent` BEFORE `AuthProvider` / `CombinedSettingsProvider` initialize. Detect the path early in `App.tsx` — if it starts with `/record-rent`, mount only:
- `HelmetProvider` + `BrowserRouter` + `QueryClientProvider` + `Toaster` + `RecordRent`

No auth, no theme provider chain, no settings, no realtime, no PWA prompt. This eliminates ~90% of failure modes inside in-app browsers.

### 2. Wrap `RecordRent` in its own local error boundary with a friendly retry
Instead of falling back to the generic chunk boundary, give the public page its own boundary that:
- Shows the Welile logo + "We had a hiccup. Tap to try again."
- Logs the error to a public Supabase table (`public_error_logs`) or to the existing logging endpoint, with `user_agent`, `pathname`, `error.message`, `error.stack`. This lets us see exactly what is failing on real user devices.

### 3. Force-unregister any old service worker on `/record-rent`
At the top of `RecordRent.tsx`, on mount: unregister all SWs and clear `welile-*` caches. This guarantees first-tap on a stale device works. We're not relying on offline support for this page anyway — it needs the network to submit.

### 4. Wrap all browser-storage access in try/catch
In whatever providers do still load (e.g., `Toaster`, react-query persistence, sonner), make sure `localStorage`/`sessionStorage` access is wrapped — iOS WhatsApp WebView throws `SecurityError` on these.

## Files to change

- `src/App.tsx` — early `if (location.pathname.startsWith('/record-rent')) return <PublicRecordRentApp />;` branch that mounts a minimal tree
- `src/pages/RecordRent.tsx` — add SW unregister on mount + local `<RecordRentErrorBoundary>`
- `src/components/public/RecordRentErrorBoundary.tsx` (new) — small error boundary with friendly UI + remote error logging
- `supabase/migrations/<ts>_public_error_logs.sql` (new) — tiny `public_error_logs` table with public INSERT-only RLS so we can see what's failing on user devices

## Out of scope (deliberately)

- No change to the share button (already works)
- No change to the SW logic for other routes
- No change to the form itself

