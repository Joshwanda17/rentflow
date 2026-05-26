# Performance & Rendering Fixes (May 26, 2026)

This document outlines the recent code changes made to resolve Android-specific GPU rendering bugs and improve general app performance on budget devices.

## 1. Android GPU Tearing Fix (`src/main.tsx`)

**The Problem:**
Certain Android devices (especially mid-range phones using Mali or Adreno GPUs) suffer from a Chromium Webview bug where CSS `backdrop-filter: blur(...)` corrupts the hardware compositor. This resulted in horizontal tearing and visual glitching across scrollable lists (such as the My Partners list).

**The Solution:**
The app previously had a runtime detector that only disabled the blur effect for phones with low RAM (<=4GB) or few CPU cores (<=4). However, many modern mid-range phones have higher specs but still possess the buggy GPU drivers. 

**The Change:**
Modified `src/main.tsx` to be fully aggressive, disabling `backdrop-blur` unconditionally for **all** Android devices while keeping it enabled for iOS (which handles it perfectly).

```typescript
// Previous (Lenient)
if (userForced || (isAndroid && (mem <= 4 || cores <= 4))) {
  document.documentElement.classList.add('no-backdrop-blur');
}

// New (Aggressive)
if (userForced || isAndroid) {
  document.documentElement.classList.add('no-backdrop-blur');
}
```

## 2. Decorative Animation Removal (`tailwind.config.ts` & `src/index.css`)

**The Problem:**
The app contained numerous custom entrance animations (`fade-in`, `slide-in-right`, `scale-in`, `pulse-red`, etc.). While aesthetically pleasing, these decorative animations consume significant CPU and GPU cycles during rendering, causing sluggishness and contributing to rendering artifacts on lower-end devices.

**The Solution:**
Audited and stripped out all non-essential, purely decorative CSS animations.

**The Changes:**
1. **Removed from `tailwind.config.ts`:**
   * `fade-in`, `fade-in-up`, `scale-in`
   * `slide-in-right`, `slide-in-left`, `slide-up`
   * `blink`, `pulse-red`
2. **Removed from `src/index.css`:**
   * `.animate-fade-in`, `.animate-fade-in-up`, `.animate-scale-in`
   * `.animate-slide-in-right`, `.animate-pulse-subtle`
   * Their corresponding `@keyframes` declarations.

**Animations Kept (Essential for UX):**
* `accordion-down` / `accordion-up` (Required for collapsible UI elements)
* `shimmer` (Required for loading state skeletons)
* `shake` (Required for form validation feedback)
* `scanLine` (Required for the QR Scanner)
* Initial SVG loading spinner (Required for app boot)

**Result:** Elements that previously slid or faded into view will now appear instantly, significantly reducing rendering overhead.
