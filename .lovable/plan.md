

## Add Tenant Drawer to Each Landlord Row

Right now tapping a landlord row expands to show **disbursement records** (amounts + payment method). You want it to show **the tenants under that landlord** with each tenant marked **Paid** or **Due Today**.

### What I'll build

A bottom **Drawer** that opens when you tap any landlord row in the **Landlords Paid / Due Today** view. The current inline expand-down behavior will be replaced by this drawer (cleaner on mobile, more room for tenant details).

```text
┌─ Kalungi Yasin · 0752485865 ─────────┐
│  3 tenants · UGX 530,000 total        │
│  ─────────────────────────────────────│
│  • John Doe        UGX 200,000  ✓ Paid│
│       Paid 12 Apr 2026 · 5 days ago   │
│  • Mary Auma       UGX 150,000  🕒 Due│
│       Due today                        │
│  • Peter Ssali     UGX 180,000  ✓ Paid│
│       Paid 02 Apr 2026 · 15 days ago  │
└────────────────────────────────────────┘
```

### How tenant data is resolved

For each landlord group, I already have a `records[]` array of `rent_request` / `disbursement` rows that include `rent_request_id`. To get tenant identity I'll:

1. Collect every `rent_request_id` from the landlord group's records.
2. Query `rent_requests` for `tenant_id` + `rent_amount` + `status` + `disbursed_at`.
3. Query `profiles` once (batched) for the tenant `full_name` + `phone`.
4. Per tenant, mark **Paid** if status ∈ `funded/disbursed/repaying/completed`, else **Due Today**.
5. Dedupe by `tenant_id` (latest request wins, amounts summed).

This runs lazily — only when a landlord row is tapped, so it doesn't slow the main list.

### Files

- **Modified**: `src/components/executive/landlord-ops/LandlordsPaidView.tsx`
  - Replace inline expansion with `<Drawer>` from `@/components/ui/drawer`.
  - Add state `selectedLandlord: LandlordGroup | null`.
  - Add a `useQuery` keyed by `['landlord-tenants', landlord_id]` enabled only when drawer open.
  - Tap on landlord card sets `selectedLandlord`; closing clears it.
  - Drawer header: landlord name, phone, total, tenant count.
  - Drawer body: scrollable list of tenant cards (name, phone, rent amount, Paid/Due badge, date).
  - Empty state inside drawer if landlord has no resolvable tenants.

### Behavior

- Tapping anywhere on the landlord row opens the drawer (no more chevron expand).
- Drawer shows a loader while tenants fetch.
- Each tenant row uses the same Paid/Due color scheme as the parent tabs (emerald for Paid, amber for Due Today).
- Closing the drawer (swipe down, tap overlay, or close button) returns to the list.

No backend, RLS, or schema changes — this is a pure UI + lazy-fetch enhancement on top of existing tables (`rent_requests`, `profiles`).

