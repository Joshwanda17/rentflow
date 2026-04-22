

## Show all Landlords with their Tenants (Paid / Pending)

Right now the **Landlords Paid** view only shows landlords who already received a disbursement. You want a fuller picture: **every landlord** with **every tenant** under them, each tenant tagged **Paid** or **Pending**, plus a bucket for **tenants with no landlord**.

### What I'll build

A new section/view inside Landlord Operations called **"Landlords & Tenants"**, with this structure:

```text
┌─ Landlords & Tenants ─────────────────────────────┐
│  KPIs: Landlords · Tenants · Paid · Pending        │
│  [Search] [All / Paid only / Pending only]         │
│                                                     │
│  ▼ Kalungi Yasin  · 0752485865  (3 tenants)        │
│       • John Doe        UGX 200,000  ✓ Paid        │
│       • Mary Auma       UGX 150,000  ⏳ Pending    │
│       • Peter Ssali     UGX 180,000  ✓ Paid        │
│                                                     │
│  ▼ Shamila Night · 0703533879  (1 tenant)          │
│       • Ali Mukasa      UGX 200,000  ✓ Paid        │
│                                                     │
│  ▼ ⚠ No Landlord Linked  (12 tenants)              │
│       • Tenant A        UGX 100,000  ⏳ Pending    │
│       • Tenant B        UGX 250,000  ✓ Paid        │
└─────────────────────────────────────────────────────┘
```

### Data sources (pulled from existing tables, no migration)

- **Landlords**: `landlords` table (id, name, phone)
- **Tenants under landlord**: derived from `rent_requests.landlord_id → tenant_id`, joined with `profiles` for tenant name/phone
- **Paid vs Pending status per tenant**:
  - **Paid** → rent_request status in `funded`, `disbursed`, `repaying`, `completed` (landlord has been/being paid)
  - **Pending** → status in `pending`, `agent_verified`, `tenant_ops_approved`, `landlord_ops_approved`, `coo_approved` (not yet disbursed)
  - **Rejected** → excluded
- **No-landlord bucket**: `rent_requests` rows where `landlord_id IS NULL` (grouped at the bottom)

### Files

- **New**: `src/components/executive/landlord-ops/LandlordsWithTenantsView.tsx` — the new collapsible list with KPIs + filters + search
- **Modified**: `src/components/executive/LandlordOpsDashboard.tsx` — add a nav item **"Landlords & Tenants"** and route to the new view (existing `LandlordsPaidView` stays untouched)

### Behavior details

- One tenant can appear once per landlord (deduped by tenant_id within each landlord). If a tenant has multiple rent requests, the **latest status wins** for paid/pending, and total paid amount is summed.
- Each row shows tenant name, phone, monthly rent amount, status badge.
- Tap a landlord card to expand/collapse the tenant list (same UX as the current Paid view).
- Search matches landlord name/phone OR tenant name/phone.
- "No Landlord Linked" group is always rendered last with an amber warning style so Ops can fix attribution.

No backend / RLS / financial-statement changes — purely a read-only aggregation of `landlords`, `rent_requests`, and `profiles`.

