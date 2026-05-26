## Why the "Pay from Your Float" button feels frozen

`TenantProfileView` opens inside a `Sheet`, and our `src/components/ui/sheet.tsx` was bumped to:
- overlay: `z-[110]`
- content: `z-[120]`

But `src/components/ui/dialog.tsx` is still at the shadcn default:
- overlay: `z-50`
- content: `z-50`

`AgentTenantCollectDialog` (a Dialog) opens behind the Sheet. Radix still grabs focus and the mobile numeric keyboard appears, but the dialog is visually trapped under the Sheet → user can't see or click it → looks frozen. A local `z-[70]` was added on `AgentTenantCollectDialog`, which is still below `120`, so it didn't help.

## Fix

Two small, surgical edits in presentation code only:

1. **`src/components/ui/dialog.tsx`** — raise the base z-index so every Dialog in the app always sits above any Sheet:
   - `DialogOverlay`: `z-50` → `z-[140]`
   - `DialogContent`: `z-50` → `z-[150]`

2. **`src/components/agent/AgentTenantCollectDialog.tsx`** — remove the now-redundant local `z-[70]` from the `DialogContent` className so it inherits the new global stacking.

No business logic, RPC, or wallet code changes. No other Dialog usages need updates — they automatically benefit.

## Verification

- Open a tenant from the Agent dashboard → tap **Pay from Your Float** → confirm the payment dialog appears above the tenant sheet, is interactive, and the "Confirm" RPC fires (existing 25 s timeout already in place).
- Spot-check one other Dialog (e.g. any confirm dialog opened from a normal page, not inside a Sheet) to confirm it still looks correct at the new z-index.
