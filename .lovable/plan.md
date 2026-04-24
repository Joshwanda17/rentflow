# Fix Landlord Ops Verification + Auto-Pay Listing Bonus

## What's Wrong

### Issue 1: "Only internal staff can verify listings" 403
The deployed `.limit(1)` fix is correct, but the function is still brittle:
1. **Treasury Guard runs BEFORE role check** — if `credits_paused` ever toggles on, Landlord Ops sees a confusing 423 instead of the real authorization status.
2. **Role allow-list omits `landlord_ops` permission grants** — a staffer with only `staff_permissions.permitted_dashboard='landlord_ops'` (no base ops role) gets rejected.

### Issue 2: Two-step approval is a needless bottleneck
Today: Landlord Ops verifies → row sits in `pending_cfo` → CFO must manually approve → agent finally gets UGX 5,000. Historical data shows 2 bonuses stuck pending forever. For a flat UGX 5,000 verification incentive, the CFO step adds no value.

---

## The Fix (3 parts)

### Part 1 — Resilient role check (`credit-listing-bonus`)
- Reorder: **role check FIRST**, treasury guard SECOND.
- Expand allow-list to accept either:
  - base role in `(manager, coo, super_admin, operations, employee, ceo)`, OR
  - `staff_permissions` row with `permitted_dashboard='landlord_ops'`.
- Improve error message to include the user ID that was checked.

### Part 2 — Auto-credit on verification (skip CFO queue)
Replace the "create pending_cfo row" path with a direct ledger write inside `credit-listing-bonus`:

1. Verify listing + landlord (unchanged).
2. Insert `listing_bonus_approvals` row with `status='paid'`, `landlord_ops_approved_*` AND `cfo_approved_by=managerId` (auto-self-approved with note "auto-approved on verification"), `paid_at=now()`.
3. Call `create_ledger_transaction` RPC with the same balanced legs the existing `approve-listing-bonus` uses:
   - `cash_in` UGX 5,000 → agent wallet, category `agent_commission_earned`, scope `wallet`
   - `cash_out` UGX 5,000 → platform, category `agent_commission_earned`, scope `platform`
4. Insert `agent_earnings` row (matches `credit-landlord-verification-bonus` pattern).
5. Notify agent: "Listing verified — UGX 5,000 credited to your commission wallet."
6. Audit log `action_type='listing_bonus_auto_paid'`.

**Treasury Guard override (per your confirmation):** Listing bonus auto-credit bypasses `credits_paused` — this is a fixed verification incentive funded from existing platform float, not a discretionary disbursement.

### Part 3 — Keep CFO queue as manual override
- `approve-listing-bonus` stays untouched for edge cases (bulk historical fixes, disputes).
- `ListingBonusApprovalQueue` UI: filter out `status='paid'` rows where `landlord_ops_approved_by = cfo_approved_by` (auto-paid signature). Show only true pending/rejected ones.

---

## Files to Edit

1. **`supabase/functions/credit-listing-bonus/index.ts`** — reorder checks, expand role allow-list (add `staff_permissions` query + `ceo`), remove treasury guard for the auto-credit path, replace pending-CFO insert with ledger write + `agent_earnings` insert + agent notification + audit log.
2. **`src/components/executive/LandlordOpsDashboard.tsx`** — toast text: "✅ Verified → UGX 5,000 credited to agent" (remove "forwarded to CFO" copy).
3. **`src/components/executive/ListingBonusApprovalQueue.tsx`** — hide auto-paid rows (where `landlord_ops_approved_by = cfo_approved_by` and `status='paid'`).

## Files NOT Touched
- `approve-listing-bonus/index.ts` (manual CFO override)
- Any migration / RLS / schema
- Agent dashboards (already read from `agent_earnings` + wallet)
- Trust scoring (already triggered by `agent_commission_earned`)

---

## Impact Assessment

| Area | Change | Risk |
|---|---|---|
| `credit-listing-bonus` | Reorder + ledger write + agent_earnings insert | Medium — touches money flow. Mitigated by reusing exact RPC pattern from `approve-listing-bonus` |
| Landlord Ops toast | Copy update | Low |
| CFO queue UI | Filter auto-paid rows | Low |
| Treasury Guard | Bypassed for this flow per your confirmation | Low — single-purpose UGX 5K incentive, fully funded |
| Ledger | One auto-credit per verification, identical legs to existing CFO path | None |
| Trust score | `agent_commission_earned` already wired | None |
| Backward compat | Existing `pending_cfo` rows still work via CFO queue | None |

---

## Technical Details

**Ledger entries shape (matches `approve-listing-bonus`):**
```
[
  { account: agent_wallet_id, cash_in: 5000, cash_out: 0, category: 'agent_commission_earned', scope: 'wallet' },
  { account: platform_account, cash_in: 0, cash_out: 5000, category: 'agent_commission_earned', scope: 'platform' }
]
```
- `entries` passed as raw JSON array (NOT `JSON.stringify`'d) per ledger serialization standard.
- Reason field: `"Listing verification bonus — auto-paid on Landlord Ops verification"` (≥10 chars).

**Role check query (replaces current `.in()` only):**
```sql
SELECT 1
FROM user_roles ur
WHERE ur.user_id = $1
  AND ur.enabled = true
  AND ur.role IN ('manager','coo','super_admin','operations','employee','ceo')
UNION
SELECT 1
FROM staff_permissions sp
WHERE sp.user_id = $1
  AND sp.permitted_dashboard = 'landlord_ops'
LIMIT 1;
```
(Implemented as two parallel Supabase queries since the JS client doesn't compose UNION cleanly.)

**Auto-paid signature for UI filter:**
`status = 'paid' AND landlord_ops_approved_by = cfo_approved_by AND landlord_ops_notes ILIKE '%auto%'`
