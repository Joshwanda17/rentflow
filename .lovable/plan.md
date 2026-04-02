

# Enhance TID Completion Dialog with Full Requester Details

## Current State

The **Approve** dialog (Section A: pending → fin_ops_approved) already shows the requester's name, phone, MoMo details, recipient, amount, reason, and requires a TID — this matches the user's requirements.

However, the **TID Completion** dialog (Section B: cfo_approved → approved/completed) is minimal — it only shows amount and name in a single sentence. It lacks the full requester details and payout method information.

## Changes

### File: `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`

**Update the TID Completion Dialog (lines 460-485)** to match the Approve dialog layout:

1. Add a detail card showing:
   - Requester name and phone
   - Payout method (MoMo number + provider, bank details, or cash location)
   - Recipient name (mobile_money_name or bank_account_name)
   - Amount (bold)
   - Reason (if provided)
2. Keep the TID input field with validation (min 3 chars)
3. Same layout pattern already used in the Approve dialog — just replicate the `selected` detail block

This is a single-file UI change — no backend or database modifications needed. The existing `handleTidComplete` function already handles the ledger entry, audit log, and wallet deduction correctly.

### Files Modified
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — expand TID completion dialog with full requester details

