## Root cause

When an Agent opens **Deposit to wallet** from the dashboard, `DepositFlow` is opened with:

- `defaultPurpose="operational_float"`
- `lockPurpose={true}`
- `allowedPurposes=['operational_float','personal_deposit']`

This means `mustChoosePurpose` is **false**, so the dedicated "purpose" step is skipped and the user lands directly on the form. On the form, the Deposit Purpose section behaves like this today:

```text
if (lockPurpose && depositPurpose) → show locked chip ("Operational Float")
if (showPurposeGrid || !lockPurpose) → show the 2-up picker grid
otherwise                            → render NOTHING
```

If `depositPurpose` is briefly empty (state-update race between `handleClose` resetting it to `''`, the prefill effect, and the agent-default effect), **neither the chip nor the grid is rendered**. The submit handler then refuses the empty value and toasts *"Deposit purpose was missing — please pick a purpose and try again"* — but the form has no purpose field to pick from. That is exactly the screenshot the user sent.

So the toast is correct, but the form is genuinely incomplete in that moment. Fix: the purpose section must always render *something selectable* whenever the value is empty, so the user can never be told to "pick a purpose" without being shown the choices.

## Plan

Single file: `src/components/payments/DepositFlow.tsx`

### 1. Always render the picker when no purpose is selected

In the Deposit Purpose section (around lines 1565–1634), change the visibility rule from:

```text
showPurposeGrid || !lockPurpose
```

to:

```text
showPurposeGrid || !lockPurpose || !depositPurpose
```

So if `depositPurpose` is empty for any reason — even with `lockPurpose` on — the 2-up grid of allowed purposes appears and the user can tap one. As soon as they pick, the locked chip takes over again as today.

### 2. Add a visible "Empty state" hint inside the purpose section

When `!depositPurpose`, show a small inline notice above the grid:

```text
"Pick what this money is for to continue."
```

styled with `text-destructive` when `errorFieldId === 'deposit-purpose'`, plain muted otherwise. This makes the error toast self-explanatory: the user looks down and immediately sees the choices they need to make.

### 3. Defensive re-prefill on submit attempt

In `handleAttempt` (the wrapper that runs `validateForm` before `handleSubmit`), if the only blocking reason is an empty `depositPurpose` AND `defaultPurpose` is set AND `lockPurpose` is true, silently set `depositPurpose = defaultPurpose` and re-run validation once. This recovers the common race (state was reset by `handleClose` then the dialog was reopened) without bothering the user. If it's still empty after the recovery attempt (e.g. no `defaultPurpose` was ever passed), fall through to the existing scroll-to-field + focus + error-ring behaviour.

### 4. Keep the existing `handleSubmit` enum allowlist guard untouched

The belt-and-braces guard at lines 754–763 stays — it still catches any path that bypasses the form (e.g. programmatic submits). Only the user-facing visibility is being fixed here; the data-integrity guard is correct.

### 5. Verify

- Open Agent dashboard → tap **Deposit to wallet** → tap **Cash with agent** → land on form → confirm the "Operational Float" chip appears as today.
- Manually break the state (clear depositPurpose via React DevTools) → confirm the picker now appears with the 2 allowed options instead of nothing.
- Tap Confirm with the value re-set → deposit submits cleanly; no "pick a purpose" toast.

## Out of scope

- No DB migration, no edge-function change, no enum change.
- No redesign of the supporter or partner deposit flows — they already have `mustChoosePurpose=true` and hit the dedicated purpose step, so they were never affected by this bug.
- No change to the agent personal-deposit confirmation gate (lines 1635–1678) — that flow already works.
