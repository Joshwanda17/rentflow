

## Fix: "Register & Select" button text cut off on mobile

**Problem**: The button row uses `flex-1` on both buttons, splitting space 50/50. The "Register & Select" text with its icon overflows on 390px viewports.

**Changes to `src/components/agent/AgentAngelPoolInvestDialog.tsx`** (lines 334-350):

1. Change button layout from `flex-1` equal split to give the Register button more room:
   - Remove `flex-1` from both buttons
   - Use `shrink-0` on "Back to Search" and `flex-1` on the Register button, OR
   - Simply add `text-sm` to both buttons and keep `flex-1` to shrink text to fit

2. Shorten button label to **"Register"** (removing "& Select" since auto-selection is implied) — this is the simplest fix and avoids any layout hacks.

**Recommended approach**: Shorten the label to "Register" and keep the `UserPlus` icon. Single-line change.

