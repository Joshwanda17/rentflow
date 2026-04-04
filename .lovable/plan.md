
Investigation result

I found the parent-agent reward is not guaranteed because the app has two different sub-agent registration paths, and only one of them credits the UGX 10,000 commission.

What is happening now

1. Invite activation path does credit the parent agent
- In `supabase/functions/activate-supporter/index.ts`, when `isSubAgent && parentAgentId`, it:
  - inserts into `agent_subagents`
  - then calls `credit_agent_event_bonus(..., 'subagent_registration', ...)`
- This is the only path that currently awards the UGX 10,000 bonus.

2. Link / self-signup path does not credit the parent agent
- In `src/pages/SelectRole.tsx`, when a user becomes an agent through a parent-agent link, it:
  - inserts into `agent_subagents`
  - does not call `credit_agent_event_bonus`
  - assumes “the DB trigger handles it”

3. That fallback trigger path is broken against the live schema
- The latest referral migration (`supabase/migrations/20260404043643_069a0426-adac-4f35-84c0-d0d3eb102d78.sql`) still uses old column names that do not match the current generated types:
  - uses `profiles.role` / `NEW.role`
  - uses `referred_user_id` instead of live `referred_id`
  - uses `scope` / `wallet_id` instead of live `ledger_scope` / `user_id`
- So the code path that `SelectRole` relies on is not the right place for the sub-agent reward and is also schema-incompatible.

4. There is also legacy trigger drift
- Older migration creates `on_profile_referral` on `profiles`
- Newer migration creates `trg_credit_referral_bonus`
- Since the newer migration does not remove the old legacy trigger, the system likely still has overlapping referral behavior.

Root cause

The parent agent is not rewarded reliably because:
- invite flow uses the correct UGX 10,000 event-bonus RPC
- link/self-signup flow only creates the `agent_subagents` relationship and never triggers the same reward path
- the fallback referral-trigger logic is both the wrong mechanism for sub-agent commission and mismatched to the current database schema

Recommended implementation plan

1. Make `agent_subagents` the single source of truth for sub-agent commission
- Add one backend-owned trigger/function on `agent_subagents` insert
- When a new parent/sub-agent relationship is created, award exactly one `subagent_registration` bonus to `parent_agent_id`
- Use deterministic idempotency based on the sub-agent relationship so both invite and link flows behave the same

2. Remove duplicate app-level bonus awarding
- Remove the direct `credit_agent_event_bonus` call from `activate-supporter`
- Let both invite flow and link flow rely on the same backend trigger after the `agent_subagents` row is inserted
- This avoids “works in one screen, fails in another” behavior

3. Repair the regular referral trigger stack separately
- Rewrite the referral trigger functions to use the live schema:
  - roles from `user_roles`
  - `referred_id` in `referrals`
  - `ledger_scope` and `user_id` in `general_ledger`
- Keep regular referral rewards at UGX 500
- Explicitly exclude sub-agent registration from that smaller referral path

4. Remove legacy trigger overlap
- Drop the old `on_profile_referral` trigger and keep only one canonical referral trigger path
- This reduces silent double-fires and conflicting logic

5. Backfill missing sub-agent commissions
- Add a one-time backend-safe backfill for existing `agent_subagents` rows that do not yet have a matching `subagent_registration` earning
- Use idempotency so already-paid parent agents are skipped

Files likely to change

- `supabase/migrations/...`  
  - add canonical `agent_subagents` bonus trigger/function
  - fix referral trigger functions to match live schema
  - drop legacy trigger(s)
  - optional backfill statements
- `supabase/functions/activate-supporter/index.ts`
  - remove direct bonus RPC once DB trigger owns the reward path
- `src/pages/SelectRole.tsx`
  - update comments / UX copy so it no longer claims the old referral trigger is responsible

Expected result

```text
Any sub-agent registration
→ row inserted into agent_subagents
→ one backend-owned, idempotent UGX 10,000 commission to parent agent
→ works for both:
   - invite activation
   - referral-link/self-signup
→ regular referrals remain UGX 500 and do not interfere
```

Verification after implementation

- Test invite-based sub-agent activation end to end
- Test link-based sub-agent signup end to end
- Retry the same flow twice to confirm no duplicate UGX 10,000 award
- Confirm parent agent wallet/earnings reflect exactly one `subagent_registration` commission
- Confirm ordinary referrals still receive UGX 500 only
