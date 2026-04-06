
# Remove Whitespace Below Bottom Navigation Bar on Mobile

## Problem
The bottom role switcher navigation bar has whitespace visible beneath it on mobile. This is caused by the content area's bottom padding (`pb-20` = 80px) being larger than needed for the nav bar (~50px), and potentially the page body extending below the fixed nav.

## Changes

### 1. Reduce Content Bottom Padding Across Dashboards
The `pb-20` (80px) padding reserved for the bottom nav is excessive — the nav is only ~50px. Reduce to `pb-16` (64px) in all four public dashboard scroll containers:

- `src/components/dashboards/SupporterDashboard.tsx` — change `pb-20` → `pb-16`
- `src/components/dashboards/TenantDashboard.tsx` — same change
- `src/components/dashboards/AgentDashboard.tsx` — same change  
- `src/components/dashboards/LandlordDashboard.tsx` — same change

### 2. Tighten the Bottom Nav Itself
In `src/components/BottomRoleSwitcher.tsx`, ensure the nav doesn't produce extra whitespace below itself by adding a minimal safe-area fallback and removing any excess padding that might render as visible whitespace on devices without a notch.

This is a targeted CSS adjustment across 5 files with no logic changes.
