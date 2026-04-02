

# Fix: "Install App" Button Should Directly Install (No Fallback Toast)

## Problem
On Android mobile, when the native install prompt fails or isn't available, the button falls back to showing a toast message ("Open your browser menu and tap Install app") instead of directly installing. The user wants the Install App button to just work — trigger the native install prompt directly, no manual instructions.

## Root Cause
In `PWAInstallPrompt.tsx` lines 83-88 and 91-95, when `promptInstall()` fails or returns false, the code shows a toast with manual browser instructions. This is the fallback the user sees in the screenshot.

## Changes

### File: `src/components/PWAInstallPrompt.tsx`

**`handleInstall` function (lines 67-99):**
- Remove the toast fallback messages ("Open your browser menu..." and "Tap Share button...")
- When native prompt isn't available yet, retry `promptInstall()` after a short delay (the `beforeinstallprompt` event may fire late)
- If still no prompt available on Android, silently wait and keep the button visible — do NOT show manual instructions
- On error, log silently without showing toast instructions

**Footer info section (lines 231-237):**
- Remove the browser/OS label line at the bottom that currently shows "Open your browser menu (⋮) and tap Install app" — replace with nothing or a neutral "Works like a native app" message

## Summary
One file changed. The Install App button will always attempt the native `beforeinstallprompt` flow. No more fallback toast telling users to manually use the browser menu.

