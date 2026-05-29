## Goal

When an agent posts a rent request, the landlord must already exist in the system **with at least one verified house**. If not, the landlord registration form shows a clear "List a house" shortcut that explains the agent earns **UGX 5,000** when Landlord Ops verifies the house — **UGX 1,000 paid instantly** the moment the house is listed, and the remaining **UGX 4,000 paid automatically** when Landlord Ops marks the house verified, straight into the agent's withdrawable wallet.

This splits today's single UGX 5,000 "pay-on-verification" bonus into two stages without changing the total.

## What changes

### 1. Split the listing bonus (money flow)

Today: `credit-listing-bonus` pays the full UGX 5,000 only when Landlord Ops verifies the house.

New behavior:
```text
House listed (agent submits)      -> UGX 1,000 instant  -> agent withdrawable wallet
Landlord Ops marks "verified"     -> UGX 4,000 auto-paid -> agent withdrawable wallet
                                     -------------------------------------------------
Total                                UGX 5,000 (unchanged)
```

- **DB migration**: add `listed_bonus_paid boolean default false` + `listed_bonus_paid_at timestamptz` to `house_listings` (tracks the instant UGX 1,000 leg). Verification stays tracked by the existing `listing_bonus_paid` flag + `listing_bonus_approvals` row.
- **New edge function `credit-house-listed-bonus`** (verify_jwt = false): called right after a listing is created. Posts a balanced double-entry via `create_ledger_transaction` (wallet `agent_commission` cash_in ↔ platform `marketing_expense` cash_out) for **UGX 1,000**, idempotent on `house_listings.id` (guarded by `listed_bonus_paid`). Goes to the withdrawable bucket (`recipient_type = user`).
- **Edit `credit-listing-bonus`**: change `LISTING_BONUS` from `5000` to `4000` (the remaining verification leg). Update its success message/notes to "UGX 4,000".
- **Edit `approve-listing-bonus`** (CFO manual fallback path): same UGX 4,000 amount and messaging so the two verification paths stay consistent.

### 2. "List a house" shortcut on the landlord registration form

- In `LandlordRegistrationForm` (agent mode only), add an info card + button: **"This landlord needs a verified house — List a house"** that opens `ListEmptyHouseDialog`, pre-filling landlord name/phone when already typed.
- Card copy: "You earn **UGX 5,000** when Landlord Ops verifies this house — **UGX 1,000 now**, **UGX 4,000 on verification**, paid straight to your withdrawable wallet."

### 3. Rent-request gating (landlord must have a verified house)

- In `AgentRentRequestDialog`, when resolving the landlord (both the outstanding picker and the inline name/phone path), check `house_listings` for `landlord_id = <landlord> AND verified = true`.
- If none exists, block submission with a friendly message and surface the landlord dialog with the "List a house" shortcut, so the agent lists + gets the house verified first.
- The check runs against the resolved/created landlord id; existing landlords with a verified house pass straight through.

### 4. Messaging updates

- `ListEmptyHouseDialog` success + intro copy updated to reflect the UGX 1,000-now / UGX 4,000-on-verification split (currently it only mentions the separate tenant-placement bounty).

## Technical notes

- Wallet credits go exclusively through `create_ledger_transaction` with `recipient_type = user` so both legs land in the withdrawable bucket — consistent with the existing listing-bonus and `credit_agent_event_bonus` patterns (no direct wallet writes).
- Both bonus legs are idempotent (listing-level flags + `commission_accrual_ledger` / `listing_bonus_approvals` guards) so retries never double-pay.
- `config.toml` gets a `[functions.credit-house-listed-bonus]` entry with `verify_jwt = false`.

## Open question

For the rent-request gate: should an unverified-landlord rent request be a **hard block** (cannot submit until a house is verified), or a **soft warning** (agent can still proceed but is strongly nudged to list a house)? The plan above assumes a **hard block** per "they must be in the system already with at least a house verified" — tell me if you'd prefer the softer version.