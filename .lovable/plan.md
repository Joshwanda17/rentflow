

# Strengthen Event-Based Architecture

## Current State

The system has the **foundations** but is not fully wired:

- **`system_events` table** exists with 20 event types and proper indexes
- **`log_system_event` RPC** exists and works (INSERT into system_events, returns UUID)
- **DB triggers** call `log_system_event` for: risk score changes, payments, wallet balance changes, rent request lifecycle
- **Edge functions** (80+ of them) call `log_system_event` exactly **zero times**
- **Client-side** uses ephemeral `window.dispatchEvent` for 5 events (`supporter-contribution-changed`, `pool-funded`, `open-deposit`, `opportunities-marked-seen`, `user-deleted`)
- **Retention**: 7-day auto-purge deletes ALL events including financial ones
- **Write suppression**: The memory says system events are suppressed, but the actual trigger only blocks `notifications` — `system_events` inserts are NOT currently blocked

## Plan

### Phase 1: Expand Event Types Enum
Add missing event types needed for edge function coverage:

```sql
ALTER TYPE system_event_type ADD VALUE 'deposit_approved';
ALTER TYPE system_event_type ADD VALUE 'deposit_rejected';
ALTER TYPE system_event_type ADD VALUE 'withdrawal_requested';
ALTER TYPE system_event_type ADD VALUE 'withdrawal_approved';
ALTER TYPE system_event_type ADD VALUE 'withdrawal_rejected';
ALTER TYPE system_event_type ADD VALUE 'wallet_transfer';
ALTER TYPE system_event_type ADD VALUE 'portfolio_topup';
ALTER TYPE system_event_type ADD VALUE 'rent_disbursed';
ALTER TYPE system_event_type ADD VALUE 'roi_distributed';
ALTER TYPE system_event_type ADD VALUE 'loan_approved';
ALTER TYPE system_event_type ADD VALUE 'loan_rejected';
ALTER TYPE system_event_type ADD VALUE 'expense_transfer';
ALTER TYPE system_event_type ADD VALUE 'agent_collection';
ALTER TYPE system_event_type ADD VALUE 'role_changed';
ALTER TYPE system_event_type ADD VALUE 'user_deleted';
ALTER TYPE system_event_type ADD VALUE 'password_reset';
ALTER TYPE system_event_type ADD VALUE 'login_success';
ALTER TYPE system_event_type ADD VALUE 'listing_created';
ALTER TYPE system_event_type ADD VALUE 'listing_approved';
```

### Phase 2: Fix Retention Policy
Update the cleanup function to preserve financial events permanently:

```sql
CREATE OR REPLACE FUNCTION public.cleanup_old_system_events()
RETURNS void AS $$
BEGIN
  DELETE FROM public.system_events
  WHERE created_at < now() - interval '7 days'
  AND event_type NOT IN (
    'payment_made','payment_missed','funds_added','funds_withdrawn',
    'deposit_approved','withdrawal_approved','wallet_transfer',
    'portfolio_topup','rent_disbursed','roi_distributed',
    'loan_approved','agent_collection','expense_transfer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

### Phase 3: Create Shared Event Logger for Edge Functions
Create `supabase/functions/_shared/eventLogger.ts` — a lightweight helper:

```typescript
export async function logSystemEvent(
  adminClient: SupabaseClient,
  eventType: string,
  userId: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  await adminClient.rpc('log_system_event', {
    p_event_type: eventType,
    p_user_id: userId,
    p_related_entity_type: entityType ?? null,
    p_related_entity_id: entityId ?? null,
    p_metadata: metadata ?? {},
  }).catch(err => console.error('Event log failed:', err));
}
```

### Phase 4: Wire Top 10 Critical Edge Functions
Add `logSystemEvent` calls at the success path of these functions:

| Edge Function | Event Type |
|---|---|
| `wallet-transfer` | `wallet_transfer` |
| `approve-deposit` | `deposit_approved` |
| `approve-rent-request` | `rent_request_approved` |
| `disburse-rent-to-landlord` | `rent_disbursed` |
| `portfolio-topup` | `portfolio_topup` |
| `reject-withdrawal` | `withdrawal_rejected` |
| `agent-deposit` | `agent_collection` |
| `platform-expense-transfer` | `expense_transfer` |
| `process-supporter-roi` | `roi_distributed` |
| `approve-loan-application` | `loan_approved` |

Each gets a single line added after the success response construction.

### Phase 5: Add Auto-Logging Triggers on Critical Tables
Add DB triggers that automatically emit events on mutations to `deposit_requests`, `withdrawal_requests`, and `general_ledger`:

- `deposit_requests`: On status change to 'approved' → log `deposit_approved`
- `withdrawal_requests`: On status change to 'approved'/'rejected' → log corresponding event
- `general_ledger`: On INSERT with category = 'wallet_transfer' → log `wallet_transfer`

### Phase 6: Replace Client-Side Ephemeral Events
Replace `window.dispatchEvent(new CustomEvent(...))` calls with Supabase Realtime subscriptions on relevant tables. The 5 affected components will subscribe to table changes instead of relying on browser-only events.

## Files Changed

| File | Action |
|---|---|
| Migration SQL | Create — enum additions, retention fix, triggers |
| `supabase/functions/_shared/eventLogger.ts` | Create — shared helper |
| `supabase/functions/wallet-transfer/index.ts` | Edit — add event log |
| `supabase/functions/approve-deposit/index.ts` | Edit — add event log |
| `supabase/functions/approve-rent-request/index.ts` | Edit — add event log |
| `supabase/functions/disburse-rent-to-landlord/index.ts` | Edit — add event log |
| `supabase/functions/portfolio-topup/index.ts` | Edit — add event log |
| `supabase/functions/reject-withdrawal/index.ts` | Edit — add event log |
| `supabase/functions/agent-deposit/index.ts` | Edit — add event log |
| `supabase/functions/platform-expense-transfer/index.ts` | Edit — add event log |
| `supabase/functions/process-supporter-roi/index.ts` | Edit — add event log |
| `supabase/functions/approve-loan-application/index.ts` | Edit — add event log |
| `src/components/supporter/FunderCapitalOpportunities.tsx` | Edit — replace dispatchEvent |
| `src/components/supporter/FundRentDialog.tsx` | Edit — replace dispatchEvent |
| `src/components/manager/ApprovedRequestsFundingWidget.tsx` | Edit — replace dispatchEvent |
| `src/components/supporter/RentOpportunities.tsx` | Edit — replace dispatchEvent |
| `src/components/rent/RentDueReceivablesWidget.tsx` | Edit — replace dispatchEvent |

## Outcome
- Every financial state transition emits a traceable system event
- Financial events are retained permanently; non-critical events still purge after 7 days
- Edge functions are wired into the event system via a shared helper
- Client-side ephemeral events are replaced with server-observable patterns

