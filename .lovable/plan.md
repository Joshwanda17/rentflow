

# Remove Excessive Bottom Whitespace

## Problem
The supporter dashboard has `pb-28` (112px) on the scroll container and an additional `pb-8` (32px) on the inner main element, creating too much whitespace below the content above the fixed bottom navigation bar.

## Fix

**File: `src/components/dashboards/SupporterDashboard.tsx`** (line ~357-358)

- Reduce `pb-28` on the outer scroll div to `pb-20` — just enough to clear the fixed bottom nav (~52px + safe area)
- Remove the redundant `pb-8` from the inner `<main>` element

