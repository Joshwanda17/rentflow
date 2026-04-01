

# Fix PWA Install — Only on /welcome, Working Install Button

## Problem
1. The PWA install prompt (`PWAInstallPrompt`) is rendered globally in `DeferredExtras.tsx` for all non-authenticated users on all routes except `/settings`
2. The `beforeinstallprompt` event is captured globally in `usePWAInstall.tsx` but can be lost across re-renders or route changes
3. Users click "Install" but nothing happens because the deferred prompt may have been consumed or lost

## Plan

### 1. Move PWA install prompt to `/welcome` route only
- **Remove** `PWAInstallPrompt` from `DeferredExtras.tsx` entirely
- **Add** the install prompt directly into `Landing.tsx` (the `/welcome` page component)

### 2. Simplify the install logic in Landing.tsx
- Use a local `useEffect` in `Landing.tsx` to listen for `beforeinstallprompt` and store the event in component state
- Also check the global `globalDeferredPrompt` from `usePWAInstall.tsx` as a fallback (the event may have fired before the component mounted)
- Show an "Install App" button on the Landing page when a prompt is available
- For iOS: show the manual install guide (Add to Home Screen instructions)
- On successful install, redirect to `/auth`

### 3. Keep the global early-capture in usePWAInstall.tsx
- The module-level `beforeinstallprompt` listener that saves the event globally is valuable — it captures the event before React mounts
- `Landing.tsx` will import and use this cached event as a fallback

### Files to Edit
- `src/components/DeferredExtras.tsx` — remove `PWAInstallPrompt` import and rendering
- `src/pages/Landing.tsx` — integrate install button with direct `beforeinstallprompt` handling
- `src/hooks/usePWAInstall.tsx` — export `globalDeferredPrompt` for Landing to consume

