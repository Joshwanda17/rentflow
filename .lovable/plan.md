
Goal: fix the unresponsive “tabs” shown in your screenshot — these are the CFO executive sidebar navigation items, and the same touch problem may also affect other tab/button UIs on mobile.

What I found
- The screenshot matches the CFO sidebar config in `src/components/layout/executiveSidebarConfig.ts`.
- Those sidebar items are rendered as plain buttons in `src/components/layout/ExecutiveDashboardLayout.tsx`.
- The whole app is wrapped in a custom pull-to-refresh container in `src/App.tsx` via `src/components/PullToRefresh.tsx` and `src/hooks/usePullToRefresh.ts`.
- That hook starts pull-tracking immediately on `touchstart` whenever the scroll container is at the top. On mobile, this can swallow or cancel normal tap/click behavior for nested interactive elements like sidebar items and tab triggers.
- The current sidebar buttons also are not hardened for touch interaction (`type="button"`, `touch-action`, pointer handling, active state), unlike some newer components that already do this.

Who is affected
- Most likely all touch users, especially on mobile/tablet.
- Most visible in executive dashboards (CFO, COO, HR, etc.) because they use the same `ExecutiveDashboardLayout`.
- Potentially also some Radix tab UIs that depend on clean pointer/tap handling.

Implementation plan
1. Harden the global pull-to-refresh behavior
- Update `src/hooks/usePullToRefresh.ts` so it does not enter pull mode on every top-of-page touch.
- Only begin pull behavior after a real downward drag threshold, not on simple taps.
- Ignore touches that start on interactive elements such as:
  - `button`
  - links
  - inputs/selects/textareas
  - elements with tab roles / tablists
  - drawer/sidebar navigation areas
- Prevent pull-to-refresh from interfering with nested scrollable containers and fixed overlays.

2. Make executive sidebar navigation reliably touchable
- Update the sidebar buttons in `src/components/layout/ExecutiveDashboardLayout.tsx` to be mobile-safe:
  - add `type="button"`
  - add `touch-manipulation`
  - add stronger pressed/hover states
  - optionally trigger on pointer-up/touch-safe path instead of relying only on `onClick`
- Raise the drawer above the backdrop with explicit z-index separation to eliminate any layering ambiguity on mobile.

3. Harden shared tab triggers
- Update `src/components/ui/tabs.tsx` so `TabsTrigger` is explicitly touch-friendly:
  - add `type="button"`
  - add `touch-manipulation`
  - preserve haptic feedback without interfering with Radix behavior
- This protects other tab strips across the app, not just the CFO sidebar.

4. Verify executive tab IDs and route behavior
- Re-check the CFO sidebar items against `src/pages/cfo/Dashboard.tsx` so every item maps to a valid content panel.
- Keep the current tab-state approach, but make sure tapping any menu item always changes `activeTab` immediately and closes the drawer on mobile.

5. QA pass after implementation
- Test on touch-sized viewports for:
  - CFO sidebar items
  - any top tab bars using `TabsTrigger`
  - drawer open/close behavior
  - pull-to-refresh still working only when intentionally dragged
- Also verify no regressions in desktop click behavior.

Technical notes
- Primary suspect files:
  - `src/hooks/usePullToRefresh.ts`
  - `src/components/PullToRefresh.tsx`
  - `src/components/layout/ExecutiveDashboardLayout.tsx`
  - `src/components/ui/tabs.tsx`
- Most likely root cause:
  - app-level touch gesture handling is too aggressive and interferes with nested buttons/tabs
- Secondary hardening:
  - improve touch semantics and z-index behavior for the executive drawer/sidebar buttons

Expected result
- CFO sidebar items respond instantly on mobile/tablet
- shared tabs become reliably clickable/tappable
- pull-to-refresh still works, but only when the user actually intends to pull
