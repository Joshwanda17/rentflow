

## Plan: Enforce UGX as Default Currency at Database and Application Levels

### What This Does
Adds an explicit `currency` column (defaulting to `'UGX'`) to the `wallets` and `general_ledger` tables, and ensures the frontend defaults to UGX on first load. This locks the system to UGX as the base currency while leaving a clean path for future multi-currency support.

---

### Step 1: Database Migration -- Add `currency` Column

A single migration adding:

```sql
ALTER TABLE wallets ADD COLUMN currency TEXT NOT NULL DEFAULT 'UGX';
ALTER TABLE general_ledger ADD COLUMN currency TEXT NOT NULL DEFAULT 'UGX';
```

All existing rows will automatically receive `'UGX'`. No data loss or disruption -- this is a non-breaking additive change.

### Step 2: Fix Inconsistent `formatUGX` Implementations

Two files have hardcoded `formatUGX` that bypass the dynamic currency system:

- **`src/lib/creditFeeCalculations.ts`** -- change to use `formatDynamic` (like `rentCalculations.ts` already does)
- **`src/lib/agentAdvanceCalculations.ts`** -- same fix

This ensures every `formatUGX()` call in the app goes through the dynamic currency formatter with UGX as base.

### Step 3: Ensure UGX Default in Currency Provider

In **`src/hooks/useCurrency.tsx`**, verify that the initial state defaults to `'UGX'` when no user preference is stored (it already uses UGX as rate=1 base, but we'll confirm the default selection is explicit).

### Step 4: Edge Functions -- Include `currency: 'UGX'` in Ledger Inserts

Update all edge functions that insert into `general_ledger` to explicitly pass `currency: 'UGX'`:

- `process-agent-advance-deductions/index.ts`
- `process-investment-interest/index.ts`
- `seed-test-funds/index.ts`
- Any other edge functions inserting into `general_ledger` or `wallets`

This is defensive -- the DB default handles it, but explicit is better than implicit per your strict rule.

### Step 5: Frontend Ledger Inserts

Search for all client-side `general_ledger` inserts and add `currency: 'UGX'` to each insert payload. Same defensive principle.

---

### Summary of Changes

| Area | Change |
|------|--------|
| Database | Add `currency TEXT NOT NULL DEFAULT 'UGX'` to `wallets` and `general_ledger` |
| `creditFeeCalculations.ts` | Use `formatDynamic` instead of hardcoded UGX string |
| `agentAdvanceCalculations.ts` | Use `formatDynamic` instead of hardcoded UGX string |
| Edge functions (3+) | Add explicit `currency: 'UGX'` to all ledger inserts |
| Client-side inserts | Add explicit `currency: 'UGX'` to all ledger inserts |

