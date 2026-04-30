## The bug

The "Tenants Approved" PDF only shows **2 tenants** for 31 Mar – 30 Apr, even though the database actually has **96 rent_requests past the approval gate** (statuses: `agent_verified`, `tenant_ops_approved`, `landlord_ops_approved`, `coo_approved`, `funded`, `disbursed`, `repaying`, `completed`).

### Why

The handler (`handleExtractApproved` in `src/components/executive/TenantOpsDashboard.tsx:477`) filters strictly on `approved_at`:

```ts
.not('approved_at', 'is', null)
.gte('approved_at', from.toISOString())
.lte('approved_at', to.toISOString())
```

But the data shows `approved_at` is almost never populated — only 12 of 96 post-approval requests have it set. The approval workflow flips `status` forward but does not consistently stamp `approved_at`. So the report finds only 2 in the window.

Live counts (post-approval, excluding pending/rejected/cancelled):

| Status | with `approved_at` | missing `approved_at` |
|---|---|---|
| agent_verified | 0 | 2 |
| tenant_ops_approved | 0 | 1 |
| landlord_ops_approved | 0 | 2 |
| coo_approved | 0 | 3 |
| funded | 9 | 43 |
| disbursed | 0 | 2 |
| repaying | 2 | 17 |
| completed | 1 | 15 |

## The fix

Treat a request as "approved" when its **status is past the approval gate**, and use `COALESCE(approved_at, created_at)` as the timestamp for window filtering and display. This is what every other dashboard already does (e.g. `ApprovedRentRequestsWidget`, the COO funnel) and it matches the user's mental model of "approved tenant".

### Changes to `handleExtractApproved`

1. **Replace the filter** with a status whitelist of "post-approval" statuses:
   `agent_verified, tenant_ops_approved, landlord_ops_approved, coo_approved, approved, funded, disbursed, active, repaying, completed`.
2. **Window by `COALESCE(approved_at, created_at)`** — fetch with a generous `created_at` bound, then filter in JS using `approved_at ?? created_at` so we catch rows missing the stamp.
3. **Display column**: show `approved_at ?? created_at` and add a small "(from created_at)" hint in the Status column when the stamp was missing — keeps the report honest.
4. **KPI**: add a third KPI "Stamped vs Inferred" so the operator can see how many had a real `approved_at`.

### Side recommendation (separate, not in this fix)

Backfill `approved_at` once for the 84 historical rows, and add a DB trigger that stamps `approved_at = now()` whenever `status` transitions into a post-approval state and `approved_at` is null. This makes the column trustworthy going forward. I'll flag this but won't do it in this change — let me know if you want it as a follow-up migration.

## Files touched

- `src/components/executive/TenantOpsDashboard.tsx` — rewrite `handleExtractApproved` query + row mapping (~30 line diff, no new imports).

No DB changes, no new dependencies.
