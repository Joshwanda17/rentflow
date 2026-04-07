

## Fix: Register New Investor dialog overflows on mobile

**Problem**: The dialog uses `max-w-md` (448px) which exceeds the 390px mobile viewport, causing horizontal overflow.

**Changes to `src/components/agent/AgentAngelPoolInvestDialog.tsx`**:

1. Change the `DialogContent` className from `max-w-md` to `w-[95vw] max-w-md` so it respects mobile viewport width while capping at `md` on larger screens.

2. Add `px-4` padding adjustments to ensure inner content doesn't touch edges on small screens.

3. On the bottom button row (Back to Search / Register & Select), reduce text size on mobile to prevent the "Register & Select" button from being cut off — use `text-sm` on the buttons.

This is a single-line CSS fix on the container, no logic changes needed.

