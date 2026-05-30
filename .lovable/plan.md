## Why this is happening on iOS

The screenshot shows the app stuck on **“Updating…”** because some iPhone Home Screen installs are loading an **old PWA shell**.

Plainly:

1. Older iPhones installed Welile as a Home Screen app.
2. That installed app kept an old cached `index.html` / service-worker state.
3. After we deployed a new version, the old shell still pointed to old Vite chunk files that no longer exist.
4. iOS Safari/Home Screen apps are aggressive about reusing cached web app files, so a normal refresh can reload the same stale shell again.
5. Result: the app detects a newer version, tries to update, but iOS keeps serving the old cached app shell, so users stay stuck on **Updating…**.

This is not the users’ fault. “Delete the app and sleep” works only because deleting the Home Screen app removes the stale iOS web-app container. We need the app itself to clean that state safely.

## Implementation plan

### 1. Make the emergency iPhone cleanup reach everyone
- Treat stale iOS PWA cleanup as an emergency compatibility fix, not only a canary feature.
- Keep staged rollout for future update behavior, but do not let it block the cache/SW kill-switch path for affected iPhones.
- Ensure iOS standalone users always get a real cache-busted recovery path instead of looping on “Updating…”.

### 2. Ship a safer cross-platform PWA setup
- Keep Welile installable on:
  - iOS Safari / iPadOS
  - Android Chrome / Samsung Internet
  - desktop Chrome/Edge
  - lower-end Android browsers where possible
- Use one canonical manifest contract and align the legacy manifest files so older references do not conflict.
- Keep stable `id`, `scope`, icons, theme colors, and launch routes.
- Avoid a caching service worker during this recovery phase because the current issue was caused by stale service-worker/app-shell caching.

### 3. Strengthen old service-worker removal
- Keep `/sw.js` as a kill-switch worker.
- Add the same kill-switch behavior for `/service-worker.js` as well, in case any older build registered a different worker path.
- Make the worker delete all Cache Storage buckets, navigate clients to a cache-busted URL, then unregister itself.

### 4. Replace weak reload paths with hard recovery
- Replace remaining plain `location.reload()` / `window.location.reload()` recovery buttons with the existing hard recovery flow:
  - unregister service workers
  - delete caches
  - reload with a cache-busting `_v=` parameter
- Apply this to:
  - startup retry button
  - page loader retry button
  - pull-to-refresh recovery
  - update toast apply action
  - chunk error fallback

### 5. Make the “Updating…” screen impossible to trap users forever
- Keep automatic recovery attempts capped.
- After the cap, show a direct manual button: **Clear old app & reload**.
- Include iPhone-specific fallback text only after auto-recovery fails: close the app from the app switcher, reopen Safari, or remove/re-add the Home Screen app.

### 6. Improve diagnostics for support
- Log whether the device is:
  - iOS / Android / desktop
  - Safari version
  - standalone Home Screen mode
  - service worker present or absent
  - caches deleted or not
  - reload attempt count
- Keep these logs visible in Diagnostics for managers.

### 7. Verify behavior
- Check the app still boots without a registered service worker.
- Check the install prompt/instructions still work.
- Run the existing iPhone update/cache regression tests.
- Verify no update flow uses plain reload where hard recovery is required.

## Expected result

Affected iPhone users should no longer stay stuck on **Updating…**. The app will actively remove stale PWA/service-worker state, fetch the latest version, and still remain installable across iOS, Android, and desktop.