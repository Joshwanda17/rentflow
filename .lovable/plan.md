

# Add Inline Editing to Review Rent Request Dialog

## Problem
The "Review Rent Request" dialog in `RentPipelineQueue.tsx` displays financial details (Rent Amount, Duration, Access Fee, Daily Repayment, Total Repayment, House Category) as read-only text. Users need to edit these values directly within the review dialog without opening a separate edit form.

## Approach
Add a tap-to-edit pattern on the financial fields in the review dialog. Each field shows its current value normally, and when tapped, switches to an inline input. A small "Save" button persists changes to the `rent_requests` table and refreshes the data.

## What we'll change

### File: `src/components/executive/RentPipelineQueue.tsx`

1. **Add editing state** — `editingField` (which field is active), `editValue` (current input value), and `savingEdit` (loading state).

2. **Create an `InlineEditableField` sub-component** that renders:
   - **View mode**: The existing label + value with a subtle pencil icon on tap
   - **Edit mode**: An `<Input type="number">` with Save/Cancel buttons

3. **Add a `handleFieldSave` function** that:
   - Updates the specific field on `rent_requests` via Supabase
   - Auto-recalculates dependent fields when `rent_amount` or `duration_days` change (using `calculateRentRepayment` from `rentCalculations.ts`)
   - Invalidates the query cache to refresh the list
   - Updates `selectedRequest` locally so the dialog reflects the change immediately
   - Logs an audit trail entry

4. **Apply `InlineEditableField`** to these fields (lines 507-538):
   - `rent_amount` — Rent Amount
   - `duration_days` — Duration
   - `access_fee` — Access Fee
   - `daily_repayment` — Daily Repayment
   - `total_repayment` — Total Repayment
   - `house_category` — House Category (text input, not number)

5. **Import** `Pencil` icon from lucide-react and `calculateRentRepayment` from `@/lib/rentCalculations`.

### Auto-recalculation logic
When `rent_amount` or `duration_days` is edited, the save function will recalculate `access_fee`, `total_repayment`, and `daily_repayment` using `calculateRentRepayment()` and include all recalculated fields in the update payload. This ensures financial consistency.

### UX details
- Pencil icon appears on each editable field row
- Tapping the pencil switches that single field to edit mode
- Save button confirms; Cancel or blur reverts
- Toast confirms success or shows error
- Only one field editable at a time

## Files changed
1. `src/components/executive/RentPipelineQueue.tsx` — add inline editing to the review dialog's financial fields

