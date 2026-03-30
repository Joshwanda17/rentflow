# Fix Double-Credit Bug — Unified Wallet Mutation Plan

## Problem Summary

Three distinct duplication vectors exist because wallet credits happen via **both** direct `.update()` calls **and** ledger-triggered `sync_wallet_from_ledger`:

```text
Issue 1: wallet-transfer
  Path A: Manual .update() on sender wallet  ── debit
  Path A: Manual .update() on recipient wallet ── credit
  Path B: Ledger insert (NO transaction_group_id) ── trigger does NOT fire
  Risk: Two concurrent transfers can race on optimistic lock reads

Issue 2: agent commission (QUADRUPLE credit)
  Path A: credit_agent_rent_commission RPC → direct wallet INSERT ON CONFLICT UPDATE (+commission)
  Path A: credit_agent_rent_commission RPC → ledger insert (NO txn_group_id, trigger skips)
  Path B: approve-deposit Edge Function → ALSO does direct wallet .update(+commission)
  Path B: approve-deposit Edge Function → ALSO inserts its own ledger entry
  Result: Agent gets 2× commission (RPC + Edge Function both credit)

Issue 3: repayment ledger duplication
  Path A: record_rent_request_repayment RPC → inserts 'cash_in' ledger (rent_repayment)
  Path B: approve-deposit Edge Function → inserts 'cash_out' ledger with transaction_group_id
  Path B: auto-charge-wallets → inserts its own ledger entry too
  Result: Duplicate ledger records for same repayment event
```

## Solution: Single-Writer Principle

Each mutation type gets exactly **one** owner. Callers must not duplicate what the callee already does.

---

### Fix 1: `wallet-transfer` Edge Function

**Current**: Manual `.update()` on both wallets + ledger inserts without `transaction_group_id`.

**Change**: Switch to ledger-driven updates using `transaction_group_id` so the `sync_wallet_from_ledger` trigger handles balance changes atomically.

- Remove the two manual `.update()` calls on sender/recipient wallets
- Remove the `wallet_transactions` insert (redundant with ledger)
- Insert **two** `general_ledger` entries (sender `cash_out`, recipient `cash_in`) with a shared `transaction_group_id`
- The trigger will atomically adjust both wallet balances
- Keep optimistic lock safety by doing a pre-check `SELECT balance` and comparing after trigger fires

**Files**: `supabase/functions/wallet-transfer/index.ts`

---

### Fix 2: `credit_agent_rent_commission` RPC — Make it the **sole** commission writer

**Current**: RPC does direct wallet `INSERT ON CONFLICT UPDATE` + ledger insert (no txn_group_id). Calling edge functions (`approve-deposit`) **also** independently credit the wallet and insert ledger entries.

**Changes**:

**A) Update RPC** (`credit_agent_rent_commission`):

- Remove the direct `INSERT INTO wallets ... ON CONFLICT` lines (lines 58-62, 92-95)
- Add `transaction_group_id` to the ledger insert so `sync_wallet_from_ledger` trigger handles the wallet credit
- Add an **idempotency guard**: before inserting, check `NOT EXISTS` on `general_ledger` where `category = 'agent_commission' AND source_id = p_source_id AND user_id = agent_id`

**B) Strip duplicate commission logic from `approve-deposit**`:

- Remove lines 211-262 (the inline agent commission block that does its own wallet update + ledger insert + notification)
- Instead, call `credit_agent_rent_commission` RPC (which already handles everything)

**Files**: 

- New migration SQL (update `credit_agent_rent_commission` function)
- `supabase/functions/approve-deposit/index.ts` (remove inline commission block, add RPC call)

---

### Fix 3: `record_rent_request_repayment` RPC — Stop callers from duplicating its ledger entry

**Current**: RPC inserts a `cash_in` / `rent_repayment` ledger entry. But `approve-deposit` **also** inserts a `cash_out` / `rent_repayment` ledger entry with `transaction_group_id` (which triggers wallet deduction).

**Changes**:

**A) Update RPC** (`record_rent_request_repayment`):

- Accept an optional `p_transaction_group_id UUID DEFAULT NULL` parameter
- If provided, include it on the ledger entry so the trigger handles wallet deduction
- If not provided (backward compat), omit it as today

**B) Update callers**:

- `approve-deposit`: Remove the standalone `cash_out` ledger insert (lines 194-206). Instead pass a `transaction_group_id` to the RPC so it handles both the repayment record AND the wallet deduction in one atomic path
- `auto-charge-wallets`: Already does manual wallet `.update()` without txn_group_id — leave as-is (it's the single writer for tenant deductions in that path). Confirm it does NOT also insert a duplicate `rent_repayment` ledger entry

**Files**:

- New migration SQL (update `record_rent_request_repayment` signature)
- `supabase/functions/approve-deposit/index.ts`

---

### Fix 4: Update `WELILE_WORKFLOW.md`

Document the "Single-Writer Principle" under section 34, marking the bug as resolved and listing the new rules:

- Wallet balance changes happen **only** via `sync_wallet_from_ledger` trigger (using `transaction_group_id`) OR via a single manual `.update()` — never both
- RPCs own their domain: `credit_agent_rent_commission` is the sole commission writer; `record_rent_request_repayment` is the sole repayment writer
- Edge functions must not duplicate what an RPC they call already does

---

## Execution Order

1. **Migration**: Update `credit_agent_rent_commission` (add txn_group_id to ledger, remove direct wallet write, add idempotency)
2. **Migration**: Update `record_rent_request_repayment` (accept optional txn_group_id param)
3. **Edge Function**: Refactor `wallet-transfer` to ledger-only writes
4. **Edge Function**: Strip duplicate commission logic from `approve-deposit`, delegate to RPC
5. **Edge Function**: Strip duplicate repayment ledger from `approve-deposit`, pass txn_group_id to RPC
6. **Documentation**: Update `WELILE_WORKFLOW.md`

## Impact

- **Commission accuracy**: Eliminates 2-4× overpayment to agents
- **Ledger integrity**: One entry per economic event, fully traceable
- **Race condition safety**: Trigger-based wallet sync is atomic (single SQL statement)
- **Backward compatibility**: All RPC signatures remain compatible (new params have defaults)
- &nbsp;
  ```markdown
  Fix Required**: Standardize all financial operations to use exactly ONE path — either ledger-trigger sync OR direct wallet update, never both.
  ```