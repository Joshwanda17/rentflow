# Investigation: Agent Deposit Flow -- Financial Integrity Issues

## Scenario Analyzed

Agent (e.g., Akampurira Onesmus) deposits money to their own wallet, then uses `agent-deposit` to deposit money onto tenants' wallets who have active rent balances.

---

## How It Currently Works

When an agent calls `agent-deposit` for a tenant with an active rent request:

1. Agent's wallet balance is checked (must cover the amount)
2. Tenant's active rent request is found
3. Auto-repayment is calculated (`repaymentAmount = min(amount, remainingBalance)`)
4. Commission RPC (`credit_agent_rent_commission`) is called -- credits agent via ledger trigger
5. Landlord wallet is credited directly (bypassing ledger trigger)
6. Repayment RPC (`record_rent_request_repayment`) is called -- updates rent_requests, inserts repayment row, AND inserts a `rent_repayment` ledger entry
7. Remaining deposit goes to tenant wallet (direct update)
8. Agent wallet is deducted by full amount (direct update with optimistic lock)
9. A `cash_out` ledger entry is written for the agent (no `transaction_group_id`)
10. **A SECOND `rent_repayment` ledger entry is written for the tenant** (lines 349-362)

---

## Bugs Found

### BUG 1: Double Ledger Entry for Tenant Rent Repayment (Critical)

- The `record_rent_request_repayment` RPC (step 6) already inserts a `rent_repayment` entry into `general_ledger`
- The edge function ALSO inserts a second `rent_repayment` entry (step 10, lines 349-362)
- **Impact**: Every agent deposit that triggers auto-repayment creates **two identical ledger records** for the tenant. This corrupts audit trails and could cause double-counting in financial reports.

### BUG 2: Landlord Wallet Credited Without Ledger Entry (Medium)

- The landlord's wallet is updated directly (lines 263-279) with no corresponding `general_ledger` entry
- This violates the single-writer principle and the "all money movement must go through the ledger" constitution rule
- **Impact**: Landlord receives funds that are invisible in the ledger -- untraceable money movement

### BUG 3: Race Condition on Agent Wallet (Medium)

- `credit_agent_rent_commission` RPC inserts a ledger entry with `transaction_group_id`, which fires `sync_wallet_from_ledger` trigger to credit agent's wallet
- Immediately after, the edge function reads `freshAgentWallet.balance` and deducts `amount`
- If the trigger already fired, the optimistic lock (`eq('balance', freshAgentWallet.balance)`) will see the commission-inflated balance and deduct correctly
- If the trigger hasn't fired yet, the lock passes but the subsequent trigger credit adds commission on top of the already-deducted balance -- net result is correct but order-dependent
- **Impact**: Potential for silent failures if optimistic lock fails due to timing

### BUG 4: Tenant Wallet Updated Without Ledger Entry (Medium)

- When `depositAmount > 0` (excess after repayment), the tenant's wallet is updated directly (lines 311-316) with no `general_ledger` entry
- **Impact**: Untraceable wallet credit for the tenant

---

## Proposed Fix Plan

### Step 1: Remove duplicate ledger entry in edge function

Delete lines 348-362 in `agent-deposit/index.ts` (the second `rent_repayment` ledger insert). The RPC already handles this.

### Step 2: Add landlord ledger entry

After crediting the landlord wallet, insert a `general_ledger` entry with direction `cash_in`, category `landlord_rent_payment`, for the landlord user.

### Step 3: Add tenant wallet deposit ledger entry

When `depositAmount > 0`, insert a `general_ledger` entry for the tenant (category `wallet_deposit`, direction `cash_in`) so the excess deposit is traceable.

### Step 4: Fix agent wallet deduction timing

Move the agent wallet deduction BEFORE the commission RPC call to avoid the race condition. Use the commission as a separate, trigger-driven credit.

---

## Technical Details

**Files to modify:**

- `supabase/functions/agent-deposit/index.ts` -- all 4 fixes above

**No database migrations needed** -- the RPCs and triggers are correct; the bugs are in the edge function's duplicate/missing ledger writes and direct wallet mutations.

THE TENANTS OUTSTANDING BALANCE DOES NOT DECRESE ALSO THE AMOUNT ON THEIR WALLETS DOES NOT CHANGE. SO THEIR COULD BE  A BUG . ALSO THE AGENT MUST SEE THAT THEY HAVE PAID FOR THOSE TENANTS. EMPHASIS ON AGENT AKAMPURIRA ONESMUS. MORE EMPHASIS THEIR.  THE AGENT MUST BE ABLE TO SEE THE TENNATS WHOSE BALANCE HAS DECREASED AND ALSO THE ONES THAT HAVE NOT PAID. 

&nbsp;