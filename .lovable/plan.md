

# Require TID Entry at CFO Rent Approval Stage

## Current State
The rent pipeline already flows COO → CFO correctly. However, the CFO stage has `showPayoutFields: false` (line 81), so the CFO cannot enter a Transaction ID (TID) when approving. The TID fields exist in the component but are hidden for this stage.

## Change

**File: `src/components/executive/RentPipelineQueue.tsx`**

1. **Enable payout fields for CFO stage** — Change `showPayoutFields` from `false` to `true` in the `coo_approved` config (line 81).

2. **Make TID mandatory for CFO approval** — In `handleApprove`, when `stage === 'coo_approved'`, validate that `payoutRef` is not empty before calling `fund-agent-landlord-float`. If empty, show a toast error: "Transaction ID is required for audit compliance."

3. **Pass TID to the edge function** — Include `payoutRef` and `payoutMethod` in the body sent to `fund-agent-landlord-float` so the TID is stored on the rent request record (`payout_transaction_reference` and `payout_method` columns).

**File: `supabase/functions/fund-agent-landlord-float/index.ts`**

4. **Store TID in edge function** — Accept `transaction_reference` and `payout_method` from the request body, and include them in the rent request update so `payout_transaction_reference` and `payout_method` are saved alongside the `funded` status transition.

This ensures every CFO-approved rent request has a TID on record for auditing purposes.

