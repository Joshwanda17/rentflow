
## Plan: 5-Minute SLA Landlord Payout Engine (Float-Based, OTP-Triggered, Auto-Disbursement)

### What exists today
- `agent_landlord_float` (balance, total_funded, total_paid_out per agent) — float source
- `landlords.verified` / `verified_at` / `verified_by` — phone-eligibility flag
- `sms-otp` edge function (sends + verifies 6-digit OTPs, real Africa's Talking integration)
- `useLandlordOtp` hook — already wired
- `AgentFloatPayoutWizard.tsx` — has OTP step, but is a **manual** flow: agent pays via MoMo offline, types in TID, uploads receipt, then a queue (`agent_float_withdrawals`, status `pending_agent_ops`) waits for human approval. **No 5-min SLA, no auto-disbursement, no auto-retry, no 10 AM cutoff.**
- `disburse-rent-to-landlord` and `fund-agent-landlord-float` — CFO funding paths

### The gap vs. the spec
The new spec mandates **OTP-verification triggers an automated disbursement within 5 minutes — no human in the loop**. Current flow is OTP-then-manual-MoMo-then-paperwork. We need to flip it to OTP → instant system payout.

---

## Build plan

### 1. Database (one migration)
**New table `landlord_payouts`** — purpose-built for the SLA engine:
| column | purpose |
|---|---|
| `id`, `agent_id`, `landlord_id`, `tenant_id`, `rent_request_id` | linkage |
| `amount`, `landlord_phone`, `mobile_money_provider` | payout target |
| `otp_verified_at` (timestamptz) | **starts the 5-min SLA clock** |
| `status` | `otp_verified` → `disbursing` → `completed` / `failed` / `escalated` |
| `attempts` (int), `last_attempt_at`, `last_error` | retry tracking |
| `sla_deadline` (otp_verified_at + 5 min, generated col) | for cron alerts |
| `disbursed_at`, `external_reference` | settlement proof |
| `escalated_at`, `escalated_reason` | Fin Ops escalation |

**Triggers / functions**
- `enforce_landlord_payout_eligibility()` — BEFORE INSERT trigger blocks if: landlord not `verified`; landlord phone empty/mismatched; agent float balance < amount; current time > 10:00 AM Africa/Kampala.
- `deduct_agent_float_for_payout(p_payout_id uuid)` SECURITY DEFINER RPC — atomic balance check + decrement on `agent_landlord_float`, writes balanced ledger entries (`rent_disbursement` cash_out from agent wallet/float scope + `rent_principal_collected` cash_in on bridge — using only allowlisted categories per `LOCKED_CATEGORIES`).
- `record_rent_payment` on success (existing RPC — reduces landlord rent balance).

### 2. New edge function `landlord-payout-disburse`
Single endpoint that orchestrates the entire automated leg. Caller is the agent UI; trigger is **OTP verify success**, not a human button.

Flow:
1. Re-validate eligibility (cutoff, float, landlord verified, OTP fresh ≤2 min).
2. `INSERT landlord_payouts (status='otp_verified', otp_verified_at=now())` → row exists, SLA timer started.
3. `UPDATE status='disbursing'`, call `deduct_agent_float_for_payout` (atomic).
4. Call MoMo gateway (MTN/Airtel) via existing telecom integration. Wrap in **`for (i = 1..3)`** retry loop with exponential backoff (5s → 15s → 45s) — total budget < 90s, well under the 5-min SLA.
5. On success → `status='completed'`, `disbursed_at=now()`, run `record_rent_payment`, write `general_ledger` legs, log `system_event 'landlord_payout_completed'`, fire SMS to landlord + agent + tenant.
6. On all 3 retries failing → `status='escalated'`, refund float (reverse `deduct_agent_float_for_payout`), insert `notifications` row to all `financial_ops` users, log `system_event 'landlord_payout_escalated'`, return 202.

Per the constitution: uses `adminClient.auth.getUser()`, manual `corsHeaders`, `create_ledger_transaction` with **raw array** (never stringified), only allowlisted categories.

### 3. New cron `landlord-payout-sla-monitor` (every 1 min)
Selects `landlord_payouts` where `status IN ('otp_verified','disbursing')` AND `now() > sla_deadline`. For each:
- If still `disbursing` → mark `escalated`, refund float, alert Fin Ops.
- Insert `system_events` row `'landlord_payout_sla_breach'` for the CTO infra dashboard.

### 4. Front-end refactor of `AgentFloatPayoutWizard.tsx`
Replace the post-OTP manual MoMo/TID/receipt-upload step with a single live progress screen:

```
[OTP verified ✅]    SLA countdown: 04:58
   ↓
[Disbursing… attempt 1/3]
   ↓
[✅ Paid UGX 500,000 to John Doe at 09:42]
```

- Remove TID input, provider select, receipt upload (no longer needed — system pays directly).
- Drive UI by polling `landlord_payouts` by id every 2s OR Supabase Realtime subscription on that row (cheaper, per cost-optimization protocol).
- Show **client-side pre-validation** banner before OTP step: float OK ✓, landlord verified ✓, before-10-AM ✓ — fail-fast per `useServiceValidation` pattern.
- Hard-disable the "Send OTP" button after 10:00 AM Africa/Kampala with a clear "Cutoff reached — try tomorrow before 10 AM" message.

### 5. CFO float allocation (existing, minor patch)
The CFO already allocates float via `fund-agent-landlord-float` and `assign-agent-float`. Add a **"Region"** optional metadata field on `agent_landlord_float` (single nullable `region text` column) so CFO can target allocations geographically per the spec. UI: small region tag in `AgentLandlordFloatCard` and CFO allocation dialog.

### 6. Landlord Ops verification UX (light touch)
Confirm there's a clear toggle in the Landlord Ops dashboard for `verified=true` + `verified_by`. The trigger from step 1 enforces the rule — no payout possible without it. Just make sure the existing UI surfaces "**Eligible for auto-payout**" once verified.

### 7. Monitoring & audit
- Every state change appends to `audit_logs` with the mandatory ≥10-char reason ("AUTO_DISBURSE_OK", "AUTO_RETRY_F1", "SLA_ESCALATE", etc.).
- New CFO/Fin Ops dashboard widget **"Landlord Payout SLA Health"** showing: payouts today, avg time-to-disburse, 5-min breach count, escalations queue. (One new component, slots into existing Fin Ops Command Center.)

---

## Files to create / change

**New**
- `supabase/migrations/<ts>_landlord_payout_engine.sql` — table + triggers + RPCs + cutoff function
- `supabase/functions/landlord-payout-disburse/index.ts`
- `supabase/functions/landlord-payout-sla-monitor/index.ts` (cron)
- `src/components/financial-ops/LandlordPayoutSLAHealth.tsx`
- `src/components/agent/LandlordPayoutProgress.tsx` (live SLA screen)

**Modified**
- `src/components/agent/AgentFloatPayoutWizard.tsx` — replace post-OTP manual steps with `LandlordPayoutProgress`, add cutoff/eligibility pre-checks
- `src/components/agent/AgentLandlordFloatCard.tsx` — show region tag
- `src/components/cfo/CFOFloatAllocationDialog.tsx` (or wherever CFO funds float) — add region selector
- Cron registration via `cron.schedule` in migration (per project pattern, runs every minute, calls the SLA monitor function with anon key)

## Out of scope
- Replacing the existing manual-TID flow for **non-eligible** landlords (still valid as a fallback). The new auto-flow only activates when landlord is `verified` and has a usable MoMo number.
- New MoMo provider integration — uses the existing telecom integration layer.
- No changes to `disburse-rent-to-landlord` (CFO-side disbursement) or `fund-agent-landlord-float` (CFO-side funding) — those remain the float source.

## Risks & mitigations
- **MoMo gateway flakiness** → 3-retry exp backoff inside 90s budget + escalation.
- **Double-spend race** → atomic `deduct_agent_float_for_payout` RPC with `FOR UPDATE` row lock on the float row before decrement.
- **Refund correctness on failure** → escalation path restores float via balanced reverse ledger entries, never direct mutation (per Financial Flow Integrity rule).
- **OTP replay** → reject if `otp_verified_at` is older than 120s when `landlord-payout-disburse` is called.

## Expected outcome
Agent meets landlord before 10 AM → taps "Pay" → OTP sent → landlord reads code → agent enters it → **system pays automatically within seconds, agent watches the live progress screen, landlord gets MoMo + SMS confirmation, ledger and SLA are recorded. No Fin Ops touch unless the gateway fails 3 times.**
