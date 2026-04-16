

# Rent Pipeline Refinement: OTP-Gated Landlord Payout & Process Hardening

## Current State (What Already Exists)

Your pipeline already has the 6-stage flow working:
1. **Agent submits** rent request → status `pending`
2. **Tenant Ops** verifies tenant → `tenant_ops_approved`
3. **Agent Ops** verifies agent qualification → `agent_verified`
4. **Landlord Ops** reviews landlord → `landlord_ops_approved`
5. **COO** approves → `coo_approved`
6. **CFO** funds agent float → `funded`

Then the agent uses `AgentFloatPayoutWizard` to pay the landlord (MoMo TID + GPS + receipt), and Financial Ops verifies the withdrawal.

**The `sms-otp` edge function already exists** and works with Africa's Talking. The `OtpVerificationStep` component is also built.

## What's Missing (Your Request)

### Gap 1: Landlord Ops Has No Structured Verification Checklist
Currently Landlord Ops just clicks "Approve". No landlord call logging, no acknowledgment capture, no phone verification.

### Gap 2: No Landlord OTP Gate on Float Withdrawal
Currently the agent enters a MoMo TID to prove payment. But there's no OTP sent to the **landlord's phone** to prove the agent is physically with the landlord and that the landlord's number is real.

### Gap 3: Non-Smartphone Landlords Can't Receive OTP via App
Many landlords in Gulu/Mbarara have feature phones. OTP via SMS works perfectly for them — they just read the code to the agent.

## Plan

### 1. Landlord Ops Verification Checklist (Pipeline Stage `agent_verified`)

Add structured fields to the Landlord Ops stage in `RentPipelineQueue`:
- **Landlord called?** (checkbox + timestamp)
- **Landlord acknowledges Welile as payer?** (yes/no)
- **Recommended verification method** (dropdown: Phone Call, Physical Visit, LC1 Confirmation)
- **Landlord phone verified?** (Send OTP to landlord's MoMo number at this stage)
- **Notes from call**

These fields get stored on the `rent_requests` table (new columns via migration).

Approval is blocked until: called = true AND acknowledged = true.

### 2. OTP-Gated Float Withdrawal (The Big Change)

Modify `AgentFloatPayoutWizard` to add a mandatory OTP step:

**Flow:**
1. Agent selects rent request to pay landlord
2. Agent taps "Send OTP to Landlord" → calls `sms-otp` edge function with landlord's phone
3. OTP SMS arrives on landlord's phone (works on ANY phone — feature phone or smartphone)
4. Landlord physically reads the 6-digit code to the agent
5. Agent enters the OTP in the app
6. System verifies OTP → only THEN allows the payout submission
7. The `agent_float_withdrawals` record stores `landlord_otp_verified: true` and `landlord_otp_verified_at`

**Why SMS OTP is perfect for non-smartphone landlords:**
- SMS works on every phone (Nokia 3310 to iPhone)
- No app download required
- The landlord just reads 6 digits aloud
- This proves: (a) the number is real, (b) the agent is physically present, (c) the landlord consents

### 3. Landlord Acknowledgment SMS (After Payment)

After the agent completes the payout, send a confirmation SMS to the landlord:
> "Welile has paid UGX {amount} rent for {tenant_name} to your number. If you did not receive this, call 0800-XXX-XXX."

This creates an audit trail and gives landlords a way to dispute.

### 4. COO Bulk Approval Enhancement

Add a "Select All" checkbox + "Approve Selected" button to the COO stage so bulk approval is efficient.

## Files to Change

| File | Change |
|------|--------|
| **DB Migration** | Add `landlord_called`, `landlord_acknowledged`, `landlord_verification_method`, `landlord_call_notes` to `rent_requests`. Add `landlord_otp_verified`, `landlord_otp_verified_at` to `agent_float_withdrawals` |
| `src/components/executive/RentPipelineQueue.tsx` | Add landlord verification checklist UI at `agent_verified` stage; add COO bulk approve |
| `src/components/agent/AgentFloatPayoutWizard.tsx` | Add OTP step: send OTP to landlord phone → verify before allowing submission |
| `src/components/auth/OtpVerificationStep.tsx` | Reuse existing component (already built) |
| `supabase/functions/sms-otp/index.ts` | Already works — no changes needed |
| **New**: `src/hooks/useLandlordOtp.ts` | Hook wrapping sms-otp for landlord verification context |
| `src/components/financial-ops/FloatPayoutVerification.tsx` | Show OTP verification status badge |

## Technical Flow (OTP-Gated Payout)

```text
Agent taps "Pay Landlord"
        │
        ▼
Select rent request → Show landlord name + phone
        │
        ▼
"Send OTP to Landlord" → sms-otp edge function (action: send)
        │
        ▼
Landlord receives SMS: "Your Welile code is: 482916"
        │
        ▼
Agent enters 6-digit code → sms-otp (action: verify)
        │
        ▼  (verified = true)
Agent enters MoMo TID + receipt photo + GPS
        │
        ▼
Submit → agent_float_withdrawals record created
        │
        ▼
Confirmation SMS sent to landlord: "Welile paid UGX X for {tenant}"
```

## Non-Smartphone Landlord Support

SMS OTP is the solution — no changes needed. Every phone receives SMS. The physical handshake (landlord reads code → agent types it) is the most secure verification possible for rural Uganda. No internet required on the landlord's side.

## COO Bulk Approval

```text
┌─────────────────────────────────────────┐
│ ☐ Select All (12 requests)              │
│ ☑ Tenant A — 500,000 UGX — Agent Kato  │
│ ☑ Tenant B — 300,000 UGX — Agent Okello│
│ ☐ Tenant C — 450,000 UGX — Agent Biira │
│                                         │
│ [Approve Selected (2)]  [Reject Selected]│
└─────────────────────────────────────────┘
```

