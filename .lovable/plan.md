## Goal

When the CFO processes payroll, the system must detect each employee's outstanding advance (`wallets.advance_balance`) and recover only a configurable percentage of their gross salary toward that advance — never the entire salary. The employee always receives a take-home amount.

## Current behavior (problem)

- `PayrollPanel.tsx` adds employees with a flat `amount` and calls the `platform-expense-transfer` edge function with `action: 'process_payroll'`.
- The function simply credits each `payroll_items.amount` to the employee wallet via `create_ledger_transaction`.
- Outstanding `wallets.advance_balance` is ignored. The deposit-side auto-recovery (30% of incoming deposits) does not run on payroll because payroll posts directly to `wallet:cash_in`, not via the deposit pipeline. Result: either nothing is recovered, or downstream auto-recovery sweeps the entire deposit and leaves the employee with zero take-home.

## New behavior

For every payroll item where the employee has `advance_balance > 0`:

```text
gross         = payroll_items.amount
recovery_pct  = item.recovery_percent  (default = batch.default_recovery_percent, default 30%)
recovery_cap  = min(advance_balance, gross * recovery_pct / 100)
take_home     = gross - recovery_cap
```

- `take_home` is credited to the wallet (withdrawable bucket) exactly like today.
- `recovery_cap` is posted as an advance repayment: debits `wallets.advance_balance`, balanced by a platform leg categorized as `advance_repayment`.
- If `advance_balance == 0`, behave exactly like today (full salary credited).
- The CFO can override the percentage per-employee in the UI before processing.

## UI changes (CFO Payroll panel)

1. **Batch-level default recovery %** — small input on the batch card (default 30, range 0–100). Persisted in a new `payroll_batches.default_recovery_percent` column.
2. **Add Item dialog** — when entering an employee, after resolving the profile, fetch their `wallets.advance_balance`. If > 0, show:
   - Amber warning banner: "Outstanding advance: UGX X. System will deduct Y% (UGX Z) and pay take-home UGX W."
   - Editable `Recovery %` slider/input (0–100, default = batch default).
3. **Batch list rows** — per item, show three figures: `Gross`, `Advance Recovery`, `Take-home`, plus an "Advance" badge when applicable.
4. **Pre-process summary** — before the CFO clicks Play, the panel shows totals: `Total gross`, `Total recovery`, `Total cash-out` so the CFO sees exactly how much float leaves the platform vs. how much settles internal advances.

## Backend changes

### Schema migration

```sql
ALTER TABLE payroll_batches
  ADD COLUMN default_recovery_percent numeric NOT NULL DEFAULT 30
    CHECK (default_recovery_percent BETWEEN 0 AND 100);

ALTER TABLE payroll_items
  ADD COLUMN recovery_percent numeric CHECK (recovery_percent BETWEEN 0 AND 100),
  ADD COLUMN advance_balance_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN recovery_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN take_home_amount numeric NOT NULL DEFAULT 0;
```

`recovery_percent` is nullable so it falls back to the batch default at process-time.

### Edge function: `platform-expense-transfer` → `process_payroll`

For each pending item, before posting:

1. Read `wallets.advance_balance` (snapshot to `advance_balance_snapshot`).
2. Compute `recovery_pct` (item override → batch default → 30).
3. Compute `recovery = min(advance_balance, gross * recovery_pct / 100)` and `take_home = gross - recovery`.
4. Persist `recovery_amount`, `take_home_amount` on the item.
5. Post a single `create_ledger_transaction` call with up to 4 legs (kept double-entry, balanced):
   - `platform : cash_out : take_home` (category `system_balance_correction`)
   - `wallet   : cash_in  : take_home` (category `system_balance_correction`)
   - If `recovery > 0`:
     - `wallet   : cash_out : recovery` (category `advance_repayment`) — reduces `advance_balance` via existing wallet trigger
     - `platform : cash_in  : recovery` (category `advance_repayment`) — recoups company outflow
6. Audit log entry per processed item with `{ gross, recovery, take_home, recovery_pct }` so CFO Actions Log shows the deduction trail.

### Wallet trigger compatibility

The `apply_wallet_movement` sole-writer (per `mem://constraints/wallet-sole-writer`) already routes `advance_repayment` category to decrement `advance_balance`. We confirm the category is in the ledger allowlist; if not, the migration adds it to the allowlist enum used by `create_ledger_transaction` strict mode.

## Files to change

- `supabase/migrations/<timestamp>_payroll_advance_recovery.sql` — new columns + ensure `advance_repayment` is allowlisted.
- `supabase/functions/platform-expense-transfer/index.ts` — rewrite the `process_payroll` loop with the recovery math and 4-leg ledger post.
- `src/components/cfo/PayrollPanel.tsx` — batch default %, per-item recovery %, advance preview banner, take-home columns, pre-process summary strip.

## Out of scope

- Changing how advances are issued (still via existing `IssueAdvanceSheet` / `RecordAdvancePaymentDialog`).
- Changing the deposit-side 30% auto-recovery for non-payroll deposits.
- Multi-month amortization schedules — this round is single-paycheck percentage.
