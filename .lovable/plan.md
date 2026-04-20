

## Problem
Withdrawal approvals already write to `audit_logs`, but the **CFO Actions Trail** filters for outdated action types (`withdrawal_approval`, `cfo_approve_withdrawal`) that aren't being written anymore. The actual production action types are missing from the allowlist, so approved withdrawals never appear — making it look like "money owed" never reduces.

## Production action types found (all missing from trail)

| action_type | Count | Latest | Meaning |
|---|---|---|---|
| `withdrawal_approved_ledger` | 18 | today 06:57 | **Final CFO approval that debits the wallet** (the one we care most about) |
| `withdrawal_rejected` | 18 | today 06:40 | Withdrawal denied |
| `proxy_partner_withdrawal` | 43 | Apr 17 | Partner withdrawal processed |
| `fin_ops_complete_withdrawal` | 37 | Apr 10 | FinOps marked withdrawal as paid out |
| `fin_ops_approve_withdrawal` | 7 | Apr 2 | FinOps stage approval |
| `bulk_approve_wallet_withdrawals` | 1 | Mar 24 | Bulk approval action |

Metadata shape on these is rich: `amount`, `target_user_name`, `payment_method`, `reference`, `previous_balance`, `new_balance` — perfect for the trail card.

## Fix (single file)

**File:** `src/components/cfo/CFOActionsLog.tsx`

1. **`ALL_CFO_ACTIONS`** — add the 6 missing action types; remove the dead `withdrawal_approval` and `cfo_approve_withdrawal` (or keep for backward compat — keep them, harmless).
2. **`ACTION_ICONS`** — add 💸 for the new debit actions, 🚫 for rejected.
3. **`ACTION_LABELS`** — friendly names:
   - `withdrawal_approved_ledger` → "Withdrawal Paid Out"
   - `withdrawal_rejected` → "Withdrawal Rejected"
   - `proxy_partner_withdrawal` → "Partner Withdrawal"
   - `fin_ops_complete_withdrawal` → "Withdrawal Completed"
   - `fin_ops_approve_withdrawal` → "Withdrawal Approved (Ops)"
   - `bulk_approve_wallet_withdrawals` → "Bulk Withdrawal Approval"
4. **`DEBIT_ACTIONS` set** — add `withdrawal_approved_ledger`, `proxy_partner_withdrawal`, `fin_ops_complete_withdrawal`, `bulk_approve_wallet_withdrawals` so they render with red `−` sign (showing money leaving the platform = obligation reduced).
5. **`FILTER_GROUPS` "Withdrawals" entry** — replace stale list with the real action types.

## Out of scope
- No DB schema changes
- No edge function changes — they're already logging correctly
- Withdrawal approval flow itself stays untouched

## Expected outcome
Each approved withdrawal (e.g., today's 8 approvals totalling ~UGX 12.7M) will appear in the CFO Actions Trail as a red debit card showing the user, amount, payment method, and approver — making the "money owed" reduction visible in real time.

