## Why the Deposit button feels broken

The Deposit button on the agent wallet hero card (`AgentDashboard.tsx`, line 369) does fire — it sets `showQuickDeposit=true` and opens `DepositFlow`. The problem is what happens next.

It opens `DepositFlow` with these props:

```
allowedPurposes={['operational_float', 'personal_deposit']}
lockPurpose
requirePurposeChoice
```

Inside `DepositFlow.tsx`:
- `requirePurposeChoice = true` forces `step = 'purpose'` (line 134–137, 375–384).
- That screen (line 1023–1062) shows a **dense warning card** ("Operational Float vs Personal Deposit, different wallet buckets, you cannot change this after submission") followed by two tile choices.
- For an ordinary agent on a small phone, this looks like an error / consent screen, not a deposit screen. They tap nothing because they don't know which one to pick, and the dialog appears "frozen" — there is no amount field, no MoMo logo, no "Deposit" CTA visible. To them, the button "did nothing useful".

There is also a secondary bug: the same dashboard already has a different deposit entry point (`handleDeposit` → `setDepositOpen(true)` → `AgentDepositDialog`) wired into the side-menu, so two deposit paths exist with different UX. Users who tap one and nothing obvious happens often don't try the other.

## What we'll change

### 1. Make the Deposit button respond instantly with a familiar screen

In `AgentDashboard.tsx`, change the Deposit hero button to drop straight into the deposit form pre-set to **Operational Float** (which is what 99% of agent deposits actually are — collected rent cash). Remove `requirePurposeChoice` from this entry point.

```tsx
<DepositFlow
  open={showQuickDeposit}
  onOpenChange={setShowQuickDeposit}
  allowedPurposes={['operational_float', 'personal_deposit']}
  defaultPurpose="operational_float"
  lockPurpose
/>
```

Effect: tapping Deposit immediately shows the channel picker (Cash / MTN MoMo / Airtel Money / Bank) — the screen the agent expects. The "this is company float, not your money" notice is still shown inline (line 1613–1620), and the existing in-form "Change purpose" link (line 1503–1510) still lets careful users switch to Personal Deposit through the existing confirmation gate (line 1569–1612). So we keep all the safety, we just stop blocking the first tap.

### 2. Redesign the purpose gate for the cases that still need it

`requirePurposeChoice` is still used elsewhere (e.g. when an agent opens deposit from a context where intent is genuinely ambiguous). For those cases, rewrite the gate (`DepositFlow.tsx` lines 1023–1062) to be smartphone-first and plain-language:

- Replace the warning banner with a friendly title: **"What is this money for?"** and one short helper line.
- Two big, full-width 96 px cards with large emoji + plain-Luganda-friendly copy:
  - 💼 **Money I collected from tenants** — "Goes to your work float for paying landlords."
  - 👤 **My own money (salary / personal)** — "Goes to your personal balance."
- Remove the "you cannot change this after submission" sentence from the gate (it scares first-time users; it's still enforced in the audit metadata).
- Add a back arrow at the top so it never feels like a dead end.

### 3. Make the running deposit screen easier for non-readers

Small, focused tweaks inside `DepositFlow.tsx` to help users who don't read details:

- **Big amount field at the top** with UGX prefix and a 24 px font (already a field, just enlarge and move above channel summary).
- **Quick-amount chips** (10k / 20k / 50k / 100k / 200k) under the amount input — one tap to fill.
- **Channel pills with phone-network logos** instead of icon + text (MTN yellow, Airtel red) — recognisable to users who can't read English fluently.
- **Sticky bottom bar** with a single full-width primary button labelled **"Deposit UGX 50,000"** (button text shows the live amount). On small viewports the form scrolls under it, so the action is always reachable without hunting.
- **Loading state** that says *"Sending… please wait"* with a spinner instead of the generic "Submitting…", so a slow tap doesn't feel like nothing happened.
- **Failure toast** that, in addition to the error, shows a one-tap "Try again" button — many agents currently dismiss the error and assume the deposit went through.

### 4. Unify the two entry points

Remove the duplicate `handleDeposit` → `AgentDepositDialog` side-menu entry, and route the menu's "Deposit" item to the same `setShowQuickDeposit(true)` used by the hero button. One deposit flow, one mental model. (The `AgentDepositCashDialog` field-cash-collection flow is a different action and stays.)

## Files to edit

- `src/components/dashboards/AgentDashboard.tsx` — hero `<DepositFlow>` props; menu deposit handler; remove unused `AgentDepositDialog` import + state.
- `src/components/payments/DepositFlow.tsx` — purpose-gate rewrite; bigger amount input + quick-amount chips; sticky bottom CTA with live amount; spinner copy; failure toast retry.

No backend, RPC, or ledger changes — this is purely a front-end UX and routing fix. All existing safety gates (Operational Float vs Personal confirmation, audit metadata, TID validation) are preserved.

## Out of scope

- Translating copy to Luganda/Swahili (worth doing later, but a separate task).
- Changing how `operational_float` deposits post to the ledger.
- Redesigning Withdraw / Transfer (same patterns can be applied in a follow-up).
