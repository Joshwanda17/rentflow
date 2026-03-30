

## Analysis: Auto-Charge Cron Job — Why Deductions Appear Stuck

### Root Cause

The cron job IS running daily and the edge function IS executing. I verified this by invoking it just now — it processed all 9 active charges successfully. However, **no money is being deducted** because of a combination of three issues:

1. **All 9 tenants have UGX 0 in their wallets** — there is literally no money to deduct
2. **Most linked agents also have insufficient funds** — they cannot cover the shortfall
3. **Stale `next_charge_date` creates an infinite backlog** — charges have dates stuck at March 9–21 (10–20 days behind today). The system advances by only 1 day per successful processing cycle, and the 72-hour grace period means each failed charge takes ~4 days to advance by 1 day. The system can never catch up.

### Current State (9 Active Charges)

```text
Tenant              | Wallet | Charge/day | Next Date | Grace Since
--------------------|--------|------------|-----------|------------
Sunueli Alex        | UGX 0  | 13,601     | Mar 09    | Mar 27
Kato Bashir         | UGX 0  |  4,884     | Mar 09    | Mar 27
Ndikola Hamuza      | UGX 0  |  4,884     | Mar 10    | Mar 27
Kayemba Henry       | UGX 0  |  4,884     | Mar 12    | Mar 27
Magoma Adam         | UGX 0  |  4,884     | Mar 12    | Mar 27
Kabuye Damiyano     | UGX 0  |  9,200     | Mar 15    | Mar 27
Namukisha Esther    | UGX 0  | 13,967     | Mar 15    | Mar 30
Agalejjo Jonathan   | UGX 0  |  4,767     | Mar 16    | Mar 27
Akandinda Wilson    | UGX 0  | 56,193     | Mar 21    | (none)
```

### Proposed Fix (3 Parts)

#### Part 1: Catch-Up Logic for Stale Dates
When `next_charge_date` is more than 1 day behind today, skip the backlog and jump to today. Record the missed days as a single debt entry rather than cycling through each individually. This prevents the 72h grace loop from blocking progress.

**In `auto-charge-wallets/index.ts`:**
- Before processing, calculate `missedDays = daysBetween(next_charge_date, today)`
- If `missedDays > 1`: record accumulated missed charges as debt, advance `next_charge_date` to today, clear `tenant_failed_at`, then attempt today's charge normally
- Log the catch-up with a `"catchup_debt"` status

#### Part 2: Grace Period Circuit Breaker
Prevent infinite grace-period recycling when both tenant and agent consistently have zero funds.

- After grace expires and agent also has insufficient funds, advance `next_charge_date` to tomorrow (instead of only +1 from the old stale date)
- Track consecutive failures; after 3 consecutive failed grace cycles, mark the charge as `"stalled"` and notify the manager

#### Part 3: Manager Visibility — Stalled Charges Alert
Add a notification when charges are stalled so the operations team can intervene (top up wallets, contact tenants, etc.).

- Insert a manager notification when a charge enters `"stalled"` state
- Existing dashboards will pick up the notification automatically

### Technical Details

**Files modified:**
- `supabase/functions/auto-charge-wallets/index.ts` — add catch-up logic, grace circuit breaker, stalled state

**Database migration:**
- Add `consecutive_failures` column (integer, default 0) to `subscription_charges`
- Add `"stalled"` as a valid status for the charge lifecycle

**No changes to:** cron schedule, RLS policies, or client-side code.

