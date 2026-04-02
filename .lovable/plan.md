

# Service Centre Setup & Verification Flow

## What We're Building

A complete workflow where agents set up physical Welile Service Centres, submit proof with GPS location, get verified by Agent Ops Manager, and receive UGX 25,000 from the CFO — all tracked as a marketing expense through the platform ledger.

## Flow

```text
Agent prints poster/logo → Takes photo of setup → Submits with GPS location
    ↓
Agent Ops Manager sees submission → Verifies GPS + agent details → Marks "Verified"
    ↓
CFO sees verified submissions → Approves → UGX 25,000 sent to agent wallet
    ↓
Platform ledger: cash_out/marketing_expense (platform) + cash_in/agent_commission (wallet)
```

## Changes

### 1. New Database Table: `service_centre_setups`

```sql
CREATE TABLE public.service_centre_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id),
  photo_url TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  location_name TEXT,           -- e.g. "Kampala Road, near Shell Petrol Station"
  agent_name TEXT NOT NULL,
  agent_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending → verified → approved → paid
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

With RLS policies for:
- Agents: INSERT own submissions, SELECT own submissions
- Agent Ops Manager roles: SELECT all, UPDATE (to verify)
- CFO/manager roles: SELECT verified, UPDATE (to approve)

Storage bucket `service-centre-photos` for the setup photos.

### 2. Agent Commission Benefits Page — New Sections

Add to `AgentCommissionBenefits.tsx` after the branding card:

**Printing Instructions Card:**
- Step-by-step guide in plain language
- Color codes: Primary Purple `#7214c9`, White `#FFFFFF`, Black text
- Paper size recommendation (A3 or A2 for poster, A4 for logo)
- Where to print (any print shop, show them the downloaded image)
- How to mount (visible wall, window, or signboard)

**Submit Your Service Centre Card:**
- Photo upload (camera capture preferred)
- GPS capture button (reuse existing geolocation pattern)
- Location name text input
- Agent name + phone auto-filled from profile
- Submit button → inserts into `service_centre_setups`

**My Submissions Card:**
- List of agent's own submissions with status badges (Pending → Verified → Approved → Paid)

### 3. Agent Ops Dashboard — Service Centre Verification Queue

New component `ServiceCentreVerificationQueue` added to `AgentOpsDashboard.tsx`:
- Shows all `pending` submissions
- Displays photo, GPS on map link, agent name, phone, submission date
- "Verify" button → updates status to `verified`, sets `verified_by` and `verified_at`
- "Reject" button with mandatory reason

### 4. CFO Approval — Service Centre Payout

Add a section to the CFO dashboard (or Financial Ops tools) showing `verified` service centre setups:
- Shows verified submissions with verifier name
- "Approve & Pay UGX 25,000" button
- On approval: calls `credit_agent_event_bonus` RPC with `p_bonus_type = 'service_centre_setup'`, `p_amount = 25000`
- This creates the double-entry: `cash_out`/`marketing_expense`/`platform` + `cash_in`/`agent_commission`/`wallet`
- Updates status to `paid`

### 5. Update `credit_agent_event_bonus` RPC

No changes needed — it already accepts arbitrary bonus types and amounts. We just call it with `service_centre_setup` as the type and `25000` as the amount.

### 6. Documentation Update

Update both `WELILE_WORKFLOW.md` files:
- Add Service Centre Setup bonus (UGX 25,000) to the event bonuses table
- Document the 3-step approval pipeline (pending → verified → approved/paid)
- Add to edge function registry if a new edge function is created

## Technical Details

- **Photo upload**: Uses existing `supabase.storage` pattern (see `deposit-proofs` bucket usage in `DepositFlow.tsx`)
- **GPS capture**: Reuses the `navigator.geolocation.getCurrentPosition` pattern used across 16+ existing components
- **Payout**: Uses existing `credit_agent_event_bonus` RPC — no new edge function needed for the payment itself; the CFO UI calls the RPC directly via the service role or an existing edge function wrapper
- **Realtime**: Optional — can add `service_centre_setups` to realtime publication for live status updates on the agent side

