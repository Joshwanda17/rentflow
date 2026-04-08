

# Payment Approval Reference Requirement

## Problem
The Approve button on the Pending Wallet Operations widget fires immediately without capturing how the payment was made or its reference number. The manager must be required to select a payment method and provide the corresponding reference before approval completes.

## Changes

### 1. `src/components/manager/PendingWalletOperationsWidget.tsx`

**Add state for approval dialog:**
- `approveDialog: { open: boolean; opId: string | null }`
- `paymentMethod: 'bank' | 'mtn_momo' | 'airtel_money' | 'cash' | ''`
- `paymentReference: string`

**Replace direct approve call with dialog:**
- The Approve button opens an `AlertDialog` instead of calling `handleAction` directly
- Dialog contains:
  - Payment method selector (4 options: Bank, MTN MoMo, Airtel Money, Cash)
  - Reference input field with dynamic label/placeholder based on selected method:
    - Bank → "Bank Reference Number"
    - MTN MoMo → "Transaction ID (TID)"
    - Airtel Money → "Transaction ID (TID)"
    - Cash → "Receipt Number"
  - Confirm button disabled until both method selected AND reference provided (min 4 chars)

**Update `handleAction`:**
- Pass `payment_method` and `payment_reference` in the body when action is `approve`

**Bulk Approve:**
- Disable bulk approve (or remove it), since each operation now requires individual payment references

### 2. `supabase/functions/approve-wallet-operation/index.ts`

- Accept optional `payment_method` and `payment_reference` fields from the request body
- When action is `approve`, store these in the operation's metadata (update the `pending_wallet_operations` row's metadata column with the payment details)
- Include payment details in audit log / system event metadata

### 3. Database migration

- Add `payment_method` (text, nullable) and `payment_reference` (text, nullable) columns to `pending_wallet_operations` table for permanent record

## Result
- Every approval requires selecting a payment method and entering a reference
- Payment details are persisted on the operation record for audit
- Bulk approve is disabled since individual references are required

