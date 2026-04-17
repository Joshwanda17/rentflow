

User is on `/admin/financial-ops` but the actual "Cash-Out Agents" section lives in CFO Dashboard via `CashoutAgentManager.tsx`. Each agent card currently has only Eye (view) + X (deactivate). They want a new "Cashout" button that opens **all current pending withdrawal requests** so the operator can see what each cash-out agent could be working on.

The list of pending withdrawals already exists in `AgentCashPayoutsTab.tsx` (logged-in agent view). I'll reuse the same query and present a read-only view in a dialog, with a contextual hint about which cash-out agent it's tied to.

## Plan — Add "Cashout" button to each Cash-Out Agent card

### What I'll add

**1. New button on each agent card** (`src/components/cfo/CashoutAgentManager.tsx`)
- Add a `<Banknote/>` "Cashout" button next to Eye + X
- Clicking opens a new dialog showing all currently pending withdrawal requests

**2. New dialog component** `CashoutPendingWithdrawalsDialog.tsx` (in `src/components/cfo/`)
- Fetches `withdrawal_requests` where status in `pending, requested, manager_approved, cfo_approved, fin_ops_approved, approved` (same filter as AgentCashPayoutsTab)
- Joins `profiles:user_id(full_name, phone)`
- Tabs: All / MoMo / Bank / Cash (same split logic)
- Per-row card shows: recipient name+phone, amount, payout method+details (bank/MoMo/cash), status badge, time, claim status (assigned_cashout_agent_id), reason
- Banner at top: "Pending withdrawals — visible to all cash-out agents. {Agent name} can claim from their app."
- Realtime: subscribes to `withdrawal_requests` changes and refreshes
- **Read-only here** — no claim/complete actions (those happen in the agent's own app via `AgentCashPayoutsTab`)

**3. Reuse, don't duplicate**
- Extract the existing `WithdrawalPayoutCard` from `AgentCashPayoutsTab.tsx` into a shared `src/components/withdrawals/WithdrawalPayoutCard.tsx` with optional `readOnly` prop
- Both `AgentCashPayoutsTab` and the new dialog import it

### Files
- `src/components/cfo/CashoutAgentManager.tsx` — add Cashout button + state + render dialog
- `src/components/cfo/CashoutPendingWithdrawalsDialog.tsx` — new
- `src/components/withdrawals/WithdrawalPayoutCard.tsx` — extracted, with `readOnly` prop
- `src/components/agent/AgentCashPayoutsTab.tsx` — import shared card, remove inline copy

### Out of scope
- Letting CFO claim/complete withdrawals on behalf of an agent (current model: only the agent themselves claims via their dashboard)
- Any DB changes (none needed)

