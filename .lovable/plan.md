

# Marketing Insight Popup (Annual Rent)

## What We're Building
A non-intrusive popup that appears once when the tenant enters their rent amount, showing the annual cost and positioning the platform's repayment system as a solution.

## Trigger
- Fires on `onBlur` of the rent input OR after ~1 second pause in typing
- Only shown **once per session** (tracked via `useState` flag)
- Only shown when rent amount is valid (> 0)

## UI
A dismissible toast-style card that slides in below the rent input (not a modal — won't block form progress). Contains:
- "💡 Did You Know?" header
- Monthly rent × 12 = annual figure
- "We help you spread this into manageable payments based on your income."
- Close button (X)

## Technical Details

### File: `src/pages/RegisterTenantPublic.tsx`

1. **Add state**: `shownInsight` (boolean), `insightVisible` (boolean), `typingTimer` (ref)
2. **Add debounced handler** on the rent input: on `onChange`, clear/reset a 1-second timer; on `onBlur`, trigger immediately. When triggered (and `!shownInsight` and rent > 0), set `insightVisible = true` and `shownInsight = true`.
3. **Render insight card** directly below the rent `<Input>` — a styled div with annual calculation, message text, and X close button. Animate in with a simple transition.

No new files or components needed — self-contained within the page.

