

## Mission: Welile Trust Score for Every African — Visible, Enforced, Constitutional

### Reality Check (from your live database)

| Signal | Today | Target | Coverage Gap |
|---|---|---|---|
| Profiles | 5,901 | — | — |
| With National ID | 26 | 5,901 | **99.6% missing** |
| With behavior/venue visits | 0 | 5,901 | **100% missing** |
| Verified | 195 | 5,901 | 96.7% missing |
| Agent-onboarded | 5,228 | 5,901 | OK — agents already touch most users |
| Active agents | 5,880 | — | Massive field workforce |

You already have agents touching 89% of users. They simply aren't being **forced** to capture trust signals.

---

### The Core Insight

Welile already has the score (`get_user_trust_profile`), the AI ID (`WEL-XXXXXX`), the agents (5,880), and the tables (`venue_visits`, `agent_visits`, `user_locations`, `agent_advance_ledger`, `general_ledger`). What's missing is:

1. **A score for every user** — including agent-managed ones with no smartphone
2. **An agent obligation** — every agent visit MUST drop a trust signal
3. **Lender visibility** — one shareable URL per AI ID with the score
4. **A constitutional rule** — every new feature MUST emit a trust signal

---

### Recommendation in 5 Layers

#### LAYER 1 — Universal Coverage (every user gets a score, no exceptions)

Add a one-time backfill + nightly job that ensures **every `profiles.id` has a `welile_trust_score` row** (score, tier, breakdown, last_calculated). Tiered defaults:
- Smartphone user → self-managed, score recomputes on activity
- Agent-managed (no smartphone) → score driven entirely by **agent-captured signals**
- New profile → starts at "New Member" tier with a 30-day grace ramp

New table `welile_trust_score_cache` (score, tier, data_points, breakdown JSON, last_calculated_at) + nightly cron `recalculate-trust-scores` that pages 50K users/run.

#### LAYER 2 — Agent Ops as the Data Engine (turn every visit into a signal)

Add to **Agent Ops Dashboard** a new tab **"Trust Capture"** with:

- **Today's Capture Quota** card — every agent must capture **N signals/day** (e.g., 10) split across:
  - Rent payment confirmation (highest weight)
  - Venue visit log (mall, market, restaurant, worship — geo-stamped)
  - National ID photo verification
  - Landlord introduction
  - Salary/income proof attachment
- **Capture-or-Lose policy** — agents who don't hit quota for 7 days lose commission tier (already-approved business model, just enforce)
- **Heatmap** of un-scored users in agent's territory → "Go score these 47 tenants nearby"
- **One-tap capture sheet** on `AgentDirectory` row: agent picks a user → form: location, observed behavior, ID photo, quick-vouch — writes to `venue_visits` + `agent_visits` + `audit_logs` in a single RPC

Tie it to existing `agent_commission_payouts` — **+UGX 200 per verified trust signal**, paid weekly.

#### LAYER 3 — Lender-Grade Public Profile

The route `/profile/WEL-XXXXXX` already exists via `useTrustProfile`. Harden it for external lenders:

- Add a **lender-share button** on every user's profile — generates a 30-day signed URL token
- Public view (`get_public_trust_profile` already exists) shows: score, tier, payment on-time rate, cash-flow capacity, behavior summary, **agent-vouch count** — never PII
- Add **PDF export of trust profile** (reuse the same `jsPDF` pattern from advance exports)
- Optional **lender API key system** — partner banks/SACCOs query `/api/trust/{ai_id}` with rate-limited token

#### LAYER 4 — Five New CEO Dashboard Stats (the mission scoreboard)

Add a new section **"Trust Coverage — Africa Mission"** to `CEODashboard.tsx`:

| KPI | Source | Target |
|---|---|---|
| **Trust Coverage %** | `users with score / total profiles` | 100% |
| **Avg Welile Trust Score** | `avg(welile_trust_score_cache.score)` | climb monthly |
| **Behavior Data Density** | `avg(data_points) per user` | ≥ 6 |
| **Agent Capture Rate (7d)** | `signals captured / active agents` | ≥ 70/agent/wk |
| **Lender-Ready Users** | `count where score ≥ 60 AND data_points ≥ 5` | grow MoM |

Plus a bar chart **"Score distribution by tier"** (excellent/good/standard/caution/high-risk/new) and **"Untouched Users by Region"** map → CEO can deploy agents where coverage is low.

#### LAYER 5 — Constitutional Amendment (every future prompt must conform)

Add **one new Core rule** to `mem://index.md` so every Lovable prompt automatically respects it:

> **"Every user-facing action that produces observable behavior (rent paid, location shared, venue visited, ID uploaded, deposit made, withdrawal taken, listing browsed, agent visit) MUST emit a `system_event` AND increment a `welile_trust_score` factor. Features that touch a user without contributing to their trust score are non-conformant and must be revised."**

And a paired rule for agents:

> **"Every agent-initiated workflow (onboarding, rent collection, visit, verification) MUST write to `agent_visits` or `venue_visits` with geo + AI ID. No silent agent actions."**

These two lines, in Core memory, mean every future feature you ask me to build will be screened against the trust mission before code is written.

---

### What I'd Build First (phase 1 — fastest mission progress)

1. `welile_trust_score_cache` table + nightly recompute cron + backfill — **every user gets a score in 24h**
2. CEO dashboard "Trust Coverage" section (5 KPIs + tier distribution chart)
3. Add the two Core constitution rules to `mem://index.md`
4. Agent Ops "Trust Capture" tab with quota card + one-tap capture sheet + +UGX 200/signal commission
5. Lender share button + PDF export on `/profile/WEL-XXXXXX`

### Out of scope (future phases)
- External lender API + key management
- ML scoring model (current 7-factor weighted formula is already strong)
- Cross-border expansion infrastructure (Kenya/Tanzania/Nigeria) — happens after coverage hits 80% in Uganda
- SMS-based score check (`*256*WEL#` USSD) — telecom integration follow-up

### Decision needed from you
Do you want me to proceed with **all 5 items in phase 1 in one go**, or sequence them (e.g., constitution + CEO stats first, then agent capture flow next)?

