# Fix /executive-hub Mobile Scroll

## Root cause

`/executive-hub` is wrapped (like every route) by `<PullToRefresh>` in `src/App.tsx` (line 290). On mobile, `PullToRefresh` swallows page scroll on long dashboards such as **Tenant Ops** and **Agent Ops**. Two interacting issues cause this:

1. **Wrapper is a phantom scroll container.** `PullToRefresh` renders `<div className="relative overflow-auto min-h-screen" style={{ touchAction: 'pan-y' }}>`. With `min-h-screen` and no `max-height`, the wrapper auto-grows to its content, so its own `scrollTop` is always `0`. Page scroll actually happens on `<body>`.
2. **`usePullToRefresh` reads the wrong scroll position.** It checks `(e.currentTarget as HTMLElement).scrollTop` (the wrapper, always `0`), so `isAtTop` is **always `true`**. Anywhere on the page, the smallest downward swipe (`diff > 0`) is interpreted as a pull-to-refresh gesture and applies `transform: translateY(Npx)` to the content. On Android Chrome / iOS Safari this stalls native body scroll, which is what the user perceives as "not scrollable."

This is invisible on short pages (CEO/CMO/CTO dashboards fit on one screen on phones). It hits Tenant Ops and Agent Ops because their stacked panels, KPI rows, tabs, and `AgentOpsBottomNav` push total height well past `100dvh`.

## Fix (small, surgical)

### 1. Exempt `/executive-hub` from PullToRefresh

In `src/App.tsx`, extend the existing exempt list:

```ts
const PTR_DISABLED_PREFIXES = ['/funder-onboarding', '/executive-hub'];
const disablePullToRefresh = PTR_DISABLED_PREFIXES.some(p =>
  location.pathname === p || location.pathname.startsWith(p + '/'),
);
```

When disabled, `PullToRefresh` already returns `<div className={className}>{children}</div>` (no `overflow-auto`, no touch handlers), so the body becomes the real scroll container and the page scrolls naturally on mobile. The dashboard header's `sticky top-0` stays correct because it then sticks to the document viewport (not the wrapper).

### 2. Keep the in-dashboard refresh affordances

Both dashboards already have explicit refresh paths (React Query auto-refetch on focus, "Back to overview" + tab switches re-query), so removing pull-to-refresh costs nothing here. Pull-to-refresh remains active on tenant / agent / landlord / supporter dashboards where it's actually useful.

### 3. Verify

- Resize preview to 390×844 (mobile), open `/executive-hub?tab=tenant-ops` → scroll the whole page top to bottom and back.
- Same for `?tab=agent-ops` (Home view, then open a sub-view via the dropdown), `?tab=ceo`, `?tab=cmo`.
- Check the sticky `<header>` in `ExecutiveHub.tsx` still sticks at the top on scroll.
- Confirm pull-to-refresh still works on `/dashboard/tenant` and `/dashboard/agent`.

## Out of scope (note for later)

The underlying `usePullToRefresh` bug (reading `currentTarget.scrollTop` on a non-scrolling wrapper instead of `window.scrollY` / `document.scrollingElement.scrollTop`) affects every long page wrapped by it. A proper fix is to read the document scroll position, but that's a wider behavior change and should ship in its own task with regression testing across all dashboards. This plan only unblocks `/executive-hub` immediately.
