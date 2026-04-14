

## Add Inline TID Verification to Pending Deposits List

### Problem
When the Financial Ops manager taps "Verify Deposits" and sees the pending deposits list, they can see depositor names and amounts but can only reject deposits inline. To approve/verify, they must go to a separate TID Verification screen, losing context of whose deposit they're verifying.

### Solution
Add an inline TID input field directly on each pending deposit card in `DepositStatsPanel.tsx`, so the manager can enter the transaction ID while seeing the depositor's name and amount, then approve in one tap.

### Changes in `src/components/financial-ops/DepositStatsPanel.tsx`

1. **Add state** for tracking which deposit is being verified inline (`verifyingId`), the entered TID (`inlineTid`), and processing state (`inlineApproving`).

2. **Replace the deposit card layout** (lines 269-307): Each pending deposit card gets:
   - Depositor name and amount remain prominently visible at the top
   - A "Verify" button that expands an inline TID input field below the card
   - When expanded: a TID input field + provider selector + "Approve" button, all within the same card so the name and amount stay visible
   - The existing "Reject" button remains

3. **Add inline approve handler**: When the manager enters a TID and taps "Approve":
   - Calls `supabase.functions.invoke('approve-deposit', { body: { deposit_request_id, action: 'approve' } })`
   - Logs an audit entry with the entered TID, depositor name, and amount
   - Removes the deposit from the pending list and shows success toast
   - Optionally updates the deposit's `transaction_id` if the manager entered/corrected it

4. **UI layout per card** (expanded state):
   ```text
   ┌──────────────────────────────────┐
   │ 👤 John Doe          USh 50,000  │
   │    MP241231... · MTN · 10:30 AM  │
   │ ┌──────────────────────────────┐ │
   │ │ TID: [____________] [MTN ▾] │ │
   │ │ [✓ Approve]        [✗ Reject]│ │
   │ └──────────────────────────────┘ │
   └──────────────────────────────────┘
   ```

### Files Modified
- `src/components/financial-ops/DepositStatsPanel.tsx` — add inline TID entry and approve action to each pending deposit card

