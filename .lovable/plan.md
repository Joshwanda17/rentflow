

## Pay Rent — deduct from Operational Float (not Landlord Float)

### Investigation result

The **Pay Rent** button on the agent dashboard ("Tenants" tab) opens `AgentTopUpTenantDialog`, which calls the `agent-deposit` edge function.

Good news: the **backend is already correct**. `agent-deposit` (line 246-265) checks `get_agent_split_balances → float_balance` (the operational/3-bucket float on `wallets.float_balance`) and rejects the request if insufficient. It does NOT touch `agent_landlord_float.balance` (the separate Landlord Float bucket used for landlord payouts).

**The bug is in the dialog UI**, which is misleading the agent:

- Line 43-48: fetches `wallets.balance` (TOTAL wallet, includes commission + float + advance) and labels it **"Your Wallet Balance"**.
- Line 117 / 359 / 384: validates the amount against this TOTAL balance, not against the operational float.
- Result: the agent enters an amount that fits inside their total balance but exceeds their operational float → confusing error, OR they assume the deduction came from the wrong bucket.

The actual ledger deduction always comes from operational float (the strict-mode router enforces `float_balance` for `tenant_repayment` cash_out — per the wallet 3-bucket model memory).

### Fix scope (single file: `src/components/agent/AgentTopUpTenantDialog.tsx`)

1. **Switch the displayed balance from total → operational float**
   - Replace the `wallets.balance` lookup with the existing `useAgentBalances()` hook (already used by the wallet sheet) to read `floatBalance`.
   - Re-label the card from "Your Wallet Balance" → **"Operational Float"** with a small subtext "Used for tenant rent payments".

2. **Validate against operational float, not total**
   - Update the `amountNum > agentBalance` checks (lines 123, 359, 384) to compare against `floatBalance`.
   - Update the inline warning copy from "Amount exceeds your wallet balance" → **"Amount exceeds your Operational Float"**.

3. **Update the confirm summary**
   - Change `total.label` (line 245) from "Deducted from Wallet" → **"Deducted from Operational Float"**.

4. **No backend changes**
   - `agent-deposit` already enforces float-only deduction. No edits to the edge function, no migrations, no RPC changes.

### Out of scope

- No change to commission flow (still credits 10% to commission bucket).
- No change to the Landlord Float bucket or `AgentLandlordPayoutFlow`.
- No change to any other Pay-Rent surface (the menu drawer's "Pay Rent" item already routes to the same dialog).

### Acceptance

- Dialog header card displays the agent's **Operational Float** (from `wallets.float_balance`), not the total wallet balance.
- Entering an amount greater than operational float disables the "Review Payment" button and shows "Amount exceeds your Operational Float".
- Successful payment deducts only from operational float; Landlord Float remains untouched (verifiable on the wallet card after the transaction).
- Commission (10%) still credits to the commission bucket as today.

