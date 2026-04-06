

# Fix Agent Dashboard Header White Gap

## Problem
A thin white strip appears below the purple header bar on the Agent Dashboard.

## Root Cause
The `DashboardHeader` component's `<header>` element uses `sticky top-0` positioning but lacks a bottom border override. The default `shadow-sm` may also cause a subtle visual gap between the header and the scrollable content area.

## Fix

### `src/components/DashboardHeader.tsx`
- Remove `shadow-sm` from the header and replace with a tighter shadow or no shadow to eliminate the visible gap
- Ensure no extra spacing is produced between the header and the content

### `src/components/dashboards/AgentDashboard.tsx`
- Remove any top margin/padding on the scroll container (`flex-1 overflow-y-auto`) that could create a gap below the header
- Ensure the `OfflineBanner` (rendered before the header) doesn't introduce whitespace when not visible

The fix is 2 files, CSS-only adjustments — no logic changes.

