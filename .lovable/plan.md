

# Add "TID" Prefix to Transaction ID Field

## What Changes

**File: `src/components/wallet/DepositDialog.tsx`**

1. **Add a fixed "TID" prefix** to the Transaction ID input field using an inline prefix label (styled inside the input container), so the field always displays `TID` followed by the user's input.

2. **Update `handleTransactionIdChange`** to strip any "TID" prefix the user might paste, storing only the raw value in state (e.g., user types `12345ABCD`, state holds `12345ABCD`, display shows `TID12345ABCD`).

3. **Update `checkTransactionId`** — the duplicate check already uses the first 5 characters. We ensure those 5 characters come from the user-entered portion (after TID), not from the prefix itself. The logic stays the same: take `substring(0, 5)` of the normalized user input and query with `ilike`.

4. **Update submission** — when saving to the database, prepend `TID` to the value: `transaction_id: 'TID' + transactionId.trim().toUpperCase()`.

5. **UI implementation** — use an input group pattern with a non-editable `TID` label on the left side of the input, similar to currency prefix patterns:
   ```
   ┌─────┬──────────────────────┐
   │ TID │ 12345ABCD            │
   └─────┴──────────────────────┘
   ```

## Summary of Behavior
- User sees `TID` as a fixed prefix they cannot edit
- User enters the transaction ID value after the prefix
- Duplicate check fires after 5+ characters are entered, comparing only the first 5 digits of the user's input
- Stored value in DB includes the `TID` prefix

