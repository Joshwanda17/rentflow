
# Tenant Workflow & UI Spec — Flutter Port Reference

## Deliverable

A single markdown document (`/mnt/documents/Tenant_Workflow_Spec.md`, plus a PDF copy) that fully documents the current tenant build so a Flutter team can rebuild it 1:1. No code changes to the React app — this is a documentation extract.

The document is organized exactly the way a mobile engineer reads a spec: top-down navigation map → screen-by-screen UI inventory → flow diagrams → backend contracts → formulas. Every screen entry lists the exact widgets, their position, props, onTap targets, and the underlying RPC / edge function it calls.

## Document outline (sections, with what each contains)

### 1. Architecture & Conventions
- Tech stack (React 18 + Vite + Supabase) → Flutter equivalents (Riverpod/Bloc, Supabase-Flutter SDK, GoRouter).
- Currency: **UGX only**, formatted via `formatUGX` / `formatDynamic`.
- Wallet truth model: **ledger-derived** via RPC `get_user_wallet_view` and `get_user_available_balance`. Cached `wallets.balance` is never read by tenant UI. Withdrawable = `withdrawable_balance + float_balance`; advance is liability (never spendable).
- Realtime: single channel `wallet-${userId}` listening to `wallets` UPDATE → triggers ledger refetch.
- Local-first: dashboard hydrates from `localStorage[tenant_dashboard_${userId}]` for instant paint, then refetches.

### 2. Authentication & Onboarding (`/auth`, `/onboarding`)
- Sign in: email+password OR phone+OTP (Africa's Talking SMS), Google, Apple.
- Sign up role chips: tenant / supporter / agent / landlord.
- Forgot password: 3-step (phone → OTP → new password). 3 max attempts.
- Post-login redirect: `/dashboard` → `DashboardRedirect` → `/dashboard/tenant`.
- Tenant Agreement modal (`useTenantAgreement`) blocks rent-related actions until accepted.

### 3. Tenant Dashboard `/dashboard/tenant` (`TenantDashboard.tsx`)
Mobile-first single column, max-w-lg, fixed header + scrollable body. Widget order, position, and onTap target:

| # | Widget | Position | onTap → |
|---|--------|----------|---------|
| 1 | `DashboardHeader` (avatar, role switcher, sign out, menu items) | sticky top | role switch / sign out |
| 2 | Offline banner (animated) | top, conditional | reload |
| 3 | `TenantAgreementNotice` | conditional | open Agreement modal |
| 4 | Profile row (avatar + name + verified badge + `AiIdButton`) | row 1 | avatar→`/settings`, AiId→AI ID sheet |
| 5 | `UnifiedWalletHeroCard` (balance, tap to open wallet) + `FunderQuickActions` (Add money / Withdraw / Send) | hero | open `FullScreenWalletSheet` / DepositFlow / WithdrawFlow / SendMoney |
| 6 | `RentDiscountCarousel` (horizontal scroll of rentals with bread-discount applied) | below hero | scroll cards → claim |
| 7 | Recent receipts mini-list (last 5) | conditional | — |
| 8 | **Menu** button (single CTA opens `TenantMenuDrawer`) | full width | open drawer |
| 9 | `InviteAndEarnCard` (compact) | bottom | share/referral flow |

Modals/sheets mounted at root: `FullScreenWalletSheet`, `ShareBreadDialog`, `WelileReceiptDialog`, `ClaimBreadDialog`, `ClaimRentDiscountDialog`, `AddMonthlyRentDialog`, `TenantMenuDrawer`, `PayLandlordDialog`, `PaymentPartnersDialog`, `TenantAgreementModal`, `AvailableHousesSheet`.

### 4. Tenant Menu Drawer (`TenantMenuDrawer.tsx`)
Right-side slide-in (86% width, spring damping 28). WhatsApp-style search bar + collapsible sections. Long-press (500ms) on any item opens quick-action sheet (Copy link / Share / Details).

Sections (every item documented with icon, label, description, target route or callback):
- **Money**: My Repayment Schedule (toggle inline), Pay Rent to Landlord, Pay Welile (MoMo), My Loans `/my-loans`, Transaction History `/transactions`, Financial Statement `/financial-statement`, My Receipts `/my-receipts`.
- **Home**: Available Houses — Daily Rent (opens `AvailableHousesSheet`), Welile Homes `/welile-homes`, Rent Calculator (inline), Marketplace `/marketplace`.
- **Profile**: My Referrals `/referrals`, Share & Earn `/benefits`, Tenant Agreement `/tenant-agreement`, Settings `/settings`.
- **Support**: Share App `/install`, Help & Support `/settings`.
- **Drawer extras**: TrustBoostBanner, VerificationChecklist, SubscriptionStatusCard, CreditAccessCard, RentHistoryRecordCTA, RentRequestButton (locked if no agreement), FindAHouseCTA, SuggestedHousesCard, NearbyHousesPreview, RentProcessTracker (conditional on active request), RepaymentSection (conditional on disbursed/repaying), TenantBusinessAdvancesPanel.

### 5. Wallet Sheet (`FullScreenWalletSheet.tsx`)
Full-screen sheet with: AnimatedBalance hero, 4 quick actions (Send / Add Money / Request / Withdraw), Bills, NFC card setup, pending counts badges, tabs for Transactions / Statement / Deposit Requests / Withdrawal Requests, WalletDisclaimer footer. Each action mapped to its dialog + edge function.

### 6. Deposit Flow (`DepositFlow.tsx`) — 5 steps
`purpose → channel → form → submitting → success`.
- **Purposes** (enum): operational_float, personal_deposit, partnership_deposit, personal_rent_repayment, other. Tenants default to personal_rent_repayment / personal_deposit.
- **Channels**: MoMo (MTN merchant 090777 / Airtel 4380664), Bank (Equity UG, A/C 1046203375259), Agent Cash, Cash.
- **Limits**: min 500, max 1,000,000,000 UGX. Quick chips: 50K/100K/250K/500K.
- **TID parsing**: regex `MP\d{6,16}` (MTN), `TID\d{4,18}` (Airtel), `FT[A-Z0-9]{6,18}` (bank). Optional SMS paste sheet.
- **Bank slip upload** when channel=bank, optimized via `optimizeImage`.
- **Submission**: inserts into `deposit_requests` (status=pending) — server side reconciles via `DepositReferenceMatcher` + Financial Ops approval.

### 7. Withdraw Flow (`WithdrawFlow.tsx`) — 6 steps
`source → amount → payout → details → security → process`.
- **Source**: available (withdrawable) vs roi (supporter only).
- **Strict gate**: `computeLedgerAvailable(userId)` re-fetched on entering Amount and Verify steps; stale after 30s. Confirm disabled until fresh.
- **Min**: 1,000 UGX. Max = `min(walletBalance, ledgerAvailable)`.
- **Payout modes**: mobile_money (auto-detect MTN 077/078/076/039 vs Airtel 070/074/075), bank_transfer (Uganda banks list), cash (agent pickup).
- **Security**: PIN/OTP, biometric optional.
- **Anti-duplicate**: `isSubmittingRef` lock + stable `clientRequestIdRef` (DB unique index on `user_id, client_request_id`). Friendly handling of `DUPLICATE_PENDING_WITHDRAWAL`.
- **Saved methods**: `useSavedPayoutMethods` to recall MoMo/bank destinations.
- **Submission**: edge fn `withdrawal-request` → status=pending → Financial Ops approves → `approve-withdrawal` edge fn → live `WithdrawalStatusTracker` subscription on `withdrawal_requests.id`.

### 8. Pay Rent Flow (`PayRentFlow.tsx`) — 4 steps
`type → amount → confirm → process`.
- Full payment skips amount step. Partial accepts 25/50/75/100% chips.
- Method: wallet only (free, instant). Edge fn `tenant-pay-rent` body `{amount}`.
- Receipt shows amount_paid, remaining_balance, new_wallet_balance, reference.

### 9. Rent Request Flow (`RentRequestForm.tsx`)
Single long form, four sections:
1. **Rent details**: amount, access fee rate (23/28/33% per month), payback period (7-120 days, slider + chips), number of payments (1-6, capped at min(duration,30)).
2. **Tenant details**: National ID (10-14 alphanumeric, real-time uniqueness check on `profiles.national_id`), full name, water/electricity meter.
3. **Landlord details**: name, phone, NID, TIN, property address, meters.
4. **LC1 chairperson**: name, phone, village.
5. **GPS** (`useSmartLocation`) + up to 3 house photos (optimized to ≤1200px WebP).

**Formula** (constitution-locked):
```
accessFee = round(rent × ((1+monthlyRate)^(days/30) − 1))
requestFee = rent ≤ 200,000 ? 10,000 : 20,000
totalRepayment = rent + accessFee + requestFee
dailyRepayment = ceil(totalRepayment / days)
```
Reproduced server-side by `compute_rent_repayment(rent,days)` + trigger `trg_enforce_rent_request_formula` (client values overwritten).

**Submission**: insert landlord → insert lc1 → insert `rent_requests` (status=`pending_acceptance`, `agent_id` from `localStorage.referral_agent_id`) → upload photos → `generateRepaymentSchedule` + `insertRepaymentSchedule`.

**Stages** (`status` lifecycle): `pending_acceptance` → `approved` → `funded` → `disbursed` → `repaying` → `completed` (rejected/cancelled terminal). UI tracker = `RentProcessTracker` (agent_verified, manager_approved, supporter_funded, fund_routed_at).

### 10. Repayment Section (`RepaymentSection.tsx`)
Hero progress bar, calendar grid (paid/today/upcoming/missed), `PaymentPartnersCard` for paying via MoMo, share/download PDF (`downloadRepaymentPdf` + WhatsApp), drawer with full history.

### 11. House Listings (`AvailableHousesSheet.tsx`)
Bottom sheet 95vh. Sticky search + Region select (Central/Eastern/Northern/Western + 14 cities) + Category select (single_room, double_room, bedsitter, 1-3 bedroom, studio, shop). Geolocation via PostGIS RPC `find_nearby_houses(lat,lng,radius_km,category,region,limit)` — falls back to non-spatial query if no GPS.

**HouseCard**: image carousel (lightbox + dot indicators), distance pill, category badge, verification badge, daily rate hero (3xl green), specs chips (rooms, water, power, security, parking, furnished), description, embedded Google Maps iframe (tap → open native Maps), `WhatsAppAgentButton` (deep link wa.me with prefilled message), `ShareHouseButton` (short link via `useShortLink`).

**Daily rate formula**: `(monthly_rent + accessFee[33%/30d] + platformFee[10K/20K]) / 30`.

### 12. Backend / RPC Map (table)
Every edge function and RPC the tenant flow touches, with body schema and returned shape:
- `tenant-pay-rent`, `wallet-transfer`, `withdrawal-request`, `approve-withdrawal`, `submit-tenant-form`, `approve-rent-request`.
- RPCs: `get_user_wallet_view`, `get_user_available_balance`, `compute_rent_repayment`, `find_nearby_houses`, `create_ledger_transaction`.
- DB tables surfaced: `profiles`, `wallets`, `rent_requests`, `repayment_schedule`, `landlords`, `lc1_chairpersons`, `house_listings`, `deposit_requests`, `withdrawal_requests`, `wallet_transactions`, `general_ledger`.

### 13. Design Tokens & Components (for Flutter theming)
- Colors via HSL CSS vars; full list of semantic tokens (`--primary`, `--success`, `--warning`, `--background`, etc.) → Flutter ThemeData mapping table.
- Typography sizes, radius (rounded-2xl/3xl), spacing, motion (framer-motion → Flutter implicit animations + Hero).
- Haptics: tap / impact / success / selection (use `flutter_haptic_feedback`).

### 14. Flutter Mapping Cheat Sheet
- React Sheet → `showModalBottomSheet` / `DraggableScrollableSheet`
- StepperModal → `Stepper` or custom PageView
- shadcn Card → `Card` + `Container`
- framer-motion → `AnimatedSwitcher`, `Hero`, `TweenAnimationBuilder`
- Supabase JS → `supabase_flutter` (same RPC names, identical request bodies)
- localStorage → `shared_preferences`
- PostGIS RPCs → unchanged (called the same way)

### 15. Appendix — Mermaid diagrams
- Tenant journey (login → dashboard → request rent → repay → withdraw)
- Rent request status state machine
- Wallet truth-source flow (UI ↔ get_user_wallet_view ↔ general_ledger)

## Steps to produce

1. Compile sections 1-15 into `/mnt/documents/Tenant_Workflow_Spec.md` from the already-explored source files (TenantDashboard, TenantMenuDrawer, FullScreenWalletSheet, DepositFlow, WithdrawFlow, PayRentFlow, RentRequestForm, AvailableHousesSheet, useWallet, rentCalculations, useHouseListings, Auth).
2. Generate the 3 Mermaid diagrams as embedded fenced blocks.
3. Convert to PDF via pandoc → `/mnt/documents/Tenant_Workflow_Spec.pdf`.
4. Emit both as `<lov-artifact>` tags so you can download them.

Estimated length: ~25-35 pages PDF.
