

## Portfolio Top-Up: Payment Method Selection (Cash / MoMo / Bank)

### What changes

The manager's `FundInvestmentAccountDialog` gets a payment method selector. Based on selection, different fields appear. No wallet deduction — funds are recorded as pending for verification.

### UI Flow

```text
┌─────────────────────────────────┐
│  Portfolio Top-Up               │
│                                 │
│  [Portfolio info card]          │
│                                 │
│  Payment Method:                │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ 💵   │ │ 📱   │ │ 🏦   │   │
│  │ Cash │ │ MoMo │ │ Bank │   │
│  └──────┘ └──────┘ └──────┘   │
│                                 │
│  Amount: [___________]          │
│                                 │
│  IF MoMo → TID: [___________]  │
│  IF Bank → Reference: [______] │
│  IF Cash → (no extra field)    │
│                                 │
│  Notes: [___________]           │
│                                 │
│  [Preview: Pending deposit]     │
│  [Cancel]  [Submit Top-Up]      │
└─────────────────────────────────┘
```

### Technical Details

**Frontend: `FundInvestmentAccountDialog.tsx`**
- Remove wallet balance fetch and display (no wallet deduction)
- Add `paymentMethod` state: `'cash' | 'mobile_money' | 'bank'`
- Three styled selectable cards for payment method
- Conditional fields:
  - `mobile_money` → TID input (required, min 8 chars)
  - `bank` → Bank reference input (required, min 6 chars)
  - `cash` → No extra field needed
- Remove `insufficientFunds` check entirely
- Update preview section to show "Pending verification" instead of wallet math
- Pass `payment_method`, `transaction_reference` (TID or bank ref) to the edge function
- Update title from "Wallet → Portfolio Top-Up" to "Portfolio Top-Up"

**Edge Function: `manager-portfolio-topup/index.ts`**
- Accept new fields: `payment_method` (cash/mobile_money/bank), `transaction_reference`
- Validate: if mobile_money, require `transaction_reference`; if bank, require `transaction_reference`
- Remove wallet deduction logic entirely (no wallet fetch, no balance check, no optimistic lock)
- Store payment details in `pending_wallet_operations` using existing columns:
  - `reference_id` → TID or bank reference
  - `metadata` → `{ payment_method, transaction_reference, initiated_by }`
  - `operation_type` → `'portfolio_topup'`
  - `status` → `'pending'`
- Keep ledger entries, audit log, and notifications (update descriptions to reflect payment method)

### Files affected
- `src/components/manager/FundInvestmentAccountDialog.tsx` — UI redesign with payment method cards
- `supabase/functions/manager-portfolio-topup/index.ts` — Remove wallet deduction, accept payment method fields

### No database changes
Uses existing `reference_id`, `metadata`, and `operation_type` columns on `pending_wallet_operations`.

