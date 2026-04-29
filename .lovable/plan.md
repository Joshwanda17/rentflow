## Why these cards "pile up"

The cards on the **Proxy Partner Funds** screen are **not** the withdrawal records themselves — they are computed from CFO-approved ROI (`pending_wallet_operations`) minus delivered withdrawals. So the card stays as long as the partner has unwithdrawn ROI:

- **After rejection/cancellation**: funds are correctly restored, so the card reappears with a "Last attempt rejected" banner — by design, but it feels like nothing is disappearing.
- **After successful approval**: the card *should* drop off (delivered = returns), but if the ROI accrues again or partial amounts remain, it lingers.
- The "Last attempt rejected" banner uses a **30-day lookback**, so old rejections keep showing for weeks.

The agent has no way to say *"I'm done with this — clear it from my list."*

## What we will build

Three coordinated changes on the proxy list (`src/components/agent/ProxyPartnerFunds.tsx`):

### 1. Per-card "Clear" / dismiss button
- Each card gets a small **X / Clear** icon button in the header.
- Clicking it opens a confirmation: "Hide this partner from your list?" with a short reason note (optional).
- Writes a row to a new `agent_proxy_card_dismissals` table: `{ agent_id, partner_id, portfolio_id, dismissed_at, reason, snapshot_amount }`.
- Once dismissed, the card is filtered out client-side (`partnerBalances` filter) **until new ROI accrues for that partner** (snapshot_amount comparison) — then the card automatically reappears so the agent never misses fresh money.

### 2. Bulk select + Clear
- Add a **"Select"** toggle in the toolbar (next to the existing `All / Re-request needed / New ROI / Download` row).
- When enabled, each card shows a checkbox; a sticky bottom action bar appears with:
  - `Select All visible`
  - `Clear N selected` (red destructive button) → single confirm dialog → bulk insert into `agent_proxy_card_dismissals`.
- Best fit for Caro's case: she filters to `Re-request needed`, hits Select All, then Clear.

### 3. Auto-clean rules (no button needed)
- Tighten the rejected-banner lookback from **30 days → 7 days** so old rejections naturally fall off.
- After a successful (`approved`/`completed`) withdrawal, if the partner's net `available` rounds to **0**, hide the card automatically (already mostly works — add an explicit `available > 50` guard to avoid 1-shilling rounding cards).

## Database

New migration:

```sql
create table public.agent_proxy_card_dismissals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null,
  portfolio_id uuid,
  snapshot_amount numeric not null default 0,   -- "available" at time of dismissal
  reason text,
  dismissed_at timestamptz not null default now(),
  unique (agent_id, partner_id, portfolio_id)
);
alter table public.agent_proxy_card_dismissals enable row level security;

-- Agent can manage only their own dismissals
create policy "agent_can_select_own_dismissals"
  on public.agent_proxy_card_dismissals for select
  using (agent_id = auth.uid());
create policy "agent_can_insert_own_dismissals"
  on public.agent_proxy_card_dismissals for insert
  with check (agent_id = auth.uid());
create policy "agent_can_delete_own_dismissals"
  on public.agent_proxy_card_dismissals for delete
  using (agent_id = auth.uid());
```

The `unique (agent_id, partner_id, portfolio_id)` lets us **upsert** (re-dismiss after re-appearance updates `snapshot_amount`).

Trust mission compliance: each dismissal also emits a `system_event` `agent.proxy_card_dismissed` with `{partner_id, portfolio_id, amount, reason}` for audit (no trust score change — this is a UI hygiene action, not a partner-facing action).

## Client logic changes

In `loadProxyFunds()`:
- After loading PWOs + withdrawals, fetch `agent_proxy_card_dismissals` for `agent_id = user.id`.
- In the `partnerBalances` memo, filter out any group where a dismissal exists **AND** `currentAvailable <= dismissal.snapshot_amount` (i.e. nothing new accrued since dismissal).
- A small footer link `Show N hidden cards` lets Caro un-hide if she made a mistake — opens a tiny sheet listing dismissed partners with an Undo button per row (deletes the dismissal row).

## Edge cases handled

- **Active in-flight withdrawal**: dismiss button is hidden when there's a pending/processing withdrawal (`hasPending === true`). Forces Caro to either complete or cancel first — prevents her hiding cards she still needs to act on.
- **New ROI after dismissal**: if CFO approves more ROI for the same partner, the card auto-reappears (snapshot comparison). She is never permanently blind to new money.
- **No deletion of withdrawal_requests**: we never delete real financial records — only her **view** of the card is hidden. The COO and CFO dashboards are untouched.

## Files

- **New**: `supabase/migrations/<ts>_agent_proxy_card_dismissals.sql`
- **Edited**: `src/components/agent/ProxyPartnerFunds.tsx` — add dismiss button, bulk-select toolbar, sticky action bar, hidden-cards footer, snapshot filter logic, tightened lookback to 7 days, auto-hide at `available <= 50`.

## Out of scope

- No changes to `cancel-proxy-withdrawal`, `approve-withdrawal`, or any wallet/ledger paths.
- No changes to the COO Partners page or any other staff dashboards.
- No deletion of `withdrawal_requests` rows — finance records remain immutable.
