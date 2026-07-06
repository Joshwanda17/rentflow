# Low-end phone optimization — evidence-based audit & plan

## What the earlier audit got wrong (already done)

Verified against the current code, not assumptions:

- **Dialogs/sheets already lazy-loaded** — `AgentDashboard.tsx` has **57** `lazy()` imports (DepositFlow, WithdrawFlow, scanners, poster, registration, etc.). Closed dialogs are not statically bundled.
- **Android safe-mode already exists** — `main.tsx` adds `no-backdrop-blur` + `android-compositor-safe` on Android/low-blur.
- **React Query already tuned** — `App.tsx:255-257` sets network-aware `staleTime`/`gcTime` (not a flat 60–120 min for everyone).
- **Save-Data / slow-network mode already handled** — `App.tsx` adds a `save-data` class and listens for connection changes.
- `**index.css` is ~34 KB source**, not 282 KB. The 282 KB figure is the *compiled* Tailwind output (all utilities); that is a build concern, addressed by purge, not hand-editing.

So the app is not un-optimized — but there are real, targeted issues below.

## Confirmed real issues (with evidence)

1. `**will-change: scroll-position` on `.scroll-container**` (`index.css:886`) — forces a large permanent composited layer on every scroll region. This is a leading cause of the GPU tearing in the screenshot. Fix: remove it (keep `-webkit-overflow-scrolling` + `overscroll-behavior`).
2. **225 files import `framer-motion**` — heavy JS + animated compositing on low-end. Biggest memory/CPU lever. Fix: gate motion off under `android-compositor-safe`/`prefers-reduced-motion` and swap the most common cases to CSS.
3. `**AgentCashPayoutsTab.tsx` is 1746 lines with un-virtualized lists** — this is the corrupted "Cash, Mobile Money & Bank Payments" sheet. Fix: paginate/virtualize the payout list and cap query rows.
4. **Caches cleared on every launch** (`main.tsx:82`) — `caches.delete` runs each boot. Fix: run once behind a `localStorage` version flag.
5. `**AgentDashboard.tsx` (1756 lines, 90 static imports)** — still large despite lazy dialogs. Fix: move the heaviest still-static feature panels behind `lazy()`.

## Prioritized implementation (incremental, after your OK)

&nbsp;

Minimum-device requirement:

Treat entry-level Android phones such as the itel A08 series as a primary target, not an edge case. Optimize and test using an Android Go–class profile with:

- 2 GB available RAM

- Entry-level quad-core CPU

- 6× CPU slowdown during browser testing

- 360×720 viewport, plus testing at 320px width

- Slow 3G network conditions

- Data Saver enabled

- Reduced Motion enabled

- Limited GPU texture/compositing capacity

- Current and older Chromium-based Android browsers

On this profile, the application must:

- Open without crashing, freezing, visual tearing, or automatic tab reloads.

- Keep scrolling responsive.

- Avoid blurred overlays, oversized composited layers, large shadows, and unnecessary transforms.

- Render payout lists incrementally through pagination and virtualization.

- Mount dialogs, maps, scanners, charts, and advanced tools only when requested.

- Use static UI in low-performance mode.

- Avoid retaining large query results or hidden component trees.

- Display a lightweight loading state immediately.

- Preserve every financial workflow and validation rule.

Use progressive enhancement: the essential application must work without backdrop-filter, complex animation, WebGL, high-resolution assets, or advanced GPU effects.

Test the payout sheet and agent dashboard repeatedly on this minimum-device profile. Passing desktop Lighthouse alone is not sufficient.

<html class="lite-mode android-compositor-safe no-backdrop-blur">

**Phase 1 — GPU tearing + boot cost (fast, low risk)**

- Remove `will-change: scroll-position`; strengthen `android-compositor-safe` to also drop `backdrop-filter`, big shadows, and entrance transforms on the payout sheet.
- Make cache cleanup one-time (versioned flag) in `main.tsx`.

**Phase 2 — Payout sheet (the screenshot)**

- Paginate/virtualize the payout list in `AgentCashPayoutsTab.tsx`; add row limits to its queries. Preserve all claim/complete/financial logic exactly.

**Phase 3 — Motion weight**

- Add a shared `useReducedMotion`/CSS gate so `framer-motion` animations are skipped in low-perf mode; convert the highest-traffic dashboard animations to CSS transitions. No behavior change.

**Phase 4 — Dashboard chunking**

- Lazy-load remaining heavy static panels in `AgentDashboard.tsx`.

**Phase 5 — Verify**

- Lint, typecheck, production build; compare chunk sizes before/after; test at 320/360/390 widths with 4× CPU throttle; confirm no tearing on the payout sheet.

## Guardrails

- No changes to financial calculations, ledger, RPCs, routes, permissions, or workflows.
- No file deletions in this pass (redundant-file cleanup is a separate, evidence-gated phase).
- Keep TypeScript strict; no new `any`.

## Technical notes

- Motion gate: single hook reading `matchMedia('(prefers-reduced-motion)')` + `.android-compositor-safe` class, returning a flag components use to render static instead of `motion.*`.
- Virtualization: reuse the existing approach already used in `AvailableHousesSheet.tsx`/`FindAHouse.tsx` for consistency.