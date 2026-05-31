
## Hard iOS version gate (2026-05-30)
- **`src/lib/versionGate.ts`**: `/version.json` (proxy `no-store`) holds the deployed version; compared against `__APP_VERSION__` baked into the bundle. `checkServerVersion()` (async, caches `welile_version_gate` localStorage), `isVersionStaleSync()` (sync), `isIOS()` (incl. iPadOS desktop-UA). `stale` only when both values exist and differ (never blocks dev or on missing server value).
- **`public/version.json`** must be kept in lockstep with `__APP_VERSION__`/`__CACHE_VERSION__` in `vite.config.ts` on every deploy.
- **`src/main.tsx`**: on iOS chunk-error recovery, if version is stale → `showUpdateRequiredUI()` (hard "Update Required" gate, no auto-loop) INSTEAD of the cycling recovery screen; button does full `clearAndReload`.
- **`src/pages/Auth.tsx`**: OTP login phone step blocks "Send SMS Code" when iOS bundle is stale (`otpVersionBlocked`), shows an "Update App" panel — prevents minting codes a stale device can't use (root cause of iPhone "invalid code" loop).

## Proactive iOS freshness watcher (2026-05-31)
- **`src/lib/iosFreshness.ts`** `installIOSFreshnessWatch()`: iOS-only (no-op off iOS / in preview / iframe). Listens for `pageshow` with `persisted` (bfcache restore) and `visibilitychange`→visible (foreground resume); throttled to one `/version.json` check per 60s. If the running bundle is provably stale, fires a clean `clearAndReload` BEFORE the user hits a missing-chunk 404 → retry splash. Wired in `src/main.tsx` after the iframe guard.
- Rationale (from telemetry): the retry splash is ~92% iOS because WebKit re-serves a stale cached `index.html` and restores stale page snapshots on resume/bfcache, while Android Chrome revalidates the document and self-heals on one reload. This watcher addresses the resume/bfcache path proactively rather than only reacting after a chunk error.
