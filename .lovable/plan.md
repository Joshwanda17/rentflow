

## Plan: Phase 1 — Agent Operations Dashboard (Core)

This phase delivers: **Float Control**, **GPS Visit Check-in**, **Payment Token Generation**, **Payment Recording with Token Verification**, and a **Daily Operations Summary** card on the existing Agent Dashboard.

---

### New Database Tables (4 migrations)

**1. `agent_float_limits`** — Manager-assigned float capacity per agent
- `id`, `agent_id` (FK profiles), `float_limit` (numeric, default 0), `collected_today` (numeric, default 0), `last_reset_date` (date), `assigned_by` (FK profiles), `created_at`, `updated_at`
- A daily reset trigger sets `collected_today = 0` when `last_reset_date < CURRENT_DATE` on any read/update
- RLS: agent can SELECT own row; managers can INSERT/UPDATE

**2. `agent_visits`** — GPS visit check-ins
- `id`, `agent_id`, `tenant_id`, `latitude`, `longitude`, `accuracy`, `checked_in_at` (timestamptz), `created_at`
- RLS: agent can INSERT/SELECT own rows; managers can SELECT all

**3. `payment_tokens`** — Time-limited 6-digit tokens
- `id`, `agent_id`, `tenant_id`, `token_code` (text, 6-digit), `amount` (numeric), `expires_at` (timestamptz, +30 min), `used` (boolean, default false), `used_at` (timestamptz null), `visit_id` (FK agent_visits), `created_at`
- RLS: agent can INSERT/SELECT own tokens

**4. `agent_collections`** — Payments recorded against tokens
- `id`, `agent_id`, `tenant_id`, `token_id` (FK payment_tokens), `amount`, `payment_method` (enum: mobile_money, cash, in_app_wallet), `float_before`, `float_after`, `created_at`
- On INSERT trigger: mark token as `used`, increment `agent_float_limits.collected_today`, block if `collected_today + amount > float_limit`
- RLS: agent can INSERT/SELECT own rows

---

### Database Functions

- `reset_agent_float_if_stale(agent_id)` — called before float reads; resets `collected_today` if `last_reset_date < today`
- `validate_and_record_collection(...)` — atomic function that validates token, checks float capacity, inserts into `agent_collections`, updates float, marks token used. Returns error if token expired/used or float exceeded.

---

### New UI Components

**1. `AgentDailyOpsCard.tsx`** — Summary card at top of dashboard
- Agent name, territory (from `profiles.territory` — we'll add this column)
- Tenants assigned count (existing), today's collections sum, today's visits count
- Float gauge: limit / collected / remaining, with a red warning when capacity is 0

**2. `AgentVisitDialog.tsx`** — GPS check-in flow
- Select tenant from agent's tenant list
- Show tenant details (name, phone, address, daily amount, outstanding balance)
- "Check In at Tenant Location" button → captures GPS via `useGeoLocation` hook (already exists)
- Saves to `agent_visits`, shows success confirmation

**3. `GeneratePaymentTokenDialog.tsx`** — Token generation
- Only available after a visit is recorded for this tenant today
- Displays tenant name, amount, generated 6-digit code, expiry time (30 min countdown)
- Saves to `payment_tokens`

**4. `RecordAgentCollectionDialog.tsx`** — Payment recording with token verification
- Enter token code, select payment method (Mobile Money / Cash / In-App Wallet)
- System validates: token exists, not expired, not used, agent has float capacity
- On cash: deducts from float capacity
- Shows float before/after

**5. `AgentDepositCashDialog.tsx`** — Cash deposit (reuse/extend existing `AgentDepositDialog`)
- Add deposit method selector (MTN MoMo Merchant, Airtel Money, Bank Reference)
- On confirmed deposit, reset `collected_today` proportionally or fully

**6. Updated Quick Actions** — 6 buttons at top of dashboard
- Visit Tenant, Generate Token, Record Payment, Deposit Cash, Register Tenant, View Tenants
- Uses existing `QuickNavGrid` component

---

### Dashboard Changes (`AgentDashboard.tsx`)

- Add `AgentDailyOpsCard` below the profile section (replaces simple stats row)
- Add quick action grid with 6 operational buttons
- Wire new dialogs into state management
- Add menu drawer entries for new features

---

### What's NOT in Phase 1

- Automatic SMS confirmation to tenant (Phase 2)
- Agent Performance Metrics section (Phase 2)
- Fraud Prevention monitoring & manager alerts (Phase 2)
- Tenant navigation (call/WhatsApp/GPS) — partially exists already

---

### Migration Order

1. Add `territory` column to `profiles` table
2. Create `agent_float_limits` table + RLS
3. Create `agent_visits` table + RLS
4. Create `payment_tokens` table + RLS
5. Create `agent_collections` table + trigger + RLS
6. Create `validate_and_record_collection` RPC function

