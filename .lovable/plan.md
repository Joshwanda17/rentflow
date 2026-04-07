

# Apply Reference Design to Fund Requisition Form

The current form is close but needs specific styling tweaks to match the reference image exactly.

## Changes

### `src/components/financial-ops/AgentRequisitionForm.tsx`
- **Labels**: Change to uppercase bold — `AMOUNT (UGX)`, `PURPOSE`, `DESCRIPTION`
- **Description label row**: Put "DESCRIPTION" and character counter on the same line (flex row with justify-between)
- **History date format**: Change from `MMM d, HH:mm` to `MMM d, yyyy • hh:mm a` (e.g. "Aug 24, 2024 • 10:45 AM")
- **History purpose labels**: Show the human-readable purpose label (e.g. "Operational Liquidity") instead of raw key, using a two-line layout with wrapping
- **Submit button**: Use a coral/purple gradient (`from-purple-600 via-purple-500 to-pink-500`) with fully rounded pill shape (`rounded-full`)

### `src/components/agent/FinancialAgentSection.tsx`
- **Header**: Add app name "Sovereign Vault" with avatar placeholder and notification bell icon at the top, matching the reference layout
- **Security banner text**: Update to match reference: "All fund requisitions are encrypted and audited per Sovereign compliance standards."

| File | Change |
|---|---|
| `AgentRequisitionForm.tsx` | Uppercase labels, date format, button gradient, layout tweaks |
| `FinancialAgentSection.tsx` | App header with branding, updated security text |

No logic changes — purely visual alignment to the reference.

