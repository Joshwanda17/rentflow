
# Reconcile LUKODDA JOSEPH's Wallet & Fix CFO Retraction Bug

## The Problem

Joseph's wallet shows **UGX 110,656,062** but his real ledger net is only **UGX 1,200,000**. The platform's own phantom-drift detector flagged this as **CRITICAL** at 10:45 today with a positive phantom drift of **UGX 109,456,062**.

### Root cause

In `supabase/functions/cfo-direct-credit/index.ts` (the function that powers CFO wallet retractions), the **balancing leg** of every retraction is booked against the **CFO operator's own `user_id`** (line 246: `user_id: userId`).

Because Joseph has CFO/Financial-Ops access, every time **he** clicked "Retract" on another user's wallet (Katongole 10M, Sanyu 6.65M, Lolem 2M, his own 42.5M, etc. — 19 entries totalling ~75.8M), a `cash_in` ledger row was written against his user_id. Although the entry is tagged `ledger_scope='platform'` (which should make it invisible to the wallet sync), the wallet trigger picked it up anyway, inflating Joseph's wallet balance.

Other contributors to the drift: 3× duplicate MTN deposits today (already partially reversed), and stale `agent_commission_earned` / older inflows.

## What This Plan Does

### Part 1 — Immediate reconciliation (one-shot SQL, fully audited)

Force-correct Joseph's wallet from 110.6M → 1.2M via a single controlled `apply_wallet_movement` debit:

```text
Debit: 109,456,062 UGX
  ├─ Withdrawable bucket: 109,156,062 → 0
  └─ Float bucket:           300,000 → 1,200,000  (keeps remaining 1.2M ledger-true balance)
Category: phantom_drift_resolution
Reference: PHANTOM-RECONCILE-LJ-2026-04-27
```

- Records a balancing `cash_out` ledger entry on Joseph (`ledger_scope='wallet'`)
- Records a `cash_in` settlement entry on a dedicated platform suspense user (NOT Joseph) tagged `ledger_scope='platform'`
- Marks the open `phantom_wallet_drift` row as `resolved` with notes
- Writes an `audit_logs` entry tagged `action_type='phantom_drift_reconciliation'` with the full before/after snapshot

### Part 2 — Root-cause patch (CFO retraction edge function)

Fix `supabase/functions/cfo-direct-credit/index.ts` so the platform-leg never lands on a real user's wallet:

1. **Resolve a dedicated platform suspense user_id** (a system account, not a CFO operator). If none exists, create a deterministic system profile (`platform_suspense@welile.system`) on first run and cache its id in a constant.
2. Replace both `user_id: userId` lines in the debit branch (currently lines 246 and 273) and the equivalent line in the credit branch with `user_id: PLATFORM_SUSPENSE_USER_ID`.
3. Add a hard guard at the top of the function: if `target_user_id === userId`, reject with 400 — a CFO must not retract from their own wallet through this tool (use a separate self-correction flow).

### Part 3 — Defensive DB trigger (prevents recurrence platform-wide)

Add an `enforce_platform_leg_isolation` constraint on `general_ledger`:

- Any row where `ledger_scope='platform'` AND `source_table='cfo_direct_credit'` MUST have `user_id = PLATFORM_SUSPENSE_USER_ID`. Otherwise raise an exception.
- This makes future regressions impossible regardless of which edge function tries to write the entry.

## Detailed Reconciliation Math (for audit)

```text
Joseph's current wallet:    110,656,062
  withdrawable:             109,156,062
  float:                      1,500,000

True ledger net (scope=wallet, dir-aware):   1,200,000
Phantom drift to remove:                   109,456,062

Post-fix wallet:                             1,200,000
  withdrawable:                                      0
  float:                                     1,200,000
```

The 1.2M kept matches today's legitimate residual after his portfolio top-ups, the 1.5M ROI recovery applied yesterday, and the 4M deposit approved at 11:07 by Joshua Wanda.

## Files Changed

- `supabase/functions/cfo-direct-credit/index.ts` — replace operator user_id with platform suspense user_id, add self-retraction guard
- New migration — create `platform_suspense` system user (idempotent), add `enforce_platform_leg_isolation` trigger
- One-time data migration via `insert` tool — `apply_wallet_movement` debit + `phantom_wallet_drift` resolution + `audit_logs` entry

## Out of Scope (separate follow-up if you want)

- Sweeping the other 18 CFO retractions to check whether their balancing leg also drifted into other operators' wallets. The trigger in Part 3 will surface this on the next phantom-drift run for any victim accounts.
- Reviewing the `agent_commission_earned` 74M figure on Joseph (legitimate but worth a sanity check separately).
