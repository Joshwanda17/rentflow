

## Plan: Route Post-Payment SMS Through Inngest

### What Changes

Replace the direct client-side call to `send-collection-sms` with an Inngest event. Inngest handles the SMS delivery with automatic retries, keeping all financial logic untouched.

### Architecture

```text
BEFORE:
  Agent pays → Supabase (RPC/DB) → ✅ committed
  Client calls send-collection-sms → Africa's Talking
  (no retries, client waits)

AFTER:
  Agent pays → Supabase (RPC/DB) → ✅ committed
  Client calls send-inngest-event edge function → Inngest
  Inngest → send-collection-sms → Africa's Talking
  (automatic retries, fire-and-forget)
```

### Steps

**1. Link Inngest connector to project**
- Use the existing "WELILE'S INGEST" workspace connection
- This makes `LOVABLE_API_KEY` and `INNGEST_API_KEY` available as env vars

**2. Create edge function: `supabase/functions/inngest-send-sms/index.ts`**
- Receives the same SMS payload from the client
- Fires an Inngest event (`app/payment.sms.requested`) via the connector gateway
- Returns immediately — fire-and-forget
- Payment data (tenant name, phone, amount, tracking ID, etc.) goes in the event payload

**3. Create Inngest serve endpoint: `supabase/functions/inngest/index.ts`**
- Defines an Inngest function triggered by `app/payment.sms.requested`
- Calls the existing `send-collection-sms` edge function internally (reuses all Africa's Talking logic)
- Inngest handles retries automatically if SMS delivery fails

**4. Update `AgentVisitPaymentWizard.tsx`**
- Replace `supabase.functions.invoke('send-collection-sms', ...)` with `supabase.functions.invoke('inngest-send-sms', ...)` — same payload, different endpoint
- Remove `smsSending` state since it's now fire-and-forget

**5. Register functions in `supabase/config.toml`**
- Add `[functions.inngest-send-sms]` and `[functions.inngest]` with `verify_jwt = false`

### What Does NOT Change
- `send-collection-sms` edge function — stays exactly as-is (Africa's Talking logic)
- All payment/wallet/ledger logic — completely untouched
- The `validate_and_record_collection` RPC — no changes
- SMS message format — identical

### Files

| File | Action |
|------|--------|
| `supabase/functions/inngest-send-sms/index.ts` | **Create** — event sender |
| `supabase/functions/inngest/index.ts` | **Create** — serve endpoint with SMS function |
| `src/components/agent/AgentVisitPaymentWizard.tsx` | **Edit** — swap SMS call |
| `supabase/config.toml` | **Edit** — register new functions |

