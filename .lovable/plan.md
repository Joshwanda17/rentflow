

## Make the "Welile Vouches For You" card thumb-friendly on smartphones

The card on the Agent dashboard currently looks informational: the headline number (`Up to UGX X`) sits next to a small "How it works ▾" link in the meta line, and a tiny "AI ID ›" pill in the corner. On a phone, nothing screams "tap me", and the two tap zones are crammed against each other so misclicks happen.

Goal: on small screens, turn this into a card that **clearly invites a tap**, with two big, finger-sized buttons stacked at the bottom — one to expand the explainer, one to open the AI ID profile. Desktop layout stays compact (current look).

### What changes

**1. Add a clear vouch headline + supporting sub-line (no behaviour change):**
```
┌──────────────────────────────────────────────┐
│ 🛡️  WELILE VOUCHES FOR YOU       [TOP AGENT] │
│                                              │
│     Up to UGX 1,250,000                      │
│     Trust Score 72 · Good                    │
└──────────────────────────────────────────────┘
```
The whole card is no longer one big tap target — the header just displays. This kills the "did I tap the right thing?" ambiguity.

**2. Two thumb-sized action buttons stacked underneath (mobile only — `sm:` switches to inline):**
```
┌──────────────────────────────────────────────┐
│ ▾  How is this calculated?                   │  ← 44px tall, full-width
├──────────────────────────────────────────────┤
│ 👆 Open my AI ID  →                          │  ← 44px tall, full-width, primary
└──────────────────────────────────────────────┘
```
- Each button is `min-h-[44px]` (Apple HIG minimum touch target).
- Full-width on mobile, side-by-side on `sm:` and up so desktop stays tidy.
- Both buttons get `active:scale-[0.97]` + haptic tap (already imported).
- The "How is this calculated?" button rotates its chevron when expanded — same affordance as today, just much bigger.

**3. AI ID chip → real button:** the tiny pill in the corner gets removed and folded into the second action button ("Open my AI ID →"). Removes the cramped two-target header and means people stop accidentally expanding when they meant to view their profile.

**4. Building state (no vouch yet):** the second button changes to "Build my vouch limit →" and still routes to the AI ID page where the trust journey lives. The headline says "Build your vouch limit" (today's copy).

**5. Expandable explainer body — unchanged.** All the existing content (healthy ratio meter, collection rate meter, tier ladder, vouch math, exact-inputs panel, "Open full Trust Profile" CTA) stays exactly as it is. Only the trigger UI on top changes.

### Visual sketch (mobile)

```
┌────────────────────────────────────────────────┐
│  🛡️    WELILE VOUCHES FOR YOU      [TOP AGENT]│
│                                                │
│        Up to UGX 1,250,000                     │
│        Trust Score 72 · Good                   │
│                                                │
│  ┌──────────────────┐ ┌──────────────────────┐│
│  │ ▾ How calculated │ │ 👆 Open my AI ID  →  ││
│  └──────────────────┘ └──────────────────────┘│
│       (stacked on phone, side-by-side ≥sm)     │
└────────────────────────────────────────────────┘
   [tap "How calculated" → existing explainer
    panel slides open below, unchanged]
```

### Files touched

- `src/components/agent/AgentVouchHighlightCard.tsx` — restructure the top section only:
  - Replace the `<button>` wrapper around the header with a non-interactive `<div>`; remove the inline "How it works" chip and the corner AI ID pill.
  - Add a new action-button row at the bottom of the header (above the expanded panel) with two `<button>` elements, full-width on mobile, `sm:flex-row` `sm:w-auto` on desktop.
  - Keep the existing expanded panel (`expanded && <div>...`) and `MetricRow` helper untouched.

No changes to: data hooks, trust score logic, navigation routes, any other component, or backend.

### Acceptance

1. On a 375px-wide phone, the headline number is the dominant visual; the two action buttons are clearly separate, each at least 44px tall, and span the full card width.
2. Tapping "How is this calculated?" expands/collapses the existing explainer panel; the chevron rotates.
3. Tapping "Open my AI ID →" navigates to `/profile/<aiId>` (same as today's pill).
4. A user with no vouch limit sees "Build your vouch limit" and the second button reads "Build my vouch limit →".
5. On `sm:` and wider, the two action buttons sit side-by-side so the card stays compact on tablets/desktop.
6. The TOP AGENT badge and Trust Score / tier line are still visible; haptic feedback still fires on tap.

