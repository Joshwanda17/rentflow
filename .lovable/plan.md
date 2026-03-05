

## Auto-Clear Debt and Pre-Pay Future Days on Deposit

### Problem
When tenants deposit money, the `approve-deposit` edge function only auto-deducts for the outstanding rent balance (`total_repayment - amount_repaid`). It does **not** check for `accumulated_debt` on the tenant's `subscription_charges` record (the red "Debt: USh X" badge). This means:
1. Missed daily charges accumulate as debt on the agent
2. Even after the tenant deposits, the debt badge stays red
3. Future days are not pre-paid even if the wallet has surplus

### Solution
After the existing rent auto-deduction in `approve-deposit`, add a second step that:

1. **Clears accumulated debt**: Query `subscription_charges` for the tenant's active subscription. If `accumulated_debt > 0` and the wallet still has funds, deduct the debt amount, zero out `accumulated_debt`, record it in the ledger, and notify the tenant.

2. **Pre-pays future instalments**: If the wallet still has surplus after clearing debt, calculate how many future daily charges it can cover. Advance `charges_completed`, reduce `charges_remaining`, move `next_charge_date` forward, record each pre-payment in the ledger, and call `record_rent_request_repayment` for the total pre-paid amount.

3. **Clear grace period**: Reset `tenant_failed_at` to null since the tenant has now topped up.

### File to Modify
- `supabase/functions/approve-deposit/index.ts`

### Implementation Detail

After the existing rent repayment block (line ~232), insert new logic:

```
// Step 2: Clear accumulated debt on subscription_charges
const { data: activeSub } = await supabaseAdmin
  .from("subscription_charges")
  .select("id, accumulated_debt, charge_amount, charges_remaining, charges_completed, next_charge_date, frequency, tenant_failed_at, rent_request_id")
  .eq("tenant_id", depositRequest.user_id)
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (activeSub) {
  // Re-read wallet balance after rent deduction
  const { data: walletAfterRent } = await supabaseAdmin
    .from("wallets").select("balance")
    .eq("user_id", depositRequest.user_id).single();
  
  let availableBalance = walletAfterRent?.balance || 0;
  let debtCleared = 0;
  let daysPrepaid = 0;
  let prepaidAmount = 0;

  // 2a. Clear accumulated debt
  const debt = Number(activeSub.accumulated_debt);
  if (debt > 0 && availableBalance > 0) {
    debtCleared = Math.min(debt, availableBalance);
    // Deduct from wallet (optimistic lock)
    // Update subscription: accumulated_debt -= debtCleared
    // Record ledger entry: category "debt_clearance"
    // Record rent repayment via RPC
    availableBalance -= debtCleared;
  }

  // 2b. Pre-pay future days if surplus remains
  const chargeAmount = Number(activeSub.charge_amount);
  if (availableBalance >= chargeAmount && activeSub.charges_remaining > 0) {
    daysPrepaid = Math.min(
      Math.floor(availableBalance / chargeAmount),
      activeSub.charges_remaining
    );
    prepaidAmount = daysPrepaid * chargeAmount;
    // Deduct from wallet
    // Advance next_charge_date by daysPrepaid
    // Update charges_completed += daysPrepaid, charges_remaining -= daysPrepaid
    // Record ledger entries
    // Record rent repayment via RPC
    availableBalance -= prepaidAmount;
  }

  // 2c. Clear grace period
  if (activeSub.tenant_failed_at) {
    // Reset tenant_failed_at to null
  }

  // Notify tenant about what happened
}
```

### Notifications
- Debt cleared: "Your outstanding debt of UGX X has been cleared from your deposit."
- Days pre-paid: "X future days pre-paid (UGX Y). Next charge: [date]."
- Both combined into a single notification if both apply.

### Ledger Entries
- Debt clearance: `direction: "cash_out"`, `category: "debt_clearance"`, linked to subscription
- Pre-payment: `direction: "cash_out"`, `category: "tenant_access_fee"`, one entry per batch (not per day)

### Safety
- All wallet deductions use optimistic locking (`.eq("balance", currentBalance)`)
- Debt clearance and pre-payment amounts are capped to available balance
- `record_rent_request_repayment` RPC called for total (debt + prepaid) to keep rent tracking in sync
- If subscription is already `completed` (charges_remaining = 0), skip pre-payment

