# Angel Pool Test Module — Isolated Build

## Approach

Build the Angel Investment module in a completely isolated `src/components/angel-pool/` directory with its own page at `/angel-pool`. No existing files will be modified except `App.tsx` (one lazy import + one route). No database tables — all data is mock/static for testing.

group routes if new pages are to be made

this new feature is to be added on the funder dashboard, replicate the funder dashboard place it in this folder.

**remove the dark mode, not needed.**

## Structure

```text
src/
  components/angel-pool/
    constants.ts              — Global constants
    mockData.ts               — Static mock investors, pledges, feed events
    AngelCalculator.tsx       — Investment calculator + future value simulator
    AngelPoolDashboard.tsx    — Pool metrics, progress bar, scarcity, leaderboard
    AngelActivityFeed.tsx     — Mock live activity feed with timed animations
    AngelInvestorCard.tsx     — Share allocation card (dark, exportable)
    AngelHeroCard.tsx         — Hero card (replicates HeroBalanceCard style)
  pages/
    AngelPool.tsx             — Full page assembling all components
```

## Constants (`constants.ts`)

```typescript
export const TOTAL_POOL_UGX = 500_000_000;
export const TOTAL_SHARES = 25_000;
export const PRICE_PER_SHARE = 20_000;
export const POOL_PERCENT = 8;
```

## Components

### 1. AngelCalculator

- Amount input (slider + field, UGX)
- Auto-calculates: shares, pool ownership %, company ownership %
- Future value simulator: toggle between $1B / $3B / $5B valuations
- Shows estimated value at each valuation
- Dark glassmorphism card matching HeroBalanceCard style

### 2. AngelPoolDashboard

- 4 metric cards: Total Raised, Target (500M), % Filled, Shares Remaining
- Animated progress bar (reuses existing Progress component with custom styling)
- Scarcity indicator: "Only X shares remaining" with urgency color
- Leaderboard: top 5 contributors sorted by amount (mock data)

### 3. AngelActivityFeed

- Simulated live feed using `setInterval` to cycle through mock events
- Format: "+ UGX X pledged — Name" / "+ UGX X secured — Name"
- Auto-scrolling list with fade-in animation (CSS transitions, no framer-motion)

### 4. AngelInvestorCard

- Dark premium card with: investor name, amount, shares, date, pool status %
- "Reserved for 48 hours" urgency tag
- "Secure your position" CTA
- Uses `html-to-image` (already may be available, or we use a simple canvas fallback) for WhatsApp sharing as PNG

### 5. AngelHeroCard

- Replicates the `HeroBalanceCard` mesh gradient + glassmorphism style
- Shows: Pool Target, Current Raised, ROI indicator (8% equity pool)
- Two action buttons: "Invest Now" and "View Pool"

## Page (`AngelPool.tsx`)

- Full-page layout matching the supporter dashboard structure
- Sections stacked vertically: Hero → Calculator → Pool Dashboard → Activity Feed → Share Card Generator
- Mobile-first, dark theme via Tailwind dark classes on the container
- No auth required (test page)

## Routing Change (`App.tsx`)

Add one lazy import and one route — no other file touched:

```typescript
const AngelPool = lazy(() => import('@/pages/AngelPool'));
// In Routes:
<Route path="/angel-pool" element={<AngelPool />} />
```

## Mock Data (`mockData.ts`)

Pre-populated arrays of:

- 10 mock investors with names, amounts, dates
- 15 mock activity feed events (pledges + confirmations)
- Pool progress set to ~35% filled (175M raised) for demo

## Design

- Reuses existing UI primitives: `Card`, `Button`, `Progress`, `Input`
- Dark container background with gradient accents matching primary color
- Glassmorphism on hero and calculator cards
- Large touch targets (44px min), compact number formatting on mobile
- No new npm dependencies needed
- we adding a new feature in the funder dashboard, 

## What is NOT touched

- No database migrations
- No edge functions
- No changes to supporter dashboard, wallet, or any existing component
- Only `App.tsx` gets one import + one route line