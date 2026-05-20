---
name: Proxy Payout Settlements
description: Stale-record-proof flow for proxy partner ROI display and withdrawal — partner-aggregated cards driven by v_user_wallet_strict + proxy_payout_settlements audit table
type: feature
---

**Goal.** Eliminate stale entries in the agent's Proxy Partners list. Source of truth is the ledger (`v_user_wallet_strict`); audit trail is `proxy_payout_settlements`.

**Table `proxy_payout_settlements`** (created 2026-05-14):
- `id`, `approval_id` UNIQUE (→ `pending_wallet_operations.id`), `withdrawal_id`, `partner_id`, `agent_id`, `amount_settled`, `settled_at`, `notes`, `created_at`.
- RLS: agents see own; partners see own; manager/CFO see all. Indexes on `(agent_id, partner_id)` and `(withdrawal_id)`.
- Backfill: 239 historical CFO-approved payouts whose partner strict withdrawable ≤ UGX 50 were inserted as settled.

**Edge fn `approve-withdrawal`.** After `status=completed`, when `proxy_partner_id` (or legacy `linked_party`) is present:
1. Fetch CFO-approved `pending_wallet_operations` (`category='roi_payout'`, `status='approved'`, `metadata.coo_approved_by IS NOT NULL`, `source_id` matches partner portfolios).
2. Exclude any `approval_id` already in `proxy_payout_settlements`.
3. FIFO-walk by `created_at ASC`, sum up to withdrawal amount.
4. INSERT one settlement row per consumed approval (last partial approval also stamped settled — splits out of scope).
5. For managed-proxy ROI, debit `agent_id` / resolved proxy agent only. The partner wallet is never a funding source; it is only the beneficiary/linked party for audit and settlement.

**Frontend `ProxyPartnerFunds.tsx`.**
- One card per partner (NOT per approval). Amount = `v_user_wallet_strict.available`.
- Settlement-aware filter is the SOLE source of truth — drop any approval whose `id` exists in `proxy_payout_settlements`.
- Hide partners with strict available ≤ UGX 50 (dust threshold).
- Optimistic submit lock via `submittingPartnerIds` set populated on `handleWithdrawSuccess`, cleared after 5s — button disabled + spinner.
- Realtime channel on `proxy_payout_settlements` INSERT (scoped to agent_id) → refetch.

**Invariants.**
- Only approvals carrying `metadata.cfo_approved_by` surface a card. COO-only does not.
- `approval_id` UNIQUE — an approval can only be settled once.
- Settlement is out-of-band; original `pending_wallet_operations` audit trail preserved.
- Wallet writes still go through `apply_wallet_movement` only.
- Partner credit follows Wallet Routing v2: `recipient_type='user'` → withdrawable bucket.
- Managed-proxy partner ROI follows proxy-custody routing: CFO/COO-approved ROI wallet legs credit the proxy agent's withdrawable wallet with `linked_party=partner_id`; the partner wallet/dashboard must not show that ROI as withdrawable.
- Managed-proxy ROI is full-amount only. Do not split ROI into partial cash/reinvestment for managed proxy partners.
- Proxy custody v2 cutoff still enforced; legacy `linked_party` rows pre-cutoff drained via the same edge fn branch.

**Do not.**
- Do not render per-approval cards.
- Do not derive the displayed amount from approval rows or wallet cache — only from `v_user_wallet_strict`.
- Do not bypass the settlement insert in `approve-withdrawal` for proxy withdrawals.
- Do not delete settlement rows to "re-show" a partner — issue a fresh CFO approval instead.

**Files.**
- Migration `supabase/migrations/20260514091255_*.sql`
- `supabase/functions/approve-withdrawal/index.ts`
- `src/components/agent/ProxyPartnerFunds.tsx`

**User docs.** `/mnt/documents/Proxy_Partner_Money_Flow_v2.pdf` + `/mnt/documents/Proxy_Money_Flow_Chart.pdf`.
