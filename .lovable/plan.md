

# Post-Approval Notification Enhancement

## Current State
The `approve-rent-request` edge function already creates **in-app notifications** for:
- Tenant: "Rent Request Approved!" (line 294-301)
- Agent: Bonus notification only (line 272-280)

**Missing:**
- No SMS notification to tenant or agent on approval
- No in-app notification to the agent about the approval itself (only bonus)
- No SMS on rejection either

## What Changes

### 1. Add SMS notifications to `approve-rent-request/index.ts`

After approval, send SMS via Africa's Talking (same pattern used in `sms-otp`, `send-collection-sms`, `password-reset-sms`):

- **Tenant SMS**: "WELILE: Your rent of UGX X has been approved and will be paid to your landlord. Repayment of UGX Y/day starts tomorrow. Ref: {id}"
- **Agent SMS** (if agent exists): "WELILE: Rent request for {tenant_name} (UGX X) has been approved. You earned UGX 5,000 bonus."

Phone numbers fetched from `profiles` table. Only sent for Ugandan numbers (+256).

### 2. Add agent in-app notification for approval (not just bonus)

Currently the agent only gets a bonus notification. Add a separate "Rent Approved" notification so agents without bonus still know the outcome.

### 3. Add rejection notifications

- **Tenant SMS**: "WELILE: Your rent request for UGX X was not approved. Contact your agent for details."
- **Agent in-app notification**: "{tenant_name}'s rent request was rejected."

### File Changes

| File | Change |
|---|---|
| `supabase/functions/approve-rent-request/index.ts` | Add `sendSMS()` helper, fetch tenant/agent phone from profiles, send SMS on approve + reject, add agent in-app notification on approval |

### SMS Logic
- Reuse the Africa's Talking pattern from existing functions (AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME secrets already configured)
- Format phone to +256 international format
- SMS is fire-and-forget (non-blocking, logged but won't fail the approval)
- Only attempt SMS for valid Ugandan phone numbers

### Notification Summary

| Event | Tenant In-App | Tenant SMS | Agent In-App | Agent SMS |
|---|---|---|---|---|
| Approved | Existing | **New** | **New** | **New** |
| Rejected | Existing | **New** | **New** | No |

