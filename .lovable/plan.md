## Plan: Add Quick Action Buttons to Agent Wallet Hero Card

### What changes

**Single file edit: `src/components/agent/AgentWalletHeroCard.tsx**`

Add a row of 3 quick action buttons between the "Withdrawable" line and the divider. Each button opens the existing flow component:

- **Deposit** (ArrowDownToLine icon, emerald) — Opens `DepositFlow`
- **Withdraw** (ArrowUpFromLine icon, amber) — Opens `WithdrawFlow`
- **Transfer** (ArrowLeftRight icon, blue) — Opens `SendMoneyDialog`

### Layout

```text
┌──────────────────────────────────┐
│  Agent Wallet           ● Active │
│  Total Balance                   │
│  USh 1,250,000                   │
│  Withdrawable: USh 350,000       │
│                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐     │
│  │Deposit│ │Withdraw│ │Transfer│  │  ← NEW ROW
│  └──────┘ └──────┘ └──────┘     │
│  ─────────────────────────────── │
│  Tenants  │  Earned  │ Commission│
│  ...                             │
└──────────────────────────────────┘
```

### Technical details

- Import `DepositFlow`, `WithdrawFlow`, `SendMoneyDialog` (all exist)
- use relative icons instead of words
- Add 3 boolean states: `showDeposit`, `showWithdraw`, `showTransfer`
- Buttons styled as `bg-white/10 backdrop-blur-sm` rounded pills with small icons, matching the card's dark theme
- `WithdrawFlow` receives `availableBalance={commissionBalance}` (only withdrawable portion)
- All 3 dialog/sheet components rendered alongside existing `FullScreenWalletSheet`

### Files

- **Edit**: `src/components/agent/AgentWalletHeroCard.tsx`

No new files, no database changes. All flows already exist and handle their own logic.