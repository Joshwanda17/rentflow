

# Codebase Bug Scan Results

## Critical Bugs Found

### BUG 1: Double-Deduction/Credit — Same Class as agent-deposit Fix (CRITICAL)

The `sync_wallet_from_ledger` trigger fires on ALL `general_ledger` inserts and automatically adjusts wallet balances. Several edge functions and client components **manually update wallet balances AND insert ledger entries**, causing the exact same double-deduction bug that was fixed in `agent-deposit` and `approve-deposit`.

**Affected edge functions (manual wallet update + ledger insert = double-count):**

| File | Lines | Bug |
|------|-------|-----|
| `process-investment-interest/index.ts` | 102-105 | Manual `.update({ balance: newBalance })` — NO ledger insert exists, but if one is ever added, will double-credit. Currently also bypasses trigger-only policy. |
| `approve-rent-request/index.ts` | 246-248 | Manual `.update({ balance: ... + AGENT_APPROVAL_BONUS })` for agent bonus. The `credit_agent_event_bonus` RPC on line 257 may also insert ledger entries, potentially double-crediting. |
| `credit-landlord-registration-bonus/index.ts` | 98-101 | Manual `.update({ balance: newBalance })` AND `general_ledger.insert()` on line 115. **Active double-credit bug** — trigger adds bonus again. |
| `fund-tenants/index.ts` | 136-140, 171-174 | Manual deduction from Welile wallet AND manual credit to landlord wallet. Also inserts to `pending_wallet_operations`. If those flow to ledger, double-counted. |
| `agent-invest-for-partner/index.ts` | 80-86 | Manual agent wallet deduction + `general_ledger.insert()` on line 122. **Active double-deduction bug.** |
| `coo-wallet-to-portfolio/index.ts` | 103-107 | Manual wallet deduction + `general_ledger.insert()` on line 147. **Active double-deduction bug.** |
| `retry-no-smartphone-charges/index.ts` | 108-114 | Manual wallet deduction + `general_ledger.insert()` on line 124. **Active double-deduction bug.** |
| `coo-invest-for-partner/index.ts` | 91-95 | Manual wallet deduction + ledger insert. **Active double-deduction bug.** |

**Affected client-side code (manual wallet update, bypasses ledger entirely):**

| File | Lines | Bug |
|------|-------|-----|
| `src/components/ai-id/AiIdLendDialog.tsx` | 141-157 | Direct wallet balance manipulation from CLIENT — no ledger entry, no audit trail, no RLS protection via service role. **Critical: bypasses all financial controls.** |
| `src/pages/BecomeSupporter.tsx` | 129-132 | Direct wallet credit (+500) from CLIENT — no ledger entry. |
| `src/components/wallet/PayLandlordDialog.tsx` | 194-198 | Direct wallet deduction from CLIENT — check if corresponding ledger insert exists. |

### BUG 2: ForceRefreshManager Always Throws Error

**File:** `src/components/manager/ForceRefreshManager.tsx`, lines 57-60

```typescript
const error = new Error('Force refresh feature is currently unavailable');
if (error) throw error; // ALWAYS throws — button is broken
```

The function creates an error and immediately throws it. The "Send Refresh" button will always fail with an error toast.

### BUG 3: seed-test-funds Manual Wallet Update

**File:** `supabase/functions/seed-test-funds/index.ts`, line 112

Manual `.update({ balance: newBalance })` — if a ledger entry is also inserted, this will double-count. Even if test-only, it violates the trigger-only policy and could corrupt test data.

---

## Recommended Fix Priority

**P0 — Fix immediately (active money bugs):**
1. `agent-invest-for-partner` — Remove manual wallet deduction (keep ledger insert only)
2. `credit-landlord-registration-bonus` — Remove manual wallet update (keep ledger insert only)
3. `coo-invest-for-partner` — Remove manual wallet deduction
4. `coo-wallet-to-portfolio` — Remove manual wallet deduction
5. `retry-no-smartphone-charges` — Remove manual wallet deduction
6. `fund-tenants` — Remove manual wallet deductions/credits
7. `approve-rent-request` — Remove manual agent bonus wallet update
8. `AiIdLendDialog.tsx` — Replace direct wallet updates with edge function call that uses ledger
9. `BecomeSupporter.tsx` — Replace direct wallet update with ledger entry via edge function
10. `PayLandlordDialog.tsx` — Verify ledger-only pattern

**P1 — Fix soon:**
11. `process-investment-interest` — Convert to ledger-insert-only pattern
12. `ForceRefreshManager` — Either implement properly or remove the broken button

**Pattern for all fixes:** Same as the proven `agent-deposit` fix:
- Replace `ensureWalletExists` (upsert with `ignoreDuplicates: true`)
- Remove all `.update({ balance: ... })` calls
- Keep only `general_ledger.insert()` — the `sync_wallet_from_ledger` trigger handles balance math

### Technical Notes
- All edge function fixes follow the identical pattern from the `agent-deposit` fix
- Client-side wallet updates (AiIdLendDialog, BecomeSupporter) need new edge functions or must call existing ones, since client code cannot insert into `general_ledger` with service role
- Total: **12 files** need fixes, **8 are active double-count bugs**

