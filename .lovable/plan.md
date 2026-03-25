

## Phase 5: Gradual Migration — Percentage-Based Traffic Routing with Monitoring

### What this does
Upgrades the Phase 3 shadow audit system from "log-only" to a persistent, percentage-controlled dual execution system. Shadow validation now runs on a configurable percentage of requests (not all), results are persisted to a database table for monitoring, and edge functions run shadow on both success AND failure paths to catch divergences in either direction. Rollback = set percentage to 0.

### Architecture

```text
Edge Function receives request
  │
  ├─ PRIMARY PATH (unchanged) → validates, executes, returns response
  │
  └─ SHADOW PATH (upgraded)
       ├─ Check: shouldSample(percentage) → random roll
       │    ├─ NO  → skip shadow entirely
       │    └─ YES → run shadow validation
       │         ├─ Compare shadow result to primary result
       │         ├─ Log to console (existing)
       │         └─ INSERT into shadow_audit_logs table (new)
       │              → function_name, primary_passed, shadow_passed,
       │                match, inputs (sanitized), errors, timestamp
```

### Database changes

**1. New table: `shadow_audit_logs`**
- Stores shadow comparison results for monitoring
- Columns: `id`, `function_name`, `primary_passed`, `shadow_passed`, `is_match`, `shadow_errors`, `created_at`
- No RLS needed — written only by service role from edge functions
- No sensitive data stored (inputs are omitted, only function name + pass/fail)

**2. New table: `shadow_config`**
- Single-row config table for shadow routing percentage
- Columns: `id`, `sample_percentage` (0–100, default 10), `enabled` (boolean, default true), `updated_at`
- Read by edge functions to decide sampling rate
- Updatable by managers to control rollout (10% → 25% → 50% → 100%)
- Setting `enabled = false` or `sample_percentage = 0` is the rollback mechanism

### Edge function changes

**3. `supabase/functions/_shared/shadowLogger.ts`** (upgraded)
- Add `sample_percentage` parameter to `runShadowAudit`
- Add random sampling: `Math.random() * 100 < percentage`
- Accept Supabase admin client to persist results to `shadow_audit_logs`
- Still fire-and-forget, still catches all errors

**4. `supabase/functions/_shared/shadowConfig.ts`** (new)
- `fetchShadowConfig(adminClient)` — reads `shadow_config` table, returns `{ enabled, samplePercentage }`
- Caches config in-memory for 60 seconds to avoid per-request DB reads
- Falls back to `{ enabled: false, samplePercentage: 0 }` on any error

**5. Edge functions: `wallet-transfer`, `cfo-direct-credit`, `fund-rent-pool`**
- Import `fetchShadowConfig`
- Fetch config once at start of request (cached, near-zero cost)
- Move shadow audit call to run on BOTH success and failure paths (currently only success)
- Pass `primaryPassed: true/false` based on whether primary validation succeeded or failed
- Pass config percentage to `runShadowAudit`

### Monitoring

**6. Database function: `get_shadow_match_rate`**
- SQL function returning match rate per function over last 24h/7d
- Returns: `function_name`, `total_samples`, `matches`, `divergences`, `match_rate_pct`
- Queryable by managers via existing admin tools

### Rollback mechanism
- Set `shadow_config.enabled = false` → all shadow stops immediately
- Set `shadow_config.sample_percentage = 0` → same effect
- No code deployment needed for rollback — it's a single DB row update
- Edge functions continue operating normally regardless of shadow config

### What stays the same
- All primary execution paths — unchanged
- All responses — unchanged
- Frontend — no changes
- Phase 4 `useNewServices` flag — independent, still works
- Shadow validation functions — unchanged (pure logic)

### Rollout strategy
1. Deploy with `sample_percentage = 10` (10% of traffic)
2. Monitor `shadow_audit_logs` for divergences
3. If match rate > 99% after 48h, increase to 25%
4. Continue until 100% with zero divergences
5. Phase 6 (future) can then safely swap primary to new services

### Files affected
- `supabase/functions/_shared/shadowLogger.ts` — upgrade with sampling + DB persistence
- `supabase/functions/_shared/shadowConfig.ts` — new config reader with caching
- `supabase/functions/wallet-transfer/index.ts` — wire config + shadow on all paths
- `supabase/functions/cfo-direct-credit/index.ts` — same
- `supabase/functions/fund-rent-pool/index.ts` — same
- Database: 2 new tables (`shadow_audit_logs`, `shadow_config`), 1 new function (`get_shadow_match_rate`)

