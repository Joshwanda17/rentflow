
The user is on `/cfo/dashboard` looking at the PlatformVsWalletSummary widget which shows ~35M UGX on "User Wallets". They're asking: is that 35M genuine?

Context from recovery: per-wallet drift is 0, so whatever is in `wallets` matches the ledger for real users. The 36.8M residual we documented is orphaned ledger history from 24 deleted users (no wallet rows). So the 35M displayed in `wallets` total IS genuine — it reflects actual reconciled balances of live users.

But I should verify with fresh queries, not just assume. Let me plan the verification.

# Plan: Verify the 35M Wallet Total is Genuine

## What I'll check

1. **Sum the wallets table directly** — `SELECT SUM(withdrawable_balance + float_balance) FROM wallets` and confirm it matches the ~35M shown.
2. **Cross-check against the ledger for real users only** — `SELECT SUM(cash_in - cash_out) FROM general_ledger WHERE ledger_scope='wallet' AND user_id IN (SELECT user_id FROM wallets)`. This must equal #1 exactly (per-wallet drift is already 0, so it will).
3. **Top 20 wallet holders** — list the largest balances with user role/name so you can eye-check that the money belongs to legitimate accounts (agents with float, supporters with returns, etc.).
4. **Bucket breakdown** — split the 35M into withdrawable vs float vs advance, so you see how much is "company money parked in agent floats" vs "real user-withdrawable funds".
5. **Recent activity sanity** — count wallets touched in the last 24h to confirm activity is post-recovery and matches credits-unfrozen state.

## What you'll get

A short report:
- Confirmed wallet total (should match the 35M shown)
- Ledger reconciliation: ✓ matches
- Bucket split: e.g. "X UGX withdrawable, Y UGX float, Z UGX advance"
- Top 20 holders with names/roles
- Verdict: **genuine** or **flag any anomaly**

This is read-only — no migrations, no data changes. Once approved I'll run the queries and give you the verdict in one response.
