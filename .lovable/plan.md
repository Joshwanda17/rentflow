
## Goal
Replace the fragile "float vs commission" derivation with a clean, explicit 3-bucket wallet model: **withdrawable**, **float**, and **advance (liability)**. Make withdrawals depend ONLY on `withdrawable_balance`, and auto-recover advances from incoming salary/commission.

## Current state (key findings)
- `wallets.balance` is a single cached number; segmentation is *derived* in `get_agent_split_balances` RPC and `fetchAgentWalletData.ts` by classifying ledger categories.
- This caused the recurring `INSUFFICIENT_WITHDRAWABLE` bug for Joshua Wanda — direct `wallet_transfer` from CFO was incorrectly bucketed because the derivation logic disagreed with the wallet cache.
- `agent_advance_credit` exists as a category, but advance liabilities are not tracked as a wallet bucket — only via `agent_advances` table and ad-hoc deductions.
- Agent UI (`AgentFloatBalanceCard`) leads with commission and shows float as "locked" — concept is right, but data is wrong because of derivation.

## New model
Add explicit columns on `wallets`:
- `withdrawable_balance` numeric (user-owned cash, the ONLY pool a withdrawal can draw from)
- `float_balance` numeric (company operational money, never withdrawable)
- `advance_balance` numeric (liability — money owed back to the platform)

Keep `balance` as a computed mirror = `withdrawable + float` (for backward compatibility with existing UI that reads `wallet.balance`). Advance is a liability and is NOT added to `balance`.

## Routing rules (single source of truth)
Implemented inside the ledger trigger / a new RPC `apply_wallet_movement(user_id, category, amount, direction)`:

| Category | Routing |
|---|---|
| `wallet_deposit` (salary/top-up by user), `wallet_transfer` in (CFO transfer), `cfo_direct_credit` | 100% → withdrawable, then auto-recover advance |
| `agent_commission_earned`, `partner_commission`, `referral_bonus`, `proxy_investment_commission` | 100% → withdrawable, then auto-recover advance |
| `agent_float_deposit`, `agent_float_assignment` | 100% → float |
| `agent_advance_credit` | +amount → withdrawable AND +amount → advance_balance |
| `wallet_withdrawal`, `agent_commission_withdrawal` | −amount from withdrawable (reject if insufficient) |
| `agent_float_used_for_rent`, `rent_disbursement` (agent-funded) | −amount from float |
| `agent_commission_used_for_rent` | −amount from withdrawable |
| `debt_recovery` / advance repayment | −amount from withdrawable, −amount from advance |

**Auto-recover advance** (on any credit to withdrawable from salary/commission/CFO transfer):
```
recover = min(incoming, advance_balance)
advance_balance -= recover
withdrawable += (incoming - recover)
```

## Migration plan
1. **DB migration** (schema):
   - Add `withdrawable_balance`, `float_balance`, `advance_balance` to `wallets` (default 0, NOT NULL).
   - Backfill from existing ledger using updated `get_agent_split_balances` logic + `agent_advances` outstanding totals.
   - Replace `get_agent_split_balances` RPC to read directly from these columns (fast, no scan).
   - New RPC `recompute_wallet_buckets(user_id)` for admin reconciliation.
   - Update the ledger-after-insert trigger so every relevant category routes to the correct bucket and runs advance recovery.
   - Add CHECK constraint: `withdrawable_balance >= 0 AND float_balance >= 0 AND advance_balance >= 0`.

2. **Edge function updates**:
   - `approve-withdrawal`: validate against `withdrawable_balance` only (drop the float-vs-commission derivation). Error message: "Insufficient withdrawable balance".
   - `request-withdrawal` / `wallet-withdraw`: same gate.
   - `agent-deposit`, `cfo-direct-credit`, `wallet-transfer`, `salary-payout`, `agent-commission-credit`, `fund-rent-pool`: stop manually mutating `wallets.balance`; rely on the ledger trigger to update buckets.
   - `agent-advance-disburse`: write `agent_advance_credit` ledger entry; trigger will bump both `withdrawable` and `advance_balance`.

3. **Frontend updates**:
   - `useAgentBalances` → return `{ withdrawable, float, advance }`. Remove `commissionBalance` derivation.
   - New `useWalletBuckets` hook (shared across roles).
   - `AgentFloatBalanceCard` → rename to `AgentWalletBucketsCard`. Shows:
     - **Available Balance** (withdrawable) — large, primary
     - **Outstanding Advance** (advance) — only if > 0, with red/warning styling
     - **Company Float (locked)** — only if > 0, muted, with tooltip
   - `FullScreenWalletSheet`, `FloatingWalletButton`, `AnimatedBalance` → use `withdrawable_balance` as the headline figure for users; admins/CFO see full breakdown.
   - Withdrawal request form: client-side guard `amount <= withdrawable_balance` with inline error, disable submit otherwise.
   - `fetchAgentWalletData.ts` → read directly from new columns.

4. **Reconciliation**:
   - One-time backfill SQL run inside the migration.
   - Run reconciliation for Joshua Wanda specifically to verify the 60K CFO transfer lands in withdrawable.

## Files to change
- **New migration**: add columns + trigger rewrite + RPC rewrite + backfill.
- `supabase/functions/approve-withdrawal/index.ts`
- `supabase/functions/request-withdrawal/index.ts` (and any other withdrawal entry points)
- `supabase/functions/agent-deposit/index.ts`, `cfo-direct-credit/index.ts`, `wallet-transfer/index.ts`, `agent-advance-disburse/index.ts` (remove manual balance writes)
- `src/hooks/useAgentBalances.ts` → rewrite as `useWalletBuckets`
- `src/lib/fetchAgentWalletData.ts` → simplify
- `src/components/agent/AgentFloatBalanceCard.tsx` → rebuild as 3-bucket card
- `src/components/wallet/FullScreenWalletSheet.tsx`, `FloatingWalletButton.tsx`, `AnimatedBalance.tsx` → wire to `withdrawable_balance`
- Withdrawal request form component (client-side validation)
- New memory: `mem://business-model/wallet-three-bucket-model.md` and update `mem://index.md` Core rule.

## Risks & safeguards
- **Backfill correctness**: run as a transaction; emit `audit_logs` row per wallet showing before/after buckets. Dry-run query included in migration comments.
- **Backward compatibility**: keep `wallets.balance` updated by trigger as `withdrawable + float` so legacy reads don't break during rollout.
- **Strict mode**: all new ledger writes use already-allowlisted categories — no new category names introduced.
- **Concurrency**: bucket updates inside the trigger use `FOR UPDATE` row lock on the wallet row.

## Out of scope
- Changing tenant/landlord/supporter wallets' UX (they only ever have withdrawable). The schema applies uniformly but UI changes focus on agent + CFO views where the bug surfaced.
