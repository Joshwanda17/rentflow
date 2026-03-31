

# Fix iOS White/Blank Screen During Property Registration

## Problem
The RegisterPropertyDialog shows an intermittent white/blank screen on iOS Safari. This is caused by a combination of iOS-specific rendering issues.

## Root Causes Identified

1. **Dialog zoom animations** — The dialog lacks the `stable` prop, so it uses `zoom-in-98`/`zoom-out-98` CSS animations. On iOS Safari, these transform-based animations combined with `backdrop-blur-sm` on the overlay can cause the GPU compositor to drop frames, rendering a white screen.

2. **`backdrop-blur-sm` on overlay** — iOS Safari has well-documented issues with `backdrop-filter: blur()` causing blank/white rendering, especially when layered with scrollable content and animations.

3. **Framer Motion `AnimatePresence`** — The `AnimatePresence mode="wait"` with nested `motion.div` and `motion.form` inside a Radix dialog portal can conflict with iOS Safari's compositor, especially during the geolocation permission prompt (which suspends the JS thread).

4. **Geolocation prompt interaction** — When iOS shows the location permission system dialog, it can cause the underlying WebView to re-composite. If the dialog content relies on animations mid-flight, it renders blank on return.

## Plan

### Step 1: Add `stable` prop to RegisterPropertyDialog
Add the `stable` prop to `DialogContent` to disable zoom animations, matching the pattern used by other dialogs that work on iOS (e.g., `WithdrawRequestDialog`, `DepositDialog`).

**File:** `src/components/landlord/RegisterPropertyDialog.tsx` (line 276)
- Change: `<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">`
- To: `<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" stable>`

### Step 2: Remove AnimatePresence wrapper
Replace `AnimatePresence mode="wait"` and `motion.form`/`motion.div` with plain `div`/`form` elements. The success state can use a simple conditional render. This eliminates the Framer Motion + Radix portal conflict on iOS.

**File:** `src/components/landlord/RegisterPropertyDialog.tsx`
- Replace `<AnimatePresence mode="wait">` with a simple conditional
- Replace `<motion.form>` with `<form>`
- Replace `<motion.div>` (success) with `<div>`
- Keep the small inline `motion.div` for fee breakdown (harmless, not layout-critical)

### Step 3: Add iOS-safe scroll class to dialog content
Add `-webkit-overflow-scrolling: touch` and `overscroll-behavior: contain` to the dialog for smoother iOS scrolling, using the existing `ios-fixed-scroll` CSS class.

**File:** `src/components/landlord/RegisterPropertyDialog.tsx` (line 276)
- Add `ios-fixed-scroll` class to DialogContent

## Technical Details

- **Files modified:** 1 file (`src/components/landlord/RegisterPropertyDialog.tsx`)
- **No new dependencies**
- The `stable` prop is already supported by the custom `DialogContent` component — it disables transform animations and sets `willChange: auto`
- Other dialogs using `stable` (WithdrawRequestDialog, DepositDialog, FundRentDialog) are confirmed working on iOS

