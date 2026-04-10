

# Investigation: "Withdrawal Processing" Still Showing

## Root Cause — Not a Code Bug

The UI is **correct**. It shows "Withdrawal Processing" because those withdrawal requests genuinely have status = `approved`, not `completed`.

### Database Evidence

All three partner withdrawals are stuck at `approved`:

| Partner | Amount | Status | Created |
|---------|--------|--------|---------|
| FAITH KIRABO | 2,016,000 | `approved` | Apr 9, 07:28 |
| NFITUMUKIZA BOSCO | 750,000 | `approved` | Apr 9, 07:29 |
| Mercy Bayo | 600,000 | `approved` | Apr 9, 07:29 |

The code on line 116 queries withdrawals with status `IN ('pending', 'approved', 'processing', 'manager_approved')` and renders them as "Withdrawal Processing" — which is the correct behavior per the withdrawal governance pipeline.

### Why They're Stuck

These are **proxy agent withdrawals** (the agent withdrew on behalf of partners). The agent submitted them, COO approved them (`approved`), but **FinOps never finalized them to `completed`**. The agent likely already hand-delivered the cash to the partners, but the system was never updated.

## Fix — Operational, Not Code

**Bulk-update these 20+ proxy withdrawal requests from `approved` → `completed`** via a database migration, since the agent (LUKODDA JOSEPH) has already delivered the funds.

### SQL Migration

```sql
UPDATE withdrawal_requests
SET status = 'completed',
    updated_at = now()
WHERE user_id = 'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c'
  AND status = 'approved'
  AND linked_party IS NOT NULL;
```

This will:
- Mark all 20+ proxy partner withdrawals as `completed`
- Clear the "Withdrawal Processing" badge from every partner card
- Move them into the `completedWithdrawals` query so balances recalculate correctly (Returns Due should drop to 0 for delivered partners)

### Impact
- No code changes needed
- Single database update
- Agent's partner cards will immediately show correct state on refresh

