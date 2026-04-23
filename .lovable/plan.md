

# Restore real-time updates for Carol's funder accounts (and platform-wide)

## Root cause

`src/lib/disableRealtime.ts` was added as a temporary measure to free DB connections. It monkey-patches `supabase.channel()` to return a no-op object, so EVERY `useEffect` that subscribes to `postgres_changes` — across the whole app — does nothing. Hooks like `useWalletRealtime`, the funder accounts list, ROI updates, withdrawals, and the Carol/proxy-agent funder views all silently fail to receive updates.

That's why nothing changes in the UI for Carol's funder accounts until you hard-refresh.

There is no specific Carol bug. It's a global kill switch that's still on.

## Fix

Two-step, surgical:

### 1. Re-enable realtime globally
- Flip `REALTIME_DISABLED` to `false` in `src/lib/disableRealtime.ts` (keeps the file as a future kill switch but stops the no-op patch). All existing subscriptions (`useWalletRealtime`, funder lists, withdrawals, ROI, etc.) immediately start working again.

### 2. Add a scoped realtime subscription for the funder-accounts panel
The funder list under a proxy agent (Carol) currently has no dedicated realtime hook — it relies on manual refetch / `onRefresh`. Add a small hook so deposits, ROI, and withdrawals reflect instantly without the user tapping refresh.

- New: `src/hooks/useFunderAccountsRealtime.ts`
  - Subscribes to `postgres_changes` on the tables that drive the funder panel: `investor_portfolios`, `wallets`, `roi_payments`, `withdrawal_requests`, and `proxy_agent_assignments`, filtered by `proxy_agent_id` (or beneficiary IDs) of the current agent.
  - On any change, invalidates the React Query keys used by `FunderManagementSheet` / `FunderDetailView` (e.g. `['funder-accounts', agentId]`, `['funder-stats', beneficiaryId]`, `['funder-portfolios', beneficiaryId]`).
- Wire the hook into `FunderManagementSheet.tsx` and `FunderDetailView.tsx`.

### 3. Confirm publication membership (one migration if needed)
Verify these tables are in `supabase_realtime`. If any are missing, add them via migration:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.investor_portfolios,
  public.roi_payments,
  public.withdrawal_requests,
  public.proxy_agent_assignments;
```
(`wallets`, `wallet_deductions`, `general_ledger` are already used by `useWalletRealtime` and assumed published.)

## Verification

- Open Carol's proxy-agent funder list. In another tab, insert a test ROI payment / deposit for one of her funders. The UI updates within ~1s without a refresh.
- `useWalletRealtime` resumes working everywhere (CFO retractions, withdrawal approvals, deposits) — confirm by watching console: the `[Realtime]` "DISABLED" log no longer appears.
- No spike in dropped DB connections (the original reason it was disabled was a saturated pool — if that returns, we re-enable selectively rather than killing all realtime).

## Files touched

- `src/lib/disableRealtime.ts` — flip flag to `false`.
- `src/hooks/useFunderAccountsRealtime.ts` — NEW.
- `src/components/agent/FunderManagementSheet.tsx` — call the new hook.
- `src/components/agent/FunderDetailView.tsx` — call the new hook scoped to the open funder.
- Migration (only if publication check shows missing tables).

