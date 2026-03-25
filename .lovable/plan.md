## Phase 3: Dual Execution — Shadow Audit in Edge Functions ✅

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

## Phase 4: Optional Read from New Service Layer ✅

### What was done
Added `useNewServices` feature flag (default: `false`) and created `useServiceValidation` hook that conditionally runs TransactionService/WalletService validation before edge function calls. Wired into `useWallet.sendMoney()` for fail-fast pre-validation.

### Files changed
- `src/contexts/FeatureFlagsContext.tsx` — added `useNewServices` flag
- `src/core/services/useServiceValidation.ts` — new hook with `preValidateTransfer()` and `checkBalance()`
- `src/hooks/useWallet.ts` — integrated pre-validation into `sendMoney()`

### Safety
- Flag defaults to `false` — zero behavior change for users
- Service errors always fallback to `shouldProceed: true`
- Edge function remains sole transaction authority

## Phase 5: Gradual Migration — Percentage-Based Traffic Routing with Monitoring ✅

### What was done
Upgraded shadow audit from log-only to a persistent, percentage-controlled dual execution system with DB-backed monitoring and instant rollback via config table.

### Database changes
- `shadow_audit_logs` — persists shadow comparison results (function_name, primary/shadow passed, is_match, errors)
- `shadow_config` — single-row config with `sample_percentage` (default 10%) and `enabled` toggle
- `get_shadow_match_rate(p_hours)` — SQL function returning match rate per function over configurable time window

### Files created
- `supabase/functions/_shared/shadowConfig.ts` — reads config with 60-second in-memory cache, falls back to disabled on error

### Files changed
- `supabase/functions/_shared/shadowLogger.ts` — upgraded with DB persistence via adminClient parameter
- `supabase/functions/wallet-transfer/index.ts` — shadow on both success and failure validation paths, sampled
- `supabase/functions/cfo-direct-credit/index.ts` — same pattern
- `supabase/functions/fund-rent-pool/index.ts` — same pattern, removed duplicate balance check

### Safety & rollback
- All primary paths unchanged — shadow is fire-and-forget
- Rollback: set `shadow_config.enabled = false` or `sample_percentage = 0` (no code deploy needed)
- Config cached 60s to avoid per-request DB reads
- Shadow persistence errors swallowed — never affect primary response

### Rollout strategy
1. Deployed with `sample_percentage = 10` (10% of traffic)
2. Monitor `shadow_audit_logs` for divergences
3. If match rate > 99% after 48h, increase to 25% → 50% → 100%
4. Phase 6 (future) can safely swap primary to new services
