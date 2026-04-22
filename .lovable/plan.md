

## Add "Landlords Paid" View to Landlord Ops

A new navigation card on the Landlord Ops dashboard letting operators see which landlords have been paid (via tenant rent disbursements), how much, and drill down per landlord.

### Where it goes

New card in the Landlord Ops home grid (`src/components/executive/LandlordOpsDashboard.tsx`), placed in the priority section right under "All Landlords" / above "Locations":

```
┌─────────────────────────────────────────────┐
│ 💸 Landlords Paid                    [9 →]  │
│    Disbursements from tenant rent           │
└─────────────────────────────────────────────┘
```

### What the view shows

**Top KPI bar (3 cards):**
- Total Paid Out · `UGX 1,350,000`
- Landlords Paid · `9`
- Last 30 days · `UGX X · Y disbursements`

**Search + filter row:**
- Search by landlord name / phone
- Period filter: All · 30d · 7d · Today
- Confirmation filter: All · Agent confirmed · Pending

**Landlord list** (one row per landlord, sorted by total paid desc):

```
┌──────────────────────────────────────────────────────┐
│ NAKATO MARY                       UGX 450,000   ✓ 3  │
│ 0772-xxx · MoMo · Last paid 2d ago                   │
│ 3 disbursements · 2 confirmed · 1 pending      ▸    │
└──────────────────────────────────────────────────────┘
```

Tap a row → expands to show each individual disbursement (amount, date, payout method, transaction ref, agent-receipt confirmation with GPS link + photo count). Same visual language as `LandlordPaymentHistory.tsx`.

### Data source

Single client-side `useQuery` against `disbursement_records` joined to `landlords` and `agent_delivery_confirmations`. No new tables, no edge function, no new RLS (Landlord Ops staff already have read access).

```ts
// Fetch all disbursements + landlords + delivery confirmations
const { data: disbursements } = await supabase
  .from('disbursement_records')
  .select('*, landlord:landlords(id, name, phone, mobile_money_number)')
  .order('disbursed_at', { ascending: false });

const { data: confs } = await supabase
  .from('agent_delivery_confirmations')
  .select('*')
  .in('disbursement_id', disbursementIds);

// Group in JS by landlord_id → {total, count, confirmedCount, lastPaidAt, records[]}
```

`staleTime: 60_000` to match the existing pattern in `LandlordPaymentHistory.tsx`.

### Files touched

1. **NEW** `src/components/executive/landlord-ops/LandlordsPaidView.tsx` (~250 lines)
   - Self-contained view, internal `useQuery(['landlord-ops-paid-landlords'])`
   - KPI bar, search + period + confirmation filters
   - Expandable landlord rows reusing the disbursement detail markup from `LandlordPaymentHistory.tsx`
   - Reuses `formatUGX`, `Card`, `Badge`, `Input`, `Button` from existing UI kit

2. **EDIT** `src/components/executive/LandlordOpsDashboard.tsx`
   - Add `'landlords-paid'` to the `View` union type
   - Add nav-card entry with `Banknote` icon, label "Landlords Paid", subtitle "Disbursements from tenant rent", positioned right under "All Landlords"
   - Add `view === 'landlords-paid'` branch that renders `<LandlordsPaidView />` with the existing `<BackButton />` pattern
   - Show badge count = number of paid landlords (lightweight count query)

### Acceptance

1. Landlord Ops home → tap "Landlords Paid" → see all paid landlords sorted by total, KPI totals match the sum.
2. Tap a landlord row → expanded panel shows each disbursement with amount, date, method, ref, and agent-confirmation badge (GPS link + photo count where present).
3. Period filter "Last 30 days" → list and KPIs recompute to that window.
4. Search "Nakato" → filters to matching name/phone.
5. Confirmation filter "Pending" → only landlords with at least one unconfirmed disbursement.
6. Back arrow returns to the Landlord Ops home grid.

### Out of scope

- Editing/refunding a disbursement (already in `LandlordOpsPayoutReview`).
- Landlord-side WhatsApp confirmation flow.
- CSV export (can follow later via the data-export protocol).

