## Why Grace's UGX 300,000 Withdrawal Is Currently Blocked

**Request:** `76250ae6-3657-4058-a882-6db9894b8a43` — UGX 300,000, status `manager_approved`, awaiting Fin Ops/CFO approval.
**User:** Grace Paul Ochieng (`99890a2e-…0711ff`, +254733803035)

### Root cause (verified against the live ledger)

1. Apr 29 12:25 — UGX 300,000 payroll credit landed in her wallet (withdrawable bucket).
2. Apr 29 13:04 — Grace requested the UGX 300,000 withdrawal. Manager approved Apr 29 13:39.
3. **Apr 30 04:00 (cron)** — `apply-advance-recovery` swept the **entire UGX 300,000** as an "Advance daily deduction" against her two outstanding advances (combined outstanding ~UGX 2.65M from Apr 8).
4. Result now:
   - `wallets.withdrawable_balance` = 0
   - `get_user_available_balance` = 0
   - The Approve & Complete button calls `approve-withdrawal`, which gates strictly on that RPC and returns `INSUFFICIENT_WITHDRAWABLE` because available (0) < requested (300,000).

So the UI button is correctly enforcing the strict withdrawable rule (memory: *Wallet Withdrawable Strict Rule*). The money was already recovered against her advances overnight — that's why approval fails.

### Implication

Approving the payout now would mean Welile pays Grace UGX 300,000 a second time on top of having already collected her payroll against her advance. That's double-spend unless we deliberately reverse the auto-recovery first.

---

## Recommended Path — "Refund the auto-recovery, then approve"

This is the only ledger-clean way to honour the withdrawal without double-paying.

### Steps

1. **Build a one-shot CFO action** in the Fin Ops withdrawal card called **"Reverse advance auto-deduction & approve"** (visible only when the strict gate blocks AND there is a same-day `agent_repayment` cash-out equal-or-greater than the request).
2. On click, the action calls a new edge function `cfo-refund-advance-and-approve` that:
   - Re-verifies caller is `manager` / `cfo` / `finance_ops` via `adminClient.auth.getUser` + `user_roles`.
   - Locates the most recent same-/prior-day `agent_repayment` ledger pair for this user covering ≥ requested amount.
   - Posts a balanced reversal via `create_ledger_transaction` (category `agent_advance_reversal` allowlisted): wallet `cash_in` (system_balance_correction leg) + platform `cash_out`, restoring outstanding balance back onto `agent_advances.outstanding_balance` and `apply_wallet_movement` to credit `withdrawable_balance`.
   - Logs to `audit_logs` (`action_type='advance_recovery_reversed'`, mandatory 10-char reason supplied by CFO).
   - Then internally invokes the existing `approve-withdrawal` flow with the same payload (Fin Ops reference + payment method) so the standard balanced ledger + bucket routing runs unchanged.
3. UI surfaces the reversal as a confirmation modal showing:
   - "Auto-deducted UGX 300,000 against advance #5e1a0ab5 on 30 Apr 04:00 will be reversed and added back to outstanding."
   - Required reason field (≥10 chars).
   - "Reverse & Pay UGX 300,000" / Cancel.

### Files to change

- New edge function: `supabase/functions/cfo-refund-advance-and-approve/index.ts`
- Migration: allowlist `agent_advance_reversal` category in `create_ledger_transaction` strict-mode allowlist + `enforce_recipient_routing`.
- `src/components/financial-ops/WithdrawalRequestCard.tsx` (or equivalent renderer in `/admin/financial-ops`) — add the conditional CFO button + modal.
- New small helper hook `useReverseAdvanceAndApprove.ts`.
- Update memory: `mem://constraints/wallet-sole-writer` note about new reversal category.

### Out-of-scope alternative (not recommended)

A "force approve / bypass strict gate" toggle would technically work but violates *Wallet Withdrawable Strict Rule* and *Wallet Sole Writer*, would create phantom drift (caught by the 15-min Phantom Drift Monitor), and would silently double-pay Grace. I'm explicitly not proposing that.

---

## Decision needed before I implement

Please confirm one of:

- **(A) Proceed with the reversal-then-approve path above** (clean books, advance balance restored, Grace receives UGX 300,000 once).
- **(B) Cancel the withdrawal instead** — Grace's payroll has already settled against her debt; she can request a fresh withdrawal once her wallet has new funds.
- **(C) Something else** — e.g. partial payout, or you want me to review whether the Apr 30 04:00 auto-recovery itself was incorrect (advance terms / cycle).
