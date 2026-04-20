

## Problem
In `AgentTenantCollectDialog.tsx`, the **Confirm** button on the "Confirm Payment" step does nothing.

**Root cause:** The confirmation step is rendered as a `fixed inset-0 z-50` overlay **inside** the Radix `<Dialog>`'s `DialogContent`. Radix Dialog uses a focus trap and an outside-pointer-down handler on its content. When the user taps Confirm:
1. The tap lands on the fixed overlay which is technically *outside* the original `DialogContent` bounds in the layout tree but inside the React tree.
2. Radix's pointer-down outside detector + the parent `onOpenChange={handleClose}` race the button click — the dialog closes (or the click is swallowed) before `handleAllocate` runs.
3. Result: button appears dead.

This is the same bug pattern as nesting modals inside Radix dialogs without using a portal/nested Dialog.

## Fix
Convert the inline confirmation overlay into a **proper second `<Dialog>`** (nested, portaled correctly), instead of a hand-rolled `fixed inset-0` div.

### Changes in `src/components/agent/AgentTenantCollectDialog.tsx`

1. Move the `confirming` step out of `DialogContent` — render it as its own `<Dialog open={confirming} onOpenChange={(o) => !loading && setConfirming(o)}>` sibling at the bottom of the component (next to `CommissionCelebration`).
2. Use `<DialogContent className="max-w-sm">` with `DialogHeader` / `DialogTitle` for accessibility (a11y warning fix as a bonus).
3. Keep the existing summary card (Tenant / Amount / Float after / Tenant still owes / Commission) and the Edit + Confirm buttons.
4. `Confirm` button calls `handleAllocate` directly — now reliably, since the nested Dialog's portal sits above the parent and owns its own pointer events.
5. After successful allocation, `handleAllocate` already does `setConfirming(false)` + `setResult(res)` — leave that flow intact; the success view replaces the form in the parent dialog.
6. Prevent the parent Dialog from closing while the confirm sub-dialog is open or `loading` is true: tighten parent `onOpenChange` to `(o) => { if (!loading && !confirming) handleClose(); }`.

### Out of scope
- No backend / RPC changes (`agent_allocate_tenant_payment` stays the same).
- No layout / copy changes to the form step or success step.
- No styling changes beyond what's needed to render the nested Dialog.

## Acceptance
- Tapping **Confirm** in the "Confirm Payment" sheet triggers the allocation, shows the loader, and on success displays the "Payment Allocated!" view + commission celebration.
- Tapping **Edit** returns to the form with the amount preserved.
- Tapping outside or pressing Esc on the confirm sheet returns to the form (does not close the parent dialog).
- The parent dialog cannot be dismissed while a payment is in flight.

