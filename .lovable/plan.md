

# Fix COO Agent Hub — Data Not Loading

## Root Cause
The hub fetches all agent user IDs (5,772) then passes them into `.in('id', ids)` calls. This creates URLs with thousands of UUIDs that exceed HTTP URL length limits, returning **400 Bad Request**. All subsequent queries (wallets, earnings, rent_requests, landlord_assignments) fail the same way.

## Solution
Create a database function (RPC) that performs all joins server-side and returns paginated, pre-aggregated agent data. This eliminates the massive `.in()` calls entirely.

### 1. Database Migration — Create `get_agents_hub` RPC

A PostgreSQL function that:
- Joins `user_roles` (role='agent') → `profiles` → aggregates from `wallets`, `agent_earnings`, `rent_requests`, `agent_landlord_assignments`
- Accepts parameters: `search_query text`, `sort_field text`, `sort_dir text`, `page_limit int`, `page_offset int`
- Returns: `id, full_name, phone, territory, last_active_at, wallet_balance, total_commission, tenants_count, landlords_count`
- All aggregation happens in SQL (COUNT DISTINCT for tenants/landlords, SUM for earnings)

### 2. Update `COOAgentHub.tsx`

- Replace the 6 separate Supabase queries with a single `supabase.rpc('get_agents_hub', { ... })` call
- Pass search, sort, and pagination params directly to the RPC
- Status classification (`classifyAgent`) stays client-side since it's lightweight
- Add pagination (load more / infinite scroll) since 5,772 agents shouldn't render at once

### Files Changed
- **Migration**: New RPC function `get_agents_hub`
- **Edit**: `src/components/coo/COOAgentHub.tsx` — replace data fetching with single RPC call + pagination

