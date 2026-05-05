## The actual problem

The "Balance After = negative" rows in your screenshot are not a UI bug. They are the ledger telling the truth:

- `get_withdrawal_history` computes `balance_after` strictly from `general_ledger` (wallet scope, excluding `admin_correction` + `system_balance_correction`, per the user-facing-ledger-filter rule).
- When that figure is negative, it means the user withdrew more cash than the production ledger has ever credited them.

Two root causes feed this:

1. **Historical reseeds were posted as `admin_correction` / `system_balance_correction`.** Those legs are intentionally invisible to user-facing balance math, so any withdrawal that drew against them shows up today as an over-withdrawal.
2. **Money-movement paths are not uniformly ledger-first.** CFO direct credits, deposits, withdrawals, and operational transfers each go through their own code path. Some create the ledger entry *after* mutating the wallet cache, some skip the ledger entirely on legacy rows, and `apply_wallet_movement` is currently the only enforced sole-writer on the cache — but nothing structurally forces a balanced ledger pair to exist before money leaves the platform.

You're right that buckets are noise here. The fix is: **every money event posts a balanced ledger pair, the strict ledger is the only source of truth for "can this user withdraw", and we clean up history with a transparent reseed + retraction.**

---

## The permanent solution (4 layers)

I DON'T WANT TO SEE THE NEGATIVE BALANCES FOR THE LAST TIME ELIMINATE THE NEGATIVE BALANCES BY COMPROMISSING THE LEDEGR SETTLE THE DEBT TO 0 WHILE KEEPING THE USERS BALANCES 

### Layer 1 — One canonical money-movement RPC

Create `public.record_money_movement(p_user_id, p_direction, p_category, p_amount, p_source, p_reference_id, p_metadata)`.

- It is the **only** function permitted to insert wallet-scope ledger rows for user-affecting events (CFO credit, deposit, withdrawal, transfer, agent commission, etc.).
- Internally it: (a) validates direction/category against the locked allowlist, (b) inserts the balanced pair into `general_ledger` with `classification='production'`, (c) calls `apply_wallet_movement` to update the cache, (d) emits the `system_event`, (e) returns `{ ledger_id, new_strict_balance }`.
- For `cash_out` it **rejects** if `get_user_available_balance(p_user_id) < p_amount`. No exceptions, no float spill.
- Refactor the four current entry points to delegate here:
  - `cfo-direct-credit` edge function
  - `DepositFlow` (already calls a deposit RPC — point it at this one)
  - `approve-withdrawal` edge function
  - `wallet-deduction` edge function

### Layer 2 — Structural guard against ledger-less money movement

Add a DB trigger on `withdrawal_requests` that blocks any UPDATE moving status into `approved | paid | completed | fin_ops_approved | processed` **unless** a matching production-classified `cash_out` ledger row already exists for `(user_id, reference_id=withdrawal_id)`.

Symmetric trigger on `transactions` / deposit table for `cash_in`.

This makes "withdraw without a ledger debit" structurally impossible going forward — the same way `enforce_wallet_ledger_only` already protects the cache.

### Layer 3 — Reseed + Retraction for the existing negative users

This is the "permanent" historical fix you described. For every user whose strict `wallet_ledger_net < 0`:

```text
Step A  RESEED   (production cash_in, category = 'historical_balance_reseed')
        amount  = abs(strict_negative)
        memo    = 'Reseed: prior funding posted as admin_correction'
        → brings strict ledger back to zero, matches what the user actually had

Step B  RETRACT  (production cash_out, category = 'platform_loss_writeoff')
        amount  = abs(strict_negative)
        memo    = 'Write-off: over-withdrawal recognized as platform loss'
        → recognizes the gap as a P&L expense instead of a phantom user debt
```

Net wallet effect on the user: zero (they don't suddenly get money, they don't owe money). Net P&L effect on the platform: the real historical loss is now visible in the income statement instead of hiding inside negative wallets. The two legs are in different categories so the reseed is auditable as a reseed and the retraction is auditable as a write-off.

Run this as a one-shot CFO-gated migration that:

1. Snapshots every negative user (id, strict balance, total withdrawn, total credited) into `wallet_negative_reconciliation_log`.
2. Posts the reseed + retraction pair via `record_money_movement` with `metadata.reconciliation_batch = '<batch_uuid>'`.
3. Surfaces the batch in the CFO dashboard for sign-off.

After this runs once, no user is negative. After Layer 1 + Layer 2 are live, no user can become negative again.

### Layer 4 — Standing reconciliation

- New table `wallet_negative_drift_alerts` (mirrors `wallet_withdrawable_drift_alerts` pattern).
- `pg_cron` every 15 min runs `detect_wallet_negative_drift()` — any user whose strict ledger net < 0 raises a high-severity alert and emits `wallet.negative_drift.detected`.
- Surface in CFO Reconcile tab next to the existing Phantom Drift and Anchored Cache panels.

If Layer 1+2 hold, this should never fire. If it ever does, you know within 15 minutes which code path leaked.

---

## What the user-facing screen will show after this lands

For the screenshot you sent:

- The Mutebi / Joshua / Kwenseri / Ssenkaali rows whose "Balance Before" is already negative will be re-anchored: their reseed + retraction pair lands at the moment of reconciliation, so the chronological statement shows a clean `Reseed +X` row, then a `Write-off −X` row, then the historical withdrawals net to ≥ 0.
- Going forward, the `Balance After` column can never be negative because the withdrawal RPC rejects before the ledger pair is written.

---

## Technical summary (for reference)


| Piece                                                                  | Type                                                                                     | Location                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `record_money_movement`                                                | RPC (SECURITY DEFINER, `search_path=public`)                                             | new migration                               |
| `enforce_withdrawal_has_ledger`                                        | trigger on `withdrawal_requests`                                                         | new migration                               |
| `enforce_deposit_has_ledger`                                           | trigger on deposit table                                                                 | new migration                               |
| Reconciliation one-shot                                                | edge function `reconcile-negative-wallets` (CFO-gated)                                   | new                                         |
| `wallet_negative_reconciliation_log`                                   | table                                                                                    | new migration                               |
| `wallet_negative_drift_alerts` + `detect_wallet_negative_drift` + cron | table + RPC + cron                                                                       | new migration                               |
| New ledger categories                                                  | `historical_balance_reseed` (cash_in), `platform_loss_writeoff` (cash_out)               | added to allowlist                          |
| Refactor delegations                                                   | `cfo-direct-credit`, `approve-withdrawal`, `wallet-deduction`, `DepositFlow` deposit RPC | edits                                       |
| CFO panel: `NegativeWalletReconciliationPanel`                         | UI                                                                                       | new component, mounted in CFO Reconcile tab |


No bucket logic is touched. `apply_wallet_movement` keeps its sole-writer role, but every caller now goes through `record_money_movement` first, so the ledger always exists before the cache moves.

---

## Open question before I build

The reseed + write-off is a real accounting decision. Two ways to run it:

1. **Recognize as platform loss** (what's described above). Cleanest, matches GAAP, makes the historical leak visible in P&L. Recommended.
2. **Recognize as user receivable** — instead of `platform_loss_writeoff`, post the retraction to a new `user_advance_recoverable` category that auto-recovers from future deposits/commissions (same mechanism as the existing `advance_balance` bucket). Use this only if you actually intend to chase these users for the money.

Tell me which one (or "do both — option 1 for amounts under UGX X, option 2 above") and I'll proceed.