## What's actually happening

The wallet card is correct. The cache is wrong.

For SSENKAALI PIUS (`0b109aad-212a-4fd0-ab03-3d7aee9cf397`):

- `wallets.withdrawable_balance` (cache) = **UGX 800,000**
- `get_user_available_balance` (strict ledger truth) = **UGX 650,000** ← what the card shows
- `wallets.balance` = 800,000 (also stale)

Per the **Wallet Withdrawable Strict Rule**, the card MUST show the lesser of cached and ledger-net. So the headline showing 650K is correct behavior.

### Why the ledger says 650K (post-anchor window)

A `wallet_fresh_start_anchors` row exists for this user at `2026-04-28 21:00 UTC`. All ledger entries since then on the wallet scope:

```
+800,000  system_balance_correction   Payroll: Salary for April   (12:19)
-800,000  wallet_deduction            CFO Wallet Retraction        (12:34)
+800,000  system_balance_correction   Payroll: Salary for April    (12:39)  (re-credited)
-150,000  wallet_deduction            CFO Debit — Overpayment Recovery (13:28)
─────────
 650,000  net
```

The **150,000 CFO "Overpayment Recovery"** debit at 13:28 today is the missing 150K. The card is honestly reflecting it; the cached 800K never got decremented because that wallet_deduction posted to the ledger but the wallet bucket sync didn't run (a known phantom-drift case — `apply_wallet_movement` is the sole writer, and the CFO debit path appears to have skipped it).

## Plan

### 1. Sync the cache to truth (one-shot data fix)

Run a one-time wallet bucket correction for this user so cache matches ledger:

```sql
UPDATE public.wallets
SET withdrawable_balance = 650000,
    balance              = 650000
WHERE user_id = '0b109aad-212a-4fd0-ab03-3d7aee9cf397';
```

Do this through the standard `apply_wallet_movement` path (not a raw UPDATE) so it respects the wallet write-lockdown trigger. If a direct correction is required, set the `wallet.sync_authorized=true` session flag for that single statement.

### 2. Investigate the CFO debit path that bypassed the bucket writer

The `wallet_deduction` ledger entry at 13:28 (description: `CFO Debit [🔁 Overpayment Recovery]: OVERPAYMENT`) posted to `general_ledger` but did not call `apply_wallet_movement`. This is a **phantom drift** — the same class of bug that triggered the strict-headline rule.

Audit the edge function / RPC behind "CFO Overpayment Recovery" and ensure every ledger leg it posts is paired with `apply_wallet_movement` so the cached buckets stay in sync. Add the user to `phantom_wallet_drift` review if not already flagged.

### 3. Confirm with the user

After the cache fix:
- The Partner Wallet card will show **UGX 650,000** (still 650K — because that IS the truth)
- The stale "800K" expectation goes away because the cache no longer disagrees

If the user believes the **150K overpayment recovery itself was wrong**, that's a separate CFO reversal — they need to reverse that debit (post a +150K correction) to legitimately get back to 800K. We won't do that automatically.

## Technical details

- Strict RPC: `get_user_available_balance` — already correct, no change needed
- Card source: `useAvailableBalance` → strict RPC — correct, no change
- Memory: matches `mem://architecture/wallet-baseline-anchor` and `mem://constraints/wallet-sole-writer`
- Root cause to fix: the CFO Overpayment Recovery handler must call `apply_wallet_movement` after posting the ledger leg
