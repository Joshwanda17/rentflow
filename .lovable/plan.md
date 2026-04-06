

# Fix Bottom Navigation Bar Spacing

## Problem
The bottom role switcher navigation bar has excessive whitespace — extra internal padding makes it taller than needed, and there may be unnecessary spacing around its content.

## Changes

### 1. Reduce internal padding in `BottomRoleSwitcher.tsx`
- Reduce button padding from `py-2 min-h-[52px]` to `py-1.5 min-h-[44px]` for a tighter, more compact nav bar
- Reduce icon container size from `w-8 h-8` to `w-7 h-7`
- The nav is already `fixed bottom-0 left-0 right-0 z-50` — confirm this stays intact
- Keep `pb-[env(safe-area-inset-bottom)]` for safe area support on notched devices

### 2. Ensure no extra wrapper spacing
- Verify no parent component adds margin/padding below the nav
- The Sonner toaster already has `position: fixed` so it should not contribute to layout flow

## Files Modified
- `src/components/BottomRoleSwitcher.tsx` — tighten internal spacing of nav buttons

