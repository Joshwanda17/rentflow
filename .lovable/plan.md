# Funder Activation Modal + Deposit Highlight

After a self-registered Funder is approved by Partner Onboarding, show a celebratory "Account Fully Activated" modal on dashboard load. Clicking the CTA closes the modal and gracefully highlights the Deposit button. Only shows when the Funder has zero wallet balance, with a "Remind me in 1 hour" pause option.

## Behavior

**Show modal when ALL true:**
- `signup_source === 'funder-onboarding'` (self-registered)
- `funder_verified_at` is set (approved by Partner Ops / COO)
- `wallet.balance === 0` AND `wallet.withdrawable_balance === 0` (no money in wallet — never spam funded users)
- No active "snooze until" timestamp in localStorage, OR the snooze has expired
- User has not permanently dismissed it (auto-dismissed once they make a deposit, since balance > 0 will then suppress it)

**Triggers:** every page load / dashboard mount that satisfies the conditions above.

**Snooze:** "Remind me in 1 hour" stores `Date.now() + 3_600_000` in `localStorage` under key `funder_activation_snooze_<userId>`. Modal stays hidden until that timestamp passes.

**Primary CTA — "Deposit now":**
1. Closes the modal.
2. Smooth-scrolls the wallet hero card into view.
3. Adds a temporary highlight (ring + soft pulse, ~2.5s) to the Deposit button inside `FunderQuickActions`.
4. Does NOT auto-open the deposit sheet (user taps the highlighted button themselves — clearer affordance).

## Modal UI

```text
┌─────────────────────────────────┐
│            [ ✓ ]                │   ← circular check icon, primary purple
│                                 │
│   Your account is fully         │
│        activated                │
│                                 │
│  You're all set. Add money to   │
│  your wallet to start backing   │
│  tenants and earning returns.   │
│                                 │
│  [        Deposit now        ]  │   ← primary purple button
│  [    Remind me in 1 hour    ]  │   ← ghost button
└─────────────────────────────────┘
```

- Check icon: filled circle, `bg-primary/10`, `CheckCircle2` from lucide in `text-primary`, ~64px.
- Title: `text-xl font-bold`.
- Body: `text-sm text-muted-foreground`, two short lines.
- Buttons: full-width, stacked.
- No close (X) — user must pick "Deposit now" or "Remind me in 1 hour" so the choice is intentional.

## Files to create

- `src/components/supporter/FunderActivationModal.tsx` — Dialog component. Props: `open`, `onOpenChange`, `onDepositClick`, `onSnooze`.

## Files to edit

- `src/components/dashboards/SupporterDashboard.tsx`
  - Read approval state via existing `useFunderApprovalStatus(user.id)` (already exposes `isSelfRegistered` + `verifiedAt` server-side; we'll also read `signup_source` + `funder_verified_at` from the profile query already in use, or extend the hook to surface those two flags publicly — see Technical notes).
  - Compute `shouldShowActivationModal` from approval flags + `wallet.balance === 0` + snooze check.
  - Render `<FunderActivationModal>` and pass `onDepositClick` that:
    - Sets a `highlightDeposit` state `true` for 2500ms.
    - Smooth-scrolls the wallet hero card into view.
  - Pass `highlightDeposit` down to `FunderQuickActions` via a new optional prop.

- `src/components/supporter/FunderQuickActions.tsx`
  - Add optional `highlightDeposit?: boolean` prop.
  - When true, add `ring-2 ring-primary ring-offset-2 animate-pulse` (or a custom soft pulse class) to the Deposit `<Button>` for the duration the prop stays true.

## Technical notes

- **Approval source**: `useFunderApprovalStatus` already fetches `profiles.signup_source` and `profiles.funder_verified_at`. Extend its return type to expose `isSelfRegistered: boolean` and `verifiedAt: string | null` (currently consumed only internally). No new query needed.
- **Wallet zero check**: use the existing `wallet` from `useWallet()` already in `SupporterDashboard`. Treat both `wallet.balance` and `wallet.withdrawable_balance` (when present) as 0.
- **Snooze key**: `funder_activation_snooze_<userId>` in `localStorage`. Read on mount and whenever the modal would otherwise open.
- **No DB migration**: pure client-side gating. Approval source of truth (`funder_verified_at`) already exists.
- **Highlight cleanup**: `useEffect` with `setTimeout(2500)` clearing `highlightDeposit` back to false; clear on unmount.
- **Scroll target**: add `id="funder-wallet-hero"` to the `UnifiedWalletHeroCard` wrapper so the deposit CTA can `scrollIntoView`.
- **Accessibility**: modal has proper `DialogTitle` + `DialogDescription`; check icon marked `aria-hidden`.
- **Respects existing patterns**: reuses shadcn `Dialog`, `Button`, `lucide-react` icons, project primary color tokens — no new design system surface.
