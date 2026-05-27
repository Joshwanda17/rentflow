## Goal

When a Gmail ingestion picks up an Equity Bank bulk payout email naming "SKYBUBBLES TRADING AND INVESTMENT LIMITED" as the receiver/sender, automatically settle pending bank-payout withdrawals from partners that are managed by a proxy agent — debiting each proxy agent's wallet — until the email amount is depleted. Operators see the per-email breakdown inline in the Email Transactions panel.

## Detection rule

A `gmail_transactions` row qualifies as a *bulk bank payout* when ANY of `subject`, `snippet`, `raw_body`, `from_name`, or `counterparty` (case-insensitive) contains the literal string `SKYBUBBLES TRADING AND INVESTMENT LIMITED`. No other constraints — amount, direction, sender are not required.

## Database changes (`supabase/migrations/...`)

1. New table `bulk_bank_payout_allocations`:
   - `id uuid pk`, `gmail_transaction_id uuid` (FK → gmail_transactions), `withdrawal_request_id uuid UNIQUE` (FK → withdrawal_requests), `partner_id uuid`, `proxy_agent_id uuid`, `allocated_amount numeric not null`, `status text default 'settled'`, `error_message text`, `created_at timestamptz default now()`.
   - GRANTs + RLS: staff roles (manager/super_admin/cfo/coo/financial_ops) SELECT.
2. Add columns to `gmail_transactions`:
   - `is_bulk_bank_payout boolean default false`
   - `bulk_payout_allocated_total numeric default 0`
   - `bulk_payout_settled_at timestamptz`
3. Trigger `trg_detect_bulk_bank_payout` BEFORE INSERT on `gmail_transactions`: sets `is_bulk_bank_payout = true` when text match hits.
4. Trigger `trg_auto_settle_bulk_bank_payout` AFTER INSERT on `gmail_transactions` (when `is_bulk_bank_payout`): fires a `pg_net` POST to the new edge function `auto-settle-bulk-bank-payout` with `{ gmail_transaction_id }`. Fire-and-forget — never blocks ingestion.

## Edge function `auto-settle-bulk-bank-payout`

Service role. For the given `gmail_transaction_id`:
1. Lock the gmail tx row (`select ... for update`); abort if already `bulk_payout_settled_at IS NOT NULL`.
2. Compute `remaining = amount − bulk_payout_allocated_total`. Abort if `<= 0` or amount is null.
3. Fetch candidate withdrawal requests, FIFO `order by created_at asc`:
   - `status IN ('pending','manager_approved','cfo_approved')`
   - `payout_method ILIKE 'bank%'`
   - `proxy_partner_id IS NULL` AND `agent_id IS NULL` (un-routed) OR already proxy-tagged but unsettled
   - NOT already linked in `bulk_bank_payout_allocations`
4. For each candidate, resolve active managed proxy via existing `proxy_agent_assignments` (mirrors `approve-withdrawal` auto-route logic — `is_active`, `approval_status='approved'`, prefer `is_managed_account=true`). Skip if none.
5. Check proxy agent strict withdrawable via `get_user_available_balance(proxy_agent_id)` ≥ wr.amount. Skip if not.
6. Skip if `wr.amount > remaining` (partial-skip; do not split a withdrawal across emails).
7. Invoke existing `approve-withdrawal` edge function in-process with `{ requestId, action:'approve', stage:'cfo_approved' }` plus metadata `{ bulk_email_id, settled_via:'skybubbles_bulk' }`. The existing auto-route logic will debit the proxy agent.
8. On success: insert `bulk_bank_payout_allocations` row, decrement `remaining`, increment `bulk_payout_allocated_total` on the email row, stamp `fin_ops_reference` on the wr with the gmail TID, write `audit_logs` (`action_type='withdrawal_bulk_settled_skybubbles'`).
9. After loop ends or remaining hits 0, set `bulk_payout_settled_at = now()` if remaining is 0; otherwise leave open so future runs can reuse.
10. Emit `system_events`: `withdrawal.bulk_skybubbles.settled` per allocation, `gmail.bulk_skybubbles.detected` once.

Idempotency: `withdrawal_request_id` UNIQUE prevents double-settle; row-lock on gmail tx prevents concurrent invocations from over-allocating.

## UI: `EmailTransactionsPanel.tsx`

- Add a left-side expand chevron on rows where `is_bulk_bank_payout = true`.
- Expanded panel shows: total amount, allocated, remaining; then a small table of allocations (partner name/email/phone, proxy agent name, withdrawal id short, allocated UGX, status, created_at). Empty-state when no allocations yet.
- Read from `bulk_bank_payout_allocations` joined with `withdrawal_requests` and `profiles` (partner + proxy agent display name).
- Read-only — no operator actions. Realtime subscribe to `bulk_bank_payout_allocations` insert events so the breakdown populates as the cron/trigger fires.

## Files touched

- new migration `supabase/migrations/<ts>_skybubbles_bulk_payout.sql`
- new edge function `supabase/functions/auto-settle-bulk-bank-payout/index.ts`
- edit `src/components/financial-ops/EmailTransactionsPanel.tsx`
- regen `src/integrations/supabase/types.ts` (auto)

## Risks & guards

- Over-debiting a proxy agent: gated by `get_user_available_balance` strict-rule check before allocation.
- Re-firing on the same email: gmail `id` UNIQUE + `withdrawal_request_id` UNIQUE on allocations + row-lock.
- Partner with no managed proxy: skipped silently (operator sees the email's remaining balance, can fall back to manual approval).
- Existing `approve-withdrawal` pipeline already handles ledger postings, proxy_payout_settlements, audit logs, notifications — we do NOT duplicate that logic.
- All wallet movements stay routed through `apply_wallet_movement` via the existing approve flow — no direct bucket writes.
