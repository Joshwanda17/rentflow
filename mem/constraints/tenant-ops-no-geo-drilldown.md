---
name: Tenant Ops geo drill-down rejected
description: The Continent→Country→Region→District→Agent analytics command centre for Tenant Operations was reverted; do not re-add
type: constraint
---
The "Enterprise Analytics & Operations Center" rebuild of Tenant Operations (hierarchical Continent → Country → Region → District → Agent drill-down, `TenantOpsGeoCommandCenter`, `TenantOpsAgent360Panel`, `useTenantOpsAnalytics`, and the "Analytics" view-mode button) was removed on 2026-07-30 at the user's request.

Tenant Operations keeps exactly two view modes: **New** (`TenantOpsDashboardV2`, default) and **Classic** (`TenantOpsDashboard`). Do not re-introduce the geo drill-down, the Analytics mode, or the geo band inside Classic.

**Why:** the user wanted Tenant Ops back to its pre-prompt state. The supporting DB views/RPCs (`v_tenant_ops_*`, geo aggregation RPCs) were left in place unused — do not wire them back into the UI without an explicit new request.
