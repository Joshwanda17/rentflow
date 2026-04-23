

# Back-Fill Phantom Wallet Balances into the Ledger by Inferred Category

## Goal
For every phantom wallet (UI balance > 0 but zero matching `general_ledger` entries), write a balanced double-entry `admin_correction` ledger transaction that **explains the balance** by inferred category. Wallet balances stay unchanged; the ledger now reconciles.

## Scope (live numbers)

| Inferred Category | Wallets | Total UGX |
|---|---:|---:|
| `agent_commission_earned` | 211 | 32,028,499 |
| `agent_float_deposit` | 5 | 4,491,300 |
| Mixed agent (split into both above) | 2 | 3,231,440 |
| `roi_wallet_credit` | 2 | 240,000 |
| `system_balance_correction` (orphan, no profile) | 1 | 24,680 |
| **Total** | **221** | **40,015,919** |

Inference rule (locked):
- Agent + `float_balance` > 0 → `agent_float_deposit` (float portion)
- Agent + `withdrawable_balance` > 0 → `agent_commission_earned` (withdrawable portion)
- Supporter → `roi_wallet_credit`
- Tenant / Landlord → `wallet_deposit`
- No profile / no role → `system_balance_correction`

Mixed agents get **two** entries (one per bucket) so the math stays exact.

## Mechanics

For each wallet, call `create_ledger_transaction` with:
- `classification = 'admin_correction'`
- `ledger_scope = 'wallet'`
- `category = <inferred>` (from allowlist in `LOCKED_CATEGORIES` ✓ all five are allowlisted)
- `description = 'Phantom balance back-fill: pre-ledger opening balance reconciliation'`
- `reference_id = 'PHANTOM-BACKFILL-' || wallet_id`
- `idempotency_key = 'phantom_backfill_v1_' || wallet_id || '_' || category` (prevents double-run)

**Balanced legs (cash_in == cash_out):**
```
Leg 1: account = 'wallet:<user_id>'                  direction = cash_in   amount = <bucket amount>
Leg 2: account = 'platform:opening_equity_adjustment' direction = cash_out  amount = <bucket amount>
```

This satisfies the double-entry rule, leaves wallet bucket numbers untouched, and tags the platform side as an opening-equity adjustment (never confused with real revenue/expense).

## Safety rails

1. **Dry-run first** — run as a `SELECT` simulation that lists every intended entry (wallet, user, name, bucket, category, amount) and totals, written to `/mnt/documents/phantom_backfill_preview.csv`. No writes.
2. **CFO confirm** — only after preview approval do we execute the migration.
3. **Idempotent** — re-running is a no-op due to `idempotency_key`.
4. **Orphan wallet** (`08d99a3e…`, no profile, 24,680 UGX) is included under `system_balance_correction` with `linked_party = 'orphan_wallet'` so it's flagged in audit.
5. **Audit log** — one `audit_logs` row per backfill batch with reason `"PHANTOM_BACKFILL_V1_RECONCILIATION_OF_221_WALLETS_TOTALING_40015919_UGX"`.
6. **Post-run verification** — after execution, re-run the original phantom query; expected result = 0 wallets, 0 UGX phantom.

## Files / actions

1. **Migration** `supabase/migrations/<ts>_phantom_wallet_backfill.sql`
   - Defines `phantom_backfill_v1()` PL/pgSQL function that loops through the 221 wallets and calls `create_ledger_transaction` per the rule above.
   - Calls the function once at the bottom of the migration (idempotent via key).
   - Writes one `audit_logs` row.

2. **Preview script** (run before migration via read_query): produces CSV with the exact rows that will be written.

3. **No app code changes.** Wallet balances are unchanged. Phantom Wallets dashboard (if/when built) would now show 0.

## What this does NOT do
- Does **not** move money or alter any wallet balance.
- Does **not** classify anything as fraud — every entry is `admin_correction` / opening equity.
- Does **not** touch the 488 existing `legacy_real` ledger entries.
- Does **not** delete the orphan wallet — only documents it in the ledger.

## Approval needed
On approval I will:
1. Generate the preview CSV first and share it.
2. Wait for your "go" before running the migration that writes the 223 entries (221 wallets + 2 mixed-agent split rows).

