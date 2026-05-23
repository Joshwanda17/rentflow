## Goal
Fix the iOS standalone PWA scroll freeze by removing the legacy body/`#root` `position: fixed` + `overflow: hidden` locks and replacing them with the modern `overscroll-behavior-y: none` boundary. This matches the analysis you posted and is the right call — both culprits still exist in the working tree (`useIOSCompatibility.ts` L133–139 and `index.css` L390–411), so the GitHub fix has not landed in Lovable yet.

## Why this solution (vs. the alternatives)

| Option | Verdict |
|---|---|
| **A. `overscroll-behavior-y: none`** (your proposal) | ✅ Pick this. Standard, supported on iOS 16+, keeps native momentum + keyboard avoidance, kills rubber-band. |
| B. Keep body-lock but add cleanup on unmount | ❌ Still freezes scroll the entire time the app is open in standalone — cleanup only helps on teardown, which never happens in a PWA. |
| C. Scope body-lock to only when a sheet/modal is open | ❌ Solves bounce inside modals but leaves the real bug (frozen base pages) unfixed and adds modal-state coupling. |
| D. Do nothing, rely on existing `overscroll-behavior: none` already in `critical.css` body | ❌ Doesn't override the `html.ios-standalone` cascade still forcing `position: fixed`. |

Option A is the only one that fixes the reported video without regressing bounce control.

## Changes

### 1. `src/hooks/useIOSCompatibility.ts` (lines 133–139)
Replace the four body mutations with overscroll boundaries on `html` + `body`:
```ts
if (isStandalone && isIOS) {
  document.documentElement.style.overscrollBehaviorY = 'none';
  document.body.style.overscrollBehaviorY = 'none';
}
```
No cleanup needed (style is non-destructive and the hook is app-lifetime).

### 2. `src/index.css` (lines 390–411)
Delete the three `html.ios-standalone`, `html.ios-standalone body`, `html.ios-standalone #root` blocks. Replace with a single boundary rule:
```css
/* Prevent iOS rubber-band in standalone PWA without locking layout */
html.ios-standalone,
html.ios-standalone body {
  overscroll-behavior-y: none;
}
```
This frees `#root` to use the document scroller (native momentum) and lets the iOS keyboard reflow the viewport naturally.

## Out of scope
- No changes to `DeferredExtras`, `IOSOptimizations`, or any sheet/modal scroll containers.
- No change to `--keyboard-inset-height` plumbing — once the body un-locks, the existing value works as intended.
- No change to Android branches.

## Verification
- Build passes (Lovable auto-build).
- Manual check on `/dashboard/agent` and `/dashboard/funder` inside an installed iOS PWA: full-page vertical scroll works; pull-down past the top no longer rubber-bands the whole shell; focusing an input shifts content above the keyboard.
- Desktop and iOS Safari tab behavior unchanged (both branches skipped — `isStandalone` is false there).
