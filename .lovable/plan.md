

## Plan: Agent Self-Registration of No-Smartphone Funders + Remove Visit Requirement

### What Changes

1. **Remove the "Visit" concept entirely** — Delete `FunderVisitDialog.tsx`, remove the Visits tab and Log Visit buttons from `FunderManagementSheet.tsx`, and drop visit-related state/fetches.

2. **Add "Register New Funder" flow in the FunderManagementSheet** — A button at the top that opens a dialog where the agent enters:
   - Funder's full name
   - Funder's phone number
   - Optional notes (e.g. "My uncle, lives in Kampala")
   
   On submit, the system:
   - Creates a new profile in `profiles` (via an edge function, since agents can't write to auth)
   - Assigns the `supporter` role
   - Creates a wallet for the funder
   - Auto-creates the `proxy_agent_assignments` record linking agent → funder
   - All flagged as `is_proxy` in audit

3. **New Edge Function: `register-proxy-funder`** — Handles the backend logic securely:
   - Creates auth user with phone (no password needed since they'll use USSD only)
   - Inserts profile, role, wallet, and proxy assignment
   - Returns the new funder ID

4. **Simplify FunderManagementSheet UI**:
   - Remove Visits tab, keep only Overview tab
   - Remove all MapPin/visit references
   - Add "Register Funder" button in the empty state and header
   - Keep SMS statement and Call actions
   - Keep the portfolio card and USSD info

### Files to Change

| File | Action |
|------|--------|
| `src/components/agent/FunderVisitDialog.tsx` | Delete |
| `src/components/agent/FunderManagementSheet.tsx` | Remove visits, add Register Funder dialog |
| `src/components/agent/FunderPortfolioCard.tsx` | Keep as-is |
| `supabase/functions/register-proxy-funder/index.ts` | Create — registers funder without smartphone |
| `supabase/functions/ussd-callback/index.ts` | No changes needed |

### Technical Details

**Edge Function `register-proxy-funder`**:
```
Input: { full_name, phone, agent_id, notes? }
Steps:
  1. Normalize phone to +256 format
  2. Check if phone already exists in profiles
  3. Create auth user via admin API (generateLink or createUser)
  4. Insert profile record
  5. Insert user_roles (supporter)
  6. Create wallet (balance 0)
  7. Insert proxy_agent_assignments (agent_id, beneficiary_id, role: supporter, assigned_by: agent_id)
  8. Log to audit_logs with is_proxy = true
  9. Return { success, funder_id }
```

**Register Dialog in FunderManagementSheet**: Inline form with name + phone fields, submit calls the edge function, then refreshes the funder list.

