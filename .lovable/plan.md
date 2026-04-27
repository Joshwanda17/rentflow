## What happened to LUKODDA JOSEPH's 1,500,000

The "approved" ROI payout exists in the ledger but **never landed in any wallet bucket**.

**Trace:**
- 2026-04-27 10:17:59 UTC — `approve-wallet-operation` processed a managed ROI payout.
  - Partner: WAKABI SIMON PETER (`e145f9f8-…`), portfolio `9b0c5216-…` (UGX 10,000,000 active).
  - Routed via "PAY TO WALLET" to LUKODDA JOSEPH's proxy-agent wallet (`b4d7c324-…`).
  - Reference: `PAY-MOGVHQ88-FWCE`. Amount: 1,500,000.
- Ledger rows written (balanced double-entry, scope=`wallet`):
  - cash_in 1,500,000, category `roi_wallet_credit`, **`account = NULL`**, `wallet_id = 24562f3b-…`
  - cash_out 1,500,000, category `roi_expense` (platform contra)
- Wallet bucket update: **never happened**. Per platform rules, only `apply_wallet_movement` may write `withdrawable / float / advance` buckets, and it requires a non-null `account` to know which bucket to credit. With `account=NULL`, the router has no target — the credit is logged but vanishes.
- Side effects:
  - `investor_portfolios.total_roi_earned` for portfolio `9b0c5216` is still **0** (payout never recorded against the portfolio).
  - `next_roi_date` was advanced to 2026-05-27 even though the money was never delivered.
  - `wallet_unrouted_movements` is empty, so this also bypassed the safety net.

This is a systemic bug, not a one-off. Any "Pay to Wallet" managed payout where the operator did not explicitly pick a target bucket is at risk.

## Fix plan

### 1. Recover the 1,500,000 for LUKODDA JOSEPH (one-off migration)

Credit Lukodda's `withdrawable_balance` by 1,500,000 via the sanctioned writer, with a clear audit trail:

- Call `apply_wallet_movement` (the sole authorized wallet writer) with:
  - user_id = `b4d7c324-…`, amount = 1,500,000, direction = `cash_in`, account = `withdrawable`
  - category = `roi_wallet_credit`, reference_id = `RECOVERY-PAY-MOGVHQ88-FWCE`
  - description: "Recovery: 1,500,000 ROI payout for portfolio 9b0c5216 (PAY-MOGVHQ88-FWCE) — original credit landed in ledger but was never routed to a wallet bucket."
- Update `investor_portfolios.total_roi_earned` for `9b0c5216-…` += 1,500,000.
- Insert an audit_log entry tagging the original ledger transaction_group `f2513a95-…`.
- Verify wallet movement: balance should rise from 109,456,062 → 110,956,062.

### 2. Patch `approve-wallet-operation` so future managed payouts cannot lose money

In `supabase/functions/approve-wallet-operation/index.ts` (around line 162):

- **Default the bucket**: when `op.account` is NULL for any wallet-credit category (`roi_payout`, `supporter_platform_rewards`, `agent_commission_payout`, `agent_requisition`, `salary_payment`, `employee_advance`, `platform_expense_disbursement`), default `account = 'withdrawable'` before writing the ledger entry.
- **Hard-fail safety**: after `create_ledger_transaction` returns, re-read the wallet snapshot. If the bucket delta does not match the credit, mark the operation as `failed`, raise a 500, and surface the error to the operator (no silent success).
- **Record the bucket on the pending op** for traceability: stamp the resolved `account` into `pending_wallet_operations.metadata`.

### 3. Backfill scan for other lost credits

Run a one-off audit script:
- For every `general_ledger` row where `ledger_scope='wallet'`, `direction='cash_in'`, `account IS NULL`, and `wallet_id IS NOT NULL`:
  - Cross-check whether the wallet's running bucket sum reflects the credit.
  - For each confirmed gap, recover via `apply_wallet_movement` with reference `RECOVERY-<original-ref>` and patch the related portfolio's `total_roi_earned` if applicable.
- Report results to the operator (count of gaps, total recovered, list of affected partners).

### Out of scope
- No change to `next_roi_date` advancement logic — it correctly advanced for portfolio `9b0c5216` since the payout is now being honored via recovery.
- No UI change in COO/Partner Operations — only backend correctness.

## Technical details

- Edge function file to patch: `supabase/functions/approve-wallet-operation/index.ts` lines ~140–210.
- Sole wallet writer (per platform constitution): `apply_wallet_movement` RPC.
- Tables touched by recovery: `wallets` (via RPC), `investor_portfolios`, `audit_log`, and the resulting `general_ledger` recovery rows.
- All recovery ledger rows will use `classification='production'` and a distinct `reference_id` prefixed `RECOVERY-` so the CFO Reconciliation dashboard can audit them.
