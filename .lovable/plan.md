

# Plan: Add "Renew Rent" Button for Completed Tenants

## What it does
When an agent views a tenant whose latest rent request is `completed`, they'll see a "Renew Rent" button that opens the rent request dialog pre-filled with that tenant's name, phone, and previous rent amount — saving time on repeat applications.

## Changes

### 1. Add pre-fill props to `AgentRentRequestDialog`
Add optional props: `prefillTenantName`, `prefillTenantPhone`, `prefillRentAmount`. In `useEffect`, when the dialog opens with these props set, populate the corresponding state fields automatically.

**File:** `src/components/agent/AgentRentRequestDialog.tsx`

### 2. Add Renew button + dialog state in `AgentTenantsSheet`
- Import `AgentRentRequestDialog`
- Add state for `renewDialogOpen` and `renewPrefill` (name, phone, rent amount)
- For each rent request card with `status === 'completed'`, render a "🔄 Renew Rent" button in the actions grid
- On click, set prefill data from the completed request and open the dialog
- Render the dialog at the bottom of the Sheet

**File:** `src/components/agent/AgentTenantsSheet.tsx`

### 3. No backend changes needed
Uses the existing rent request submission flow.

## Files to modify
| File | Change |
|------|--------|
| `src/components/agent/AgentRentRequestDialog.tsx` | Add optional prefill props, auto-populate on open |
| `src/components/agent/AgentTenantsSheet.tsx` | Add Renew button for completed requests, wire up dialog |

