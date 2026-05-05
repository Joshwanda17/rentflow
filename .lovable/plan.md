# Fix Atuhaire Carolyne's missing 25M + repair `cfo-direct-credit`

## Root cause

`v_user_wallet_strict` (and every user-facing wallet view) filters out
`category = 'system_balance_correction'` per the `user-facing-ledger-filter`
constitutional rule. The `cfo-direct-credit` edge function is posting the
**wallet leg** of CFO direct credits under `system_balance_correction`, paired
with a `general_admin_expense` cash_out on the platform side. Result: the
−25M leg shows in the user's ledger view, the +25M leg is filtered out, and
strict withdrawable nets to 0 — even though the cached `wallets.balance`
correctly shows 25M.

This affected at least three credits to Atuhaire today:
- 11:15  +25,000,000  "FOR SHARE HOLDING"
- 10:59     +500,000  "test funds"
- 10:53   +1,000,000  "TEST FUNDS"
Total invisible-to-user: **26,500,000 UGX**

Same bug has been silently affecting every CFO direct credit since the rule
was tightened.

## Step 1 — Repair Atuhaire's three credits (user `ae194750-4827-47e8-839e-5e772565138b`)

For each of the 3 credits above, post a **balanced reclassification pair**
under `classification='admin_correction'` via `create_ledger_transaction`:

```text
Leg A (user side):    +amount, category='wallet_deposit',       direction='cash_in'
Leg B (platform):     +amount, category='operational_expense',  direction='cash_out'
                                                                    (or matching expense)
```

Then mirror-cancel the original `system_balance_correction` legs so the
strict view balances. Net effect on strict withdrawable: **+26,500,000**.
Cached `wallets.balance` is unchanged (still 25M) — but we will reseed it to
match the new strict figure to avoid permanent drift.

Reason field (mandatory, ≥10 chars): `"CFO direct credit visibility fix — restore SHAREHOLDING + test funds"`.

Audit log: `action_type='cfo_credit_visibility_repair'`, `table_name='general_ledger'`, `record_id=<user_id>`.

## Step 2 — Fix `supabase/functions/cfo-direct-credit/index.ts`

Change the wallet-leg category from `system_balance_correction` to
`wallet_deposit` (which is on the user-visible allowlist). Keep the
platform-side leg as the appropriate operational expense category that the
CFO selects in the UI. Both legs stay `classification='production'`.

After the change, future CFO direct credits will:
- show up in the user's strict ledger view immediately
- still pass the ledger category allowlist
- still keep the cache and strict ledger in sync

## Step 3 — Sweep historical impact (read-only report first)

Run a read-only query to find every other user with at least one
`cfo-direct-credit`-shaped pair (`category='system_balance_correction'`
cash_in paired with a `general_admin_expense` cash_out on the same
`transaction_id`, classification='production', since the bug was
introduced). Surface the list in a CFO panel for review — do **not**
auto-repair until the CFO approves the list, since some of those rows may
be legitimate admin corrections.

## Out of scope for this turn

- The big `wallet_deduction_general_adjustment` debits (154.4M, 152.2M) and
  the `historical_balance_reseed` (135.4M) on this same user are pre-existing
  and will be reviewed separately if the user wants.
- The two duplicate "ATUHAIRE CAROLYNE" profiles (`522ee29a…` 1M cached,
  `7e506ac9…` 0) are not the active account and need a separate dedupe
  decision.
