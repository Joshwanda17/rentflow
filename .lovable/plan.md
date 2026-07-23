# Withdrawal Eligibility Policy — Restricted Bonus Funds (v2)

## Core rule

A **referrer's bonus becomes withdrawable only after their invitee is proven productive**. The maximum "waiting" period is **3 days** from the credit date — but the money stays locked beyond 3 days if the invitee has not met at least one productivity condition.

## Category classification


| Category                                                                                       | Source                     | Withdrawal Policy                |
| ---------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------- |
| `agent_commission_earned`, `partner_commission`                                                | Rent-collection commission | **Immediately withdrawable**     |
| `roi_wallet_credit`, `roi_expense`                                                             | Supporter ROI              | **Immediately withdrawable**     |
| `deposit`, `wallet_topup`, `tenant_refund`, `listing_rejection_offset`                         | User's own money / offsets | **Immediately withdrawable**     |
| `referral_bonus`                                                                               | Signup referral            | **Restricted** — see rules below |
| `agent_bonus`, `agent_listing_bonus`, `agent_listing_campaign_bonus`, `tenant_placement_bonus` | House listing rewards      | **Restricted**                   |
| `landlord_verification_bonus`, `landlord_referral_bonus`                                       | Landlord registration      | **Restricted**                   |
| `lc1_verification_bonus`, `lc1_referral_bonus`                                                 | LC1 registration           | **Restricted**                   |
| `recruiter_override`                                                                           | Sub-agent recruiting       | **Restricted**                   |


## Restriction rules

For every restricted credit, we store:

- `withdrawable_after` = `created_at + 3 days` (hard cap on the waiting window)
- `maturity_condition` — the condition the invitee/subject must satisfy
- `maturity_met` — flips to `true` when the condition is proven

**A restricted credit becomes withdrawable ONLY when `maturity_met = true`.** The 3-day timer is the *maximum* the user is asked to wait; if the invitee never performs, the money stays locked (returned to platform via CFO reversal after a longer window — proposed 30 days, configurable).

### Condition per source


| Restricted credit                                         | `maturity_condition` — invitee must…                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `referral_bonus` (invitee is a **tenant**)                | Post at least one rent request that reaches `submitted` or later                                                              |
| `referral_bonus` (invitee is an **agent**)                | List a house that gets verified, OR register a landlord that gets verified, OR register an LC1 chairperson that gets verified |
| `agent_listing_bonus` / campaign / placement              | Underlying `house_listings` row is `verified=true` AND has a `tenant_id`                                                      |
| `landlord_verification_bonus` / `landlord_referral_bonus` | Underlying `landlords` row is `verified=true`                                                                                 |
| `lc1_verification_bonus` / `lc1_referral_bonus`           | Underlying `lc1_chairpersons` row is `verified=true`                                                                          |
| `recruiter_override`                                      | Sub-agent has at least one verified listing OR verified landlord OR verified LC1                                              |


## Technical implementation

1. **Migration**
  - Add columns to `general_ledger`: `withdrawable_after TIMESTAMPTZ`, `maturity_condition TEXT`, `maturity_met BOOLEAN DEFAULT true`, `maturity_subject_id UUID` (points at the invitee / listing / landlord / lc1 record so we can flip the flag later).
  - `BEFORE INSERT` trigger `trg_apply_bonus_restriction`: on wallet-scope cash_in in the restricted category list, stamp `withdrawable_after = now() + 3 days`, set `maturity_met=false`, set `maturity_condition` + `maturity_subject_id` from the entry `metadata`.
  - `AFTER UPDATE` triggers on `house_listings` (verified/tenant_id), `landlords` (verified), `lc1_chairpersons` (verified), `rent_requests` (status → submitted), `profiles` (referred user first productive act): each flips matching ledger rows' `maturity_met = true`.
  - Rewrite `v_user_wallet_strict.withdrawable` = ledger cash_in **minus** rows where `maturity_met = false` OR `withdrawable_after > now()`, minus cash_out, minus pending holds. Since `get_user_available_balance` and `get_user_wallet_view` already delegate to this view, wallet card / withdraw dialog / `approve-withdrawal` all update automatically.
  - Add `pending_restricted NUMERIC` and `restricted_breakdown JSONB` to `get_user_wallet_view` output.
  - New RPC `get_user_wallet_holds(p_user_id)` → list of held rows (amount, category, condition, subject reference, release-eligible date).
2. **Backfill**
  - Existing `referral_bonus` and `agent_bonus` rows (~47.6k):
    - If credit is > 3 days old **and** the invitee has performed any productive act → auto-mark `maturity_met=true`.
    - If credit is > 30 days old and still no productive act → mark `maturity_met=false` **and** `expired=true` (no auto-release ever; CFO reversal path).
    - Otherwise → mark `maturity_met=false`, waiting for the condition trigger.
3. **UI**
  - Wallet card ("Held" chip): shows total restricted + tap-through list from `get_user_wallet_holds`. Each row displays: amount, why it's held ("Waiting for your invitee John D. to post a rent request"), release-eligible date.
  - `WithdrawRequestDialog`: inline warning when the user tries to withdraw more than the unrestricted amount, explaining the specific holds.
  - `WalletLedgerStatement`: lock icon on restricted rows, tooltip with condition + status.
4. **No changes** to commission, ROI, deposit, or merchant/agent-ops flows.

## Rollout

Single migration → view rewrite → backfill. Frontend chip + dialog copy ship in the same change. CFO/FinOps dashboards unchanged (they still see the full cache + ledger).

## Open decision (please confirm before I build)

- **Expiry window:** if the invitee never performs, do restricted bonuses expire (reverse to platform) at **30 days**, or should we hold them indefinitely until CFO manual review? Default in the plan is 30 days, configurable in `system_config`.
- THE BONUSES EXPIRE IN 3 DAYS. 
- &nbsp;