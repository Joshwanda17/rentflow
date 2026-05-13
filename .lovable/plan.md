## Advance Recovery Isolation — Wallet Routing v2 Enforcement (no new tables / columns)

Constraint acknowledged: zero schema additions. We use only existing primitives (`get_user_available_balance`, `apply_wallet_movement`, `system_events`, `wallet_routing_violations`, `create_ledger_transaction`).

### 1. Cron edge function — `supabase/functions/process-agent-advance-deductions/index.ts`
- Replace the `wallets.balance` read with `supabase.rpc('get_user_available_balance', { p_user_id: agent_id })`. This is the strict, ledger-anchored withdrawable figure.
- Cap deduction at `min(available, balanceAfterInterest)`. If `available <= 0`, write the daily `agent_advance_ledger` row with `deduction_status='none'`, `amount_deducted=0`, skip the ledger transaction, and emit `repayment_skipped_insufficient_balance` system event.
- For successful deductions, keep the existing balanced double-leg `create_ledger_transaction` call but extend each entry with explicit Wallet Routing v2 metadata so it can never silently land in float:
  - wallet leg: `recipient_type: 'user'` (forces withdrawable bucket)
  - platform leg: `recipient_type: 'operational_wallet'`
  - both legs: `metadata: { source: 'cron_advance_deduction', advance_id, withdrawable_snapshot, bucket_intent: 'advance_balance_recovery' }`
- Emit `system_events`: `repayment_attempted`, `repayment_successful`, `repayment_failed` (in catch).

### 2. Deposit sweep — `supabase/functions/approve-wallet-operation/index.ts`
- Same treatment for the FIFO `agent_repayment` legs it posts: add `recipient_type` to both legs and `metadata.bucket_intent`.
- The sweep already operates on freshly-deposited withdrawable funds, but adding the explicit routing tag makes the intent enforceable end-to-end and consistent with rule (4) of the request.

### 3. Database migration — guards only, no new tables / columns
Single migration that updates existing functions:
- **`apply_wallet_movement`**: at the top, if `p_category = 'agent_repayment'`:
  - `IF p_recipient_type IS NULL THEN RAISE EXCEPTION 'agent_repayment requires explicit recipient_type'`.
  - Force the wallet-side movement to `withdrawable_balance`. If resolution would land on `float_balance`, log to existing `wallet_routing_violations` and `RAISE EXCEPTION 'Advance repayment cannot touch float balance'`.
- **No trigger, no audit table** — the guard inside the sole writer (`apply_wallet_movement`) is sufficient because per the Wallet Sole Writer rule it is the only path that mutates buckets.
- All other audit needs (snapshot of withdrawable, deducted amount, source) flow into existing `system_events` payloads — no new audit table.

### 4. Tests — `src/__tests__/advanceRepaymentIsolation.integration.test.ts`
Vitest integration tests against the live DB seeding existing tables only:
- **A — Float untouchable**: agent with `withdrawable=0`, `float=500k`, outstanding=100k → invoke cron → assert advance unchanged, float unchanged, ledger row with `deduction_status='none'`, `repayment_skipped_insufficient_balance` event present.
- **B — Withdrawable deducted**: `withdrawable=70k`, `float=900k`, outstanding=100k → invoke cron → assert outstanding=30k, withdrawable=0, float unchanged, balanced ledger pair tagged `agent_repayment` with `recipient_type='user'` on the wallet leg.
- **C — Missing recipient_type**: direct `create_ledger_transaction` call with `category='agent_repayment'` and no `recipient_type` → assert exception.

### Out of scope (per user)
- New tables (e.g., `advance_repayment_audit`) — dropped.
- Adding columns to `general_ledger`, `wallets`, `agent_advances` — none.
- Issuance ledger posting and top-up ledger posting — separate work, not in this fix.

### Technical notes
- `get_user_available_balance` already enforces the Withdrawable Strict Rule, so reading it makes the cron compliant in one line.
- `wallet_routing_violations` already exists per Wallet Routing v2; we reuse it for the float-touch attempts, no schema change.
- Cron schedule and edge function URLs are unchanged.
