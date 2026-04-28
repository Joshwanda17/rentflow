# Fix: Confirm Payment button not responsive on iOS/Android

## Root Cause

The `Confirm` button in the **AgentTenantCollectDialog** sits low in the modal — visually right where the global `BottomRoleSwitcher` is fixed to the bottom of the viewport.

- `BottomRoleSwitcher` (src/components/BottomRoleSwitcher.tsx, line 79): `fixed bottom-0 left-0 right-0 z-50`
- Radix Dialog overlay + content: also `z-50` by default

Result: on mobile, the bottom role-switcher nav is rendered **after** the dialog in the DOM (it lives at the app shell level), so at the same z-index it wins the stacking contest and sits **on top of** the Confirm/Edit buttons. Taps on Confirm hit the role switcher's transparent nav area instead. That's why nothing happens and no `[AgentTenantCollectDialog] Confirm clicked` log fires (we already verified no such log exists).

The button code itself is fine — `touchAction: 'manipulation'` and the handler are correct. The problem is purely a z-index / overlay collision specific to mobile viewports where the dialog reaches the bottom of the screen.

## Fix

Two small, targeted changes:

### 1. Raise the dialog above the bottom nav
In `src/components/agent/AgentTenantCollectDialog.tsx`:
- Add `z-[60]` to the `DialogContent` so it sits above `BottomRoleSwitcher` (`z-50`).
- Add bottom padding/margin to the content (`mb-20` or `pb-20`) so the action buttons are pushed up clear of the ~56px role-switcher footprint, even when the modal is full height on small phones.

### 2. Make the Confirm button bullet-proof on touch
Already has `touchAction: 'manipulation'`. Additionally:
- Add `type="button"` explicitly (defensive — avoids any accidental form submit interception).
- Wrap the click handler so it also fires on `onPointerUp` as a fallback for iOS PWA edge cases (only if step 1 alone doesn't fully resolve — but step 1 is the actual fix).

## Files to change

- `src/components/agent/AgentTenantCollectDialog.tsx`
  - DialogContent: add `z-[60]` and bottom spacing so buttons clear the role switcher.
  - Confirm/Edit buttons: add `type="button"` for safety.

## Why this works

Once the dialog content is at `z-[60]` (one layer above the `z-50` BottomRoleSwitcher), taps on the Confirm button reach the button instead of the nav underneath it. The extra bottom padding guarantees the tappable area is never visually obscured by the role switcher, even on the smallest iPhone SE / older Android viewports.

No backend, RPC, or business-logic changes — purely a CSS stacking fix.
