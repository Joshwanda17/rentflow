

## Plan: Agent Ops "Daily Trust Missions" — Marketing-Style To-Dos

### Goal
Turn the Agent Ops Dashboard into a **daily mission control** that nudges field agents to harvest trust signals from the profiles they already manage — framed like a marketing/loyalty game (streaks, badges, leaderboards) instead of a chore list.

---

### What I'd add to Agent Ops Dashboard (new tab section: "Daily Missions")

#### 1. Mission Cards (top of dashboard, refreshes daily at 5am)
Each card = one bite-sized to-do an agent can complete in <5 min. Auto-generated per agent based on **gaps in their managed users' trust profiles**.

| Mission | Trigger logic | Reward (trust score + commission) |
|---|---|---|
| **"Snap 5 IDs today"** | Agent has ≥5 managed users with `national_id IS NULL` | +5 pts each user · +UGX 1,000 |
| **"Geo-tag 10 homes"** | Managed users with no `user_locations` row in 30d | +3 pts · +UGX 500 |
| **"Confirm 3 rent payments"** | Tenants with rent due today in agent's territory | +10 pts · +UGX 600 |
| **"Log 5 venue visits"** | Walk with tenant to mall/market/worship → geo-stamp | +4 pts · +UGX 400 |
| **"Vouch for 2 new users"** | Capture a quick character vouch with photo | +6 pts · +UGX 800 |
| **"Re-verify 5 stale profiles"** | Profiles not touched in 60 days | +2 pts · +UGX 300 |
| **"Add salary proof for 3"** | Managed users with no income data | +8 pts · +UGX 1,000 |

#### 2. Marketing-Style Engagement Layer
- **Streak counter** — "🔥 7-day capture streak — don't break it!"
- **Daily quota ring** — circular progress like Apple Watch (0/10 signals)
- **Tier badge** — Bronze/Silver/Gold/Diamond Capturer (weekly leaderboard)
- **Territory leaderboard** — top 10 agents this week with avatars
- **Bonus multiplier hours** — "2x points 4–6pm today!" pushes captures to specific windows
- **"Closest 5 un-scored users"** card — uses agent GPS + `profiles.referrer_id = me`, shows distance + one-tap "Capture Now" button

#### 3. End-of-Day Summary (auto-shown 6pm)
- Signals captured today vs quota
- Estimated commission earned
- Tomorrow's pre-suggested mission list ("You have 12 tenants with rent due tomorrow")
- Share-card ("I captured 23 trust signals today on Welile 🇺🇬") for WhatsApp status

#### 4. Constitution Tie-In
Every mission completion fires the existing `capture_trust_signal` RPC → guarantees `system_event` + `welile_trust_score_cache` increment, conforming to the Trust Mission core rules already in `mem://index.md`.

---

### Where to build it

**New component**: `src/components/executive/AgentDailyMissions.tsx`
Renders inside the existing **"Trust Capture"** tab on `AgentOpsDashboard.tsx` (above the current quota/heatmap cards).

**New RPCs**:
- `get_agent_daily_missions(p_agent_id)` — returns 5–7 personalized mission cards based on gaps in managed users
- `complete_mission(p_agent_id, p_mission_id, p_signal_payload)` — wraps `capture_trust_signal` + awards bonus commission to `agent_commission_payouts`

**New table** `agent_mission_completions` (agent_id, mission_id, completed_at, signals_captured, commission_awarded) for streak tracking + leaderboard.

**Cron**: `assign-daily-missions` runs 04:30 daily, populates `agent_daily_missions` per active agent for the next 24h.

---

### Out of scope (future)
- Push notifications (needs FCM setup)
- Public leaderboard outside Agent Ops (could embed on landing page later)
- Mission marketplace (custom missions from CEO/CMO)
- WhatsApp-native mission delivery (telecom integration phase)

### Decision needed
Want me to **build all 4 layers in one go** (missions + marketing UI + end-of-day + RPCs), or **start with just the mission cards + RPC** and add streaks/leaderboard in a follow-up?

