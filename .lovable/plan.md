# Fix PWA Install — Complete Overhaul

## Issues Found

1. `**start_url` is `/dashboard?source=pwa**` — Chrome may fail installability checks if this URL redirects (e.g. to login). Should be `/`.
2. **No iOS support** — current `PWAInstallPrompt` shows nothing on iOS since `beforeinstallprompt` never fires on Safari. Need iOS detection + "Tap Share → Add to Home Screen" guidance.
3. `**hasPrompt` is not reactive** — `!!globalDeferredPrompt` is evaluated at render time but doesn't trigger re-renders. Need a state variable that updates when the global prompt is captured.
4. `**drop_console: true` in production** — all `[PWA]` debug logs are stripped, making it impossible to diagnose install failures in production. Should preserve PWA logs.
5. **Icon `purpose: "any maskable"` on same entry** — Chrome prefers separate entries for `any` and `maskable`. Should split the 192 and 512 icons.
6. **Install popup UI needs upgrade** — user requested an updated install pop-up design.
7. no need to upgrde the UI but rather functionality must be surved

## Changes

### 1. Fix `public/manifest.webmanifest`

- Change `start_url` from `/dashboard?source=pwa` to `/`
- Split icon entries: separate `any` and `maskable` purpose for 192 and 512 sizes

### 2. Rewrite `src/hooks/usePWAInstall.tsx`

- Add a reactive `hasPrompt` state (not just a getter on the global)
- Add iOS detection (`isIOS` flag)
- Keep global early-capture pattern
- Keep retry logic

### 3. Rewrite `src/components/PWAInstallPrompt.tsx` — upgraded UI

- **Android/Desktop**: Show a polished bottom banner with app icon, name, "Install" button — triggers native prompt on tap
- **iOS**: Show a styled banner with "Tap ⎋ Share → Add to Home Screen" instructions
- Auto-dismiss after install or manual close
- 3-second delay before showing
- Animated entrance/exit

### 4. Keep `vite.config.ts` clean (no VitePWA plugin)

- Already removed — the custom `sw.js` + `manifest.webmanifest` handle everything

### 5. No changes to `main.tsx` or `sw.js`

- Service worker registration is already correct (registers on non-preview hosts)
- `sw.js` is functional

## Files Modified

- `public/manifest.webmanifest` — fix `start_url`, split icon purposes
- `src/hooks/usePWAInstall.tsx` — reactive state, iOS detection
- `src/components/PWAInstallPrompt.tsx` — upgraded UI with iOS support