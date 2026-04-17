
The user wants to know if any **funder (supporter)** wallets were affected by the maintenance/recovery work. The recovery touched:
1. Re-scoping of 25 legacy NULL-user platform contra-legs (no user wallets touched)
2. Float backfill for 6 agents (3.18M UGX) — agent wallets only
3. Per-wallet drift verification — already showed 0 drift across all wallets

But the user specifically wants funders confirmed clean. I should run targeted read-only checks.

# Plan: Audit Funder (Supporter) Wallets Post-Maintenance

## What I'll check (all read-only)

1. **Identify all funders** — `SELECT user_id FROM user_roles WHERE role='supporter'`.
2. **Per-funder drift check** — for each funder, compare:
   - `wallets.withdrawable_balance + float_balance + advance_balance`
   - vs `SUM(cash_in - cash_out)` from `general_ledger WHERE ledger_scope='wallet' AND user_id=funder`
   - Flag any non-zero drift.
3. **Cross-check investor_portfolios** — sum each funder's `investment_amount` for active portfolios and confirm it ties to their ledger principal entries (`pool_capital_received` / portfolio creation legs).
4. **Maintenance window touch-check** — any funder rows in `general_ledger` with `created_at` between 2026-04-09 14:41–14:43 (recovery window) or referenced by the `ledger_rescope` audit log? Expected: zero, since the rescope only touched user_id IS NULL rows.
5. **Float backfill collateral check** — confirm none of the 6 agents who got float restored were also tagged as supporters (would be unusual but worth verifying).
6. **Recent funder activity sanity** — count funder wallets updated in the last 24h to confirm normal post-unfreeze activity.

## What you'll get

A short report:
- Total funders audited: N
- Funders with drift: 0 expected (confirms ledger == buckets)
- Funders touched by maintenance window: 0 expected
- Portfolio-vs-ledger reconciliation: pass/fail per funder, with specifics if any fail
- **Verdict**: "All funder wallets clean — no funder was affected by maintenance" or a flagged list with exact UGX amounts and user IDs

No data changes. If anything is flagged, I'll come back with a targeted correction plan using `create_ledger_transaction` (never direct wallet writes), same pattern as the agent float backfill.
