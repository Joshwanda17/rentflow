
# Consolidate wallet→platform debits into the CFO Debit action

## Why

Per your decision: only the **CFO "Debit" action** (`DirectCreditTool` → `cfo-direct-credit` edge function in `debit` mode) should pull money from a user's wallet into the platform. The legacy **`wallet-deduction`** path (`WalletDeductionPanel` → `wallet-deduction` edge function) must no longer be a live tool.

Today, both paths exist:
- `cfo-direct-credit` (debit mode) — current preferred tool, mounted on CFO Dashboard → Pay Out tab.
- `wallet-deduction` — only invoked by `WalletDeductionPanel`, which is **not mounted anywhere in the routed UI** but the edge function is still deployed and callable.

We will remove the dead UI and lock the edge function so nothing can quietly fall back to it.

## Scope

### 1. Frontend
- **Delete** `src/components/financial-ops/WalletDeductionPanel.tsx` (no remaining importers).
- **Keep** `src/components/cfo/WalletRetractionsFeed.tsx` — it only reads historical `wallet_deductions` rows for audit display; it does not write.
- **Keep** `src/components/cfo/CFOActionsLog.tsx` `wallet_deduction` filter entry so historical entries stay visible/labeled.

### 2. Edge function
- **Hard-disable** `supabase/functions/wallet-deduction/index.ts`: replace the body with a 410 Gone response that returns:
  > "Retired. Use CFO Direct Debit (cfo-direct-credit, operation: 'debit') instead."
- This guarantees no automation, scheduled job, or stale client can post through the deprecated path.

### 3. Documentation / memory
- Update `mem/constraints/wallet-deduction-strict.md` to mark the `wallet-deduction` function as retired and point to `cfo-direct-credit` (debit) as the sole wallet→platform debit channel.
- Add a one-line core memory: "All wallet→platform debits MUST go through `cfo-direct-credit` (debit). `wallet-deduction` is retired."

### 4. No DB schema changes
- `wallet_deductions` table stays for historical audit (read-only from here on).
- No ledger schema or RLS changes.

## Out of scope / deliberate non-changes

- `cfo-direct-credit` already does NOT create any `agent_advances` row, nor touch `advance_balance`. It only writes balanced `general_ledger` legs and updates the wallet cache via `apply_wallet_movement`. So future deposits will land cleanly in `withdrawable_balance` with no silent "debt swallow." (Confirmed in code; same conclusion as the prior read-only review.)
- Welile Trust Score, audit logs, and CFO Actions Log already understand `cfo_direct_debit` — no changes needed there.

## Technical detail

```text
BEFORE
 ┌──────────────────┐    invoke    ┌─────────────────┐
 │ DirectCreditTool │ ───────────► │ cfo-direct-credit│ → ledger + wallet cache (no debt)
 └──────────────────┘              └─────────────────┘

 ┌─────────────────────┐  invoke   ┌──────────────────┐
 │ WalletDeductionPanel│ ────────► │ wallet-deduction │ → ledger + wallet_deductions
 │ (unmounted)         │           │ (still deployed) │
 └─────────────────────┘           └──────────────────┘

AFTER
 ┌──────────────────┐    invoke    ┌─────────────────┐
 │ DirectCreditTool │ ───────────► │ cfo-direct-credit│ → SOLE wallet→platform debit channel
 └──────────────────┘              └─────────────────┘

 wallet-deduction edge fn → returns 410 Gone (no ledger writes possible)
 WalletDeductionPanel.tsx → DELETED
 wallet_deductions table → read-only historical audit (WalletRetractionsFeed still reads it)
```

## Files to change

1. Delete `src/components/financial-ops/WalletDeductionPanel.tsx`
2. Edit `supabase/functions/wallet-deduction/index.ts` → return 410 Gone
3. Edit `mem/constraints/wallet-deduction-strict.md` → mark retired
4. Edit `mem/index.md` core rules → add the consolidation rule

Approve and I'll implement.
