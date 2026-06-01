---
name: No URL cache-busting
description: Never add query-string cache-busters to navigation URLs/reloads; only static assets get cache-busting
type: constraint
---
URLs (navigation/document reloads) must NEVER carry query-string cache-busters
(e.g. `?_v=`, `?t=`, timestamp params). On iOS Safari those create an endless
refresh loop because the stale shell just reloads to the same busted URL.

- App-shell freshness is handled by `/version.json` (served `no-store`) +
  cache/SW purge in `hardRecovery.ts`, and the manual "Clear Cache & Reload"
  button in Settings. A plain `window.location.reload()` is correct.
- Only STATIC ASSETS (images, fonts, generated cards/PDFs via html-to-image
  `cacheBust: true`) may use cache-busting. That is asset-level, not URL-level.

**Why:** URL cache-busters caused the iPhone refresh/splash loop and are not
needed — the Lovable proxy already revalidates HTML on every navigation.
