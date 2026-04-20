
The user wants a secure, OTP-verified, agent-initiated rent payout flow that draws from agent float and pays landlords via mobile money. Let me check what already exists so I don't duplicate.

Existing pieces I already saw in context:
- `AgentLandlordPayoutDialog.tsx` — already has a payout dialog but it just calls `record_rent_payment` RPC. No OTP, no float deduction, no MoMo transfer.
- `LandlordPayoutProgress.tsx` — already renders progress for a `landlord_payouts` table with statuses `otp_verified | disbursing | completed | failed | escalated` and an SLA countdown. So a `landlord_payouts` table likely already exists with OTP-verified state.
- `OtpVerificationStep.tsx` — generic 6-digit OTP UI component exists.
- Africa's Talking SMS integration exists (mem://infrastructure/telecom-integration-logic).
- Wallet 3-bucket model (withdrawable / float / advance) — float is the right bucket per the constitution.
- `create_ledger_transaction` RPC — must be used for double-entry accounting.
- Agent commission model: 10% commission on rent (mem://business-model/agent-incentive-model).

Let me verify what's already in the DB before planning new tables — but in plan mode I'll assume `landlord_payouts` exists (the progress component proves it) and check during implementation whether OTP columns + agent float deduction are wired.

I need to ask one critical question because it changes the architecture significantly.

## Plan — Secure OTP-Verified Agent Rent Payout

Build on what already exists (`landlord_payouts` table, `LandlordPayoutProgress` UI, OTP component, Africa's Talking SMS) and fill the gaps: OTP issue/verify, float deduction with double-entry ledger, and MoMo disbursement.

### New flow (replaces current `AgentLandlordPayoutDialog` body)

```text
[1 Agent Form]  →  [2 issue-landlord-otp]  →  [3 SMS to landlord]
                                                      ↓
[6 LandlordPayoutProgress] ← [5 disburse] ← [4 verify-landlord-otp]
```

### Database changes (migration)
Add to existing `landlord_payouts` (or create if missing):
- `tenant_name`, `tenant_phone`, `landlord_phone` text
- `otp_hash` text, `otp_expires_at` timestamptz, `otp_attempts` int default 0, `otp_max_attempts` int default 3
- `status` enum extended with `pending_otp`
- Index on `(agent_id, status)`
- RLS: agent can read/insert own payouts; only edge functions (service role) can update OTP fields

### Edge functions (3 new, all isolated to avoid bundle timeout)

**1. `issue-landlord-payout-otp`**
- Auth: `adminClient.auth.getUser(token)`
- Validates: agent has `float_balance >= amount`, all 4 fields present, phone format
- Atomically reserves float via RPC `reserve_agent_float(agent_id, amount, payout_id)` (does not move money yet, just locks)
- Generates 6-digit OTP, stores SHA-256 hash + 2-min expiry
- Sends SMS via Africa's Talking: *"Welile: {agent_name} is paying you UGX {amount} for rent at {tenant_name}. OTP: {code}. Valid 2 min. Do not share unless you want to receive this money."*
- Returns `payout_id`

**2. `verify-landlord-payout-otp`**
- Increments `otp_attempts`; rejects if > 3 or expired
- Compares hash; on success sets status `otp_verified` + `otp_verified_at`
- Triggers internal call to `disburse-landlord-payout` (fire-and-forget)
- On 3rd failure: releases float reservation, sets status `failed`

**3. `disburse-landlord-payout`** (already may exist — check first)
- Calls `create_ledger_transaction` with balanced legs:
  - cash_out: agent `float` bucket (category `agent_float_payout`)
  - cash_in: landlord wallet OR external MoMo holding (category `landlord_rent_credit`)
- Calls MoMo provider (MTN/Airtel) — uses existing disbursement code if present
- Retries 3× with exponential backoff; on final failure refunds float and sets `escalated`
- Emits `system_event` `landlord_payout.completed` for trust score (mem://features/trust)

### Frontend changes

**Refactor** `src/components/agent/AgentLandlordPayoutDialog.tsx` into 3 steps via `AnimatePresence`:
1. **Form step** — fields: Landlord Name, Landlord Phone, Tenant Name, Tenant Phone, Amount, Provider. Shows live agent float balance. "Send OTP" button calls `issue-landlord-payout-otp`.
2. **OTP step** — reuses existing `OtpVerificationStep.tsx`. 2-min countdown, max 3 attempts, resend after 60s (calls issue function again, same payout_id).
3. **Progress step** — reuses existing `LandlordPayoutProgress.tsx` (already polls realtime).

### Safeguards (mapped to requirements)
| Requirement | Implementation |
|---|---|
| Float ≥ amount | DB CHECK + RPC row-level lock `FOR UPDATE` |
| OTP expiry | `otp_expires_at` checked server-side |
| Max 3 attempts | `otp_attempts` column + server enforcement |
| Float never negative | Reservation pattern + ledger trigger rejects negative |
| Audit | `audit_logs` row on issue/verify/disburse via `record_audit_event` RPC (10-char reason) |
| Trust signal | `capture_trust_signal` RPC on success (mem://features/trust/trust-coverage-engine) |

### Files to create / edit
- `supabase/migrations/<ts>_landlord_payout_otp.sql` (new)
- `supabase/functions/issue-landlord-payout-otp/{index.ts,deno.json}` (new)
- `supabase/functions/verify-landlord-payout-otp/{index.ts,deno.json}` (new)
- `supabase/functions/disburse-landlord-payout/{index.ts,deno.json}` (new or extend)
- `src/components/agent/AgentLandlordPayoutDialog.tsx` (rewrite as 3-step wizard)
- Reuses: `OtpVerificationStep.tsx`, `LandlordPayoutProgress.tsx`

### One question before I build
The flow can pay the landlord one of two ways. Which one?
- **A. Direct MoMo disbursement** to the landlord's phone number entered on the form (Africa's Talking / MTN B2C). Money leaves the platform.
- **B. Internal wallet credit** — credit the landlord's Welile wallet (auto-create if phone not registered). Landlord withdraws later.

A is what tenants/landlords usually expect for "rent paid"; B keeps money on-platform and is cheaper. The existing `LandlordPayoutProgress` shows `external_reference` which suggests A was the intent — but I'll confirm before wiring the MoMo call.
