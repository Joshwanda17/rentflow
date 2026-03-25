

## Phase 4: Optional Read from New Service Layer

### What this does
Adds a `useNewServices` feature flag and creates a hook (`useServiceValidation`) that conditionally runs the new service layer's validation logic before edge function calls. When the flag is off (default), nothing changes. When enabled, client-side pre-validation runs using `TransactionService` methods, providing instant feedback before the network call.

### Changes

**1. `src/contexts/FeatureFlagsContext.tsx`**
- Add `useNewServices: boolean` to the `FeatureFlags` interface (default: `false`)

**2. `src/core/services/useServiceValidation.ts` (new)**
- A hook that reads the `useNewServices` flag
- Exposes methods like `preValidateTransfer(request)`, `preValidateDeposit(request)`, `checkBalance(balance, amount)`
- Each method returns `{ shouldProceed: true }` when the flag is off (passthrough)
- When the flag is on, runs the corresponding `TransactionService` / `WalletService` validation and returns `{ shouldProceed, errors }` 
- Always non-blocking — if the service layer throws, it returns `shouldProceed: true` (safe fallback)

**3. `src/hooks/useWallet.ts`**
- Import `useServiceValidation`
- In `sendMoney()`, call `preValidateTransfer()` before invoking the edge function
- If pre-validation fails (and flag is on), return the error immediately without the network call — faster UX
- If pre-validation passes or flag is off, proceed to edge function as before (zero behavior change)

**4. `src/components/wallet/SendMoneyDialog.tsx`**
- No changes needed — it already consumes `sendMoney` from `useWallet`

### Architecture

```text
User clicks "Send Money"
  │
  ├─ useNewServices = false (default)
  │    └─ Straight to edge function (current behavior, unchanged)
  │
  └─ useNewServices = true
       ├─ TransactionService.validateWalletTransfer() runs locally
       ├─ Pass → proceed to edge function as normal
       └─ Fail → return error instantly (no network call)
           └─ Edge function is NEVER bypassed for success — it remains the authority
```

### Key safety properties
- Flag defaults to `false` — zero change for all users
- New services only provide early rejection (fail-fast), never early approval
- Edge function remains the sole authority for executing transactions
- If service validation throws an exception, fallback is `shouldProceed: true`
- No database changes, no edge function changes

### Files affected
- `src/contexts/FeatureFlagsContext.tsx` — add flag
- `src/core/services/useServiceValidation.ts` — new hook
- `src/hooks/useWallet.ts` — wire pre-validation into `sendMoney`

