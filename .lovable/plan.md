

# Pin the Agent Ops bottom nav to the viewport

## Problem
The bottom navigation on the Agent Ops dashboard scrolls away with the page content instead of staying pinned. You shouldn't have to scroll to find Dashboard / Pipeline / Agents / Finance / More.

## Root cause
`AgentOpsBottomNav` already has `fixed bottom-0 inset-x-0 z-40 sm:hidden` — the styling is correct. But it's rendered **inside** `AgentOpsDashboard`'s scroll container, and somewhere up the tree there's an ancestor with `transform`, `filter`, or `overflow` that breaks `position: fixed` (a known CSS gotcha — `transform` on an ancestor turns `fixed` into `absolute` relative to that ancestor). That's why it scrolls with the content instead of sticking to the viewport.

A second issue: the nav is gated by `sm:hidden`, so on tablet/desktop it disappears entirely. On the mobile preview where you're seeing it, the fixed positioning is being defeated by an ancestor.

## Fix

1. **Render the nav via a React portal to `document.body`** so no ancestor `transform`/`overflow`/`contain` can capture its `position: fixed`. This guarantees it pins to the viewport regardless of the parent layout.
2. **Add bottom padding to the dashboard scroll area** (`pb-[calc(env(safe-area-inset-bottom)+72px)]`) so the last card isn't hidden behind the nav.
3. **Keep `sm:hidden`** (mobile-only) as designed — the desktop layout uses the side nav. If you want it visible on desktop too, say the word and I'll drop that class.
4. **Bump z-index to `z-50`** so it sits above any floating buttons (e.g. `FloatingPortfolioButton` at `z-40`).

## Files

**Modified**
- `src/components/executive/agent-ops-v2/AgentOpsBottomNav.tsx` — wrap returned `<nav>` in `createPortal(..., document.body)`; bump to `z-50`.
- `src/components/executive/AgentOpsDashboard.tsx` — add `pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0` to the main scroll container so content clears the pinned nav.

## Verification
- Scroll the Agent Ops dashboard on mobile → nav stays glued to the bottom edge.
- Last card is fully visible (not clipped by the nav).
- Tapping a tab still switches views; safe-area inset respected on iOS.
- Desktop layout unchanged.

