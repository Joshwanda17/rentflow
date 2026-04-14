

## Fix: Landlords Tab Badge Count Mismatch

### Root Cause (Two bugs)

**Bug 1 — Wrong column names in data query (line 23)**
The `LandlordsPipeline` component queries `landlords!inner(id, full_name, phone, address)` but the `landlords` table has `name` (not `full_name`) and `property_address` (not `address`). The Supabase query silently errors, returning no data → "No landlords in pipeline."

**Bug 2 — Badge counts rent requests, not landlords (line 179)**
The landlords badge count query is an exact duplicate of the tenants query — it counts all non-funded/rejected/cancelled `rent_requests` (12). It should count **distinct landlord_ids** from those requests instead.

### Fix

**File: `src/components/executive/AgentOpsPipelineHub.tsx`**

1. **Line 23** — Fix the select columns:
   - `full_name` → `name`
   - `address` → `property_address`

2. **Line 35** — Fix the grouping reference:
   - `ll?.full_name` → `ll?.name`
   - `ll?.address` → `ll?.property_address`

3. **Line 179** — Fix the landlords badge count to count distinct landlords with active requests:
   - Change from counting all `rent_requests` to selecting `landlord_id` from non-funded requests, then counting unique non-null landlord IDs
   - This ensures the badge shows the number of unique landlords, not the number of requests

### Impact
- Badge will show the correct number of unique landlords with active pipeline requests
- The landlords list will actually load and display data
- Detail sheets will show correct landlord names and addresses

