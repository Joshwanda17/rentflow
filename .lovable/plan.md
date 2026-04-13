

## Plan: Update WELILE_WORKFLOW.md with Latest Logic and Features

### Summary
Update the workflow document to reflect three recent changes: (1) causal ROI date advancement policy, (2) compound feature with preview dialog, and (3) inactivity lock glassmorphism styling.

### Changes to `public/WELILE_WORKFLOW.md`

**1. Section 11 — COO Dashboard (around line 609)**

Add to "Key COO Features" list:
- Portfolio Compound with Preview Dialog — COO/Partner Ops can compound ROI directly from portfolio view (replaces WhatsApp button). Shows confirmation dialog with current principal, ROI amount, and new principal before executing. Updates principal only; does NOT advance `next_roi_date`.
- OVERDUE Badge — Portfolios with `next_roi_date` in the past display a red "OVERDUE" badge in the Nearing Payouts section. Dates no longer auto-roll forward.

**2. Section 25 — Supporter Investment Model (around line 1100)**

Add a new subsection "Causal Date Advancement Policy" after Payout Rules:
- `next_roi_date` does NOT auto-roll on missed payments
- `next_roi_date` does NOT advance when COO initiates a payout
- `next_roi_date` advances +1 month ONLY when CFO approves via `approve-wallet-operation`
- Compounding updates principal but preserves payout date
- Missed payments show as OVERDUE until sequentially processed

**3. Section 36 — Approval & Governance Flows (around line 1549)**

Update "Monthly ROI Payout" flow to include the causal date advancement step and add a new "Compounding" flow:

```
COO initiates payout → Queued as pending_wallet_operation → CFO approves → Ledger entries → Wallet sync → next_roi_date +1 month → Notification
```

New Compounding flow:
```
COO/Partner Ops clicks Compound → Preview dialog → Confirm → Principal updated (no date change) → Ledger entries (roi_expense + roi_reinvestment) → Audit log
```

**4. Section 7 — Supporter Dashboard (around line 402, Design subsection)**

Add: Inactivity lock screen uses glassmorphism overlay (`backdrop-blur-2xl`, `backdrop-saturate-150`, 70% opacity)

**5. Section 32 — Edge Functions, approve-wallet-operation entry (around line 1309)**

Update description: "Approve pending credits; advances `next_roi_date` +1 month for ROI payout approvals"

**6. Footer (line 2037)**

Update version to 3.4 and date to April 13, 2026.

### No database or backend changes needed
This is a documentation-only update.

