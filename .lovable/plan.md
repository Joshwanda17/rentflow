

# Wallet Deduction: TUMWSIGYE ISAAC — UGX 75,000

## User Verified

| Field | Value |
|-------|-------|
| Name | TUMWSIGYE ISAAC |
| ID | 89787456-e4ec-4166-82eb-7b367e4ec353 |
| Balance | UGX 75,000 |
| Deduction | UGX 75,000 |
| New Balance | UGX 0 |

## Execution

Insert a `cash_out` ledger entry (category: `wallet_deduction_general_adjustment`, reason: "Money was paid out to user") which triggers `sync_wallet_from_ledger`. Record in `wallet_deductions` and `audit_logs`.

Same process as the previous 9 deductions — one direct database operation via psql.

