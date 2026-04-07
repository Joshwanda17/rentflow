

# Redesign Fund Requisition to Match Reference Design

## What Changes

Redesign `FinancialAgentSection` and `AgentRequisitionForm` to match the uploaded reference — a clean, modern financial app layout with a proper header, styled form card, prominent submit button, and polished requisition history cards.

## Changes

### File: `src/components/agent/FinancialAgentSection.tsx`

Replace the Sheet wrapper with a full-height layout matching the reference:
- **Header area**: "FINANCIAL AGENT" badge in purple below app name, large "Fund Requisition" title, subtitle "Request liquidity for operational disbursements."
- Remove the info banner — the header conveys enough context
- Render the redesigned `AgentRequisitionForm` below
- Bottom security banner: purple rounded card with shield icon — "Secured Vault Access" + compliance message

### File: `src/components/financial-ops/AgentRequisitionForm.tsx`

Complete visual overhaul (logic stays the same):

**Form Card:**
- Rounded card with light gray/purple tint background
- Header row: purple icon + "Submit Fund Requisition" + subtitle "FUNDS WILL BE DISBURSED TO YOUR WALLET"
- **Amount field**: Styled with "UGX" prefix label inside the input, placeholder "0.00", gray background
- **Purpose dropdown**: Gray background, "Select requisition purpose" placeholder
- **Description textarea**: Gray background, character counter "0 / 250" aligned right, placeholder "Provide details regarding this fund request..."
- **Submit button**: Full-width, purple gradient (`bg-gradient-to-r from-purple-600 to-purple-500`), rounded-xl, large text "Submit Requisition" with arrow icon, no border

**History Section:**
- Header row: "My Requisitions" left-aligned + "VIEW ALL" link right-aligned (purple text)
- Show only first 3 by default; "VIEW ALL" toggles showing all
- Each requisition card: horizontal layout with:
  - Left: purple file icon in a light purple circle
  - Middle: purpose label (bold) + status badge (colored: orange PENDING, green APPROVED, red DECLINED) + date/time
  - Right: amount + "UGX" label, right-aligned
- Status badges: solid background (not outline) — orange for pending, green for approved, red for declined, small rounded pill with uppercase text

**Style tokens:**
- Form background: `bg-muted/40` or `bg-gray-50`
- Input backgrounds: `bg-gray-100` with no visible border
- Button: `bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl py-6 text-base font-semibold`
- Requisition cards: `bg-muted/30 rounded-2xl p-4` with no visible border

| Area | Change |
|---|---|
| FinancialAgentSection | New header layout, security banner at bottom |
| AgentRequisitionForm (form) | Styled card with gray inputs, gradient button, UGX prefix |
| AgentRequisitionForm (history) | Card-based list with icons, solid status badges, VIEW ALL toggle |
| Logic | No changes — all mutations/queries stay identical |

**Files changed:** `FinancialAgentSection.tsx`, `AgentRequisitionForm.tsx`

