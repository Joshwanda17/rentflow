

# Redesign: Agent "My Tenants" Page — Clean, Mobile-First, Professional

## Problem
The current 860-line `AgentTenantsSheet.tsx` is overloaded with filters, sort options, stats cards, schedule previews, multiple action buttons, and dense information. On a small smartphone it's cramped and overwhelming for field agents who need to quickly see: **who owes what** and **take action**.

## Design Principles
- **One-thumb usable** on a 5" phone screen
- **Plain language** — no jargon ("Still owes" not "Outstanding balance", "Paid up" not "Cleared")
- **Show what matters first** — Name, Amount owed, one-tap actions
- **Progressive disclosure** — details on tap, not all at once

## New Layout

```text
┌──────────────────────────────────┐
│ 👥 My Tenants              [12] │
│ ┌──────────────────────────────┐ │
│ │ 🔍 Search name or phone...  │ │
│ └──────────────────────────────┘ │
│ [Owing ⓸] [Paid up] [All]       │
│ Total owed: UGX 2,400,000       │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ J  Jane Mukasa    450,000   │ │
│ │    0771234567    ▓▓▓░░ 40%  │ │
│ ├──────────────────────────────┤ │
│ │ K  Kato Brian     300,000   │ │
│ │    0752345678    ▓▓░░░ 25%  │ │
│ └──────────────────────────────┘ │
│                                  │
│ ── Tapped on Jane ──            │
│ ┌──────────────────────────────┐ │
│ │ Rent: 400,000  Daily: 13,333│ │
│ │ Paid so far: 180,000        │ │
│ │ Still owes: 270,000         │ │
│ │                              │ │
│ │ [📞 Call] [💬 WhatsApp]     │ │
│ │ [📄 PDF]  [🔄 Renew]       │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

## What Changes

### Header — Simplified
- Remove the 3 stat cards (Owing/Cleared/No Phone grid). Replace with a single summary line: "Total owed: UGX X"
- Keep search bar (unchanged)
- Reduce 6 filter pills → 3: **Owing** (default), **Paid up**, **All**
- Remove sort selector entirely — always sort by highest debt first (most useful for agents)

### Tenant Row — Cleaner
- Keep: avatar initial, name, phone, outstanding amount (bold red if owing)
- Keep: compact progress bar
- Remove: "You paid X" line, "No payment recorded" line, agent payment tracking text
- Remove: call button from the row (move to expanded view)
- Use plain words: amount in red = "owes", green badge = "Paid up"

### Expanded View — Focused
- Show: Rent amount, Daily amount, Paid so far, Still owes — in a clean 2x2 grid
- Action buttons: **Call**, **WhatsApp**, **PDF**, **Receipt** — 2x2 grid, larger tap targets (h-10 minimum)
- Keep: Renew button for completed requests
- Remove: schedule day preview dots, "Receipt WA" (redundant with WhatsApp), the agent payment summary card
- Remove: No-smartphone tools section (move check to a small icon indicator only)

### Language Changes
| Before | After |
|--------|-------|
| "Cleared" | "Paid up" |
| "Outstanding" badge | Red amount is self-explanatory |
| "Your payments" | Remove entirely |
| "Balance reduced / cleared" | "Paid up" |
| "Still owing" | "Still owes" |
| "No rent records yet" | "No rent plans yet" |

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/components/agent/AgentTenantsSheet.tsx` | Full rewrite of JSX; keep data-fetching logic intact. Remove ~300 lines of UI complexity |

### What Stays Exactly The Same
- All data fetching logic (fetchTenants, fetchTenantRequests)
- Sheet open/close behavior
- Renew rent dialog integration
- PDF download and WhatsApp share handlers
- The filtering/search logic (simplified to 3 tabs but same mechanism)

### Removed UI Elements
- 3-stat grid header (Owing/Cleared/No Phone cards)
- Sort mode selector
- Schedule day preview dots
- Agent payment summary card in expanded view
- No-smartphone management tools section
- "Receipt WA" button (keep just WhatsApp)
- ChevronUp/ChevronDown icons

### Mobile Optimizations
- All tap targets minimum 44px height
- Font sizes: names 14px, amounts 14px bold, labels 11px
- Progress bar thicker (h-2)
- Buttons h-10 with clear icons
- `touch-manipulation` on all interactive elements

