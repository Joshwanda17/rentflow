

## Plan: Phase 1 — Agent Operations Dashboard (Core) ✅ IMPLEMENTED

This phase delivers: **Float Control**, **GPS Visit Check-in**, **Payment Token Generation**, **Payment Recording with Token Verification**, and a **Daily Operations Summary** card on the existing Agent Dashboard.

---

### Database Tables Created

1. `agent_float_limits` — Manager-assigned float capacity per agent (with daily reset)
2. `agent_visits` — GPS visit check-ins
3. `payment_tokens` — Time-limited 6-digit tokens (30 min expiry)
4. `agent_collections` — Payments recorded against tokens
5. Added `territory` column to `profiles` table

### Database Functions Created

- `reset_agent_float_if_stale(p_agent_id)` — resets `collected_today` when date changes
- `validate_and_record_collection(p_token_code, p_payment_method, p_agent_id)` — atomic token validation + collection recording

### UI Components Created

1. `AgentDailyOpsCard.tsx` — Daily ops summary (visits, collections, float gauge)
2. `AgentVisitDialog.tsx` — GPS check-in with tenant selection
3. `GeneratePaymentTokenDialog.tsx` — 6-digit token generation with countdown
4. `RecordAgentCollectionDialog.tsx` — Token-verified payment recording
5. `AgentDepositCashDialog.tsx` — Cash deposit to restore float capacity

### Dashboard Updated

- Quick action grid (6 buttons): Visit Tenant, Generate Token, Record Payment, Deposit Cash, Register User, My Tenants
- Daily Ops Card positioned prominently below profile

---

### Phase 2 (Not Yet Implemented)

- Automatic SMS confirmation to tenant
- Agent Performance Metrics (daily/weekly totals, repayment rate, digital payment %)
- Fraud Prevention monitoring & manager alerts
- Tenant navigation (call/WhatsApp/GPS directions)
