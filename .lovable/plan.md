

# Make "How to Install" Button Directly Trigger Install

## Problem
When the browser doesn't support the native install prompt (iOS Safari, some desktop browsers), the button label changes to "How to Install" and opens an instruction guide page instead of attempting installation. The user wants the button to always try to install the app directly.

## Solution

**File: `src/components/PWAInstallPrompt.tsx`**

1. Change the button label from conditional `'Install Now' / 'How to Install'` to always say **"Install App"** (matching the uploaded reference style)
2. Update `handleInstall` to always attempt `promptInstall()` first regardless of platform method — only fall back to the guide if there's truly no prompt available AND it's a platform that requires manual steps (iOS)
3. On iOS specifically, instead of showing a multi-step guide page, show a brief toast with the one-line instruction ("Tap Share → Add to Home Screen") so the user stays on the same screen
4. Add the download icon styling to match the purple button in the reference image

**Changes are limited to `src/components/PWAInstallPrompt.tsx`** — the `handleInstall` function and button render section (~15 lines changed).

## Estimated impact
- Android/Chrome: No change — native prompt fires as before
- iOS/Safari: Instead of navigating to an instruction page, a toast appears with the share instruction while staying on the install prompt screen
- Button always reads "Install App" with download icon, consistent across platforms

