

# Real-Time Portfolio Visibility in Partner Ops Dashboard

## Problem
When an agent submits a field investment, the portfolio is created in the database but the Partner Ops dashboard caches data for 10 minutes (`staleTime: 600000`). Executives must manually refresh to see new investments.

## Solution
Add a real-time subscription to the Partner Ops dashboard so new/updated portfolios appear instantly without manual refresh.

## Changes

### 1. Enable realtime on `investor_portfolios` (Migration)
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.investor_portfolios;
```

### 2. Add realtime listener in `PartnersOpsDashboard.tsx`
Subscribe to `postgres_changes` on `investor_portfolios`. On any INSERT or UPDATE event, invalidate the `exec-partner-portfolios` query cache so the dashboard re-fetches automatically.

### 3. Reduce stale time
Lower `staleTime` from 600,000ms (10 min) to 30,000ms (30s) as a fallback for cases where realtime misses an event.

### 4. Send push notification to Partner Ops users (Edge Function)
Add a fire-and-forget notification in `agent-invest-for-partner` targeting users with the `coo` role (who access Partner Ops), so they get an immediate alert about the new investment — similar to the existing `notify-managers` call.

**Files modified:**
- `src/components/executive/PartnersOpsDashboard.tsx` — realtime subscription + reduced stale time
- `supabase/functions/agent-invest-for-partner/index.ts` — COO/Partner Ops notification
- Migration: enable realtime on `investor_portfolios`

