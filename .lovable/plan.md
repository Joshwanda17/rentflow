## Goal

Eliminate stale proxy partner records permanently by switching from per-approval cards (with fragile balance math) to **one card per partner driven by `v_user_wallet_strict`**, plus a settlement table for audit. Lock the withdraw button immediately on submit.

## End-state behavior

1. Proxy Partners list shows **one card per linked proxy partner** whose live withdrawable (from `v_user_wallet_strict`) > UGX 0 AND who has at least one CFO-approved unsettled ROI approval.
2. The amount on the card = the partner's strict live withdrawable (ledger truth — cannot be stale).
3. When a proxy withdrawal is **submitted**, the card's button locks instantly.
4. When `approve-withdrawal` completes, the function inserts settlement rows linking that withdrawal to the partner's oldest unsettled CFO approvals (FIFO), summing up to the withdrawn amount → those approvals are marked settled and excluded next render.
5. Only approvals carrying `metadata.coo_approved_by` AND `metadata.cfo_approved_by` (existing CFO-approval gate) are eligible.

## Database (one migration)

Create `proxy_payout_settlements`:

```text
id              uuid pk
approval_id     uuid  -- pending_wallet_operations.id
withdrawal_id   uuid  -- withdrawal_requests.id
partner_id      uuid  -- supporter / linked_party
agent_id        uuid
amount_settled  numeric
settled_at      timestamptz default now()
unique (approval_id)   -- one approval can only be settled once
```

- RLS: agent can SELECT own rows; service role full access; CFO/manager SELECT all.
- Index on `(agent_id, partner_id)` and `(withdrawal_id)`.

**Backfill for the current 7 stale rows + future-proof:** insert synthetic settlement rows for every existing partner where strict live withdrawable = 0 but unsettled CFO approvals still exist (closes them out without touching ledger).

## Edge function: `approve-withdrawal`

After the existing `status: completed` update, when the withdrawal has `proxy_partner_id` (or `linked_party`):

1. Fetch all unsettled CFO-approved `pending_wallet_operations` for that partner ordered by `created_at ASC`.
2. Walk them, accumulate amounts up to the withdrawal's amount, insert one `proxy_payout_settlements` row per approval consumed.
3. Last partial approval gets a partial-settlement row (still marked settled — splitting approvals is out of scope; FIFO closes the oldest first).

## Frontend: `ProxyPartnerFunds.tsx` rewrite (focused)

Replace the per-approval rendering loop with **partner-aggregated cards**:

1. Query approved CFO ops (existing logic) → group by `partnerId`.
2. LEFT JOIN with `proxy_payout_settlements` → drop approvals where `id` exists in settlements.
3. Drop partners whose remaining unsettled approval count = 0.
4. For each remaining partner, fetch `v_user_wallet_strict.available` → that's the card's "To Withdraw" amount.
5. Drop partners where strict available ≤ UGX 50 (dust threshold).
6. Card shows: partner name + portfolio + phone + live withdrawable. Single "Withdraw" button.
7. On submit: optimistic local `submittingPartnerIds: Set<string>` → button disabled + spinner until refetch confirms partner gone or `in_flight` flag returns true.
8. Real-time subscription on `proxy_payout_settlements` (INSERT) → refetch list on any new settlement.

## Files

- **NEW** `supabase/migrations/<ts>_proxy_payout_settlements.sql` — table + RLS + indexes + backfill.
- **EDIT** `supabase/functions/approve-withdrawal/index.ts` — insert settlement rows after status update.
- **EDIT** `src/components/agent/ProxyPartnerFunds.tsx` — partner-aggregated cards, submit lock, settlement-aware filter, realtime sub.

## Out of scope

- No changes to CFO approval flow.
- No changes to `pending_wallet_operations` schema (keep settlement out-of-band so audit trail is preserved).
- No ledger changes (already source of truth).

## Verification

1. After migration runs, the 7 currently-visible cards (Caleb, Olweny, Hellen, Shakilah, Gideon, Musene, Nassanga) are evaluated against `v_user_wallet_strict` — those with 0 withdrawable disappear instantly.
2. Submit a withdrawal → button locks immediately.
3. CFO approves → settlement row inserted → card disappears within 1 refresh cycle.
4. Repeat for the same partner with a fresh CFO approval → card reappears.