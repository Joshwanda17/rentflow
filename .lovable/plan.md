

# Permanent Ledger Integrity: Back-Fill All Phantom Wallets + Lock Down Direct Wallet Writes

## Goal
Two outcomes, one plan:
1. **Back-fill** all 221 phantom wallets (40,015,919 UGX) with balanced `admin_correction` ledger entries — **no withdrawal freezes**, balances untouched.
2. **Permanently prevent** future phantom wallets by making the ledger the only legal way to mutate a wallet balance. Any direct UPDATE to `wallets.balance / withdrawable_balance / float_balance / advance_balance` outside the ledger trigger path will be **rejected at the database level**.

## Part 1 — Back-fill (one migration, idempotent)

Insert balanced double-entry rows per phantom wallet via `create_ledger_transaction`:

| Inferred category (by role) | Wallet leg | Platform leg |
|---|---|---|
| Agent (commission-heavy) | `cash_in` `agent_commission_earned` (wallet) | `cash_out` `agent_commission_earned` (platform) |
| Agent (float-heavy)      | `cash_in` `agent_float_deposit` (wallet)     | `cash_out` `agent_float_deposit` (platform)     |
| Supporter                | `cash_in` `roi_wallet_credit` (wallet)       | `cash_out` `roi_expense` (platform)             |
| Tenant / Landlord        | `cash_in` `wallet_deposit` (wallet)          | `cash_out` `wallet_deposit` (platform)          |
| Other / orphan           | `cash_in` `system_balance_correction` (wallet) | `cash_out` `system_balance_correction` (platform) |

Rules:
- `classification = 'admin_correction'`
- `description` = `"Phantom wallet back-fill — opening equity (<category_reason>)"`
- Skip any wallet that already has a wallet-scope ledger entry (idempotent guard).
- One `txn_group_id` per wallet for traceability.
- Wallet bucket fields are **not** modified — back-fill is ledger-only; balances already match.

Audit row written to `audit_logs` with `action_type = 'phantom_wallet_backfill'`, count, total UGX, and the inferred-category breakdown.

## Part 2 — Permanent enforcement (the real fix)

### 2a. Database guard: reject illegal wallet writes

New trigger `enforce_wallet_ledger_only` on `wallets` BEFORE UPDATE:

```text
IF any of (balance, withdrawable_balance, float_balance, advance_balance) changed
   AND current_setting('app.ledger_write', true) IS DISTINCT FROM 'true'
THEN RAISE EXCEPTION 'Wallet balances may only be mutated by the ledger trigger path. Use create_ledger_transaction.';
```

The legitimate ledger→wallet sync function (the one already triggered by `general_ledger` inserts) sets `SET LOCAL app.ledger_write = 'true'` inside its transaction, so it passes. Every other code path — edge functions, RPCs, manual UPDATEs, dashboards — gets rejected.

### 2b. Revoke direct UPDATE on bucket columns

```sql
REVOKE UPDATE (balance, withdrawable_balance, float_balance, advance_balance)
  ON public.wallets FROM authenticated, anon, service_role;
```
Only `SECURITY DEFINER` functions owned by `postgres` can touch them — and only via the ledger-sync function that sets the session flag.

### 2c. Audit the offenders (read-only sweep, no code changes yet)

Search and list every edge function / RPC that currently does `.update({ balance: ... })` or `UPDATE wallets SET balance` directly. Output a short report so any function that would now fail can be migrated to `create_ledger_transaction` in a follow-up. Known suspects to check: `cfo-direct-credit`, `manager-portfolio-topup`, `wallet-deduction`, `process-scheduled-payouts`, `approve-wallet-operation`, plus any wallet-bucket recompute jobs.

### 2d. Memory rule

Append to `mem://architecture/financial-flow-integrity` and Core memory:
> Direct UPDATEs to `wallets.balance/withdrawable_balance/float_balance/advance_balance` are forbidden and rejected by DB trigger `enforce_wallet_ledger_only`. The only legal path is `create_ledger_transaction` → ledger trigger → wallet sync.

## Order of operations (safety first)

1. **Migration A** — Back-fill 221 phantom wallets (idempotent, balances unchanged).
2. **Verification query** — confirm 0 phantom wallets remain.
3. **Migration B** — Install `enforce_wallet_ledger_only` trigger + REVOKE bucket UPDATE privilege + ensure ledger-sync function sets `app.ledger_write = true`.
4. **Audit sweep** — list every direct-wallet-write site found in edge functions, return a follow-up checklist (no code rewrites in this round to avoid breaking flows mid-migration; we patch them one by one once the trigger is logging which paths fail).

## Out of scope (for this round)
- No withdrawal freezes.
- No bucket recomputation — buckets stay as-is.
- No rewriting of `cfo-direct-credit` / `manager-portfolio-topup` internals yet — the trigger will surface exactly which call sites need migration, then we fix them targeted.
- No retroactive reclassification of the 488 existing `legacy_real` entries.

## Deliverables
- 1 back-fill migration (Part 1).
- 1 enforcement migration (Part 2a + 2b).
- 1 audit report listing every direct-wallet-UPDATE site to migrate next.
- Updated memory rule.

## Approval needed
On approval I will execute steps 1 → 4 in order and report counts + the audit list at the end.

