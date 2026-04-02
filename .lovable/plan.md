

# Fix: PWA Install Button Not Triggering Native Install

## Problem

The "Install App" button shows up but tapping it doesn't trigger the native browser install dialog. The root cause is that the current `PWAInstallPrompt` component has too much complexity — iOS guides, fallback instructions, feature lists — which obscures the core install flow and introduces edge cases where the prompt gets lost or hidden.

## What Changes

### 1. Simplify `usePWAInstall.tsx` hook
- Keep the global early-capture of `beforeinstallprompt` (this is correct)
- Remove the `promptTriggered` ref guard — it can prevent retries after errors
- Add a small retry mechanism: if `deferredPrompt` is null when user taps install, wait ~800ms and check `globalDeferredPrompt` again before giving up
- Ensure the prompt is only cleared AFTER `userChoice` resolves (not on error)

### 2. Rewrite `PWAInstallPrompt.tsx` — pure one-tap install
- **Remove** all iOS manual instruction UI and `AdaptiveInstallGuide` integration
- **Remove** the features list (Zap, WifiOff, Shield)
- **Show** the install button ONLY when `hasPrompt` or `isInstallable` is true (native prompt available)
- **Hide completely** when no native prompt — no fallback text, no instructions
- On tap: call `deferredPrompt.prompt()` immediately, await `userChoice`, clear prompt
- Track success via `appinstalled` event (already in hook)
- Add a 2-second delay before showing the button (per "optional enhancements")

### 3. Ensure service worker registers correctly
- The custom `public/sw.js` is already registered in `main.tsx` for non-preview hosts
- Verify `vite.config.ts` VitePWA plugin doesn't conflict with the manual `sw.js` registration — currently `manifest: false` is set, which is correct
- Ensure the VitePWA `injectManifest` or `generateSW` mode doesn't produce a competing SW file — set `selfDestroying: false` and `strategies: 'injectManifest'` or disable workbox SW generation entirely since we have a custom `sw.js`

### 4. Fix VitePWA conflict with custom SW
- The VitePWA plugin with `workbox` config generates its own service worker, which conflicts with the manually registered `public/sw.js`
- **Solution**: Either remove VitePWA entirely (since we have a custom SW and manifest) OR switch to `injectManifest` mode pointing to our `sw.js`
- Simplest fix: remove VitePWA from vite.config.ts entirely — the custom `sw.js` and `manifest.json` already handle everything

### 5. Manifest validation
- Current `manifest.json` has duplicate `launch_handler` keys — remove the duplicate
- Icons all point to the same `welile-logo.png` with different `sizes` values — this works but the actual image file must match at least the largest declared size (512x512)

## Technical Details

```text
Flow:
  Page Load → beforeinstallprompt fires → stored globally
  → 2s delay → "Install App" button appears
  → User taps → deferredPrompt.prompt() → native dialog
  → userChoice resolved → clear prompt, hide button
  → appinstalled event → mark as installed
```

Key files modified:
- `src/hooks/usePWAInstall.tsx` — simplified, retry logic added
- `src/components/PWAInstallPrompt.tsx` — stripped to minimal one-tap UI
- `vite.config.ts` — remove VitePWA plugin (conflicts with custom SW)
- `public/manifest.json` — remove duplicate `launch_handler`

