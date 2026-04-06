

# Redesign Agent Wallet Card to Purple Gradient Style

## What Changes

The agent's wallet card on the dashboard will be restyled to match the uploaded reference image — a bold purple gradient card with rounded corners, the balance prominently displayed, and "Withdraw" / "Send" action buttons at the bottom.

## Design

Based on the reference image:
- Purple gradient background (`from-[#7C3BED]` to a lighter purple)
- White text throughout
- "Wallet Balance" label at top-left
- Large bold "UGX {amount}" below
- A decorative icon/sparkle element top-right
- Two pill-shaped action buttons at the bottom: **Withdraw** and **Send**

## Technical Details

**File: `src/components/dashboards/AgentDashboard.tsx`** (lines ~261-288)

Replace the current wallet `<button>` block with a styled purple gradient card:

- Background: `bg-gradient-to-br from-[#7C3BED] to-[#9B6EF3]` with rounded-2xl
- White text for label and balance
- Two bottom buttons: "Withdraw" (opens withdraw flow) and "Send" (opens wallet sheet or send flow)
- Remove the current border/primary-tint styling and carrier badges
- Keep the `onClick` on the main card area to open `FullScreenWalletSheet`
- Add `e.stopPropagation()` on the two action buttons so they trigger their own flows

### Button Actions
- **Withdraw**: Opens the existing `FullScreenWalletSheet` (or a withdraw-specific flow if one exists)
- **Send**: Opens the `FullScreenWalletSheet` for sending money

### Files

| Action | File |
|--------|------|
| Modify | `src/components/dashboards/AgentDashboard.tsx` — restyle wallet card to purple gradient with Withdraw/Send buttons |

