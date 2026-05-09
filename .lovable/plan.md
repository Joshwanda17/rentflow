## Landlord (Owner) Workflow Extraction — Plan

Mirror the structure of `Tenant_Workflow_Spec.md` and `Agent_Workflow_Spec.md` already in `/mnt/documents/`. Output a single Markdown artifact:

**File:** `/mnt/documents/Landlord_Workflow_Spec.md`

### Sections to cover

1. **Role & Entry Points**
   - `AppRole = 'landlord'`, default route, role switcher, auto-enrollment via phone match in `landlords.phone`.
   - Landlord agreement gate (`useLandlordAgreement`, `/landlord-agreement`, `LANDLORD_AGREEMENT_VERSION`).

2. **Login → Dashboard Boot Sequence**
   - `LandlordDashboard.tsx` mounts → `useProfile`, `useWallet`, `useLandlordStats(userId)`.
   - Cached-first stats from `localStorage` key `lf_landlord_stats_<userId>` (instant paint).
   - Background fetch of `landlords` table filtered by `registered_by`.

3. **Hero & Top Surface**
   - `UnifiedWalletHeroCard` (role=landlord) — Total + Withdrawable.
   - Optional richer variant `LandlordWalletHeroCard` (Properties / Rent-per-month / Empty count, occupancy %).
   - `VerificationChecklist` (highlightRole='landlord').
   - `CreditAccessCard` — landlord credit access limit.

4. **Primary Action Buttons** (positions, onClick, downstream sheet)
   - **Register Property** → `RegisterPropertyDialog`.
   - **Menu** → `LandlordMenuDrawer` (right-side drawer).
   - **Invite & Earn** card.

5. **Register Property Flow** — full breakdown of `RegisterPropertyDialog`
   - Fields: address, monthly rent, # houses, UEDCL meter, NWSC meter (≥1 required), payout date (1-28), caretaker, GPS capture (`navigator.geolocation`, high accuracy 15s), occupied/empty toggle, tenant name+phone (if occupied), LC1 chairperson trio, terms checkbox.
   - **Fee math:** `platformFee = monthlyRent × 0.10`; landlord receives `monthlyRent − platformFee`; 12-month total displayed.
   - DB writes: `landlords` insert (with `registered_by=user.id`, `desired_rent_from_welile=monthlyRent`, `ready_to_receive=false`), optional `lc1_chairpersons` insert, optional `welile_homes_subscriptions` insert when tenant exists.
   - Manager verification flow via `VerifyLandlordButton` — sets `verified`, `verified_at`, `verified_by`, optional `ready_to_receive`. Triggers bonuses via `credit-landlord-registration-bonus` and `credit-landlord-verification-bonus` edge functions.

6. **Add Tenant Flow** — `LandlordAddTenantDialog`
   - 3-stage form: Tenant identity → Property + rent → LC1 + GPS + terms.
   - Phone lookup of tenant in `profiles` (links account if exists).
   - Inserts new `landlords` row (one row per tenant placement).

7. **Menu Drawer** — every item, route, badge
   - Property Management: Add Tenant, Daily Rent Listings (`AvailableHousesSheet`), My Tenants (`/landlord-welile-homes`), Welile Homes Impact.
   - Finances: My Receipts, My Loans, Payment History (`/transactions`), Financial Statement.
   - Growth: Post Shopping Receipt, My Referrals, Share & Earn.
   - More: Landlord Agreement, Share App, Settings, Help.

8. **My Properties Sheet** — `MyPropertiesSheet`
   - Bottom sheet (85vh). Per-card: address, owner, occupancy badge + Switch (`is_occupied` toggle, optimistic), rooms, units, rent, tenant name, `TenantRating` star widget, Google Maps link.
   - Summary chips: Occupied / Empty counts.

9. **My Tenants Section** — `MyTenantsSection`
   - Tenant cards with avatar, phone, address, rent, agent attribution badge, `StarRatingDisplay`, Review button → `UserReviewsSection` dialog.
   - Lookup uses `landlords.phone == profile.phone` (phone-matched landlord rows).

10. **Welile Homes Section** — `LandlordWelileHomesSection`
    - 5-year savings projection: `MONTHLY_GROWTH_RATE=0.05`, `LANDLORD_FEE_RATE=0.10`. Compounding: `balance = balance × 1.05 + (rent × 0.10)` over 60 months.
    - Enroll tenant via `EnrollTenantWelileHomesDialog`; manage via `ManageTenantSubscriptionDialog`; `WelileHomesLandlordBadge` + leaderboard.

11. **Wallet & Withdrawals**
    - Strict withdrawable rule (`get_user_available_balance`) + 3-bucket model (withdrawable / float / advance — landlords use only withdrawable).
    - `FullScreenWalletSheet` is shared with all roles; payout via standard withdraw flow.

12. **Rent Payout to Landlord** (server-driven, surfaces in landlord wallet)
    - `disburse-rent-to-landlord` edge function: CFO/manager-triggered; treasury guard; reads `rent_requests` (status `coo_approved` | `funded`); pays via wallet credit if `landlords.phone` matches a profile, else cash payout queue. Adds `RENT_FUNDED_BONUS = 5000 UGX` agent bonus.
    - Two-step OTP route: `issue-landlord-payout-otp` → `verify-landlord-payout-otp` → `landlord-payout-disburse` → `submit-landlord-payout-receipt` (agent uploads receipt to close loop).
    - SLA monitor: `landlord-payout-sla-monitor` cron.

13. **Verification & Bonuses**
    - Registration bonus (`credit-landlord-registration-bonus`) on landlord create.
    - Verification bonus (`credit-landlord-verification-bonus`) when manager flips `verified=true`.
    - Trust signals (`capture_trust_signal`) on receipt upload, location capture, ready-to-receive flip.

14. **Database Tables Touched** (read-only summary table)
    - `landlords` (full column list from live schema), `welile_homes_subscriptions`, `lc1_chairpersons`, `rent_requests`, `landlord_payouts`, `agent_landlord_float_allocations`, `profiles`, `wallets`, `general_ledger`.

15. **Calculations Cheat-Sheet** (Flutter port)
    - Platform fee: `rent × 0.10`.
    - Landlord net per month: `rent × 0.90`.
    - 12-month receivable: `(rent × 0.90) × 12`.
    - Welile Homes 5-yr projection: iterate 60× `bal = bal × 1.05 + rent × 0.10`.
    - Agent rent-funded bonus: flat 5,000 UGX.
    - Tenant placement bonus to listing agent: 5,000 UGX.

16. **State / Hooks Reference**
    - `useLandlordStats`, `useLandlordAgreement`, `useLandlordOtp`, `useLandlordFloatAllocations`, `useAgentLandlordFloat`, `useWallet`, `useProfile`, `useAuth`.

17. **Navigation Map (ASCII)**

```text
LandlordDashboard
 ├─ UnifiedWalletHeroCard ──tap──> FullScreenWalletSheet ──> WithdrawFlow / DepositFlow
 ├─ VerificationChecklist
 ├─ CreditAccessCard
 ├─ [Register Property] ──> RegisterPropertyDialog (form + GPS)
 │      └─ insert landlords + welile_homes_subscriptions (if tenant)
 ├─ [Menu] ──> LandlordMenuDrawer
 │      ├─ Add Tenant ──> LandlordAddTenantDialog
 │      ├─ Daily Rent Listings ──> AvailableHousesSheet
 │      ├─ My Tenants / Welile Homes ──> /landlord-welile-homes
 │      ├─ My Receipts / Loans / Transactions / Financial Statement
 │      └─ Referrals / Share / Settings / Agreement
 ├─ MyPropertiesSheet (Switch occupancy, Rate tenant, Map)
 └─ InviteAndEarnCard
```

### Deliverable
Single self-contained Markdown file ready for Flutter/Codex consumption, plus a `<lov-artifact>` tag so it surfaces in the file viewer alongside the Tenant and Agent specs.
