

# Fix Plan: Partner Wallet Payout + Tenant Rent Payment from Wallet

## Two Bugs Being Fixed

### Bug 1: Partner "Pay to Wallet" — Missing `transaction_group_id`
When the COO clicks "Pay to Wallet" for a partner, a `pending_wallet_operations` record is created **without a `transaction_group_id`**. When the CFO approves it, the `approve-wallet-operation` function copies this null value to the `general_ledger`. The `sync_wallet_from_ledger` trigger requires a non-null `transaction_group_id` to fire — so the partner's wallet **never gets credited**.

**Fix**: Generate a `crypto.randomUUID()` as `transaction_group_id` when creating the pending operation in `COOPartnersPage.tsx`.

### Bug 2: Tenant "Pay Rent" — Completely Fake (No Backend)
The current `PayRentFlow.tsx` is a UI-only mockup:
- Payment success/failure is determined by `Math.random() > 0.2`
- No backend function is called
- No wallet deduction occurs
- No rent request repayment is recorded
- The tenant's outstanding balance never changes

**Fix**: Create a new `tenant-pay-rent` Edge Function and wire the `PayRentFlow` to call it. The function will:
1. Verify the tenant's identity
2. Check wallet balance ≥ payment amount
3. Call `record_rent_request_repayment` RPC to reduce outstanding balance
4. Insert a `cash_out` ledger entry with `transaction_group_id` → trigger auto-deducts from wallet
5. Route funds to landlord wallet via ledger entry
6. Return success with updated balance

---

## Changes

### 1. `src/components/coo/COOPartnersPage.tsx`
Add `transaction_group_id: crypto.randomUUID()` to the `pending_wallet_operations` insert in `handlePay` (~line 2626).

### 2. New: `supabase/functions/tenant-pay-rent/index.ts`
New Edge Function that:
- Authenticates the tenant via JWT
- Accepts `{ amount, description? }` in request body
- Looks up tenant's active rent request (`status IN ('funded', 'disbursed', 'repaying')`)
- Validates: amount > 0, amount ≤ wallet balance, amount ≤ outstanding balance
- Calls `record_rent_request_repayment` RPC to update rent_requests
- Inserts `cash_out` ledger entry (category `rent_repayment`) with `transaction_group_id` → triggers wallet deduction
- Inserts `cash_in` ledger entry for the landlord (category `landlord_rent_payment`) with `transaction_group_id` → triggers landlord wallet credit
- Notifies tenant and landlord
- Returns `{ success, amount_paid, remaining_balance, new_wallet_balance }`

### 3. `src/components/payments/PayRentFlow.tsx`
Replace the fake `handleProcessingComplete` with real logic:
- Import `supabase` client and `useAuth`
- Accept `walletBalance` prop (from `TenantPaymentsWidget`)
- Add "Wallet" as a payment method option (first/default)
- On confirm: call `supabase.functions.invoke('tenant-pay-rent', { body: { amount } })`
- Show real success/failure based on the response
- Display actual receipt data (amount deducted, remaining rent, new wallet balance)

### 4. `src/components/payments/TenantPaymentsWidget.tsx`
- Pass real wallet balance and rent data (from hooks) instead of hardcoded defaults
- Pass `walletBalance` to `PayRentFlow`

---

## Technical Details

- Follows the single-writer principle: wallet changes happen only via `sync_wallet_from_ledger` trigger
- Uses `record_rent_request_repayment` RPC as the sole source of truth for rent repayment (no duplicate writes)
- Landlord routing uses the existing `auto_route_rent_funds` pattern (landlord → caretaker → agent fallback)
- Agent commission (UGX 10,000) is NOT triggered here — commissions are only for agent-facilitated collections, not self-payments by tenants

