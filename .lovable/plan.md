

## Plan: Short Referral Links for Agent Dashboard

### Problem
Agent share links contain raw UUIDs and long query parameters:
```
https://welilereceipts.com/auth?ref=8f42b1c3-5d9e-4a7b-b2e1-9c3f4d5a6e7b&become=agent
```
These are hard to read, intimidating to recipients, and break on some messaging apps.

### Solution
Create a `short_links` database table that maps short 6-character codes to full URL parameters. When sharing, the app generates/reuses a short code. A new `/r/:code` route resolves the code and redirects to the full auth URL with all original parameters intact.

### How It Works

```text
Agent clicks "Share"
      │
      ▼
App checks short_links table for existing code
matching this user + params combo
      │
      ├── Found ──▶ Reuse existing code
      │
      └── Not found ──▶ Insert new row, get auto-generated 6-char code
      │
      ▼
Share link: welilereceipts.com/r/X7kM2p   (short!)
      │
      ▼
Recipient opens link
      │
      ▼
/r/:code route loads → queries short_links → redirects to:
  /auth?ref=UUID&become=agent   (all params preserved)
```

### Technical Details

**1. Database migration** — New `short_links` table:
```sql
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL DEFAULT generate_short_code(),  -- reuse existing 6-char generator
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_path text NOT NULL,       -- e.g. "/auth"
  target_params jsonb NOT NULL,    -- e.g. {"ref":"uuid","become":"agent"}
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one code per user+path+params combo
CREATE UNIQUE INDEX idx_short_links_user_params 
  ON public.short_links(user_id, target_path, md5(target_params::text));

-- RLS: users can insert/select their own links
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own short links" ON public.short_links
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public select by code (for resolution)
CREATE POLICY "Anyone can resolve short links" ON public.short_links
  FOR SELECT TO anon, authenticated
  USING (true);
```

**2. New route `/r/:code`** — `src/pages/ResolveShortLink.tsx`
- Queries `short_links` by code
- Reconstructs the full URL from `target_path` + `target_params`
- Redirects via `window.location.replace()`
- Shows loading spinner while resolving

**3. New hook `useShortLink`** — `src/hooks/useShortLink.ts`
- Takes `path` and `params` object
- Upserts into `short_links` (reuses existing code if same user+path+params)
- Returns the short URL: `welilereceipts.com/r/X7kM2p`
- Caches in React Query to avoid repeated DB calls

**4. Update agent share components** to use `useShortLink`:
- `QuickShareSubAgentSheet.tsx` — `{ref, become: "agent"}`
- `ShareSubAgentLink.tsx` — `{ref, become: "agent"}`
- `ShareReferralLink.tsx` — `{ref}`
- `AgentPartnerDashboardSheet.tsx` — `{ref}`
- `ShareSupporterRecruit.tsx` — `{role: "supporter", ref}`
- `ShareCalculatorLink.tsx` — `{role: "supporter", ref}`
- `EarningsRankSystemSheet.tsx` — `{role: "agent", ref}`
- `ShareWelileAIBanner.tsx` — (no params, static — skip)

Each component replaces the long URL with the short one from the hook. All params (ref, role, become) are preserved in the database and reconstructed on resolution.

### Files

| File | Action |
|------|--------|
| Database migration | **Create** — `short_links` table with RLS |
| `src/hooks/useShortLink.ts` | **Create** — hook to generate/cache short links |
| `src/pages/ResolveShortLink.tsx` | **Create** — resolve code and redirect |
| `src/App.tsx` | **Edit** — add `/r/:code` route |
| `src/components/agent/QuickShareSubAgentSheet.tsx` | **Edit** — use short link |
| `src/components/agent/ShareSubAgentLink.tsx` | **Edit** — use short link |
| `src/components/agent/ShareReferralLink.tsx` | **Edit** — use short link |
| `src/components/agent/AgentPartnerDashboardSheet.tsx` | **Edit** — use short link |
| `src/components/shared/ShareSupporterRecruit.tsx` | **Edit** — use short link |
| `src/components/supporter/ShareCalculatorLink.tsx` | **Edit** — use short link |
| `src/components/agent/EarningsRankSystemSheet.tsx` | **Edit** — use short link |

### Result
Before: `welilereceipts.com/auth?ref=8f42b1c3-5d9e-4a7b-b2e1-9c3f4d5a6e7b&become=agent`
After: `welilereceipts.com/r/X7kM2p`

All referral tracking, role assignment, and sub-agent registration continue working exactly as before — the short code just maps back to the same parameters.

