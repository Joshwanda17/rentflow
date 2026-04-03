

## Mandatory TID Submission with Format Enforcement

### Changes to `src/components/payments/DepositFlow.tsx`

**1. Remove auto-prefix logic**
- Line 64: Change `getReferenceId()` from `return \`TID\${transactionId.trim().toUpperCase()}\`` to `return transactionId.trim().toUpperCase()`
- Lines 338-341: Remove the hardcoded `TID` prefix badge `<span>` from the input wrapper
- Line 344: Change `inputMode` from `numeric` to `text` (allow alphanumeric for MP/TID prefixes)
- Line 347: Remove `.replace(/\D/g, '')` filter so users can type `MP` or `TID`

**2. Add real-time inline TID validation**
- Add `tidError` state variable
- Add a `validateTid(value)` helper that checks on every keystroke:
  - MTN provider → must start with `MP` → error: "MTN TIDs must start with 'MP' (e.g. MP39665905645)"
  - Airtel provider → must start with `TID` → error: "Airtel TIDs must start with 'TID' (e.g. TID144205097399)"
- Show red error text below the input when invalid, green checkmark icon when valid
- Clear/re-validate when provider selection changes

**3. Update placeholders**
- Line 345: MTN placeholder → `"e.g. MP39665905645"`, Airtel → `"e.g. TID144205097399"`

**4. Block submit when TID invalid**
- Line 420: Disable submit button when `tidError` is non-empty or TID is empty (for momo channel)
- Keep existing `validateForm()` checks as defense-in-depth; update Airtel check (line 81-84) to enforce `TID` prefix instead of just rejecting `MP`

**5. Mark TID as required**
- Line 336-337: Add asterisk `*` to the label
- Line 351-353: Add helper text: "Enter the exact TID from your payment confirmation SMS"

### No other files change

