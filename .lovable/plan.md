

# Fix: Agent Dashboard — Daily Rent Expected Card Rendering Issue

## Problem
The screenshot shows 7+ stacked "DAILY RENT EXPECTED" labels with gold icons between the Verification Checklist and the Action Grid. The `DailyRentExpectedCard` component renders only once in code (line 291), but is visually duplicating on mobile devices — likely caused by the `animate-fade-in` CSS animation combined with React Query re-renders creating paint artifacts on older Android WebView.

## Root Cause
The `DailyRentExpectedCard` at line 291 of `AgentDashboard.tsx` uses `animate-fade-in` CSS class. On re-renders (React Query refetch, state changes in parent), the animation replays and can cause visual "ghost" frames on low-end devices. Additionally, the card's query (`staleTime: 300000`) still re-fetches on mount, which triggers multiple re-renders during the loading → data transition.

## Fix

### 1. `DailyRentExpectedCard.tsx` — Remove animation, add stable rendering
- Remove `animate-fade-in` from the card wrapper to prevent paint artifacts
- Wrap the component return in a stable container with a fixed `key`
- Show the loading state inline (skeleton number) instead of `'...'` to prevent layout shift
- Add `refetchOnWindowFocus: false` and `refetchOnMount: false` to prevent unnecessary re-fetches

### 2. `AgentDashboard.tsx` — Wrap card in stable container
- Wrap `<DailyRentExpectedCard>` in a `<div key="daily-rent-card">` to prevent React reconciliation from re-mounting it during parent re-renders

## Files Changed
- `src/components/agent/DailyRentExpectedCard.tsx`
- `src/components/dashboards/AgentDashboard.tsx` (minor wrapper)

