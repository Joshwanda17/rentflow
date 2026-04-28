## Tenant Payments Report — fixes

I checked the report code (`src/lib/generateTenantOpsReportPdf.ts`) and the data builder in `src/components/executive/TenantOpsDashboard.tsx`, then verified against the live ledger for **20–26 Apr 2026**.

**What I found**
- The report IS already tenant-centric (one row per paying tenant). The 4 tenants and UGX 785,300 in your screenshot match the ledger exactly.
- The Agent column showed "—" for all 4 tenants because none of them have any `agent_collections`, `field_collections`, or active `rent_requests` rows — so there's literally no agent linked. We can widen attribution by also falling back to `profiles.referrer_id` (the agent who onboarded them) so the column is rarely empty.
- Outstanding shows 0 for everyone because we only read `rent_requests`. Tenants without a rent_request always look "fully settled". We should pull lifetime balance from the ledger directly so it's always accurate.
- Date range has a **timezone off-by-one bug**: `reportFrom.toISOString()` converts local-midnight to UTC, so "From 20 Apr" actually starts at 19 Apr 21:00 UTC in Uganda. We'll normalize to local end-of-day on both ends.

### Changes

**1. Make tenant focus explicit (visual)** — `generateTenantOpsReportPdf.ts`
- Rename headline subtitle to: *"Tenants who paid in this period — with their agent (if any) and current outstanding balance."*
- Show tenant phone under the tenant name in the Tenant column (small grey).
- Move the Agent column AFTER Channel and shrink it (de-emphasized but still present, as requested).
- Footer note clarifies: *"One row per tenant. Agent column shows the field agent who collected or onboarded them."*

**2. Accurate date range** — `TenantOpsDashboard.tsx` `handlePrintReport`
- Build `fromIso` from local-midnight of `reportFrom` (set hours to 0,0,0,0 first, then `toISOString()`), and `toIso` from local-end-of-day (already correct).
- Display the resolved range in the PDF subtitle exactly as queried, so what you see on the PDF == what was queried.

**3. Outstanding from ledger (always accurate)** — `TenantOpsDashboard.tsx`
- For each paying tenant, compute `outstanding = SUM(rent_charged cash_out) − SUM(tenant_repayment + rent_repayment cash_in)` from `general_ledger` across all time, instead of relying on `rent_requests.total_repayment − amount_repaid`.
- Falls back to 0 if no charges exist (cash-only tenants).

**4. Broader agent attribution (so the Agent column is meaningful)** — `TenantOpsDashboard.tsx`
- Per-payment attribution priority:
  1. The agent on the matching `agent_collections` row (already done).
  2. The agent on any active `rent_requests` for the tenant (already done).
  3. **NEW**: `profiles.referrer_id` if it points to a user with the `agent` role (the onboarding agent).
- If still none, show "Direct (no agent)" instead of "—" so it's clear the tenant paid without an agent.

**5. Empty/edge cases**
- If 0 payments in range: keep current toast.
- If `reportFrom > reportTo`: swap them silently and show a warning toast.

### Files touched
- `src/components/executive/TenantOpsDashboard.tsx` — date normalization, ledger-based outstanding, referrer-based agent fallback.
- `src/lib/generateTenantOpsReportPdf.ts` — subtitle copy, tenant phone subline, column order/width tweak, footer note.

### Out of scope
- No DB migrations. No new tables. No changes to other reports or dashboards.
