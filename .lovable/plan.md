

# Paginate Landlord List — Match Tenant Ops Format

## Problem
The "All Landlords" view renders all 233 landlords at once as large, detailed cards. The user wants a compact, paginated list format matching the Tenant Ops `TenantOverviewList` style.

## Changes

### Edit: `src/components/executive/LandlordOpsDashboard.tsx` — Landlords view (lines ~640–744)

1. **Add pagination state**: `page` (default 1), `perPage` (20 items per page)
2. **Slice the filtered list** to show only `filtered.slice((page-1)*perPage, page*perPage)`
3. **Add pagination controls** at the bottom: Previous / Next buttons with "Page X of Y" indicator
4. **Compact card format**: Shrink each landlord card to a single-row layout similar to `TenantOverviewList`:
   - Left: user icon circle + landlord name (bold) + status badge (Verified/Pending) on same line
   - Below name: phone number + house count + tenant count summary
   - Right: chevron arrow
   - Remove the expanded tenant/agent sub-cards from the list view (keep them accessible via a detail click or expandable row)
5. **Category filter chips** (optional but matching): Add filter chips for Verified / Pending / Has Tenants / No Tenants — similar to the category chips in `TenantOverviewList`

### UI Structure (per row)
```text
┌─────────────────────────────────────────────────┐
│ [👤] Mbajja Christiana    [Pending] [1 house]   │
│      📞 0758713415 · 1 tenant · Agent: Akamp... │
│                                    [✏️] [🗑️] > │
└─────────────────────────────────────────────────┘
```

### Pagination Footer
```text
  Showing 1-20 of 233    [← Previous]  [Next →]
```

### Files Changed
- **Edit**: `src/components/executive/LandlordOpsDashboard.tsx` — add pagination + compact card layout to landlords view

