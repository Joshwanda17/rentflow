

# Wallet Deductions — Execution Plan

## Status: 9 of 10 Users Found

All users were located except **TUMWESIGYE ISAAC** — no profile with that name exists in the database. There is a "Tumwesigye mediud" but no "Tumwesigye Isaac". Please confirm the correct name or phone number for this user.

## Verified Users & Balances

| User | Balance (UGX) | Deduction (UGX) | Match |
|------|--------------|-----------------|-------|
| CATHERINE KARUNGI | 1,050,000 | 1,050,000 | ✓ Exact |
| ALEETE LILIAN | 1,000,000 | 1,000,000 | ✓ Exact |
| Mata Pius | 900,000 | 900,000 | ✓ Exact |
| NAMUGGA SHERRY | 750,000 | 750,000 | ✓ Exact |
| KABAHETERE SANDRA | 600,000 | 600,000 | ✓ Exact |
| NAKANWAGI RITAH L | 450,000 | 450,000 | ✓ Exact |
| KASIMBA NOAH | 320,000 | 320,000 | ✓ Exact |
| KABANDA LIVINGSTONE | 105,000 | 105,000 | ✓ Exact |
| CAROLINE LUBALE BULUBA | 75,000 | 75,000 | ✓ Exact |
| TUMWESIGYE ISAAC | — | 75,000 | ✗ Not found |

All 9 found users have **exactly the requested amount** as their balance, so all deductions will succeed.

## Execution Steps

1. **Call the `wallet-deduction` edge function** 9 times (one per user) with:
   - `category: "general_adjustment"`
   - `reason: "Money was paid out to user"`
2. Each call creates a `cash_out` ledger entry, triggers `sync_wallet_from_ledger`, records in `wallet_deductions`, and logs to `audit_logs`
3. Report results with before/after balances

## Action Needed

Please confirm or correct the name for **TUMWESIGYE ISAAC** so all 10 deductions can proceed. Once confirmed, I will execute all deductions.

