
# Proxy Partner Withdrawal — Custody Refactor

Cutoff-only refactor. Old `linked_party` balances on agent wallets are frozen and continue to drain through legacy paths until exhausted; everything new follows the partner-direct model.

## Decisions locked in
- Schema may be extended **only** where strictly required.
- No backfill. Old custody stays where it is. Cutoff = deploy timestamp.
- `process-supporter-roi` cron stays **paused**. CFO continues manual credits — but routed to the partner.
- ROI cash payouts (matured returns) only. Principal/portfolio top-up flows are out of scope.

## Schema additions (the only ones)

```sql
-- wallets is a view → add to underlying user_wallets table
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS held_balance numeric NOT NULL DEFAULT 0;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS transaction_group_id uuid,
  ADD COLUMN IF NOT EXISTS initiated_by uuid,        -- agent who pressed "withdraw"
  ADD COLUMN IF NOT EXISTS beneficiary_id uuid;      -- legal owner (partner)

-- semantics: user_id stays = wallet owner (partner for proxy)
-- agent_id stays for back-compat; initiated_by is the new canonical field
CREATE INDEX IF NOT EXISTS idx_wr_initiated_by ON public.withdrawal_requests(initiated_by);
CREATE INDEX IF NOT EXISTS idx_wr_txn_group ON public.withdrawal_requests(transaction_group_id);
```

Reuse existing columns: `general_ledger.transaction_group_id`, `account`, `wallet_id`, `recipient_type`, `wallet_bucket` already exist.

## New flow (cutoff onward)

```text
ROI matures
   │
   ▼
cfo-direct-credit (recipient = PARTNER)
   │  posts double-entry, tagged transaction_group_id
   │  apply_wallet_movement → partner.withdrawable_balance += roi
   ▼
Partner wallet shows ROI

Agent opens partner card → "Initiate Withdrawal"
   │
   ▼
NEW: initiate-proxy-withdrawal edge fn
   ├─ user_id = partner_id   (owner)
   ├─ initiated_by = agent_id
   ├─ beneficiary_id = partner_id
   ├─ status = 'pending'
   ├─ auto_dispatched = false   ← no bypass
   └─ HOLD: withdrawable -= amt, held_balance += amt   (atomic, ledger-posted as wallet_hold)
   ▼
FinOps queue (sees partner + initiating agent + amount)
   │
   ▼
approve-withdrawal (existing)
   ├─ DR partner_wallet_liability   CR withdrawal_clearing
   ├─ held_balance -= amount        (funds leave partner wallet)
   ▼
Payout settlement (cash/MoMo proof upload)
   └─ DR withdrawal_clearing  CR cash_or_momo_float
```

## Code changes

### Edge functions
1. **NEW `initiate-proxy-withdrawal/index.ts`**
   - Auth: agent JWT.
   - Validates agent ↔ partner link (`registered_partners` / `proxy_partners`).
   - Reads partner's strict withdrawable via `get_user_available_balance(partner_id)`.
   - Inserts `withdrawal_requests` with `user_id=partner`, `initiated_by=agent`, `beneficiary_id=partner`, `transaction_group_id=uuid`, `status='pending'`, `auto_dispatched=false`.
   - Posts hold ledger pair (`wallet_hold` / `wallet_hold_offset`) tagged with same `transaction_group_id`, then calls `apply_wallet_movement` to move `withdrawable → held` on the **partner** wallet.
   - Emits `system_event` `withdrawal.proxy.initiated`.

2. **`agent-withdrawal/index.ts`** — block proxy mode.
   - If `linked_party` or proxy partner detected → `400 { code: 'use_initiate_proxy_withdrawal' }`. Self-withdrawals continue to work.

3. **`approve-withdrawal/index.ts`** — strip linked_party custody branch.
   - Remove the entire `isProxyPayout && wr.linked_party !== wr.user_id` path that debits the agent wallet.
   - On approval: debit **partner.held_balance** (not withdrawable, not agent), post `partner_wallet_liability → withdrawal_clearing` legs against `transaction_group_id` from the request.
   - Settlement leg (`withdrawal_clearing → momo_float`) on payout proof.

4. **`reject-withdrawal/index.ts` & `cancel-proxy-withdrawal/index.ts`**
   - Reverse the hold: `held_balance -= amt, withdrawable += amt` for `user_id` (partner), reverse-leg ledger with same `transaction_group_id`.

5. **`cfo-direct-credit/index.ts`** — when `category` ∈ ROI categories AND target is a proxy partner, **require** `recipient_type='user'` and `target_user_id = partner_id` (never agent). Reject if caller passes agent id with partner-tagged metadata. Add a guard + clear error.

6. **`process-supporter-roi/index.ts`** — remains paused. Update its (dormant) credit logic so that when re-enabled, it posts to **partner.user_id**, never agent + linked_party. Add `PAYOUT_PAUSED=true` guard at top; document.

### Frontend
- `src/components/agent/ProxyInvestmentHistorySheet.tsx` — keep as-is (read-only history).
- New `WithdrawForPartnerButton` (or extend existing proxy partner card) → calls `initiate-proxy-withdrawal`. Show partner's withdrawable + pending hold.
- Agent wallet hero/full-screen: stop summing partner-linked credits into the agent's "earned" total. Replace with a "Held in custody (legacy)" read-only badge that just sums the **historical** linked_party net (frozen pool) so agents still see it drain to zero over time.
- FinOps "Pending Withdrawals" panel: surface `initiated_by` (agent name) next to `user_id` (partner name) for proxy rows.

### RPC additions (minimal)
- `place_withdrawal_hold(p_user_id uuid, p_amount numeric, p_txn_group uuid)` — atomic withdrawable→held on partner wallet, posts ledger pair, sets `wallet.sync_authorized` flag.
- `release_withdrawal_hold(p_user_id uuid, p_amount numeric, p_txn_group uuid, p_outcome text)` — `outcome ∈ ('settled','reverted')`.
- Both `SECURITY DEFINER`, `SET search_path = public`.

## Hard rules enforced
- No edge function may credit `general_ledger` with `user_id=agent` AND `linked_party=partner` after cutoff. Add a DB trigger `trg_block_proxy_custody_writes`:
  ```text
  if NEW.created_at >= '<cutoff>' and NEW.linked_party is not null
     and exists(select 1 from supporters where user_id::text = NEW.linked_party)
     and NEW.user_id <> NEW.linked_party::uuid
     → RAISE EXCEPTION 'proxy custody writes are forbidden post-cutoff'
  ```
  (Allowlist exception only for the legacy reversal path.)
- `auto_dispatched` is forced to `false` for any row where `initiated_by IS NOT NULL AND user_id <> initiated_by`. Ensures FinOps sees every proxy withdrawal.

## What we are NOT doing
- Not moving the existing 245M / 850M positions. They drain via the existing approve-withdrawal legacy branch, which we keep behind an `is_legacy_linked_party` flag on the **request row** (set true only for pre-cutoff requests).
- Not creating new tables.
- Not enabling the cron.
- Not touching deposit/top-up/principal flows.

## Memory updates after deploy
- New: `mem://architecture/proxy-partner-custody-v2` — the partner-direct rule + cutoff date.
- Update Core: add bullet "Proxy partner ROI is credited to PARTNER wallet only. Agents initiate, FinOps approves. linked_party custody writes blocked post-cutoff."

## Verification checklist
1. Migration applies cleanly (3 columns, 1 trigger, 2 RPCs).
2. `cfo-direct-credit` to a proxy partner: ledger row has `user_id=partner`, partner.withdrawable rises, agent wallet untouched.
3. Agent presses "Withdraw for Partner": `withdrawal_requests` row has `user_id=partner, initiated_by=agent, status='pending', auto_dispatched=false`; partner.held rises by amount; partner.withdrawable falls.
4. Row appears in FinOps Pending queue.
5. Approve → partner.held drops to 0; clearing/momo legs balance; agent wallet unchanged throughout.
6. Reject → partner.held returns to withdrawable; reverse legs posted with same `transaction_group_id`.
7. Attempt to write `user_id=agent, linked_party=partner` post-cutoff → trigger raises.
8. `agent-withdrawal` proxy attempt → 400 with redirect code.
