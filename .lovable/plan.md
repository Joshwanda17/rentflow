

# Audit: Remaining Agent Flaws — Broken Functions, Missing Ledger Entries, Direct Wallet Mutations

## Critical Findings

### FLAW 1 — `approve-loan-application`: Direct wallet mutations (CRITICAL)

This is the worst remaining anti-pattern. The entire function bypasses the ledger completely:

- **Line 123-129**: Directly does `.update({ balance: agentWallet.balance - application.amount })` on the wallets table (agent debit)
- **Line 166-172**: Directly does `.update({ balance: ... + application.amount })` on the wallets table (borrower credit)
- **Lines 153-159, 176-182**: Manual "rollback" logic that also directly mutates wallet balances
- **Zero ledger entries created** — this entire money flow is invisible to the financial system
- **Race condition**: Read-then-write pattern on `balance` with no locking

**Fix**: Replace all direct wallet mutations with a single `create_ledger_transaction` RPC call containing two legs:
- Leg 1: Agent wallet `cash_out` (loan disbursement)
- Leg 2: Borrower wallet `cash_in` (loan receipt)

Remove all manual rollback logic — the RPC is atomic.

### FLAW 2 — `process-agent-advance-deductions`: Missing `user_id` on platform entry

Line 116-126: The platform-side entry has no `user_id` field. While the RPC accepts `NULL` user_id for platform entries, this makes it impossible to trace which agent's repayment created the platform income. The wallet-side entry (line 104-115) correctly has `user_id: advance.agent_id`.

**Fix**: Add `user_id: advance.agent_id` to the platform entry.

### FLAW 3 — `agent-angel-pool-invest`: Missing `transaction_date` on all entries

Lines 92-109 and 128-145: No `transaction_date` field on any of the 4 ledger entries (2 for investment, 2 for commission). While the RPC defaults to `NOW()`, this is inconsistent with the standard entry format used by all other fixed functions. More importantly, the commission platform entry (line 131-136) has no `user_id`, making platform-side commission expenses untraceable.

**Fix**: Add `transaction_date: new Date().toISOString()` to all entries. Add `user_id: user.id` to the platform commission entry (line 131).

### FLAW 4 — `agent-invest-for-partner`: Missing `transaction_date` on all entries + `user_id: null` pattern

Lines 103-130, 211-240, 243-272: None of the 6 entries across 3 RPC calls include `transaction_date`. Multiple entries use explicit `user_id: null` for platform legs, which is fine functionally but inconsistent. The bigger issue: this function creates 3 separate RPC calls for what is logically one transaction, breaking atomicity — if the second or third RPC fails, the system is in an inconsistent state.

**Fix**: Add `transaction_date` to all entries. Consider consolidating the credit+debit into fewer RPC calls where possible, though the net-zero design is intentional.

### FLAW 5 — `fund-agent-landlord-float`: Missing `user_id` on bonus platform entry

Line 183-193: The platform-side entry for the agent bonus has no `user_id`. The wallet-side entry (line 170-181) correctly has `user_id: bonusAgentId`. This makes it impossible to trace which agent's bonus created the platform expense.

**Fix**: Add `user_id: bonusAgentId` to the platform entry.

### FLAW 6 — `agent-deposit`: Missing `user_id` on multiple platform entries

- Line 408-417: Platform entry for `agent_float_used_for_rent` — no `user_id`
- Line 522-530: Same issue in the no-repayment branch
- Line 550-558: Platform entry for tenant wallet deposit — no `user_id`

**Fix**: Add appropriate `user_id` values to all platform entries.

---

## Summary Table

| Function | Severity | Issue |
|----------|----------|-------|
| `approve-loan-application` | **CRITICAL** | Direct wallet `.update()` — no ledger entries at all |
| `process-agent-advance-deductions` | Medium | Missing `user_id` on platform entry |
| `agent-angel-pool-invest` | Medium | Missing `transaction_date` + missing `user_id` on platform commission |
| `agent-invest-for-partner` | Low-Medium | Missing `transaction_date` on all entries |
| `fund-agent-landlord-float` | Medium | Missing `user_id` on bonus platform entry |
| `agent-deposit` | Medium | Missing `user_id` on 3 platform entries |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/approve-loan-application/index.ts` | Full rewrite of approval flow: replace direct wallet mutations with `create_ledger_transaction` RPC |
| `supabase/functions/process-agent-advance-deductions/index.ts` | Add `user_id` to platform entry |
| `supabase/functions/agent-angel-pool-invest/index.ts` | Add `transaction_date` to all entries, add `user_id` to platform commission entry |
| `supabase/functions/agent-invest-for-partner/index.ts` | Add `transaction_date` to all entries |
| `supabase/functions/fund-agent-landlord-float/index.ts` | Add `user_id` to bonus platform entry |
| `supabase/functions/agent-deposit/index.ts` | Add `user_id` to 3 platform entries |

## Deployment

Redeploy all 6 edge functions after fixes. Test with dummy data via `curl` to confirm RPC layer is reached correctly.

