
The user has effectively approved my earlier fix plan but tightened it into a production-safe recovery procedure. They want:

1. **Freeze first** (withdrawals + credits + trigger)
2. **Router with hard fail** on unknown categories (defensive)
3. **Backup wallets table** before recompute
4. **Full recompute** from ledger for all 5,921 wallets
5. **Verification queries** (invariant + ledger-vs-wallet + outlier)
6. **Phantom withdrawal recovery** — convert any already-withdrawn excess into `advance_balance`
7. **User communication** plan
8. **Long-term ledger integrity guard**

I'll present this as the execution plan they're approving me to run.

# Recovery Plan: Wallet Bucket Reconciliation (Production-Safe)

Six phases, executed strictly in order. Each phase is reversible until the next begins.

## Phase 0 — Freeze (immediate, ~30 sec)

One migration that:
- Disables `general_ledger_route_buckets` trigger (stops the live bug)
- Sets `treasury_controls.withdrawals_paused = true`
- Sets `treasury_controls.credits_paused = true` (new flag, gated in `apply-credit` / `wallet-transfer` / `approve-deposit` / CFO transfer functions)
- Logs a `system_events` row: `wallet.recovery.frozen`

Withdrawals and inbound credits return a clean error: *"Wallet operations temporarily paused for reconciliation. Please try again shortly."*

## Phase 1 — Backup (5 sec)

```sql
CREATE TABLE wallet_backup_2026_04_17 AS
SELECT *, now() AS snapshot_at FROM wallets;
```

This is the rollback safety net. Kept for 90 days.

## Phase 2 — Defensive Router (one migration)

Rewrite `wallet_route_for_category` to:
- Map every legacy category found in `general_ledger` (the ~30 categories from the investigation: `deposit`, `wallet_deduction`, `wallet_deduction_general_adjustment`, `wallet_deduction_cash_payout_retraction`, `system_balance_correction`, `test_funds_cleanup`, `roi_wallet_credit`, `pending_portfolio_topup`, `agent_proxy_investment`, `coo_proxy_investment`, `supporter_rent_fund`, `partner_funding`, `roi_expense`, `roi_reinvestment`, `agent_repayment`, `rent_payment_for_tenant`, `rent_obligation`, `rent_float_funding`, `proxy_partner_withdrawal`, `pool_capital_received`, `balance_correction`, `reconciliation`, `coo_proxy_investment_reversal`, etc.)
- **Hard-fail on anything unknown** with `RAISE EXCEPTION 'UNSUPPORTED_LEDGER_CATEGORY: %', p_category` — this kills the silent-skip class of bug forever.

## Phase 3 — Full Recompute (loop, ~2 min for 5,921 wallets)

Re-enable trigger, then:
```sql
DO $$ DECLARE r record; BEGIN
  PERFORM set_config('wallet.sync_authorized', 'true', true);
  FOR r IN SELECT user_id FROM wallets LOOP
    PERFORM recompute_wallet_buckets(r.user_id);
  END LOOP;
END $$;
```

## Phase 4 — Verification (read-only)

Three queries, results saved to `/mnt/documents/reconciliation_report_2026_04_17.csv`:

1. **Per-user ledger-vs-wallet diff** — flags any wallet where `withdrawable + float ≠ Σ(credits − debits)` per bucket.
2. **Outlier scan** — top 50 balances by `withdrawable_balance` for manual eye-check.
3. **Net-negative ledger users** — those whose ledger sum is negative but were credited anyway (the phantom-withdrawal cohort).

If any per-user diff is non-zero, abort and restore from `wallet_backup_2026_04_17`.

## Phase 5 — Phantom Withdrawal Recovery

Compute per-user excess withdrawn:
```text
excess = max(0, total_withdrawn - true_credits_at_time_of_withdrawal)
```

For each affected user:
- Insert `agent_advance_credit` ledger entry of `excess` (recorded as a recoverable advance, not a write-off)
- This bumps `advance_balance` and offsets future salary/commission/CFO credits automatically (existing auto-recovery logic handles repayment)
- Audit log entry per user with the excess amount and source ledger IDs

Generates `/mnt/documents/phantom_withdrawals_2026_04_17.csv` for CFO review.

## Phase 6 — Unfreeze + Communicate

- Flip `withdrawals_paused = false`, `credits_paused = false`
- Emit `system_events`: `wallet.recovery.complete`
- In-app banner (added to `WalletPage` and `AgentDashboard` for 7 days):
  > *"Your wallet balance has been corrected to match your transaction history. Past activity remains unchanged."*
- No SMS blast (avoids alarming the 5,668 unaffected users)

## Long-Term Guard (added in same release)

New nightly cron `audit-wallet-ledger-integrity`:
```sql
SELECT user_id FROM wallets w
WHERE (withdrawable_balance + float_balance) <>
      (SELECT COALESCE(SUM(CASE WHEN direction='cash_in' THEN amount ELSE -amount END), 0)
       FROM general_ledger WHERE user_id = w.user_id AND ledger_scope='wallet');
```
Any mismatch fires a Slack alert via `system_events` → `app/wallet.integrity.violation` Inngest handler.

---

## Files / migrations to be created

1. **Migration A** — Freeze (trigger disable + treasury flags)
2. **Migration B** — Backup table
3. **Migration C** — Hard-fail router rewrite
4. **Migration D** — Recompute loop
5. **Migration E** — Phantom-advance inserts (data, generated from Phase 4 results)
6. **Migration F** — Unfreeze + nightly integrity cron
7. **Edge functions** — gate `apply-credit`, `wallet-transfer`, `approve-deposit`, `approve-withdrawal`, CFO direct credit on `credits_paused` / `withdrawals_paused`
8. **UI** — recovery banner component on wallet/agent pages
9. **Memory** — extend `mem://business-model/wallet-three-bucket-model` with the legacy-category map and the hard-fail invariant

## Estimated runtime

~3 minutes total DB work, ~5 minutes code/UI changes. Wallet operations frozen the entire time.

## Rollback

At any point before Phase 6: `TRUNCATE wallets; INSERT INTO wallets SELECT [original cols] FROM wallet_backup_2026_04_17;` then re-disable the trigger.
