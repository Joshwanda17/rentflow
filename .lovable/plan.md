

## Route Wallet Payouts Through Proxy Agent

### Problem
When a partner has a linked proxy agent (non-managed), clicking "Pay to Wallet" still credits the **partner's** wallet. The proxy assignment is shown as a notice but ignored in the payment logic.

### New Rule
- **Has proxy agent (managed OR non-managed)** → "Pay to Wallet" becomes **"Credit Agent Wallet"** and routes funds to the agent's wallet
- **Cash** → no wallet credit, proxy is irrelevant
- **No proxy agent at all** → "Pay to Wallet" credits the partner's wallet directly (current behavior)

### Changes — `src/components/coo/COOPartnersPage.tsx`

**1. UI: Dynamic button label and description based on proxy status**

In the "Standard or Non-Managed Proxy" section (~line 2958–2975):
- If `selectedManaged?.hasProxy` is true:
  - Button label: **"Credit Agent Wallet"**
  - Description: **"Send to {agentName}'s wallet"**
  - Icon: `ShieldCheck` instead of `Wallet`
  - Mode passed to `handlePay`: `'agent_wallet'` (not `'wallet'`)
- If no proxy:
  - Keep current: "Pay to Wallet" / "Credit partner's digital wallet" / mode `'wallet'`

**2. Logic: `handlePay` already handles `agent_wallet` mode correctly**

The existing `handlePay` function (line 2614) already:
- Sets `operationType` to `roi_agent_wallet_credit` for `agent_wallet` mode
- Sets `target_wallet_user_id` to `managed.agentId`
- Includes `is_managed_payout: true` metadata
- Logs the correct audit action `roi_managed_payout_requested`

So no changes needed in `handlePay` — it already routes correctly when called with `'agent_wallet'` mode.

**3. Managed account section unchanged**

The fully managed account path (line 2923–2941) already shows "Send to Agent Wallet" and works correctly. No changes there.

### Summary of what changes

The only change is in the payment options UI section: when a proxy agent exists, the wallet button dynamically switches to route through the agent instead of the partner. Cash always bypasses the proxy. Only partners with **no** proxy assignment get direct wallet credit.

### Event & Audit Trail
All paths already log:
- `pending_wallet_operations` with `operation_type`, `target_wallet_user_id`, and metadata
- `audit_logs` with `pay_mode`, `is_managed_payout`, agent details
- Ledger entries via the approval pipeline

### Files Changed
| File | Change |
|------|--------|
| `src/components/coo/COOPartnersPage.tsx` | Wallet button: dynamic label/mode based on proxy status |

No database or edge function changes needed.

