

# Fix: Manual Rent Collection Missing Reason in Tenant Ops

## Problem
The **Collect** button in the Tenant Ops `DailyPaymentTracker` calls the `manual-collect-rent` edge function **without a `reason`** parameter. The edge function requires a reason of at least 10 characters (line 97), so every collection attempt fails with "A reason of at least 10 characters is required".

The `TenantRentCollector` component correctly prompts for a reason, but the `DailyPaymentTracker` skips it entirely.

## Fix

### Edit `src/components/executive/DailyPaymentTracker.tsx`

1. Add state for a collect dialog that captures a reason before invoking the edge function:
   - `collectTarget` state to track which rent request the manager wants to collect from
   - `collectReason` state for the mandatory reason text input

2. Change the **Collect** button from directly calling `collectMutation.mutate(id)` to opening a small confirmation dialog/sheet that:
   - Shows tenant name and daily amount
   - Has a text input for the reason (minimum 10 characters)
   - Has a "Confirm Collection" button that calls the mutation with `{ rentRequestId, collectionReason }`

3. Update the `collectMutation` to pass the reason in the request body:
   ```ts
   body: { rent_request_id: rentRequestId, reason: collectionReason }
   ```

### Files Changed
- **Edit**: `src/components/executive/DailyPaymentTracker.tsx` — add reason input dialog and pass reason to edge function

