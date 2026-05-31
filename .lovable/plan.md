## Goal

Let the page (body) scroll natively on Android/mobile without the global overscroll suppression fighting it — while keeping every inner scroll container (modals, sheets, lists) behaving exactly as before.

## Why this is safe (addressing the concern)

`overscroll-behavior` does **not** make an element scrollable or unscrollable. Scrollability comes from `overflow-y` + content height. `overscroll-behavior` only controls scroll-chaining and the bounce/pull-to-refresh effect.

Inner sections keep their own containment rules and are untouched:
- `.ios-fixed-scroll` → `overscroll-behavior: contain` (index.css:386)
- `.ios-momentum-scroll` → `overscroll-behavior-y: contain` (index.css:419)
- modal/sheet rule → `overscroll-behavior: contain` (index.css:876)

None of these depend on the body rule, so relaxing the body rule cannot break them. There is no `auto-scroll: none` property anywhere — that does not exist in CSS.

## Changes

1. **`src/critical.css` (line ~117)** — on `body`, change `overscroll-behavior: none` to `overscroll-behavior-y: contain`. This stops only the page-bounce/refresh chaining while leaving normal vertical scrolling fully native. Keep `overflow-y: auto` and `min-height: 100dvh`.

2. **`index.html` (line 88)** — leave `overscroll-behavior-y: contain` as-is (it already matches the relaxed rule), so the two app-shell declarations agree instead of conflicting.

3. **`src/index.css` (line ~439)** — keep the `html.ios-standalone body { overscroll-behavior-y: none }` rule. This only applies inside an installed iOS PWA to stop rubber-banding, and it is scoped, so it does not affect normal Android/browser scrolling.

## Verification

- Load `/welcome` and `/auth` at 390x844 mobile viewport and confirm the page scrolls top-to-bottom with touch.
- Open a modal/bottom sheet and confirm inner scrolling still contains (no background scroll bleed).
- Confirm no new CSS parse errors in the build output.

## Technical notes

This is a frontend/CSS-only change. No business logic, routing, or PullToRefresh hook changes are part of this plan — those entry routes already bypass the PullToRefresh wrapper.
