

# Redesign Agent Float Management — Sovereign Vault Aesthetic

## Reference Analysis (from screenshot)

The design uses the Sovereign Vault aesthetic with:
- "AGENT FLOAT MANAGEMENT" uppercase tracking-widest subtitle above a bold heading
- Clean tab bar (Transfers / Balances / Reconciliation) without icons, text-only
- Card with "Record Bank Float Transfer" heading + subtitle description
- Uppercase tracking-widest field labels (CASH-OUT AGENT, AMOUNT (UGX), BANK REFERENCE (TID)*, BANK NAME, NOTES)
- Full-width stacked fields (not 2-column grid)
- Purple-pink gradient pill-shaped submit button: "Record Float Transfer ➤"
- "Transfer History" section with "VIEW ALL" link in primary color
- Each history item shows a bank icon (purple circle), branch name, bank + TID, amount in UGX, and COMPLETED/PENDING badge
- Bottom summary card: purple gradient with "TOTAL FLOAT PROCESSED" uppercase label, large formatted amount, and "+X% from last week" trend
- Bottom tab bar: HOME, TRANSFERS, BALANCES, PROFILE (with icons)

## Changes — Single File

### `src/components/cfo/AgentFloatManagement.tsx`

**Main layout:**
- Replace header with uppercase "AGENT FLOAT MANAGEMENT" subtitle + bold "Agent Float Management" title
- Tab bar: text-only triggers without icons, clean underline style

**FloatTransfersTab:**
- Card with rounded-2xl, "Record Bank Float Transfer" heading + "Initiate and document bank-to-agent float settlements." subtitle
- All labels uppercase tracking-widest (CASH-OUT AGENT, AMOUNT (UGX), BANK REFERENCE (TID)*, BANK NAME, NOTES)
- Stack all fields vertically (no 2-column grid)
- Agent selector styled as a rounded-xl select with chevron
- Submit button: full-width pill shape with purple-pink gradient (`bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 rounded-full`)
- Transfer History section with "VIEW ALL" header link
- Each history row: circle icon with bank building, branch name, bank + TID ref, right-aligned UGX amount + COMPLETED/PENDING badge (green/amber)
- Bottom summary card: purple gradient background showing "TOTAL FLOAT PROCESSED" with computed sum and weekly trend percentage

**No logic changes** — only visual/layout restructuring. All existing mutations, queries, and data flow remain identical.

| File | Change |
|---|---|
| `src/components/cfo/AgentFloatManagement.tsx` | Restyle entire component to Sovereign Vault aesthetic |

