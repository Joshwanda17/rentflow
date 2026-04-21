

## Tenant Ops can correct rent — and it propagates through the whole system

### Problem

When Tenant Ops edits a tenant's rent on `TenantDetailPanel`, only three columns on `rent_requests` change: `rent_amount`, `daily_repayment`, `duration_days`. But every dashboard (CFO, COO Tenant Balances, Agent collection, etc.) computes "what the tenant owes" as:

```
outstanding = total_repayment − amount_repaid
```

`total_repayment`, `access_fee` and `request_fee` are never recalculated, and the auto-charge engine keeps using the old `subscription_charges.charge_amount`. Result: the edit is cosmetic — the CFO and the daily charge cron see the old debt forever.

### Fix — make the Tenant Ops edit a real correction

When Tenant Ops saves a rent correction on a tenant's request, the system will:

1. **Recompute fees** using the existing `calculateRentRepayment()` helper in `src/lib/rentCalculations.ts` (the same engine used at request creation), so the new `rent_amount` + `duration_days` produce a fresh `access_fee`, `request_fee`, `total_repayment`, and `daily_repayment`.
2. **Persist all six columns** on `rent_requests` in one update: `rent_amount, duration_days, access_fee, request_fee, total_repayment, daily_repayment`.
3. **Sync the active subscription charge** for that request: update `subscription_charges.charge_amount` to the new daily so the daily auto-charge cron immediately collects the corrected amount, and refresh `end_date` based on new duration.
4. **Audit the correction** with a strict `audit_logs` row of type `tenant_ops_rent_correction` containing `{ rent_request_id, tenant_id, before, after, reason }` plus a mandatory ≥10-char reason captured in the dialog.
5. **Block destructive edits** if `amount_repaid > new total_repayment` (would create a negative outstanding) — show an inline error and refuse to save.
6. **Invalidate caches** so CFO Dashboard, COO Tenant Balances, Agent Tenant Search, and Tenant Ops queues all show the corrected outstanding on next refresh.

### What the user sees

`Tenant Ops → tap a tenant → tap a rent request → Edit (pencil)` opens an upgraded inline editor with:

- Rent Amount (UGX)
- Duration (days)
- Live preview of the recomputed Access Fee, Request Fee, **New Total Repayment**, **New Daily Repayment**, and **New Outstanding** (vs. old).
- Required "Reason for correction" text (≥10 chars).
- Save button disabled until reason is provided and new outstanding ≥ 0.

After save, a green toast confirms "Rent corrected — daily charge updated to UGX X" and the tenant's outstanding number updates everywhere (CFO, COO, Agent dashboards) on next data load.

### Where it propagates automatically (no extra code needed)

Because every dashboard reads `total_repayment − amount_repaid` live from `rent_requests`, the single update to that row makes the corrected debt show up in:

- CFO Dashboard outstanding totals
- COO `TenantsBalancesDetail`
- Agent `PriorityCollectionQueue` & `EarningsForecastCard`
- `AgentTenantSearch`, `UserProfileSheet`, `TenantAgentLinker`, `TenantRentCollector`
- Daily payment / missed-days trackers
- Tenant Ops PDF report

### Technical details

**Files touched (3):**

1. `src/components/executive/TenantDetailPanel.tsx` — extend the inline request edit:
   - Add `reason` field and a recomputed-preview block.
   - On save, call `calculateRentRepayment(rentAmount, durationDays)` and update `rent_amount, duration_days, access_fee, request_fee, total_repayment, daily_repayment` in one query.
   - Then `update subscription_charges set charge_amount = newDaily, end_date = newEnd where rent_request_id = reqId and status in ('active','pending')`.
   - Write an `audit_logs` row with `action_type='tenant_ops_rent_correction'`, `table_name='rent_requests'`, `record_id=reqId`, and full before/after metadata + reason.
   - Guard: refuse if `Number(amount_repaid) > newTotalRepayment`.
   - Invalidate `['tenant-detail', tenantId]`, `['exec-tenant-ops']`, `['coo-tenant-balances']`, `['cfo-*']` queries.

2. `src/components/rent/EditApprovedRentDialog.tsx` *(optional consistency pass)* — same recompute logic so the dialog used in `RentDueReceivablesWidget` and `ApprovedRentRequestsWidget` stays in sync (currently lets users hand-edit `total_repayment` directly, which can desync from `rent_amount`). Switch it to derive from `rent_amount` + `duration_days` via `calculateRentRepayment()`.

3. No DB migration needed — all target columns already exist on `rent_requests` and `subscription_charges`.

### Edge cases

- **No active subscription charge** (request not yet funded): skip step 3 silently — `total_repayment` change still propagates.
- **Already fully repaid** (`amount_repaid >= old total_repayment`): allow lowering only if `new total_repayment >= amount_repaid`; otherwise block.
- **Reason missing or <10 chars**: blocked client-side and rejected by audit policy.
- **RLS**: `rent_requests` and `subscription_charges` updates are already permitted for staff roles used by Tenant Ops; no policy changes required.

### Acceptance check

After saving a correction lowering rent from 500k → 300k for a tenant with `amount_repaid = 100k`:
- `total_repayment` drops from ~565k → ~339k.
- Outstanding shown on CFO Dashboard, COO Tenant Balances, and Agent collection queue all show the new ~239k owed.
- Tomorrow's auto-charge takes the new `daily_repayment` instead of the old.
- An `audit_logs` row with the reason is visible to the manager audit view.

