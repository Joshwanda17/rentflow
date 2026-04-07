

# Remove Full-Screen Install Gate, Use Browser-Native Prompt Instead

## Problem
The current `PWAInstallGate` shows a full-screen blocking overlay asking users to install the app. If the app is already installed, it should not appear at all. Instead of a custom full-screen gate, the browser's native install prompt should handle installation.

## Changes

### 1. Remove `PWAInstallGate` from the app tree
**File: `src/App.tsx`**
- Remove the `PWAInstallGate` wrapper around `<AppRoutes />`
- Remove the lazy import for `PWAInstallGate`
- The existing `PWAInstallPrompt` (non-blocking floating banner at the bottom) already handles prompting users to install — it will continue to work as-is

### 2. Auto-trigger the native browser install prompt
**File: `src/components/PWAInstallPrompt.tsx`**
- On first visit (if the app is not installed and the `beforeinstallprompt` event fires), automatically call `prompt()` after a short delay to show the browser's native install dialog
- If the user dismisses it, fall back to the existing floating banner behavior
- On iOS, show the existing toast guidance ("Tap Share → Add to Home Screen")

### 3. Installed-app detection remains intact
The existing standalone detection (`display-mode: standalone`, `navigator.standalone`, `welile_pwa_installed` localStorage flag) already gates the prompt correctly in `usePWAInstall.tsx` — no changes needed there.

## Technical Details

**Files modified:**
- `src/App.tsx` — remove `PWAInstallGate` import and wrapper
- `src/components/PWAInstallPrompt.tsx` — auto-trigger native prompt on first visit

**Files unchanged:**
- `src/components/PWAInstallGate.tsx` — kept but no longer imported (can be deleted later)
- `src/hooks/usePWAInstall.tsx` — standalone detection already correct

