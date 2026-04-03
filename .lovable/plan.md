

## Strict Deposit Verification Without TID Pre-Registration

### Problem
The current system allows Financial Ops staff to **pre-register TIDs** via the `TidVerification` component — storing them in `pre_registered_tids` before any user submits a deposit. When a user later submits a deposit with a matching TID, it **auto-approves** without manual review. This creates fraud risk from unauthorized or mismatched deposits.

### What Changes

**1. Remove TID Pre-Registration from TidVerification.tsx**
- Remove the entire "Step 2" block (lines 109-148) that inserts into `pre_registered_tids` when no pending deposit is found
- Remove the `not_found_preregistered` and `not_found_exists` result states and their UI sections
- When no pending deposit matches the entered TID, show a simple "No matching deposit found" message instead
- The component becomes a pure **search-and-approve** tool: enter TID + amount → find matching pending deposits → approve

**2. Remove Auto-Match from DepositFlow.tsx**
- Remove the entire "Pre-registered TID auto-match" block (lines 144-184) that queries `pre_registered_tids` and triggers auto-approval
- All deposits will always land as `status: 'pending'` — no exceptions
- Remove the conditional success message; always show "Deposit submitted for verification"

**3. Add TID Format Validation**
- In `DepositFlow.tsx` `validateForm()`: enforce MTN TIDs must start with `MP`, Airtel TIDs must match valid Airtel format
- In `TidVerification.tsx`: add the same provider-aware format validation before searching
- In `ApprovalQueue.tsx`: display the provider and validate TID format before allowing approval

**4. Add Unique TID Constraint (Database Migration)**
- Add a unique index on `deposit_requests.transaction_id` to enforce uniqueness at the DB level (the client-side duplicate check already exists but this adds a hard constraint)

**5. Audit Trail Enhancement**
- In the `approve-deposit` edge function: ensure `processed_by` (who approved) and timestamp are always recorded (already done)
- In `ApprovalQueue.tsx`: log verification actions with the operator's entered TID vs. the deposit's TID for audit

### Files Modified

| File | Change |
|------|--------|
| `src/components/financial-ops/TidVerification.tsx` | Remove pre-registration logic; keep as search-and-approve only; add TID format validation |
| `src/components/payments/DepositFlow.tsx` | Remove `pre_registered_tids` auto-match block; add MTN/Airtel TID format validation |
| `src/components/financial-ops/ApprovalQueue.tsx` | Add TID format badge/validation display for operators |
| Database migration | Add unique index on `deposit_requests.transaction_id` |

### What Does NOT Change
- The `pre_registered_tids` table remains in the database (no destructive migration) but is no longer written to or read from
- The `approve-deposit` edge function remains unchanged — it already handles manual approval correctly
- The `ApprovalQueue` approval/reject flow remains intact
- All existing pending deposits continue to work normally

### Strict Rules Enforced
- No TIDs stored without a user-initiated deposit
- No auto-approval based on pre-entered TIDs
- No matching against unlinked TIDs
- Unique TID constraint prevents reuse
- Every approval logged with operator identity and timestamp

