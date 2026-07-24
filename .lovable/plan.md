
# Landlord Ops Phase 2 — Execution Plan

Phase 1 (single/bulk hide + bulk reject via atomic RPCs, server-side audit, optimistic patch, lazy invalidation) stays untouched. Phase 2 completes the dedup, replaces client aggregation, makes bulk verify atomic & idempotent, and tunes caching.

## Order of execution

Each numbered block is a single, verifiable change. I'll ship them in this order to keep the tree buildable at every step.

### 1. Shared listing utilities (client-only, no DB)
- `src/lib/landlord-ops/queries.ts` — `HOUSE_LISTING_SELECT` constant (superset of all 4 duplicated selects incl. nested `landlord`), `RawHouseListing`, `EnrichedHouseListing` types.
- `src/lib/landlord-ops/profile-utils.ts` — `fetchProfilesByIds(ids, { chunkSize=500, concurrency=4 })` (Set-dedup, filter null, `Promise.all` over chunks), `buildProfileMap`, `enrichListingsWithProfiles`. Returns `Map<string, Profile>`; missing = `null`, DB failure throws.
- `src/lib/landlord-ops/audit.ts` — `logAudit({ actionType, tableName, recordId, metadata })` thin wrapper for the remaining non-transactional client audit sites (approve/reject landlord, delete, etc.). Actor is always `auth.uid()` server-side.
- Replace the four `house_listings` select duplications (lines 838/891/955/997) + every `.from('profiles').select().in('id', …)` enrichment loop in `LandlordOpsDashboard.tsx` with these helpers. Cache shape unchanged.

### 2. Bulk verify — atomic + idempotent
- Migration: new RPC `bulk_verify_house_listings(p_listing_ids uuid[], p_reason text) RETURNS TABLE(id uuid, status text, agent_id uuid, bonus_credited boolean, error text)`.
  - `SECURITY DEFINER`, `SET search_path=public`, `is_landlord_ops_staff(auth.uid())` gate, `array_length ≤ 500` guard.
  - Per listing (in one transactional loop): row-lock via `SELECT … FOR UPDATE`, skip if already `verified=true` → `status='already_verified'`; else `UPDATE house_listings SET verified=true, verified_by=auth.uid(), verified_at=now()`, insert `audit_logs`, then call the existing internal SQL bonus routine used by `credit-listing-bonus`. Idempotency: leverage the existing `listing_bonus_paid` flag + `UNIQUE (listing_id, bonus_type)` on the underlying bonus ledger reference (add if missing).
  - Wallet credit stays inside the same DB transaction (no HTTP hop). If the bonus routine already lives in an edge fn, extract its SQL core into a `public.credit_listing_bonus_internal(p_listing_id uuid)` SECURITY DEFINER helper and have both single and bulk paths call it.
- New edge fn `bulk-verify-house-listings`: JWT check → call the RPC → for each `status='verified'` row, fire `notify-listing-verified` (or reuse existing SMS/push path) with `Promise.allSettled`; return `{ totalRequested, verified[], alreadyVerified[], ineligible[], failed[], notificationsPending[] }`.
- `handleBulkVerify` in dashboard: one invoke, patch `verified/listing_bonus_paid` on `verified[]` in cache, keep `failed[]` selection, lazy invalidate.

### 3. `all_enriched` action for the landlord list
- Migration: RPC `get_landlord_ops_enriched(_search, _sort, _category, _pending_filter, _district, _region, _verification, _date_from, _date_to, _limit, _offset)` returning landlords + tenant/agent names + phones + listing counts + rent-request summary joined server-side (single query, `count() OVER()` for total). Reuses `is_landlord_ops_staff` gate.
- Edge fn `landlord-ops`: add `action: "all_enriched"` returning `{ data, pagination: { page, pageSize, total, totalPages }, summary }`.
- `src/hooks/useLandlordOps.ts`: add `useLandlordOpsAllEnriched(params)`; delete the `allLandlords` `useQuery` + `landlord-ids → house_listings → profiles → rent_requests` chain in the dashboard (~lines 1040–1225). UI keeps consuming the same field shape (mapper in the hook if needed).

### 4. Global listing search RPC
- Migration: `search_house_listings_global(p_query text, p_limit int default 50, p_offset int default 0)` — trim, empty→empty result, `ILIKE` on landlord name/phone, tenant name/phone, agent name/phone, title, district, sub_county, village, short_code, status; wildcard-escape `%` and `_`; parameterized; `is_landlord_ops_staff` gate; ordered by `verified DESC, created_at DESC`.
- Replace the 5-step client search chain with `supabase.rpc('search_house_listings_global', …)`. Keep the existing debounce; add an `AbortController`/generation counter to drop stale responses.

### 5. All Requests consolidation
- Prefer PostgREST embed: `rent_requests?select=…, tenant:profiles!tenant_id(name,phone), landlord:landlords!landlord_id(name,phone), agent:profiles!agent_id(name,phone)` with existing filter/sort/pagination. Only fall back to an RPC if the FK graph doesn't expose all three joins cleanly — I'll check with `psql` first and pick the simpler route without expanding scope.

### 6. Caching pass
- Search results: `staleTime 15s`, `gcTime 5m`.
- All Landlords / paginated ops rows: `staleTime 60s`, `gcTime 10m`, `placeholderData: keepPreviousData`.
- Verification queue: `staleTime 15s`.
- Profile / reference: `staleTime 10m`.
- Query keys already include search/sort/category/page — audit and normalize any that don't. No global stale time change.

### 7. Dev-only measurement
- `src/lib/landlord-ops/devMetrics.ts`: `withMetric(label, fn)` timing helper + a supabase request counter guarded by `import.meta.env.DEV`. Wire around: All Landlords load, global search, All Requests load, single verify, bulk verify (1 & 100), tab return. Numbers logged to `console.table` only in dev.

### 8. Verification
- `tsgo` typecheck, `bun run lint` (existing scripts), targeted vitest for any touched tests.
- Manual matrix per spec: empty/1-char/phone/name searches, missing profiles, 0/many landlords, 1 & 100 selected, retry same batch (must return `already_verified`), rapid typing (stale-drop), filter-change mid-request, unauthorized user (RPC returns permission error), notification failure (verify still committed, `notificationsPending` populated).

## Out of scope this phase
No visual redesign, no unrelated schema changes, no new dashboard features. Bulk-verify's underlying `credit-listing-bonus` behaviour is preserved bit-for-bit — I only extract its SQL core into a reusable internal function; SMS/push templates unchanged.

## Deliverables at the end
Before/after request counts, files changed, migrations & edge fn actions added, idempotency mechanism used (unique constraint on bonus ledger + `listing_bonus_paid` flag + row lock), wallet/bonus integrity notes, notification-failure behaviour, `tsgo` + lint results, and any residual risks.

## Approval

Say **go** and I'll ship Block 1 first (pure client utilities, zero DB risk), then Block 2's migration for review before wiring, then the rest in order.
