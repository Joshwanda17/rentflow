## Root cause

On the funder mobile DepositFlow, after the user taps **Confirm & fill** in the "Confirm extracted details" inner sheet, the parent **Deposit to wallet** dialog closes — so the **Deposit USh …** button never gets pressed.

The inner sheet (`smsPasteOpen`) uses `modal={false}`, which means it lives in a portal at body level and is treated as *outside* the parent dialog by Radix. The parent currently guards against this with:

```tsx
onPointerDownOutside={(e) => { if (smsPasteOpen) e.preventDefault(); }}
onInteractOutside={(e) => { if (smsPasteOpen) e.preventDefault(); }}
onEscapeKeyDown={(e) => { if (smsPasteOpen) e.preventDefault(); }}
```

The Confirm & fill handler runs `setSmsPasteOpen(false)` synchronously. Pointer-down is preventDefaulted (state still true at that instant), but the **focus-restoration** that Radix performs as the inner dialog unmounts fires `onFocusOutside` / a follow-up `onInteractOutside` *after* `smsPasteOpen` has already flipped to `false`. The guard short-circuits, Radix concludes the user clicked outside the parent, and the whole DepositFlow closes.

This only manifests on touch devices because desktop pointer-up + click happen on the same React tick before commit; on mobile the focus restore is async enough to lose the race. The screenshot the user sent confirms the inner sheet is the "4/4 fields detected" confirmation step right before the dialog vanishes.

## Fix (UI-only, in `src/components/payments/DepositFlow.tsx`)

Make the parent DepositFlow dialog **immune to outside-interaction dismissal at all times**. The dialog already provides explicit Close / Cancel / X buttons (which call `handleClose`), so accidental dismissal via outside-click / focus-restore / Esc is never desired in this fintech flow.

Change the three guards on the outer `<DialogContent>` from conditional to unconditional:

```tsx
onPointerDownOutside={(e) => e.preventDefault()}
onInteractOutside={(e) => e.preventDefault()}
onEscapeKeyDown={(e) => e.preventDefault()}
```

Also harden the inner SMS sheet so its Confirm & fill handler defers the close to the next tick, eliminating any residual focus-race against the parent:

```tsx
onClick={() => {
  const ok = applyPastedSms(smsPasteText);
  if (ok) {
    setSmsPasteText('');
    setSmsConfirmStep(false);
    // Defer so Radix's focus restore happens after this React commit,
    // preventing the parent dialog from interpreting it as outside-click.
    setTimeout(() => setSmsPasteOpen(false), 0);
  }
}}
```

No business logic, no state-shape, no edge-function, no DB changes — just two small UI hardenings inside `DepositFlow.tsx`.

## Verification

- On a phone (390×844 viewport): open DepositFlow → MoMo → Paste SMS → Review → **Confirm & fill**. The inner sheet must close, the parent stays open with the amount/TID/date/time pre-filled, and the user can tap **Deposit USh …** as the next action.
- The X, Cancel, and Back buttons inside the parent still close it normally (they call `handleClose` directly, not via outside-interaction).
