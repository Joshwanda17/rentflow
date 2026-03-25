

## Phase 3: Dual Execution — Shadow Audit in Edge Functions

### What this does
Adds non-blocking shadow validation calls inside 3 edge functions (`wallet-transfer`, `cfo-direct-credit`, `fund-rent-pool`). Shadow logic runs after the primary validation, logs match/divergence, and **never** affects the primary response.

### New files

**1. `supabase/functions/_shared/shadowValidation.ts`**
Port of Phase 2 pure validation functions for Deno runtime. Contains:
- `shadowValidateWalletTransfer()` — amount range, UUID, self-transfer, phone checks
- `shadowValidateCfoAdjustment()` — role check, amount 1–50M, reason length
- `shadowValidatePoolFunding()` — supporter role, positive amount

These are standalone pure functions (no imports from `src/`).

**2. `supabase/functions/_shared/shadowLogger.ts`**
- `runShadowAudit(fnName, inputs, primaryPassed, shadowFn)` — wraps shadow in try/catch
- Executes as fire-and-forget (non-awaited promise)
- Logs `[SHADOW] MATCH` or `[SHADOW] DIVERGENCE` with both results
- Shadow errors logged as `[SHADOW] ERROR` — never propagated

### Edge function changes (minimal, additive only)

**3. `wallet-transfer/index.ts`**
- Add import of `runShadowAudit` and `shadowValidateWalletTransfer`
- After all primary validations pass (before wallet DB operations ~line 100), insert:
```ts
runShadowAudit('wallet-transfer', { senderId, resolvedRecipientId, amount },
  true, () => shadowValidateWalletTransfer({ senderId, recipientId: resolvedRecipientId, amount, description: safeDescription })
);
```
- Zero changes to primary logic, responses, or error paths

**4. `cfo-direct-credit/index.ts`**
- Same pattern after role+input validation succeeds
- Shadow validates CFO adjustment inputs

**5. `fund-rent-pool/index.ts`**
- Same pattern after role+amount validation succeeds
- Shadow validates pool funding inputs

### What stays the same
- All primary execution paths, responses, DB operations — untouched
- No frontend changes, no database changes
- Shadow calls are detached promises — add zero latency to user responses
- Any shadow failure is swallowed silently (logged only)

### Technical details
- `_shared/` imports via relative path: `import { ... } from "../_shared/shadowValidation.ts"`
- Shadow functions are pure (no DB, no Supabase client)
- `runShadowAudit` catches all errors internally — the `.catch(() => {})` on the caller side is a double safety net
- Log output format: `[SHADOW] wallet-transfer | MATCH | primary=true shadow=true`

