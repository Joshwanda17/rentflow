

# Fix: Reconciliation Panel Shows 0 Users (Missing RPC)

## Root Cause

The **Wallet vs Ledger Reconciliation** panel calls `get_wallet_reconciliation` RPC — but that function **does not exist** in the database. The call silently fails (or returns null), so the panel renders "0 users, All Balanced."

Meanwhile, the **Ledger Integrity** widget uses `get_ledger_integrity_checks`, which correctly finds **4 users with wallet/ledger drift**.

### The 4 Drifted Users
| User ID | Wallet | Ledger | Drift |
|---------|--------|--------|-------|
| 9f1b35… | 1,100,000 | 0 | +1.1M |
| 6b7d9e… | 600,000 | 0 | +600K |
| 27d5a0… | 75,000 | 0 | +75K |
| bd266f… | 0 | 5,000 | -5K |

## Fix — Two Steps

### 1. Create the Missing `get_wallet_reconciliation` RPC (Migration)

```sql
CREATE OR REPLACE FUNCTION public.get_wallet_reconciliation()
RETURNS TABLE(
  user_id uuid,
  user_name text,
  wallet_balance numeric,
  ledger_balance numeric,
  discrepancy numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.user_id,
    COALESCE(p.full_name, 'Unknown') AS user_name,
    w.balance AS wallet_balance,
    COALESCE(lb.ledger_balance, 0) AS ledger_balance,
    ROUND((w.balance - COALESCE(lb.ledger_balance, 0))::numeric, 2) AS discrepancy
  FROM wallets w
  LEFT JOIN profiles p ON p.id = w.user_id
  LEFT JOIN (
    SELECT gl.user_id,
           SUM(CASE WHEN gl.direction = 'cash_in' THEN gl.amount ELSE 0 END)
           - SUM(CASE WHEN gl.direction = 'cash_out' THEN gl.amount ELSE 0 END) AS ledger_balance
    FROM general_ledger gl
    WHERE gl.ledger_scope = 'wallet' AND gl.user_id IS NOT NULL
    GROUP BY gl.user_id
  ) lb ON lb.user_id = w.user_id
  ORDER BY ABS(w.balance - COALESCE(lb.ledger_balance, 0)) DESC;
$$;
```

This returns all wallets with their ledger-computed balance and discrepancy, joined to profile names. The reconciliation panel's existing code already expects exactly these columns (`user_id`, `user_name`, `wallet_balance`, `ledger_balance`, `discrepancy`).

### 2. No Code Changes Needed

The `CFOReconciliationPanel.tsx` already correctly:
- Calls `get_wallet_reconciliation`
- Maps the result to `ReconciliationRow`
- Filters by matched/mismatched
- Shows summary stats (Total Users, Matched, Mismatched, Total Gap)

Once the RPC exists, the panel will immediately show all users and highlight the 4 with drift.

## Impact
- Reconciliation panel will show real data instead of "0 users"
- Both panels (Reconciliation + Ledger Integrity) will agree on drift count
- No UI code changes required

