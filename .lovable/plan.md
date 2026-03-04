

## Generate Shareable Activation Link After Proxy Investment

### What Changes

**1. Edge Function (`agent-invest-for-partner/index.ts`)**
- After the investment succeeds, look up the partner's `supporter_invites` record (where `activated_user_id = partner_id` or `created_by = agent.id` and matching phone/email)
- If a pending invite exists, return the `activation_token` in the response
- If no pending invite exists (partner already fully activated), return a flag indicating "already activated"

**2. Success Screen (`AgentInvestForPartnerDialog.tsx`)**
- Expand the success state to include `activation_token` (optional)
- After "Investment Successful!", add a **"Share Activation Link"** section with:
  - A generated link using `getPublicOrigin() + '/join?t=' + activation_token`
  - **Copy Link** button
  - **Share via WhatsApp** button (pre-filled message with investment summary + activation link)
  - **Native Share** button (using `navigator.share` API with fallback)
- The share message includes: partner name, investment amount, monthly reward, payout date, and the activation link
- If partner is already activated (no token), show a simpler "Share Investment Confirmation" with just the reference ID

### Share Message Template
```
🎉 Your Welile Investment is Ready!

Hi {partnerName}, {agentName} has invested UGX {amount} on your behalf into the Rent Management Pool.

💰 Monthly Reward: UGX {monthlyReward} (15%)
📅 Payout Day: {payoutDay}th of each month
🗓️ First Payout: {firstPayoutDate}

👉 Activate your account to start receiving rewards:
{activationLink}

Ref: {referenceId}
```

### Files to Modify
- `supabase/functions/agent-invest-for-partner/index.ts` — add activation token lookup to response
- `src/components/agent/AgentInvestForPartnerDialog.tsx` — add share buttons to success screen

