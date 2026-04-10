

# Real-Time Proxy Partner Card Refresh on Withdrawal Completion

## What This Does
When a FinOps officer marks a withdrawal as `completed`, the agent's Proxy Partner Funds page automatically refreshes — no manual reload needed. The "Withdrawal Processing" badge clears instantly and balances update.

## Technical Approach

**Single file change**: `src/components/agent/ProxyPartnerFunds.tsx`

### Add a Realtime Subscription
Inside the existing `useEffect` (or a new one), subscribe to `withdrawal_requests` changes filtered to the agent's `user_id`:

```ts
const channel = supabase
  .channel('proxy-withdrawal-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'withdrawal_requests',
      filter: `user_id=eq.${user.id}`,
    },
    (payload) => {
      // When any withdrawal status changes, reload all data
      loadProxyFunds();
    }
  )
  .subscribe();
```

Cleanup on unmount: `supabase.removeChannel(channel)`.

### Why This Is Safe
- `withdrawal_requests` is **already in `supabase_realtime` publication** (migration `20260119155432`)
- Realtime kill switch is **currently OFF** (`REALTIME_DISABLED = false`)
- The kill switch whitelist includes `withdrawal_requests`-adjacent tables
- Filter by `user_id` ensures each agent only receives their own withdrawal events — minimal connection load
- `loadProxyFunds()` already handles full state recalculation, so a simple re-fetch is correct

### No Database Changes
- No migrations needed
- No new tables or RLS policies
- Single UI file edit

