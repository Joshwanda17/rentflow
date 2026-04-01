

# Capital Opportunities — Investment Entry & Selection Flow

## Overview

Replace the current static Angel Pool opportunity card in `/angel-pool` with a conversion-focused entry card and a selection modal (Drawer on mobile, Dialog on desktop) that lets users choose between **Tenant Support Pool** and **Angel Pool**. After selection, the entry card transforms to show active investment state. All mock data, no database.

## Files to Create/Edit

### New file: `src/components/angel-pool/CapitalOpportunityEntry.tsx`
The main entry component with two states:

**Default State (no investment):**
- Headline: "Grow Your Capital" with supporting text about verified opportunities
- Single highlight metric: total opportunity size (e.g. "USh 1.2B+ in active demand")
- Trust row: 4 compact indicators (Verified · Insured · 24hr Deploy · Active Network)
- Primary CTA: "Explore Opportunities" → opens selection modal
- Clean card matching existing `OpportunitySummaryCard` border/shadow style

**Post-Selection State:**
- Shows selected pool name + badge
- Current invested value and key metric (monthly return for Tenant, shares owned for Angel)
- Primary action: "Add More Funds"
- Secondary action: "Manage Investment"
- No pool selection shown — only the user's active investment

State is held in local `useState` (mock, no persistence).

### New file: `src/components/angel-pool/InvestmentSelectionSheet.tsx`
Responsive modal component:
- Uses `Drawer` (vaul) on mobile (`md:` breakpoint), `Dialog` on desktop via a `useMediaQuery` or simple width check
- Title: "Choose Your Investment"
- Two option cards side by side on desktop, stacked on mobile:

**Card 1 — Tenant Support Pool:**
- Icon + title + 1-line description ("Fund verified rent requests, earn monthly returns")
- Metrics: Monthly Return: 15% · Deploy: 24–72hrs · Payout: Monthly
- Trust line: "Verified & insured"
- CTA button: "Support Tenant"

**Card 2 — Angel Pool:**
- Icon + title + 1-line description ("Own shares in Welile's future growth")
- Metrics: Equity: up to 8% · Horizon: Long-term · Ownership: Shares
- Trust line: "Early-stage opportunity"
- CTA button: "Invest in Angel Pool"

Clicking a CTA closes the modal and calls back with the selected pool type.

### Edit: `src/pages/AngelPool.tsx`
- Remove the current inline Angel Pool opportunity card (lines ~260–373)
- Import and render `<CapitalOpportunityEntry />` in the Capital Opportunities section
- Pass mock investment state and handlers

## Interaction Flow

```text
Entry Card (default) → CTA click → Selection Sheet opens
  → User picks "Support Tenant" or "Angel Pool"
  → Sheet closes → Entry Card transforms to active state
  → Shows invested amount, key metric, "Add More" / "Manage" buttons
```

## Technical Details

- `useIsMobile` hook (or `window.innerWidth < 768`) to switch between Drawer and Dialog
- All state is local `useState` — selected pool, mock invested amount
- Reuses existing UI primitives: `Card`, `Button`, `Badge`, `Drawer`, `Dialog`
- Responsive: cards stack on mobile, side-by-side on `sm:` breakpoint
- Typography hierarchy via Tailwind: `text-lg font-black` for headline, `text-xs` for trust indicators
- No new npm dependencies

