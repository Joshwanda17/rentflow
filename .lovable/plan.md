## Raise deposit maximum to UGX 1,000,000,000

**File:** `src/components/payments/DepositFlow.tsx` (line 107)

**Change:**
```ts
const MAX_DEPOSIT = 1_000_000_000; // was 10_000_000
```

That single constant drives:
- Validation toast ("Maximum deposit is …")
- Input `max` attribute
- Confirm-button disabled state
- Helper text ("Between USh 500 and USh 1.0B")
- Inline red "Maximum is …" warning

No backend cap exists for deposit amount, so no edge function or DB change is needed. The currency formatter already renders values ≥ 1B as `1.0B`, so the helper text will read naturally.

**Out of scope (left at UGX 10M):** rent amount, loan amount, partner top-up quick-pick chips, tenant quick-contribute dialog. Tell me if you want any of those raised too.