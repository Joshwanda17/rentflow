

# Fix: Landlord Ops Dashboard — Show All 219 Landlords

## Problem
The "All Landlords" view derives its data from `house_listings` joined to `landlords`. Only **1 out of 219** landlords has a `landlord_id` linked on a house listing, so the dashboard shows just 1 landlord.

## Root Cause
```text
landlords table:     219 records (registered by agents)
house_listings:      Only 1 has landlord_id set
Dashboard query:     Derives landlords from house_listings join → shows 1
```

Agents register landlords in the `landlords` table, but the `house_listings.landlord_id` foreign key is rarely populated. The dashboard must query the `landlords` table directly.

## Solution

### Add a direct landlords query in `LandlordOpsDashboard.tsx`

1. **New React Query** — Fetch all landlords directly from the `landlords` table with fields: `id, name, phone, verified, has_smartphone, mobile_money_name, mobile_money_number, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region, property_address, tenant_id, registered_by, managed_by_agent_id, house_category, number_of_rooms, created_at`

2. **Enrich with agent/tenant names** — Batch-fetch profiles for `registered_by`, `managed_by_agent_id`, and `tenant_id` fields, then map names onto each landlord record

3. **Replace `uniqueLandlords`** — The current `useMemo` that derives landlords from house_listings (lines 323-336) will be replaced with the directly-fetched landlord data. Also count house listings per landlord by grouping the existing `rows` data.

4. **Update the Landlords view** (line 462+) — Display all landlords with:
   - Name, phone, WhatsApp link
   - Tenant name (from `tenant_id` profile lookup)
   - Agent name (from `registered_by` or `managed_by_agent_id`)
   - Property address, district, region
   - Verified/Pending status badge
   - Smartphone indicator
   - House count (from house_listings match)
   - Edit/Delete buttons (existing functionality preserved)

5. **Update KPI counts** — Home view KPI cards for "Landlords", "Verified", "Smartphone" will use the direct query count instead of derived count

## Impact
- All 219 landlords become visible immediately
- Landlords without a linked house listing are no longer invisible
- Agent and tenant contact info shown alongside each landlord
- No database migration needed — read-only change

## Files Changed
- `src/components/executive/LandlordOpsDashboard.tsx`

