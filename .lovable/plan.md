

# Fix Aleete Lilian's Data & Prevent Recurrence

## Data Repair (SQL updates via insert tool)

**User:** Aleete Lilian — `0f27c113-3e22-474c-99e5-7ccfe66859b7`

Two updates needed:

1. **Portfolio capital**: Update `investor_portfolios` where `portfolio_code = 'WIP2602283615'` — set `investment_amount` to **38,056,400** (was 32,547,000 + 5,509,400 top-up)

2. **Wallet balance**: Update `wallets` where `user_id = '0f27c113-3e22-474c-99e5-7ccfe66859b7'` — set `balance` to **1,000,000** (the 1,000,000 that was double-deducted)

3. **Audit log**: Insert an audit record documenting this manual correction for traceability.

## Prevention (Already Done)

The root cause — the `portfolio-topup` Edge Function performing a manual wallet deduction AND a ledger insert (causing double-deduction via the `sync_wallet_from_ledger` trigger) — was already fixed in the previous session. The function now:
- Relies solely on the ledger trigger for wallet deduction (Single-Writer Principle)
- Includes a post-ledger negative-balance check with automatic reversal

No additional code changes are needed. The fix applies to all future top-ups globally.

## Files to Edit
- **Database only** — two UPDATE statements and one INSERT (audit log)
- No code file changes required

