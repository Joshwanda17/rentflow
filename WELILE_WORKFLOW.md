# Welile Platform — Exhaustive UI & Backend Workflow

**Version:** 5.0  
**Date:** 2026-04-07  
**Status:** Living Document — Complete Feature Registry  
**App Name:** Welile.com (PWA, all platforms)

---

# Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Role System & Navigation](#2-role-system--navigation)
3. [Tenant Workflows](#3-tenant-workflows)
4. [Agent Workflows](#4-agent-workflows)
5. [Supporter (Funder) Workflows](#5-supporter-funder-workflows)
6. [Landlord Workflows](#6-landlord-workflows)
7. [Manager / Staff Workflows](#7-manager--staff-workflows)
8. [COO Dashboard Workflows](#8-coo-dashboard-workflows)
9. [CFO Dashboard Workflows](#9-cfo-dashboard-workflows)
10. [CEO Dashboard Workflows](#10-ceo-dashboard-workflows)
11. [CTO Dashboard Workflows](#11-cto-dashboard-workflows)
12. [CMO Dashboard Workflows](#12-cmo-dashboard-workflows)
13. [CRM Dashboard Workflows](#13-crm-dashboard-workflows)
14. [Tenant Operations Dashboard](#14-tenant-operations-dashboard)
15. [Partner Operations Dashboard](#15-partner-operations-dashboard)
16. [Agent Operations Dashboard](#16-agent-operations-dashboard)
17. [Landlord Operations Dashboard](#17-landlord-operations-dashboard)
18. [Financial Operations Command Center](#18-financial-operations-command-center)
19. [Rent Request Pipeline (End-to-End)](#19-rent-request-pipeline-end-to-end)
20. [Wallet System](#20-wallet-system)
21. [Ledger & Accounting Engine](#21-ledger--accounting-engine)
22. [Property & Housing](#22-property--housing)
23. [Marketplace & E-Commerce](#23-marketplace--e-commerce)
24. [Chat & Messaging](#24-chat--messaging)
25. [AI Assistant](#25-ai-assistant)
26. [Receipts & QR Scanning](#26-receipts--qr-scanning)
27. [Loans & Credit System](#27-loans--credit-system)
28. [Referral & Gamification](#28-referral--gamification)
29. [Notifications & Realtime](#29-notifications--realtime)
30. [Settings & Profile](#30-settings--profile)
31. [Vendor Portal](#31-vendor-portal)
32. [PWA & Offline](#32-pwa--offline)
33. [Angel Pool Investment System](#33-angel-pool-investment-system)
34. [Edge Functions (Backend Logic)](#34-edge-functions-backend-logic)
35. [Security & RLS](#35-security--rls)
36. [Database Schema Overview](#36-database-schema-overview)
37. [Known Issues & Technical Debt](#37-known-issues--technical-debt)
38. [HR Dashboard Workflows](#38-hr-dashboard-workflows)
39. [Appendices](#appendices)

---

# 1. Authentication & Onboarding

## 1.1 Supported Auth Channels

| Channel | Flow |
|---------|------|
| **Phone + Password** | User enters phone → resolved to email → signs in with password |
| **Email + Password** | Standard email/password sign-in |
| **SMS OTP** | Phone → Edge Function `sms-otp` sends code → verify → session |
| **WhatsApp Deeplink** | Edge Function `whatsapp-login-link` generates magic link → user clicks → auto-login |
| **Google OAuth** | Redirects to Google → callback → session created |
| **Apple OAuth** | Redirects to Apple → callback → session created |

## 1.2 Onboarding Flow

```
Landing Page (/welcome)
    ↓
Auth Page (/auth) — Sign Up or Sign In
    ↓ (first time)
Select Role (/select-role)
    ↓
Role assigned → Dashboard (/dashboard)
```

## 1.3 UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Auth.tsx` | `src/pages/Auth.tsx` | Main auth page with tabs for login/signup |
| `SelectRole.tsx` | `src/pages/SelectRole.tsx` | Post-signup role selection grid |
| `Join.tsx` | `src/pages/Join.tsx` | Referral-driven signup (`?ref=` param) |
| `UpdatePassword.tsx` | `src/pages/UpdatePassword.tsx` | Password update page |
| `Landing.tsx` | `src/pages/Landing.tsx` | Public landing page |
| `Install.tsx` | `src/pages/Install.tsx` | PWA install instructions |
| Auth components | `src/components/auth/` | Login forms, OTP input, Google/Apple OAuth buttons, WhatsApp login |

### UI Design: Auth Page
- **Layout**: Centered card with tabs (Sign In / Sign Up)
- **Mobile**: Full-width form, large touch targets (min 44px)
- **Branding**: Welile.com logo at top, primary purple accent
- **OTP Input**: 6-digit input with auto-focus progression
- **OAuth Buttons**: Google and Apple sign-in with platform icons
- **WhatsApp Login**: Green-branded button with WhatsApp icon

## 1.4 Backend Logic

- **`auth-email-hook`**: Custom email templates for verification
- **`otp-login`**: Validates OTP codes
- **`sms-otp`**: Sends SMS OTP via integrated provider
- **`whatsapp-login-link`**: Generates authenticated WhatsApp deep links
- **`admin-reset-password`**: Staff-initiated password resets
- **`password-reset-sms`**: SMS-based password recovery
- **`provision-staff-passwords`**: Bulk staff password provisioning
- **`bulk-password-reset`**: Mass password reset across multiple users
- **`diagnose-auth`**: Auth diagnostics and troubleshooting utility
- **Identity Resolution**: Phone numbers are normalized (+256 prefix handling), matched against profiles table
- **Session Persistence**: "Remember Me" stores session; adaptive "Welcome Back" banner shows last login method
- **Referral Tracking**: `?ref=` and `?role=` URL params passed through auth flow to track acquisition
- **Account Separation**: Accounts from different providers are distinct and not automatically merged
- **Preview Domain Handling**: `preparePreviewOAuthFlow` clears service workers/caches on preview domains

## 1.5 Password Reset

```
User requests password reset
    ↓
resetPasswordForEmail() with redirect to /update-password
    ↓
Always redirects to custom domain (welilereceipts.com) to avoid auth-bridge token invalidation
    ↓
/update-password page allows setting new password
```

---

# 2. Role System & Navigation

## 2.1 Supported Roles (15 total)

| Group | Roles |
|-------|-------|
| **Consumer** | `tenant`, `landlord` |
| **Financial** | `supporter` |
| **Field** | `agent` |
| **Staff** | `manager`, `employee`, `operations`, `hr` |
| **Executive** | `ceo`, `coo`, `cfo`, `cto`, `cmo`, `crm` |
| **God Mode** | `super_admin` |

## 2.2 Role Storage

- Stored in `user_roles` table (separate from profiles, prevents privilege escalation)
- Role checks use `has_role()` SECURITY DEFINER function (bypasses RLS recursion)
- Internal/executive roles require authorization codes

## 2.3 Navigation Logic

```
User logs in
    ↓
useAuth() → fetches roles from user_roles
    ↓
Dashboard auto-routing:
  - Supporter with ≥ UGX 100K deployed → /dashboard (supporter view)
  - Agent → /dashboard (agent view)
  - Tenant → /dashboard (tenant view)
  - Staff/Executive → /admin/dashboard (with hidden Staff nav icon)
  - User can set "Home Screen" preference to override
```

### UI Design: Navigation
- **MobileBottomNav**: Fixed bottom bar with 5 icons (Home, Wallet, Chat, Menu, Staff)
- **BottomRoleSwitcher**: Horizontal pill strip for switching roles
- **RoleSwitcher**: Dropdown selector for role switching
- **AppBreadcrumb**: Trail navigation for nested views
- **PageTransition**: Framer-motion slide/fade between routes

## 2.4 Role Switching

- `BottomRoleSwitcher` / `RoleSwitcher` components
- Users can switch between assigned roles without re-auth
- `RoleGuard` component protects executive routes

## 2.5 Role Access Requests

- Standard users get: supporter, agent, tenant, landlord by default
- Additional roles require manager-approved "Role Access Request" (`ApplyForRoleDialog`)
- Qualified investors (≥ UGX 100K deployed capital) can toggle "Open All Dashboards" in Settings
- Users can set a "Home Screen" (Default Dashboard) preference to override defaults

## 2.6 Staff Role Provisioning

- Internal staff/executive roles assigned manually by super_admin/manager/cto
- Dual-access strategy: auto-redirect to /admin/dashboard with hidden 'Staff' nav icon
- `BulkAssignRoleDialog` for batch role assignment
- `BulkRemoveRoleDialog` for batch role removal
- `InlineRoleToggle` / `QuickRoleEditor` / `MobileRoleEditor` for individual role management

---

# 3. Tenant Workflows

## 3.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Tenant home — balance, rent status, daily charges |
| `/find-a-house` | Browse daily-rent listings with map |
| `/house/:id` | Property detail page |
| `/payment-schedule` | View rent payment calendar |
| `/pay-landlord` | Direct landlord payment flow |
| `/rent-money` | Rent Money services hub (deposits, transfers, withdrawals) |
| `/my-loans` | View credit/loan status |
| `/rent-discount-history` | Discount history |
| `/benefits` | Loyalty benefits |
| `/my-receipts` | Receipt history |
| `/calculator` | Rent calculator |
| `/try-calculator` | Public rent calculator |
| `/referrals` | Referral tracking |
| `/categories` | Browse categories |

## 3.2 Dashboard Components

### UI Design: Tenant Dashboard
- **Layout**: Single-column mobile-first, scrollable sections
- **Hero Section**: Wallet balance card with deposit/withdraw/transfer actions
- **Rent Status**: Color-coded status tracker (Pending → Funded → Repaying → Complete)
- **Daily Charge**: Prominent daily amount due with countdown
- **Quick Actions**: Grid of action buttons (Pay Rent, Find House, Calculator, etc.)

| Component | Purpose |
|-----------|---------|
| `TenantDashboard.tsx` | Main tenant view |
| `TenantMenuDrawer.tsx` | Hamburger navigation drawer |
| `RentRequestButton.tsx` | Quick rent request action |
| `RentRequestForm.tsx` | Full rent request submission |
| `RepaymentSection.tsx` | Current repayment status with payment history |
| `RepaymentHistoryDrawer.tsx` | Past repayments |
| `RepaymentScheduleView.tsx` | Future schedule |
| `PaymentStreakCalendar.tsx` | Gamified payment streak calendar |
| `RentDiscountWidget.tsx` / `RentDiscountToggle.tsx` | Discount features |
| `RentAccessLimitCard.tsx` | Credit limit display |
| `LoanProgressWidget.tsx` | Loan progress bar |
| `SubscriptionStatusCard.tsx` | Welile Homes subscription status |
| `AchievementBadges.tsx` / `ShareableAchievementCard.tsx` | Gamification badges |
| `InviteFriendsCard.tsx` | Referral prompt with share link |
| `FindAHouseCTA.tsx` | Property discovery call-to-action |
| `NearbyHousesPreview.tsx` / `SuggestedHousesCard.tsx` | Property suggestions |
| `AvailableHousesSheet.tsx` | Bottom sheet: browse available houses |
| `MyLandlordsSection.tsx` | Tenant's landlord info |
| `RegisterLandlordDialog.tsx` | Register own landlord dialog |
| `IncomeTypeSelector.tsx` | Income categorization selector |
| `RentCalculator.tsx` / `WeeklyMonthlyCalculator.tsx` | Rate calculators |
| `ShareHouseButton.tsx` | Share property listing via Web Share API |
| `QuickContributeDialog.tsx` | Quick rent contribution dialog |
| `WelileHomesButton.tsx` | Welile Homes entry button |
| `WhatsAppAgentButton.tsx` | Direct WhatsApp to assigned agent |
| `RentCalculatorShareButton.tsx` | Share calculator results |

## 3.3 Rent Request Flow (Tenant Perspective)

```
Tenant → Submits Rent Request (amount, landlord details, property)
    ↓
Request enters 6-stage pipeline (see Section 19)
    ↓
If approved & funded:
  - Daily auto-deductions begin from tenant wallet
  - Tenant sees RentProcessTracker: Verification → Approval → Funding → Delivery → Repayment
    ↓
Daily charge via `auto-charge-wallets` Edge Function
    ↓
Repayment tracked in rent_requests.amount_repaid
```

## 3.4 Auto-Deduction Mechanism

```
auto-charge-wallets runs daily at 06:00 UTC (pg_cron)
    ↓
Hierarchical fallback:
  1. Deduct from tenant's wallet
  2. After 72-hour grace period → deduct from linked agent's wallet
  3. For non-smartphone tenants → agent charged directly
    ↓
High-frequency retry: every 3 hours for 24 hours before final debt recording
    ↓
Manual collection also available via Tenant Ops (see Section 14)
```

## 3.5 Automatic Repayment on Deposit

```
Tenant receives a wallet deposit (any channel)
    ↓
approve-wallet-operation checks for active rent request (funded/disbursed/approved)
    ↓
Auto-calculates outstanding balance
    ↓
Invokes record_rent_request_repayment RPC
    ↓
Triggers rent_repayment ledger entry to debit wallet
    ↓
Auto-deductions only on NEW deposit events (not retroactive)
```

## 3.6 Daily Rent Marketplace

```
Agent posts listing → Appears on /find-a-house immediately
    ↓
Listing shows "Pending Verification" or "Verified" badge
    ↓
Daily rate = (monthly_rent + 33% access_fee + platform_fee) / 30, rounded up
    ↓
Tenant can express interest → Agent contacted
    ↓
PostGIS spatial indexing for proximity-based discovery
    ↓
Interactive map with Leaflet + MarkerCluster for discovery at scale
```

## 3.7 Tenant Agreements

- `src/components/tenant/agreement/` — Digital tenant agreement flow
- Terms acceptance and signature capture

## 3.8 Backend Logic

- **`register-tenant`**: Creates tenant profile, links to agent
- **`auto-charge-wallets`**: Daily cron deducts rent installments
- **`process-credit-daily-charges`**: Credit line daily charges
- **`process-credit-draw`**: Credit drawdown processing
- **`check-repayment-status`**: Validates repayment progress
- **`rent-reminders`**: Automated SMS/push reminders
- **`payment-reminder`**: Payment due notifications
- **`retry-no-smartphone-charges`**: Retry failed charges for non-smartphone users
- **`tenant-pay-rent`**: Tenant direct rent payment from wallet (validates balance → ledger cash_out → `record_rent_request_repayment` RPC → `credit_agent_rent_commission` RPC → fire-and-forget `notify-managers`)

---

# 4. Agent Workflows

## 4.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Agent home — float, earnings, tasks, wallet button |
| `/earnings` | Earnings breakdown with filters |
| `/analytics` | Performance analytics |
| `/agent-registrations` | Tenant/property registrations |
| `/sub-agents` | Sub-agent network analytics |
| `/agent-advances` | Cash advance management |
| `/agent-advances/:id` | Advance detail |
| `/agent/cash-payouts` | Cash payout requests |
| `/agent-commission-benefits` | Commission model explainer page |
| `/referrals` | Referral stats |
| `/my-receipts` | Agent receipts |
| `/deposit-history` | Deposit history |
| `/transaction-history` | Transaction history |
| `/agent-agreement` | Agent digital agreement |

## 4.2 Dashboard Components

### UI Design: Agent Dashboard
- **Layout**: Mobile-first, single-column with collapsible sections
- **Hero**: Large floating purple wallet button (FAB) — opens full-screen wallet sheet
- **Quick Stats**: 3-column grid (Float Balance, Today's Collections, Earnings)
- **Sections**: Collapsible cards for each function (Rent Requests, Link Signups, Sub-Agents, etc.)
- **FAB**: `FloatingActionButton.tsx` — Quick actions (Register Tenant, Collect Rent, etc.)
- **Toolbar**: `FloatingToolbar.tsx` — Contextual toolbar with role-specific actions

| Component | Purpose |
|-----------|---------|
| `AgentDashboard.tsx` | Main agent view (in `src/components/dashboards/`) |
| `AgentMenuDrawer.tsx` | Hamburger navigation with icon-color `#7214c9` |
| `AgentDailyOpsCard.tsx` | Daily operations summary card |
| `TodayCollectionsCard.tsx` | Today's collection stats |
| `CollectionStreakCard.tsx` | Gamified collection streak |
| `AgentGoalCard.tsx` / `AgentGoalProgress.tsx` | Monthly goal progress |
| `AgentActionInsights.tsx` | AI-driven action recommendations |
| `EarningsForecastCard.tsx` | Projected earnings |
| `EarningsRankSystemSheet.tsx` | Ranking system explainer |
| `DailyRentExpectedCard.tsx` | Expected daily rent collections |
| `AgentLeaderboard.tsx` | Agent performance rankings |
| `PriorityCollectionQueue.tsx` | Priority tenant collection queue |
| `AgentVerificationOpportunitiesCard.tsx` | Verification tasks available |
| `VerificationOpportunitiesButton.tsx` | Quick access to verification queue |
| `ShareablePerformanceCard.tsx` / `ShareableMilestoneCard.tsx` | Shareable achievement cards |

### Registration Components
| Component | Purpose |
|-----------|---------|
| `RegisterTenantDialog.tsx` | Register new tenant |
| `RegisterLandlordDialog.tsx` | Register new landlord |
| `RegisterSubAgentDialog.tsx` | Register sub-agent |
| `UnifiedRegistrationDialog.tsx` | Combined registration dialog |
| `ListEmptyHouseDialog.tsx` | Post property listing |
| `HouseImageUploader.tsx` | Property photo upload |

### Collection & Payment Components
| Component | Purpose |
|-----------|---------|
| `RecordAgentCollectionDialog.tsx` | Record tenant rent collection |
| `RecordTenantPaymentDialog.tsx` | Record tenant payment |
| `AgentVisitDialog.tsx` | GPS check-in at tenant location |
| `AgentVisitPaymentWizard.tsx` | Visit + payment combined flow |
| `GeneratePaymentTokenDialog.tsx` | Generate payment token for offline |
| `AgentReceiptDialog.tsx` | Issue receipt |
| `AgentDepositDialog.tsx` / `AgentDepositCashDialog.tsx` | Agent deposit flows |
| `AgentWithdrawalDialog.tsx` | Agent withdrawal request |
| `RequestCommissionPayoutDialog.tsx` | Commission payout request |
| `MyCommissionPayouts.tsx` | Commission payout history |

### Landlord Payout Components
| Component | Purpose |
|-----------|---------|
| `AgentLandlordFloatCard.tsx` | Landlord float balance card |
| `AgentLandlordPayoutDialog.tsx` | Initiate landlord payout |
| `AgentLandlordPayoutFlow.tsx` | Full payout flow with GPS |
| `AgentFloatPayoutWizard.tsx` | Float payout step wizard |
| `FloatPayoutStatusTracker.tsx` | Track payout approval status |
| `FloatTransactionHistory.tsx` | Float transaction log |
| `AgentOpsFloatPayoutReview.tsx` | Agent Ops review interface |
| `AgentLandlordMapSheet.tsx` | Map showing landlord locations |
| `LandlordRecoveryLedger.tsx` | Landlord recovery tracking |
| `AgentDeliveryConfirmation.tsx` | Delivery proof submission |

### Sub-Agent & Team Components
| Component | Purpose |
|-----------|---------|
| `SubAgentsList.tsx` | Sub-agent directory |
| `MySubAgentsSheet.tsx` | Sub-agent management sheet |
| `SubAgentInvitesList.tsx` | Pending sub-agent invites |
| `RecruitSubAgentCTA.tsx` | Recruitment call-to-action |
| `QuickShareSubAgentSheet.tsx` | Share recruitment link |
| `ShareSubAgentLink.tsx` | Sub-agent invite link |
| `ShareReferralLink.tsx` | General referral link |
| `SetTeamGoalDialog.tsx` | Set team goals |
| `TeamGoalProgress.tsx` | Team goal tracking |

### Tenant & Property Management
| Component | Purpose |
|-----------|---------|
| `AgentTenantsSheet.tsx` | Agent's tenant directory |
| `NearbyTenantsSheet.tsx` | GPS-proximity tenant finder |
| `AgentTenantRentRequestsList.tsx` | Tenant rent requests list |
| `AgentMyRentRequestsSheet.tsx` | Agent's own rent requests |
| `AgentRentRequestDialog.tsx` | Submit rent request for tenant |
| `AgentRentRequestsManager.tsx` | Manage rent requests |
| `AgentRentPaymentGuide.tsx` | Payment guidance for agents |
| `AgentTopUpTenantDialog.tsx` | Top up tenant wallet |
| `AgentListingsSheet.tsx` | Property listings |
| `AgentManagedPropertiesSheet.tsx` | Managed properties |
| `AgentManagedPropertyDialog.tsx` | Property detail management |
| `RentalFinderSheet.tsx` | Find rentals for tenants |
| `CreditVerificationButton.tsx` | Credit verification action |

### Partner/Funder Management (Agent Perspective)
| Component | Purpose |
|-----------|---------|
| `AgentInvestForPartnerDialog.tsx` | Proxy investment for supporter |
| `AgentPartnerDashboardSheet.tsx` | Partner portfolio overview |
| `FunderManagementSheet.tsx` | Manage funder accounts |
| `FunderPortfolioCard.tsx` | Funder summary card (invested, returns, wallet) |
| `ProxyInvestmentHistorySheet.tsx` | Proxy investment history |
| `AgentInvitesList.tsx` | Invites sent by agent |

### Miscellaneous Agent Components
| Component | Purpose |
|-----------|---------|
| `CollapsibleAgentSection.tsx` | Reusable collapsible section |
| `CollapsibleLinkSignups.tsx` | Link signup tracking |
| `CollapsibleRentRequests.tsx` | Rent requests section |
| `CollapsibleSubAgents.tsx` | Sub-agents section |
| `CollapsibleUserInvites.tsx` | User invites section |
| `MobileMoneySettings.tsx` | MoMo payout settings |
| `NoSmartphoneScheduleManager.tsx` | Schedule for non-smartphone tenants |
| `PendingDepositsSection.tsx` | Pending deposit requests |
| `LoanManagement.tsx` / `LoanPaymentCalculator.tsx` | Agent loan tools |
| `AgentRegistrationAnalytics.tsx` | Registration performance |
| `RecruitTenantWelileHomes.tsx` | Recruit for Welile Homes |
| `ServiceCentreSubmissionForm.tsx` | Service Centre photo/GPS submission |

## 4.3 Registration Workflow

```
Agent registers on platform
    ↓
Agent receives float allocation (agent_float_limits)
    ↓
Agent goes to field:
  1. Register tenants (collect details, property info)
  2. Register landlords (phone, location, LC1 details)
  3. Post property listings (GPS, photos, rent amount)
    ↓
Auto-verification trigger: First posted rent request → agent verified
```

## 4.4 Collection Workflow

```
Agent visits tenant
    ↓
Check-in with GPS (agent_visits table)
    ↓
Collect rent payment:
  - Cash: Record amount, issue receipt
  - Mobile Money: Record TID, provider, payer details
    ↓
agent_collections record created
    ↓
Float updated (float_before → float_after)
    ↓
5% commission earned (agent_earnings)
    ↓
Streak tracking (agent_collection_streaks)
  - Consecutive days → streak multiplier (up to 1.20x)
```

## 4.5 Landlord Payout Workflow

```
Rent request reaches "funded" status (CFO approved)
    ↓
Funds appear in agent's Landlord Float wallet (bridge scope)
    ↓
Agent pays landlord externally (MoMo, cash, bank)
    ↓
Agent submits proof:
  - Transaction ID
  - Receipt photos
  - Mandatory GPS (within 500m of property)
    ↓
agent_float_withdrawals record created
    ↓
Manager reviews → Approve or Reject
    ↓
If rejected: Amount restored to agent float via reversal entry
    ↓
If approved: Agent receives UGX 5,000 personal wallet bonus
```

## 4.6 Commission Payout Workflow

```
Agent accumulates earnings
    ↓
Agent requests commission payout (agent_commission_payouts)
    ↓
Specifies: amount, MoMo number, provider
    ↓
Financial Ops reviews → Approve/Reject
    ↓
If approved: Funds disbursed
```

## 4.7 Proxy Investment (Invest for Partner)

```
Agent initiates "Invest for Partner" on behalf of supporter
    ↓
Agent's wallet debited immediately
    ↓
Portfolio created with status = 'pending_approval'
    ↓
Partner credit + Agent 2% commission queued in pending_wallet_operations
    ↓
Manager/Executive approves:
  - cash_in credits partner wallet
  - cash_out (wallet_to_investment) moves to portfolio
  - Net-zero: Partner wallet stays at 0, money in portfolio
    ↓
If rejected: Portfolio cancelled, agent refunded
    ↓
Notifications: 'Investment Activated' to supporter, 'Partner Investment Approved' to agent
```

## 4.8 Agent-Facilitated Angel Pool Investment

**Edge Function:** `agent-angel-pool-invest`  
**UI Component:** `AgentAngelPoolInvestDialog.tsx`  
**Branding:** Purple `#7718D1` (hover: `#6514B5`), responsive dialog `w-[95vw]`

```
Agent collects funds from investor (Cash, MoMo, Bank)
    ↓
Agent deposits into investor's wallet
    ↓
Agent opens Angel Pool Invest dialog:
  - Search existing investor by phone
  - OR register new investor inline (register-proxy-funder, phone duplicate check)
    ↓
Selects share count (UGX 20,000/share)
    ↓
agent-angel-pool-invest Edge Function:
  1. Validates investor wallet balance
  2. Checks remaining pool capacity (max 25,000 total shares)
  3. Records shares in angel_pool_investments (with agent_id, payment_method, investment_reference)
  4. Creates cash_out ledger entry for investor
  5. Credits agent 1% commission (platform-funded):
     - Platform debit: cash_out / marketing_expense / platform scope
     - Agent credit: cash_in / angel_pool_commission / wallet scope
     - Shared transaction_group_id for auditability
    ↓
Ownership calculation:
  - Pool % = (shares / 25,000) * 100
  - Company % = (shares / 25,000) * 8
```

**Flow Pattern:** Collect → Wallet → Pool (wallet acts as mandatory control layer)

## 4.9 Proxy Partner Payout Management

**UI Component:** `ProxyPartnerFunds.tsx` (in wallet Proxy Partners tab)

```
Proxy agent assigned to partner (proxy_agent_assignments, status: 'approved', is_active: true)
    ↓
Agent sees "Proxy Partners" tab in wallet
    ↓
Only partners with ROI balance > 0 shown as actionable
    ↓
Partner Ops approves ROI payout:
  - ROI-Only Policy: ONLY accrued returns credited, principal stays in portfolio
  - ROI = (investment_amount * roi_percentage / 100 / 12) * months_elapsed
  - Prioritizes total_roi_earned field from portfolios
  - Idempotency: credit_proxy_approval RPC with MD5-based deterministic UUID
    ↓
ROI credited to agent's wallet (for physical delivery to partner)
    ↓
Agent initiates "Withdraw" for delivery:
  - Available balance = Total Accrued Returns - Completed Withdrawals
  - Ledger category: proxy_partner_withdrawal
    ↓
Active delivery tasks labeled "Ready for delivery"
```

## 4.10 Financial Agent Requisition Flow

**UI Components:** `AgentRequisitionForm.tsx` + `FinancialAgentSection.tsx` (bottom-sheet on agent dashboard)  
**CFO Component:** `CFOAgentRequisitions.tsx` (approval queue)

```
Agent submits requisition (expense category, amount, justification)
    ↓
Requisition enters CFO approval queue
    ↓
CFO reviews and approves/rejects
    ↓
If approved: Funds credited to agent wallet
```

## 4.8 Float Management

- `AgentFloatManager.tsx` — Float overview & operations
- Float limits with low/critical threshold percentages
- Daily transaction limits
- Float pause/resume capability
- Float rebalancing records (`agent_rebalance_records`)
- Float funding history (`agent_float_funding`)
- Cash-on-hand tracking

## 4.9 Agent Advances (Cash Advances)

```
Manager issues advance to agent
    ↓
agent_advances record: principal, daily_rate, cycle_days
    ↓
Daily deductions via process-agent-advance-deductions
    ↓
agent_advance_ledger tracks: opening_balance, interest, deductions, closing_balance
    ↓
Agent can receive topups (agent_advance_topups)
    ↓
Advance expires or is fully repaid → status changes
```

## 4.10 Sub-Agent Network

```
Agent recruits sub-agents (agent_subagents table)
    ↓
Parent agent earns:
  - UGX 10,000 per sub-agent signup (flat event bonus via credit_agent_event_bonus RPC)
  - 2% recruiter override on sub-agent managed tenant repayments
    (deducted from manager's 8% share → manager keeps 6%, recruiter gets 2%)
    ↓
Sub-agent analytics: /sub-agents page
    ↓
Platform records both:
  - cash_out / marketing_expense / platform scope (platform debit)
  - cash_in / agent_commission / wallet scope (agent credit)
  Both linked via shared transaction_group_id
```

## 4.11 Agent Tasks & Escalations

- `agent_tasks`: Assigned tasks (verify_tenant, visit_property, etc.)
  - Priority levels, due dates, GPS requirements
  - Completion tracking with GPS coordinates and notes
- `agent_escalations`: Agent-reported issues
  - Severity levels, resolution tracking
  - Manager assignment and resolution notes

## 4.12 Agent Goals

- Monthly targets for registrations and activations (`agent_goals`)
- Trackable via analytics page
- `SetTeamGoalDialog` for team-level goals
- `TeamGoalProgress` for team tracking

## 4.13 Agent Earnings Model

### 10% Rent Repayment Commission (via `credit_agent_rent_commission` RPC)

Every rent repayment triggers a 10% commission split across up to 3 agent roles:

| Role | Share | Condition |
|------|-------|-----------|
| Source Agent | 2% | Agent who originally registered the tenant |
| Tenant Manager | 8% | Agent currently managing the tenant (if no recruiter) |
| Tenant Manager | 6% | Agent currently managing the tenant (if recruiter exists) |
| Recruiter Override | 2% | Agent who recruited the Tenant Manager (from manager's share) |

**Example:** Tenant repays UGX 100,000 → Total commission = UGX 10,000
- Source Agent: UGX 2,000
- Tenant Manager: UGX 8,000 (or UGX 6,000 if recruiter exists)
- Recruiter: UGX 2,000 (only if recruiter exists, taken from manager's share)

### Fixed Event Bonuses (via `credit_agent_event_bonus` RPC)

| Activity | Reward |
|----------|--------|
| Verified house listing | UGX 5,000 |
| Landlord location verification | UGX 5,000 |
| Rent application facilitation | UGX 5,000 |
| Sub-agent registration | UGX 10,000 |
| Tenant replacement | UGX 20,000 |
| Service Centre setup (verified & CFO-approved) | UGX 25,000 |

### Double-Entry Marketing Expense Pattern

All agent earnings (commissions and bonuses) are platform **marketing expenses**. Every agent wallet credit is paired with a platform debit:

```
Platform Side (Debit):
  direction: cash_out
  category: marketing_expense
  ledger_scope: platform
  description: "Marketing expense: Agent commission on repayment" (or bonus description)

Agent Side (Credit):
  direction: cash_in
  category: agent_commission
  ledger_scope: wallet
  description: "Commission on repayment: Source agent 2%" (or specific role/bonus)

Both entries share the same transaction_group_id for auditability.
```

### Other Commissions

| Action | Reward |
|--------|--------|
| Proxy investment facilitation | 2% commission |
| Angel Pool investment facilitation | 1% commission (platform-funded, `angel_pool_commission` category) |
| Landlord management fee (non-smartphone landlords) | 2% |

## 4.14 Performance Tiering

| Tier | Criteria |
|------|----------|
| **Gold** | Weighted score ≥ top tier (Earnings 30%, Collections 25%, Referrals 25%, Visits 20%) |
| **Silver** | Weighted score ≥ mid tier |
| **Bronze** | Below mid tier |

## 4.15 Agent Lifecycle Pipeline

```
New → Active → Top Earner
         ↓
    Idle (7d+) → Dormant (30d+)
```

## 4.16 Wallet Statement Filters

- **Direction Filters**: 💰 Money In / 📤 Money Out
- **Category Chips**: Filter by transaction type with counts
- **Plain English Explanations**: Human-readable description for every transaction
- **Date Grouping**: Transactions grouped by day

## 4.17 Agent Products (Marketplace)

- Agents can list products for sale via `AgentProductsSection`
- Product management with add/edit/delete

## 4.18 Agent Commission Benefits Page

**Route:** `/agent-commission-benefits` (accessible from agent hamburger menu, icon color `#7214c9`)

**UI Component:** `AgentCommissionBenefits.tsx`

**Purpose:** Plain-language ("ordinary man") page explaining the full commission model with concrete money examples so agents understand exactly how they earn.

**Content Sections:**
1. **How You Earn** — Explains 10% repayment commission with UGX 100,000 example
2. **Commission Split Table** — Source 2%, Manager 8%, Recruiter Override 2%
3. **Event Bonuses Table** — UGX 5,000–20,000 per activity
4. **Career Path** — Team Leader (2+ sub-agents → cash advances), 50 tenants → Electric Bike

**WhatsApp Sharing:**
- Uses `navigator.share` Web Share API (mobile)
- Falls back to `https://wa.me/?text=...` URL (desktop)
- Shares structured text summary of commission model with Welile branding

**Branding Assets:**
- High-resolution "Welile Service Centre" logo and poster available for download
- Agents can print these for field setup and recruitment

**Printing Instructions (on-page guide):**
- Step-by-step plain-language guide for agents
- Colour codes: Primary Purple `#7214c9`, White `#FFFFFF`, Black `#000000`
- Paper sizes: A3/A2 for poster, A4 for logo
- Mounting advice: visible wall, window, signboard

## 4.19 Service Centre Setup Workflow

**Service Centre Setup Submission:**
- Agent takes a photo of mounted poster/logo
- GPS location captured via `navigator.geolocation.getCurrentPosition`
- Location name text description
- Agent name and phone auto-filled from profile
- Submits to `service_centre_setups` table with status `pending`

**Service Centre Verification & Payout Pipeline:**
```
Agent submits (pending) → Agent Ops Manager verifies GPS + photo (verified)
    → CFO approves & pays UGX 25,000 (paid)
```
- **Agent Ops Dashboard** (`ServiceCentreVerificationQueue`): Shows pending submissions with photo, GPS map link, agent details. Verify or Reject (with mandatory 10+ char reason).
- **CFO Dashboard** (`ServiceCentrePayoutApproval`): Shows verified submissions. "Approve & Pay UGX 25,000" button calls `credit_agent_event_bonus` RPC with `p_event_type = 'service_centre_setup'`.
- **Ledger flow:** Platform debit (`cash_out`/`marketing_expense`/`platform`) + Agent credit (`cash_in`/`agent_commission`/`wallet`) via shared `transaction_group_id`.
- **My Submissions:** Agent sees own submissions with status badges (Pending → Verified → Approved → Paid).

**Database table: `service_centre_setups`**
- Fields: `agent_id`, `photo_url`, `latitude`, `longitude`, `location_name`, `agent_name`, `agent_phone`, `status` (pending/verified/approved/paid/rejected), `verified_by`, `verified_at`, `approved_by`, `approved_at`, `rejection_reason`
- Storage bucket: `service-centre-photos` (public)
- RLS: Agents INSERT/SELECT own; Staff (manager, operations, cfo, cto, super_admin) SELECT/UPDATE all

## 4.20 Backend Edge Functions

- **`agent-deposit`**: Process agent deposits
- **`agent-withdrawal`**: Process agent withdrawals
- **`agent-invest-for-partner`**: Proxy investment flow
- **`credit-listing-bonus`**: Award listing bonus (triggers `credit_agent_event_bonus` RPC)
- **`credit-landlord-registration-bonus`**: Landlord reg bonus (triggers `credit_agent_event_bonus` RPC)
- **`credit-landlord-verification-bonus`**: Verification bonus (triggers `credit_agent_event_bonus` RPC)
- **`approve-listing-bonus`**: Manager approves listing bonus
- **`send-collection-sms`**: SMS confirmation after collection
- **`process-agent-advance-deductions`**: Daily advance repayments
- **`manual-collect-rent`**: Manual rent collection recording
- **`tenant-pay-rent`**: Direct tenant wallet-to-rent payment
- **`wallet-deduction`**: Financial Ops wallet deduction tool
- **`notify-managers`**: Fire-and-forget manager notification

---

# 5. Supporter (Funder) Workflows

## 5.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Supporter home — portfolio, returns |
| `/investment-portfolio` | Detailed portfolio view |
| `/supporter-earnings` | Earnings/rewards history |
| `/become-supporter` | Onboarding flow |
| `/activate-supporter` | Activation process |
| `/opportunities` | Investment opportunities |
| `/my-watchlist` | Watched opportunities |
| `/investor/portfolio/:token` | Public portfolio share link |
| `/calculator` | Investment calculator |
| `/referrals` | Referral stats |
| `/financial-statement` | Financial statements |
| `/angel-pool` | Angel Pool investment page |
| `/angel-pool-agreement` | Angel Pool legal agreement |

## 5.2 Dashboard Components

### UI Design: Supporter Dashboard
- **Layout**: Premium glassmorphism aesthetic, dark gradient hero card
- **Hero**: MTN-style balance card (`HeroBalanceCard.tsx`) with animated balance counter
- **Quick Stats Row**: 4 pill-shaped stats (Total Invested, Returns, Wallet, Active Accounts)
- **Quick Actions**: Grid of branded action buttons (Deposit, Transfer, Invest, Withdraw)
- **Virtual Houses Feed**: Scrollable house cards showing rent performance
- **Notification Bell**: Top-right bell icon with unread count badge

| Component | Purpose |
|-----------|---------|
| `SupporterDashboard.tsx` | Main supporter view |
| `HeroBalanceCard.tsx` | Large balance display (MTN-style, glassmorphism) |
| `PortfolioSummaryCards.tsx` | Portfolio overview cards |
| `QuickStatsRow.tsx` | Key metrics strip |
| `ModernQuickActions.tsx` | Action shortcuts grid |
| `ModernQuickLinks.tsx` | Navigation links row |
| `VirtualHousesFeed.tsx` / `VirtualHouseCard.tsx` | Virtual house browsing |
| `VirtualHouseDetailsSheet.tsx` | Virtual house detail bottom sheet |
| `HouseOpportunities.tsx` / `RentOpportunities.tsx` | Available investments |
| `TenantsNeedingRent.tsx` | Funding needs (anonymized) |
| `FundingPoolCard.tsx` | Pool balance & health indicator |
| `FundingMilestones.tsx` | Milestone tracking |
| `InvestmentCalculator.tsx` / `CalculatorShareCard.tsx` | ROI projection tool |
| `InvestmentGoals.tsx` / `SetGoalDialog.tsx` | Goal setting dialog |
| `ROIEarningsCard.tsx` | ROI summary card |
| `InterestPaymentHistory.tsx` | Reward history table |
| `CreditRequestsFeed.tsx` | Rent credit requests feed |
| `SupporterLeaderboard.tsx` / `SupporterROILeaderboard.tsx` | Competitive rankings |
| `SupporterReferralStats.tsx` | Referral performance |
| `SupporterNotificationsFeed.tsx` | Notifications feed |
| `NotificationBell.tsx` / `NotificationsModal.tsx` | Bell icon + notification modal |
| `SupporterMenuDrawer.tsx` | Navigation drawer |
| `FunderPortfolioCard.tsx` | Agent-facing funder summary |
| `ModernInviteCard.tsx` | Invite flow card |
| `ShareSupporterLink.tsx` / `ShareCalculatorLink.tsx` | Sharing utilities |
| `FloatingPortfolioButton.tsx` | Quick portfolio access FAB |
| `MerchantCodePills.tsx` | Deposit merchant codes |
| `SimpleAccountsList.tsx` / `SimpleInvestmentCard.tsx` | Account views |
| `SimpleTenantsList.tsx` | Anonymized tenant list |
| `WalletDetailsSheet.tsx` | Wallet breakdown sheet |
| `MyInvestmentRequests.tsx` | Pending requests |
| `InvestmentAccountCard.tsx` | Individual account card |
| `InvestmentBreakdownSheet.tsx` | Investment breakdown detail |
| `InvestmentPackageSheet.tsx` | Package selection sheet |
| `InvestmentWithdrawButton.tsx` | Capital exit button |
| `CreateAccountDialog.tsx` / `AccountDetailsDialog.tsx` | Account creation/detail |
| `FundAccountDialog.tsx` | Fund account dialog |
| `FundRentDialog.tsx` | Fund specific rent request |
| `WithdrawAccountDialog.tsx` | Withdraw from account |
| `RequestManagerInvestDialog.tsx` | Request manager to invest |
| `PayoutMethodDialog.tsx` | Select payout method |
| `UserProfileDialog.tsx` | Supporter profile view |
| `TenantRequestDetailsDialog.tsx` | Anonymized tenant request detail |
| `FundedHistory.tsx` | Funding history |
| `FunderCapitalOpportunities.tsx` | Capital deployment opportunities |
| `OpportunityHeroButton.tsx` | Opportunity CTA |
| `OpportunitySummaryCard.tsx` | Opportunity summary |
| `ModernOpportunityTabs.tsx` | Tabbed opportunity browser |
| `RentCategoryFeed.tsx` | Categorized rent feed |
| `ModernSectionHeader.tsx` | Section header with actions |

## 5.3 Capital Deployment Flow

```
Supporter deposits funds to wallet
    ↓
Transfers wallet → Rent Management Pool (instant, no approval)
    ↓
Pool balance visible to managers
    ↓
Manager deploys to approved rent request:
  - Atomic transaction via fund-tenant-from-pool
  - Ledger: pool_rent_deployment
  - Creates tenant obligations + auto-charge
  - Pays agent UGX 5,000 bonus
    ↓
15% Reserve locked for monthly rewards
    ↓
Pre-payout Liquidity Gate: blocks if balance < 15% of active capital
```

## 5.4 Returns & Rewards

```
Monthly rewards processing (process-monthly-rewards)
    ↓
ROI calculated on deployed capital
    ↓
Rewards credited to supporter wallet
    ↓
Supporter can withdraw (single-step Financial Ops approval)
```

## 5.5 Investment Accounts (Portfolios)

```
Portfolio created via:
  - Self-service (create-investor-portfolio)
  - Agent proxy (agent-invest-for-partner)
  - COO proxy (coo-invest-for-partner)
  - Manager creation (CreateInvestmentAccountDialog)
  - COO wallet-to-portfolio transfer (coo-wallet-to-portfolio)
    ↓
Portfolio lifecycle:
  - Active → Earning ROI
  - Maturity alerts at term end
  - Renewal: Manager resets cycle (3-24 months), custom ROI%, resets total_roi_earned to 0
  - Renewal count badge (×2, ×3) on card
  - Portfolio renewals tracked in portfolio_renewals table
    ↓
Custom naming: Bold nicknames above reduced-size portfolio codes (WIP... ID)
    ↓
Modification: Edit codes, emails, schedules, 'Invested On' dates
    ↓
One-tap PDF generation + WhatsApp sharing
```

## 5.6 COO Wallet-to-Portfolio Transfer

```
COO/Manager/Super Admin selects a partner with wallet balance
    ↓
Transfers funds from partner's wallet into an active portfolio
    ↓
Optimistic locking deducts from wallet
    ↓
Records pending_portfolio_topup operation
    ↓
Attributed as 'Tenant Partnership Operations' in user communications
```

## 5.7 Funder Statement Generation

- **`send-funder-statement`**: Generates and sends portfolio statements to funders

## 5.8 Supporter Agreements

- `src/components/supporter/agreement/` — Digital agreement flow
- Legal agreement sent via `send-supporter-agreement-email`

## 5.9 Privacy Rules (STRICT)

- Supporters NEVER see: tenant names, landlord names, agent names, phone numbers, user lists, chat
- Supporters ONLY see: Virtual Houses, rent amounts, payment health, portfolio performance, funding outcomes

## 5.10 Backend Edge Functions

- **`fund-rent-pool`**: Wallet → Pool transfer
- **`fund-tenant-from-pool`**: Pool → Rent deployment
- **`create-investor-portfolio`**: New portfolio creation
- **`portfolio-topup`**: Add to existing portfolio
- **`manager-portfolio-topup`**: Manager-initiated topup
- **`coo-wallet-to-portfolio`**: COO wallet-to-portfolio direct transfer
- **`apply-pending-topups`**: Process queued portfolio topups
- **`create-supporter-invite`**: Generate invite links
- **`activate-supporter`**: Complete supporter activation
- **`register-proxy-funder`**: Register funder via proxy (agent/manager)
- **`process-supporter-roi`**: Calculate and credit ROI
- **`process-monthly-rewards`**: Monthly reward distribution
- **`process-investment-interest`**: Interest calculations
- **`send-supporter-agreement-email`**: Legal agreement
- **`send-funder-statement`**: Funder statement PDF
- **`supporter-account-action`**: Account management actions
- **`angel-pool-invest`**: Angel Pool share investment

---

# 6. Landlord Workflows

## 6.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Landlord home — properties, rent status |
| `/welile-homes` | Property listings management |
| `/welile-homes-dashboard` | Landlord dashboard for Welile Homes |
| `/landlord-welile-homes` | Dedicated landlord property view |
| `/landlord-agreement` | Digital landlord agreement |

## 6.2 Dashboard Components

### UI Design: Landlord Dashboard
- **Layout**: Mobile-first, property-centric
- **Hero**: Properties count + total rent receivable
- **Property Cards**: Each property shows tenants, rent status, payment history
- **Quick Actions**: Add Property, Add Tenant, View Payments

| Component | Purpose |
|-----------|---------|
| `LandlordDashboard.tsx` | Main landlord view |
| `LandlordMenuDrawer.tsx` | Navigation drawer |
| `MyPropertiesSheet.tsx` | Property portfolio sheet |
| `MyTenantsSection.tsx` | Tenant listing per property |
| `LandlordPaymentHistory.tsx` | Rent payment history |
| `LandlordAddTenantDialog.tsx` | Add tenant to property |
| `RegisterPropertyDialog.tsx` | Register new property |
| `ManageTenantSubscriptionDialog.tsx` | Manage tenant subscriptions |
| `EnrollTenantWelileHomesDialog.tsx` | Enroll tenant in Welile Homes |
| `LandlordWelileHomesSection.tsx` | Welile Homes integration section |
| `WelileHomesLandlordBadge.tsx` | Participation badge |
| `WelileHomesLandlordLeaderboard.tsx` | Landlord rankings |
| `TenantRating.tsx` | Rate tenants |
| `EncouragementMessageDialog.tsx` | Send encouragement to tenants |

## 6.3 Property Registration

```
Agent registers property in field
    ↓
Property linked to landlord via phone
    ↓
Landlord details: Name, phone, MoMo provider
    ↓
LC1 Chairperson details (must match property village)
    ↓
GPS coordinates recorded
    ↓
Property chain enforced: Agent → Landlord → Property → Tenant
```

## 6.4 Rent Receipt Flow

```
Rent request approved & funded
    ↓
Agent pays landlord (external)
    ↓
Agent submits proof (GPS + receipt)
    ↓
Landlord receives rent confirmation
    ↓
landlords table updated: amount_received, last_payment
```

## 6.5 Landlord Agreements

- `src/components/landlord/agreement/` — Digital landlord agreement flow

## 6.6 Caretaker System

```
Landlord without wallet
    ↓
Agent or third party registered as caretaker
    ↓
Caretaker earns 2% management fee
    ↓
Auto-routing: Funds go to caretaker wallet instead
```

## 6.7 Backend

- **`disburse-rent-to-landlord`**: Record landlord disbursement
- **`fund-agent-landlord-float`**: CFO funds agent float for landlord payment
- Auto-routing fallback: Landlord wallet → Caretaker wallet → Agent wallet (for cash-out)

---

# 7. Manager / Staff Workflows

## 7.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/admin/dashboard` | Staff operations hub |
| `/admin/users` | User management |
| `/admin/financial-ops` | Financial Operations Command Center |
| `/staff` | Staff portal |
| `/manager-access` | Manager access request |
| `/manager-login` | Manager authentication (PIN screen) |
| `/users` | User administration |
| `/platform-users` | Platform-wide user management |
| `/audit-log` | Audit trail viewer |
| `/deposits-management` | Deposit management |
| `/financial-statement` | Financial statements |
| `/roi-trends` | ROI trend analysis |

## 7.2 Manager Dashboard Components

### UI Design: Manager Dashboard
- **Layout**: Responsive — sidebar on desktop, bottom nav + hamburger on mobile
- **KPI Strip**: Horizontal scroll strip with key metrics
- **Hub Cards**: Color-coded grid of department cards
- **Quick Actions**: Priority action buttons (Approve, Review, Fund)
- **Desktop Sidebar**: `DesktopManagerSidebar.tsx` — Full left sidebar navigation
- **Mobile Menu**: `MobileManagerMenu.tsx` — Hamburger menu with full navigation

| Component | Purpose |
|-----------|---------|
| `ManagerDashboard.tsx` | Main manager view |
| `DesktopManagerSidebar.tsx` | Desktop navigation sidebar |
| `MobileManagerMenu.tsx` | Mobile navigation menu |
| `MobileQuickActions.tsx` | Quick action buttons |
| `ManagerHubCards.tsx` | Section navigation cards grid |
| `ManagerKPIStrip.tsx` | Key metrics horizontal strip |
| `ManagerKPIDetailDrawer.tsx` | Drill-down detail drawer |
| `ManagerSectionHeader.tsx` | Section headers with breadcrumb |
| `ManagerTip.tsx` | Contextual helper tips |
| `ManagerPinScreen.tsx` | PIN authentication screen |
| `MyPerformanceCard.tsx` | Staff performance card |
| `DailyReportMetrics.tsx` | Daily metrics report |
| `DashboardPermissionsTab.tsx` | Dashboard visibility controls |
| `ForceRefreshManager.tsx` | Force cache refresh tool |
| `PasswordResetGuide.tsx` | Password reset instructions |

### Agent Operations Components
| Component | Purpose |
|-----------|---------|
| `AgentDetailsDialog.tsx` | Comprehensive agent profile dialog |
| `AgentCollectionsWidget.tsx` | Collection monitoring widget |
| `AgentEarningsOverview.tsx` | Earnings tracking |
| `AgentFloatManager.tsx` | Float management tool |
| `AgentCommissionPayoutsManager.tsx` | Commission payout approvals |
| `IssueAdvanceSheet.tsx` | Issue cash advance sheet |
| `PaidAgentsHistory.tsx` | Agent payment history |

### User Management Components
| Component | Purpose |
|-----------|---------|
| `UserProfilesTable.tsx` | User listing with search/filter |
| `UserDetailsDialog.tsx` / `user-details/` | Detailed user profile views |
| `SimpleUserCard.tsx` | Compact user card |
| `CompactUserStats.tsx` | Quick stats strip |
| `UserCountsSummary.tsx` | Total counts by role |
| `ActiveUsersCard.tsx` | Active user monitoring |
| `QuickUserLookup.tsx` | Fast user search |
| `QuickUserActions.tsx` | Inline user action buttons |
| `FloatingUserActions.tsx` | Floating action buttons |
| `InlineRoleToggle.tsx` / `QuickRoleEditor.tsx` / `MobileRoleEditor.tsx` | Role management |
| `BulkAssignRoleDialog.tsx` / `BulkRemoveRoleDialog.tsx` | Batch role operations |
| `InactiveUsersReachOutDialog.tsx` | Re-engagement tool |
| `DuplicatePhoneUsersSheet.tsx` | Duplicate phone detection |
| `CreateUserInviteDialog.tsx` | User invitation dialog |
| `BulkWhatsAppDialog.tsx` | Mass WhatsApp messaging |
| `UserLocationsManager.tsx` | Location tracking |
| `RoleHistoryViewer.tsx` | Role change audit trail |

### Financial Operations Components
| Component | Purpose |
|-----------|---------|
| `FinancialOverview.tsx` | Financial summary dashboard |
| `FinancialCharts.tsx` | Visual analytics charts |
| `FinancialAlerts.tsx` | Risk alerts panel |
| `FinancialStatementsPanel.tsx` | P&L, cash flow, balance sheet |
| `GeneralLedger.tsx` | Ledger browser with scope filtering |
| `ManagerLedgerSummary.tsx` | Ledger overview |
| `ManagerBankingLedger.tsx` | Banking operations ledger |
| `DayGroupedLedger.tsx` | Date-grouped ledger view |
| `SupporterPoolBalanceCard.tsx` | Pool health (Balance, Deployed, 15% Reserve, Deployable) |
| `ReserveAllocationPanel.tsx` | Reserve management |
| `BufferAccountPanel.tsx` | Buffer/escrow accounts |
| `BufferTrendChart.tsx` | Buffer trend analysis chart |
| `PeriodComparison.tsx` | Period-over-period analysis |
| `DepositRequestsManager.tsx` | Deposit processing queue |
| `DepositAnalytics.tsx` | Deposit metrics dashboard |
| `DepositRentAuditWidget.tsx` | Rent deposit auditing |
| `FloatingDepositsWidget.tsx` | Pending deposits widget |
| `ManagerDepositsWidget.tsx` | Deposit overview widget |

### Investment Management Components
| Component | Purpose |
|-----------|---------|
| `InvestmentAccountsManager.tsx` | Portfolio management |
| `CreateInvestmentAccountDialog.tsx` | Create portfolio dialog |
| `CreateSupporterDialog.tsx` | Create supporter account |
| `CreateSupporterWithAccountDialog.tsx` | Create supporter + portfolio |
| `EditInvestmentAccountDialog.tsx` | Edit portfolio details |
| `FundInvestmentAccountDialog.tsx` | Fund portfolio dialog |
| `RenewPortfolioDialog.tsx` | Renew matured portfolio |
| `InvestmentEditHistoryDialog.tsx` | Investment edit audit log |
| `FundEditHistory.tsx` | Fund edit audit trail |
| `FundFlowTracker.tsx` | Capital flow visualization |
| `ManagerInvestmentRequestsSection.tsx` | Investment request queue |
| `PendingInvestmentRequestsWidget.tsx` | Pending investment widget |
| `MonthlyRewardsTrigger.tsx` | Trigger monthly rewards |
| `SupporterROITrigger.tsx` | Trigger ROI processing |
| `SupporterInvitesList.tsx` | Supporter invitation list |
| `AddBalanceDialog.tsx` | Manual balance adjustment |

### Rent & Operational Components
| Component | Purpose |
|-----------|---------|
| `RentRequestsManager.tsx` | Rent request management |
| `PendingRentRequestsWidget.tsx` | Pending requests widget |
| `ApprovedRequestsFundingWidget.tsx` | Approved requests needing funding |
| `PaymentConfirmationsManager.tsx` | Payment confirmation queue |
| `PaymentProofsManager.tsx` | Payment proof verification |
| `WithdrawalRequestsManager.tsx` | Withdrawal approval queue |
| `PendingWalletOperationsWidget.tsx` | Pending wallet operations |
| `PendingInvitesWidget.tsx` | Pending invitations |
| `PendingSellerApplicationsWidget.tsx` | Seller application queue |
| `SubscriptionMonitorWidget.tsx` | Subscription monitoring |
| `WelileHomesSubscriptionsManager.tsx` | Welile Homes subscriptions |
| `WelileHomesWithdrawalsManager.tsx` | Welile Homes withdrawals |
| `ReceiptManagement.tsx` | Receipt management |
| `PrintableReceiptSheet.tsx` | Printable receipt generation |
| `RecordMerchantPayment.tsx` | Record merchant payment |
| `LoanApplicationsManager.tsx` | Loan application approvals |
| `OrdersManager.tsx` | Marketplace order management |
| `VendorAnalytics.tsx` | Vendor performance |
| `OpportunitySummaryForm.tsx` | Investment opportunity form |
| `ActivityManager.tsx` | Activity tracking |
| `QuickActionsDropdown.tsx` | Admin quick actions |
| `ChromecastButton.tsx` | Cast to TV display |

### AI & Intelligence Components
| Component | Purpose |
|-----------|---------|
| `AIBrainDashboard.tsx` | AI-powered insights dashboard |
| `AIRecommendationCard.tsx` | AI action recommendations |
| `AISessionHistory.tsx` | AI interaction history |
| `AIUserExperienceReport.tsx` | AI-generated user experience report |
| `AuditLogViewer.tsx` | Comprehensive audit log viewer |

## 7.3 Approval Workflows

### Withdrawal Approval (Single-Step)
```
User requests withdrawal
    ↓
Wallet pre-deducted immediately (withdrawal_pending category)
    ↓
Financial Ops reviews: TID/receipt/bank ref required
    ↓
Approve → Mark as completed, record TID
    ↓
Reject → Idempotent refund via withdrawal_reversal ledger entry
    (deterministic transaction_group_id: 'wallet-reject-{id}')
```

### Deposit Approval
```
User submits deposit (TID required)
    ↓
TID Verification (Financial Ops):
  - Match against pending deposits → auto-approve
  - No match → pre-register TID as 'waiting'
    ↓
When depositor submits matching TID → instant auto-approve
    ↓
Audit log records all auto-approvals
```

### Commission Approval
```
Agent earns commission
    ↓
Queued in pending_wallet_operations (status: 'pending')
    ↓
Manager/Executive approves
    ↓
Funds credited to agent wallet
```

## 7.4 Operations Departments

- **Tenant Operations**: Full lifecycle management (see Section 14)
- **Landlord Operations**: Property orchestration, vacancy tracking, listing verification, listing rejection (push back to agent), budget matching, viewing coordination with SMS alerts (see Section 17)
- **Partner Operations**: Capital management with card-based dashboard (see Section 15)
- **Agent Operations**: Agent lifecycle, performance, float management (see Section 16)
- Operations users assigned to departments via junction table

## 7.5 Backend Edge Functions

- **`approve-deposit`**: Process deposit approval
- **`approve-wallet-operation`**: Generic wallet op approval
- **`reject-withdrawal`**: Reject withdrawal with reason
- **`delete-user`**: User deletion (with audit)
- **`register-employee`**: Staff registration
- **`transfer-tenant`**: Transfer tenant between agents
- **`batch-process-financials`**: Bulk financial operations
- **`import-partners`**: Bulk partner import (up to 200 per batch)
- **`export-database`**: Data export
- **`user-snapshot`**: Generate user data snapshot

---

# 8. COO Dashboard Workflows

## 8.1 Route: `/coo/dashboard`

### UI Design: COO Dashboard
- **Layout**: Tabbed interface with horizontal scrollable tab bar
- **Mobile**: Tabs truncated to 4 chars, full labels on desktop
- **Tab Strip**: Colored active tab with primary background
- **Content Area**: Full-width content below tabs

## 8.2 Tabs & Sections

| Tab | Component | Purpose |
|-----|-----------|---------|
| `overview` | Default | KPIs + Rent Queue + Metrics + Pool + Alerts |
| `rent-approvals` | `RentPipelineQueue` | Stage 4 rent approvals (landlord_ops_approved) |
| `transactions` | `FinancialTransactionsTable` | Transaction monitoring |
| `collections` | `AgentCollectionsOverview` | Agent collection tracking |
| `wallets` | `FinancialOpsCommandCenter` | Wallet operations |
| `agent-activity` | `CashoutAgentActivity` | Agent cashout monitoring |
| `analytics` | `PaymentModeAnalytics` | Payment channel analytics (donut chart) |
| `reports` | `FinancialReportsPanel` | Financial reporting |
| `alerts` | `FinancialAlertsPanel` | Risk & alert management (large payments >2M, failed withdrawals) |
| `withdrawals` | `COOWithdrawalApprovals` | Stage 4 withdrawal sign-off |
| `partners` | `COOPartnersPage` | Partner management with **deletion** (mandatory reason) |
| `staff-performance` | `StaffPerformancePanel` | Staff monitoring |

### COO-Specific Components

| Component | Purpose |
|-----------|---------|
| `FinancialMetricsCards.tsx` | Real-time KPI cards (Total Rent, Daily/Monthly Payments, Agent Collections, System Balance, Pending/Failed Transactions) |
| `AgentCollectionsOverview.tsx` | Agent collection tracking with filters |
| `COODataTable.tsx` | Reusable data table for COO views |
| `COODetailLayout.tsx` | Consistent detail page layout |
| `COOWithdrawalApprovals.tsx` | Withdrawal approval queue |
| `COOPartnerWithdrawalApprovals.tsx` | Partner withdrawal approvals |
| `FinancialAlertsPanel.tsx` | Anomaly detection (large payments, failed withdrawals) |
| `FinancialReportsPanel.tsx` | Report generation panel |
| `FinancialTransactionsTable.tsx` | Transaction monitoring table |
| `PaymentModeAnalytics.tsx` | Payment channel donut chart |
| `WalletMonitoringPanel.tsx` | Wallet balance monitoring |

### KPI Cards (FinancialMetricsCards)

| KPI | Data Source | Threshold |
|-----|------------|-----------|
| Total Rent Facilitated | `general_ledger` (rent categories) | Green: growing, Red: declining |
| Daily Payments | `general_ledger` (today's entries) | Green: >0, Yellow: <50% avg |
| Monthly Payments | `general_ledger` (current month) | Target vs actual |
| Agent Collections | `agent_collections` (current period) | Green: above target |
| System Balance | `wallets` + `general_ledger` net | Red: <15% reserve |
| Pending Transactions | `pending_wallet_operations` count | Yellow: >10, Red: >50 |
| Failed Transactions | Failed operations count | Any: Red alert |

### Overview KPIs (Clickable)
- Active Users, Active Partners, Active Landlords
- Earning Agents, Rent Coverage metrics
- Each KPI links to a drill-down detail page (`/coo/*`)

### Partner Management (COOPartnersPage)

| Component | Purpose |
|-----------|---------|
| `COOPartnersPage.tsx` | Full partner management interface |
| `PartnerImportDialog.tsx` | Bulk import from Excel (up to 200/batch) |
| `UpdateContributionDatesDialog.tsx` | Contribution date corrections |

Features:
- Partner-level aggregation (total invested, active portfolios, wallet balance)
- Search and filtering across partners
- Full CRUD: create, edit, fund, renew portfolios
- **Partner Deletion**: Delete with mandatory 10-char reason (permanent role removal + account freeze)
- **Suspend**: Soft-disable partner access
- **Wallet-to-Portfolio Transfer**: Move partner wallet funds into active portfolios

### Detail Pages

| Route | Purpose |
|-------|---------|
| `/coo/active-users` | Drill into active user metrics |
| `/coo/earning-agents` | Top-earning agents |
| `/coo/tenants-balances` | Tenant balance overview |
| `/coo/rent-requests` | New rent requests |
| `/coo/active-partners` | Active supporter details |
| `/coo/partner-requests` | Pending partner applications |
| `/coo/active-landlords` | Active landlord details |
| `/coo/pipeline-landlords` | Landlords in verification pipeline |
| `/coo/rent-coverage` | Rent coverage analysis |

---

# 9. CFO Dashboard Workflows

## 9.1 Route: `/cfo/dashboard`

### UI Design: CFO Dashboard
- **Layout**: Tabbed interface with 20+ tabs (icons + labels)
- **Tab Strip**: Wrap-style tabs with icon + text, primary color when active
- **Mobile**: Tab labels truncated to 4 chars
- **Tabs**: Overview, Cash Position, Channels, P&L, Disbursements, Statements, Solvency, Payouts, Reconcile, Ledger, ROI Requests, Rent Collections, Agent Rankings, Retractions, Advances, Approval Audit, Agent Requisitions, Float Management, Listing Bonus

## 9.2 Tabs & Components

| Tab | Component(s) | Purpose |
|-----|-------------|---------|
| `overview` | `ThresholdAlerts` + `FinancialOverview` | Alerts + financial summary |
| `cash` | `DailyCashPositionReport` | Daily cash position with Platform vs Custody split |
| `channels` | `ChannelBalanceTracker` + `DirectCreditTool` | Channel balances + manual credit |
| `revenue` | `RevenueExpenseDashboard` | P&L analysis |
| `disbursements` | `DisbursementRegistry` | Disbursement tracking registry |
| `statements` | `FinancialStatementsPanel` | P&L, cash flow, balance sheet |
| `solvency` | `BufferAccountPanel` | Buffer/escrow monitoring |
| `payouts` | (See below) | Multi-section payout authorization |
| `reconciliation` | `CFOReconciliationPanel` | Reconciliation tools |
| `ledger` | `GeneralLedger` | Full ledger browser |
| `roi-requests` | `CFOROIRequests` | Partner ROI payout authorization (CFO inbound credit authority) |
| `rent-collections` | `RentCollectionsFeed` | Real-time agent collection tracking |
| `agent-rankings` | `AgentPerformanceRankings` | Weighted KPI rankings (Earnings 30%, Collections 25%, Referrals 25%, Visits 20%) |
| `retractions` | `WalletRetractionsFeed` | Wallet retraction monitoring |
| `advances` | `CFOAdvancesManager` | Agent cash advances with compounding interest |
| `approval-audit` | `ManagerApprovalAudit` | Cross-department approval audit trail |
| `agent-requisitions` | `CFOAgentRequisitions` | Financial agent requisition approval queue |
| `float-management` | `AgentFloatManagement` | 3-tab float management: Transfers, Balances, Reconciliation |
| `listing-bonus` | `ListingBonusApprovalQueue` | Listing bonus payout approval |

### CFO-Specific Components

| Component | Purpose |
|-----------|---------|
| `ThresholdAlerts.tsx` | CFO risk threshold alerts |
| `DailyCashPositionReport.tsx` | Separate KPIs for Platform Cash vs User Funds (Custody) |
| `ChannelBalanceTracker.tsx` | MTN, Airtel, Bank, Agent Cash channels with week-over-week trends |
| `DirectCreditTool.tsx` | Manual wallet credit tool (10-char reason required) |
| `RevenueExpenseDashboard.tsx` | Revenue vs Expense analysis |
| `DisbursementRegistry.tsx` | All disbursement records |
| `CFOReconciliationPanel.tsx` | Bank ↔ Ledger reconciliation |
| `BatchPayoutProcessor.tsx` | Batch payout processing tool |
| `ServiceCentrePayoutApproval.tsx` | Service Centre payout approval queue |
| `CFOPartnerPayoutProcessing.tsx` | Partner payout processing |
| `CFOReceivablesTracker.tsx` | Receivables monitoring |
| `CFOWithdrawalApprovals.tsx` | Withdrawal approval queue |
| `PlatformVsWalletSummary.tsx` | Platform vs wallet balance comparison |
| `PendingPortfolioTopUps.tsx` | Pending portfolio top-up queue |
| `AgentCashReconciliation.tsx` | Agent cash reconciliation |
| `CashoutAgentActivity.tsx` | Agent cashout pattern monitoring |
| `CashoutAgentManager.tsx` | Cashout agent management |
| `DeliveryPipelineTracker.tsx` | Delivery pipeline tracking |
| `FinancialAgentsPanel.tsx` | Tagged agents for expense categories (Ops, Marketing, R&D, Salaries) |
| `PayrollPanel.tsx` | Monthly batch + individual payroll transfers |
| `ProxyAgentManager.tsx` | Proxy agent assignments |
| `LandlordOpsPayoutReview.tsx` | Landlord Ops payout review |
| `UserSearchPicker.tsx` | Searchable user picker for assignments |

### Payouts Tab (Multi-Section)

```
┌─ ServiceCentrePayoutApproval ──────────────────────────┐
│ Verified Service Centres awaiting CFO payment approval  │
└─────────────────────────────────────────────────────────┘
┌─ Grid: 2 columns ──────────────────────────────────────┐
│ BatchPayoutProcessor │ SupporterROITrigger             │
│ Batch payout engine  │ ROI authorization gates          │
├──────────────────────┼──────────────────────────────────┤
│ AgentCommission      │ CFOPartnerPayoutProcessing      │
│ PayoutsManager       │ Partner withdrawal approvals     │
└──────────────────────┴──────────────────────────────────┘
┌─ WithdrawalRequestsManager ────────────────────────────┐
│ All withdrawal requests across all users                │
└─────────────────────────────────────────────────────────┘
```

## 9.3 Cash Position Reporting
- Separate KPIs for 'Platform Cash' and 'User Funds (Custody)'
- Prevents accounting inflation
- High-priority reconciliation: all user wallets vs. platform ledger net position

## 9.4 Ledger Hub (Full Visibility)
- Full visibility into ALL 6 specialized ledgers:
  1. Suspense Ledger (unmatched funds)
  2. Default & Recovery Ledger
  3. Supporter Capital Ledger
  4. Commission Accrual Ledger
  5. Fee Revenue Ledger
  6. Settlement & Reconciliation Ledger
- General Ledger browser with scope filtering (Wallet/Platform/Bridge)

## 9.5 Rent Request Approval (Stage 5 — Final)
- CFO sees requests at `coo_approved` status
- Approve → Atomic operation:
  - Credits agent landlord float
  - Records bridge-scope ledger entry
  - Issues agent UGX 5,000 bonus
  - Status → `funded`
- Reject → Status → `rejected` with reason

## 9.6 Receivables Tracking
- Monitors proportional revenue recognition for access and request fees
- Revenue recognized relative to tenant repayment progress

## 9.7 Wallet Adjustment Tool
- Manual Credit: Platform → User Wallet
- Manual Debit: User Wallet → Platform
- 10-character mandatory audit reason
- Double-entry ledger tracking

## 9.8 Disbursements
- **Financial Agents**: Tagged agents for expense categories (Ops, Marketing, R&D, Salaries)
- **Payroll**: Monthly batch + individual transfers via `platform-expense-transfer`
- **Proxy Agent Assignments**: Searchable User Pickers (name/phone) for non-smartphone users

## 9.9 Withdrawal Approval
- Wallet withdrawal approvals handled by Financial Ops (single-step)
- CFO retains oversight of financial statements, solvency, and reconciliation

## 9.10 Backend Edge Functions

- **`cfo-direct-credit`**: Direct wallet credit
- **`platform-expense-transfer`**: Expense disbursement
- **`fund-agent-landlord-float`**: Fund agent float for landlord payouts
- **`approve-rent-request`**: CFO-level rent approval (atomic)

---

# 10. CEO Dashboard Workflows

## 10.1 Route: `/ceo/dashboard`

### UI Design: CEO Dashboard
- **Layout**: Executive summary with large KPI cards
- **North Star**: Prominent rent secured metric
- **Charts**: Growth trends, utilization, health indicators
- **Staff Panel**: Performance monitoring with heatmaps

## 10.2 Components

| Component | Purpose |
|-----------|---------|
| `CEODashboard.tsx` | Main CEO view (`src/components/executive/`) |
| `AngelPoolManagementPanel.tsx` | Angel Pool config and shareholder management |

## 10.3 Sections

- **North Star Metric**: Rent Secured (UGX/month)
- **Executive KPIs**: Active virtual houses, rent success rate, capital utilization
- **Platform Health**: Coverage ratios, liquidity buffer, default rate
- **Growth Trends**: User acquisition, revenue trajectory
- **Staff Performance Panel**: Audit logs, daily heatmaps, SLA compliance (idle time, response rates)
- **ROI Trends**: `/roi-trends` — Historical return analysis
- **Executive Hub**: `/executive-hub` — Cross-functional overview
- **Angel Pool Management**: CEO-exclusive pool configuration and shareholder management

---

# 11. CTO Dashboard Workflows

## 11.1 Route: `/cto/dashboard`

### UI Design: CTO Dashboard
- **Layout**: System monitoring style with status indicators
- **Latency Meter**: Real-time DB latency with color-coded thresholds
- **User Admin**: Full platform user management
- **Infrastructure Cards**: Service status grid

## 11.2 Components

| Component | Purpose |
|-----------|---------|
| `CTODashboard.tsx` | Main CTO view (`src/components/executive/`) |

## 11.3 Sections

- **System Health**: Real-time DB latency monitoring (Healthy <300ms, Degraded >1000ms) every 60 seconds
- **Performance Metrics**: DB reads per session, cache hit rates, Edge Function error rates
- **User Management**: Platform user administration (with role assignment powers)
- **Infrastructure**: Service status, deployment health
- **TV Dashboard**: `/tv-dashboard` — Large-screen monitoring display (`ChromecastButton` integration)

---

# 12. CMO Dashboard Workflows

## 12.1 Route: `/cmo/dashboard`

### UI Design: CMO Dashboard
- **Layout**: Marketing analytics with charts and funnels
- **Acquisition Funnel**: Visual signup-to-activation pipeline
- **Leaderboard**: Top referrers with avatars and rankings

## 12.2 Components

| Component | Purpose |
|-----------|---------|
| `CMODashboard.tsx` | Main CMO view (`src/components/executive/`) |

## 12.3 Sections

- **User Acquisition**: Signup funnel, referral performance
- **Referral Leaderboard**: Top referrers with rankings
- **Campaign Tracking**: Marketing channel performance, attribution
- **Engagement Metrics**: DAU/MAU, session data

---

# 13. CRM Dashboard Workflows

## 13.1 Route: `/crm/dashboard`

### UI Design: CRM Dashboard
- **Layout**: Customer-centric with segment cards
- **Segment Tiles**: Color-coded by customer type
- **Ticket Queue**: Priority-sorted support tickets

## 13.2 Components

| Component | Purpose |
|-----------|---------|
| `CRMDashboard.tsx` | Main CRM view (`src/components/executive/`) |

## 13.3 Sections

- **Customer Segments**: Tenant, agent, supporter categorization
- **Support Tickets**: Issue tracking and triage
- **Retention Metrics**: Churn indicators
- **Communication Tools**: Notification management, bulk messaging

---

# 14. Tenant Operations Dashboard

## 14.1 Route: Part of `/admin/dashboard` → Operations → Tenant Ops

### UI Design: Tenant Ops Dashboard
- **Pattern**: Card-based Quick Nav Grid (2-column mobile, 4-column desktop)
- **Active State**: Primary-colored cards with white icon when active
- **KPIs**: Clickable metric cards that filter the tenant list
- **Back Navigation**: `ChevronLeft` "Back to Overview" header on sub-views

## 14.2 Architecture

Card-based navigation system with separate sub-views:

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Clickable KPIs + Tenant Overview List |
| `pipeline` | `RentPipelineQueue` | Stage 1 rent approvals (tenant_ops_approved) |
| `daily` | `DailyPaymentTracker` | Daily auto-deduction tracking |
| `missed` | `MissedDaysTracker` | Tenants behind on payments |
| `behavior` | `TenantBehaviorDashboard` | Behavioral analytics |
| `history` | `ApprovalHistoryLog` | Full approval audit trail |
| `all-requests` | `ExecutiveDataTable` | All rent requests table |
| `link-agent` | `TenantAgentLinker` | Link tenants to agents |
| `collect-rent` | `TenantRentCollector` | Manual rent collection |
| `agent-tenants` | `AgentTenantSearch` | Agent-tenant relationship search |
| `tenant-detail` | `TenantDetailPanel` | Deep-dive into individual tenant |

### Components

| Component | Purpose |
|-----------|---------|
| `TenantOpsDashboard.tsx` | Main container with nav grid |
| `TenantOverviewList.tsx` | Tenant list with category filters |
| `TenantDetailPanel.tsx` | Individual tenant deep-dive |
| `TenantBehaviorDashboard.tsx` | Behavioral analytics |
| `TenantAgentLinker.tsx` | Link tenants to agents |
| `TenantRentCollector.tsx` | Manual rent collection tool |
| `TenantTransferPanel.tsx` | Transfer tenant between agents |
| `AgentTenantSearch.tsx` | Search agent-tenant relationships |
| `AgentTenantConnector.tsx` | Connect agents to tenants |
| `DailyPaymentTracker.tsx` | Daily auto-deduction tracker |
| `MissedDaysTracker.tsx` | Missed payment tracker |
| `RepaymentTrendChart.tsx` | Repayment trend bar chart |
| `RentPipelineQueue.tsx` | Rent pipeline approval queue |
| `RentPipelineTracker.tsx` | Pipeline status tracker |
| `ApprovalHistoryLog.tsx` | Approval audit trail |
| `ExecutiveDataTable.tsx` | Data table for executive views |
| `DeleteRentRequestDialog.tsx` | Delete rent request (mandatory reason) |
| `DeleteHistoryViewer.tsx` | Deleted request audit log |
| `RentAdjustmentDialog.tsx` | Adjust rent request amounts |
| `ChangeMaturityDateDialog.tsx` | Change maturity dates |
| `UserProfileSheet.tsx` | User profile side sheet |

## 14.3 Overview KPIs (Clickable)

| KPI | Metric | Click Action |
|-----|--------|--------------|
| Pending | Requests awaiting review | Filters list to pending |
| Funded | Active funded requests | Filters list to funded |
| Repaying | Tenants actively repaying | Filters list to repaying |
| Disbursed | Funds released to landlords | Filters list to disbursed |
| Rejected | Declined requests | Filters list to rejected |
| Completed | Fully repaid requests | Filters list to completed |

## 14.4 Tenant Overview List

- All tenants displayed with clickable names for deep-dive
- **Category filters**: All, Active (funded/disbursed), Pending, Rejected, Completed
- **Smartphone flag toggle**: Mark tenants as having/not having smartphones
- Syncs with KPI card clicks via `initialCategory` prop
- Deduplicates by `tenant_id` (shows latest request per tenant)

## 14.5 Manual Rent Collection

```
Tenant Ops Manager selects a tenant with active rent request
    ↓
Chooses collection source:
  - Tenant wallet
  - Agent wallet
    ↓
Enters mandatory reason (≥ 10 characters)
    ↓
manual-collect-rent Edge Function:
  1. Validates reason
  2. Deducts from selected wallet
  3. Records wallet_transaction with reason
  4. Calls record_rent_request_repayment RPC
  5. Logs to audit_logs with full metadata
```

## 14.6 Repayment Trend Chart

- Bar chart showing daily gross repayment breakdown
- Allows Tenant Ops to monitor collection velocity
- Date-range filtering

## 14.7 Tenant Detail Panel

- Deep-dive into individual tenant: rent requests, wallet, repayment history
- Accessible by clicking tenant name in overview list
- Shows all active/past rent requests with amounts and status

## 14.8 Rent Request Deletion

- `DeleteRentRequestDialog.tsx` — Delete tenant's rent request with mandatory reason
- `DeleteHistoryViewer.tsx` — Full snapshot + audit log of deleted requests
- Deletion button on each tenant row in Daily Payment Tracker

---

# 15. Partner Operations Dashboard

## 15.1 Route: Part of `/admin/dashboard` → Operations → Partner Ops

### UI Design: Partner Ops Dashboard
- **Pattern**: Card-based Quick Nav Grid matching COO/Tenant Ops pattern
- **Mobile (< 768px)**: 2-column nav grid, back button on sub-views, stacked KPIs
- **Desktop**: 3-column nav grid, wider content, KPIs in 4-column row
- **Info icons**: Tooltips for contextual help

## 15.2 Architecture

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Partner KPIs + Quick stats |
| `portfolios` | `COOPartnersPage` | Full partner management (shared with COO) |
| `escalations` | `PartnerOpsBrief` | Partner escalation queue |
| `directory` | `PartnerDirectory` | Partner contact directory |
| `capital` | `PartnerCapitalFlow` | Capital flow visualization |
| `roi` | `ROIPaymentHistory` | ROI payout history with trends |
| `churn` | `PartnerChurnAlerts` | Churn risk alerts |

### Components

| Component | Purpose |
|-----------|---------|
| `PartnersOpsDashboard.tsx` | Main container with nav grid |
| `PartnerOpsBrief.tsx` | Escalation queue |
| `PartnerDirectory.tsx` | Contact directory |
| `PartnerCapitalFlow.tsx` | Capital flow charts |
| `PartnerChurnAlerts.tsx` | Churn risk monitoring |
| `PartnerOpsWithdrawalQueue.tsx` | Withdrawal queue |
| `ROIPaymentHistory.tsx` | ROI payment history |
| `ROITrendsPage.tsx` | ROI trend analysis |

## 15.3 Partner Table (COOPartnersPage Integration)

- Shares the same partner management interface as COO dashboard
- Partner-level aggregation: total invested, active portfolios, wallet balance
- Search, filtering, and all CRUD dialogs
- Suspend (soft-disable) and Delete (permanent with 10-char reason)
- Portfolio renewal with auto-renewal background task

## 15.4 Partner Returns Logic

- **Returns Calculation**: ROI is a monthly rate (e.g., 20% per month)
- **Compounding**: ROI is reinvested into the principal, increasing the next month's returns base
- **Scheduling**: `payout_day` is auto-calculated from the contribution date (max 28)
- **Nearing Payouts**: Displays portfolios due within 30 days
- **Payout Dialog**: Maintains local snapshot during session, marking processed items with ✓
- **Payout Filters**: Filter to isolate partners with payouts on the 1st of every month
- **Manual Date Edit**: Executives can manually edit `next_roi_date` in Partner Detail view
- **Terminology**: ROI labeled 'Returns', Invested labeled 'Principal'

## 15.5 KPI Cards

- Total Partners, Total Capital, Active Portfolios
- Average ROI, Near-Maturity Count
- Churn risk indicators

## 15.6 Auto-Renewal Logic

- Background task runs on dashboard load (regardless of active tab)
- Checks for matured portfolios and auto-renews based on `auto_reinvest` flag
- Runs once per session (`autoRenewedRef`)

---

# 16. Agent Operations Dashboard

## 16.1 Route: Part of `/admin/dashboard` → Operations → Agent Ops

### UI Design: Agent Ops Dashboard
- **Pattern**: Mobile-first Quick Nav Grid (2-column on mobile, 4-column on desktop)
- **Color-coded cards**: Each nav card has distinct color coding
- **Badge counts**: Real-time counts on navigation cards
- **Touch-optimized**: Minimum 44px touch targets, `active:scale-95` for haptic feel

## 16.2 Architecture

State-driven sub-view system with Quick Nav Grid:

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Quick Nav Grid + KPI cards |
| `pipeline` | `RentPipelineQueue` | Agent Ops rent pipeline (Stage 2) |
| `service-centres` | `ServiceCentreVerificationQueue` | Service Centre photo/GPS verification |
| `tasks` | `AgentTaskManager` | Task assignment and tracking |
| `float-payouts` | `AgentOpsFloatPayoutReview` (from agent component) | Float payout review |
| `escalations` | `AgentEscalationQueue` | Escalation resolution |
| `lifecycle` | `AgentLifecyclePipeline` | Agent lifecycle (New→Active→Dormant) |
| `tiers` | `AgentPerformanceTiers` | Gold/Silver/Bronze rankings |
| `listing-bonus` | `ListingBonusApprovalQueue` | Listing bonus approvals |
| `directory` | `AgentDirectory` | Full agent directory |
| `proximity` | `AgentProximitySelector` | GPS-based agent assignment |
| `brief` | `AgentOpsBrief` | Operational summary brief |
| `collections` | `AgentCollectionsWidget` | Collection monitoring |
| `vacancy` | `VacancyAnalytics` | Vacancy tracking analytics |

### Components

| Component | Purpose |
|-----------|---------|
| `AgentOpsDashboard.tsx` | Main container with Quick Nav Grid |
| `ServiceCentreVerificationQueue.tsx` | Verify Service Centre submissions (photo + GPS) |
| `AgentTaskManager.tsx` | Assign/track agent tasks |
| `AgentEscalationQueue.tsx` | Handle agent-reported escalations |
| `AgentLifecyclePipeline.tsx` | Visualize agent lifecycle stages |
| `AgentPerformanceTiers.tsx` | Performance tier management |
| `AgentDirectory.tsx` | Searchable agent directory |
| `AgentProximitySelector.tsx` | GPS proximity-based agent finder |
| `AgentOpsBrief.tsx` | Daily operational brief |
| `ListingBonusApprovalQueue.tsx` | Approve listing bonuses |
| `VacancyAnalytics.tsx` | Vacancy analysis dashboard |
| `StaffPerformancePanel.tsx` | Staff performance monitoring |

## 16.3 Service Centre Verification

```
Agent submission appears in queue
    ↓
Agent Ops reviews:
  - Photo of mounted poster/logo
  - GPS coordinates (Google Maps link)
  - Agent details (name, phone)
  - Location description
    ↓
Verify: GPS matches expected area + photo shows proper setup
    → Status: 'verified' → forwarded to CFO for payment
    ↓
Reject: Mandatory 10+ character reason
    → Status: 'rejected' → agent notified
```

---

# 17. Landlord Operations Dashboard

## 17.1 Route: Part of `/admin/dashboard` → Operations → Landlord Ops

### UI Design: Landlord Ops Dashboard
- **Pattern**: Card-based Quick Nav Grid
- **Map Integration**: Leaflet map for property visualization

## 17.2 Architecture

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Landlord Ops KPIs + nav grid |
| `pipeline` | `RentPipelineQueue` | Landlord Ops rent pipeline (Stage 3) |
| `chain-health` | `ChainHealthTab` | Property chain health monitoring |
| `deal-pipeline` | `DealPipeline` | Deal flow tracking |
| `property-map` | `PropertyMapView` / `PropertyMapLeaflet` | Map-based property view |
| `tenant-matching` | `TenantMatchingQueue` | Match tenants to properties |
| `vacancy` | `VacancyAnalytics` | Vacancy tracking |

### Components (src/components/executive/landlord-ops/)

| Component | Purpose |
|-----------|---------|
| `LandlordOpsDashboard.tsx` | Main container |
| `ChainHealthTab.tsx` | Property chain integrity monitoring |
| `DealPipeline.tsx` | Deal flow visualization |
| `PropertyMapView.tsx` / `PropertyMapLeaflet.tsx` | Map-based property view (Leaflet) |
| `TenantMatchingQueue.tsx` | Tenant-property matching |
| `ViewingSchedulerDialog.tsx` | Schedule property viewings |
| `AssignPersonDialog.tsx` | Assign agent/caretaker to property |
| `EditLandlordDialog.tsx` | Edit landlord details |
| `EditLC1Dialog.tsx` | Edit LC1 chairperson details |
| `EmptyHouseActionDialog.tsx` | Actions for empty houses |
| `LandlordOpsPayoutReview.tsx` | Payout review (CFO component) |

## 17.3 Listing Rejection Flow

```
Landlord Ops Manager reviews listing
    ↓
Approve → listing stays active
    ↓
Reject → status set to 'rejected' with mandatory reason (≥10 chars)
    ↓
Rejected listings appear on agent dashboard with red indicator
    ↓
Agent can fix issues and "Relist" (status → 'available')
```

## 17.4 Viewing Coordination

```
Tenant expresses interest in property
    ↓
Landlord Ops schedules viewing via ViewingSchedulerDialog
    ↓
SMS alerts sent to tenant, agent, and landlord
    ↓
Agent checks in via GPS at viewing location
    ↓
verify-viewing-checkin validates GPS proximity
    ↓
viewing-confirmation-sms sent post-viewing
```

---

# 18. Financial Operations Command Center

## 18.1 Route: `/admin/financial-ops`

### UI Design: Financial Ops
- **Layout**: Tabbed interface with TID Verification as primary tab
- **Primary Styling**: TID tab has primary-colored border to emphasize importance
- **Live Pulse**: Real-time metrics strip at top
- **Queue**: Sortable/filterable approval queue

## 18.2 Components

| Component | Purpose |
|-----------|---------|
| `FinancialOpsCommandCenter.tsx` | Main container |
| `FinancialOpsPulseStrip.tsx` | Real-time metrics strip |
| `TidVerification.tsx` | TID verification and matching |
| `ApprovalQueue.tsx` | Priority approval queue |
| `AuditFeed.tsx` | Audit event feed |
| `DepositStatsPanel.tsx` | Deposit statistics |
| `FinOpsWithdrawalVerification.tsx` | Withdrawal verification |
| `FloatPayoutVerification.tsx` | Float payout verification |
| `ReconciliationDashboard.tsx` | Daily reconciliation |
| `RequestDetailSheet.tsx` | Request detail side sheet |
| `ScaleDashboard.tsx` | Scale monitoring |
| `TransactionSearch.tsx` | Transaction search |
| `WalletDeductionPanel.tsx` | Wallet deduction tool |

### Live Pulse Strip
- Real-time metrics via RPC `get_financial_ops_pulse`
- Includes: pending withdrawal counts, approval rates
- Total volume, approval rates

### TID Verification Tab (High Priority)
- Primary-colored styling to emphasize mandatory workflow
- **Verify & Match Flow**:
  ```
  Operator enters TID
      ↓
  System searches pending deposits
      ↓
  Match found → Auto-approve via Edge Function
      ↓
  No match → Pre-register in pre_registered_tids (status: 'waiting')
      ↓
  Future deposit with this TID → Instant auto-approval
  ```
- Proactive pre-registration from mobile money statements
- Submissions restricted to 7-day window (future/older blocked)
- Transaction references forced uppercase, prefixed TID/RCT

### Priority Approval Queue
- Toggle: Newest ↔ Oldest sort
- Filters: status, channel, amount range
- Server-side pagination via RPC `get_paginated_transactions`
- 400ms search debouncing

### Deposit Automation (High-Scale)
- Batch auto-approve TID-matched deposits
- 5% flagged for manual spot-audit
- Duplicate detection

### Payout Automation
- Auto-dispatch withdrawals by channel (MTN, Airtel, Bank, Cash)
- Agent capacity-based assignment
- VIP/500K+ UGX priority lane

### Daily Reconciliation
- `get_reconciliation_summary` RPC
- Ledger totals vs. channel balances
- Anomaly alerts: velocity abuse, balance mismatches

---

# 19. Rent Request Pipeline (End-to-End)

## 19.1 The 6-Stage Pipeline

```
Stage 1: TENANT OPS REVIEW
  ↓ Tenant submits request
  ↓ Tenant Ops validates: tenant details, property chain, landlord info
  ↓ Quick Approve → status: 'tenant_ops_approved'
  ↓ Reject → status: 'rejected' (with reason)

Stage 2: AGENT OPS REVIEW
  ↓ Agent Ops validates: agent assignment, GPS, field verification
  ↓ Quick Approve → status: 'agent_ops_approved'

Stage 3: LANDLORD OPS REVIEW
  ↓ Landlord Ops validates: landlord details, property chain, budget matching
  ↓ Quick Approve → status: 'landlord_ops_approved'

Stage 4: COO REVIEW
  ↓ COO validates: operational capacity, strategic fit
  ↓ Quick Approve → status: 'coo_approved'

Stage 5: CFO APPROVAL (ATOMIC)
  ↓ CFO executes final approval:
    - Credits agent landlord float (bridge scope)
    - Records ledger entry
    - Issues agent UGX 5,000 bonus
    - Status → 'funded'
  ↓ This is an ATOMIC backend operation

Stage 6: AGENT DELIVERY
  ↓ Agent sees funded request in Landlord Float wallet
  ↓ Agent pays landlord externally
  ↓ Agent submits proof (GPS + receipt + TID)
  ↓ Financial Ops verifies
  ↓ Status → 'delivered'
```

## 19.2 Rejection at Any Stage

```
Reviewer rejects with mandatory reason
    ↓
Status → 'rejected'
    ↓
Tenant Ops can review and potentially re-submit
```

## 19.3 Review Interface Shows

- Daily repayment amount calculation
- Assigned agent contact info
- Property GPS with Google Maps link
- LC1 chairperson details
- Approval history timeline

## 19.4 Repayment Accounting (Triple-Synchronized)

```
Repayment received (auto-deduction, debt clearance, or pre-payment)
    ↓
record_rent_request_repayment RPC:
  1. Updates rent_requests.amount_repaid
  2. Updates landlords table (receivables)
  3. Creates general_ledger entry
    ↓
Repayment hierarchy:
  1. Outstanding rent
  2. Accumulated debt
  3. Future daily installments (advances next_charge_date)
    ↓
Agent earns 10% commission split (via credit_agent_rent_commission RPC):
  - Source Agent: 2% of repayment amount
  - Tenant Manager: 8% (or 6% if recruiter exists)
  - Recruiter Override: 2% (if recruiter exists, from manager's share)
  Platform records cash_out/marketing_expense (platform scope) + cash_in/agent_commission (wallet scope)
    ↓
If RPC fails → deductions reversed
```

## 19.5 Fund Routing Fallback

```
auto_route_rent_funds logic:
    ↓
1. Landlord wallet (matched by phone) → preferred
2. Caretaker wallet (if landlord missing) → fallback
3. Agent wallet (property verifier) → final fallback for cash-out
```

## 19.6 Backend

- **`approve-rent-request`**: Multi-stage approval handler
- **`delete-rent-request`**: Cancel/delete request
- **`fund-tenant-from-pool`**: Deploy pool funds
- **`fund-tenants`**: Batch funding
- **`disburse-rent-to-landlord`**: Record landlord payout
- **`fund-agent-landlord-float`**: CFO funds agent float

---

# 20. Wallet System

## 20.1 Core Architecture

```
Every user has a wallet record (wallets table)
    ↓
Balance is DERIVED from ledger (never edited directly)
    ↓
sync_wallet_from_ledger trigger updates wallet on ledger entry
  - ONLY fires when transaction_group_id IS NOT NULL
  - This trigger is the SOLE WRITER for wallet balances (Trigger-Only Policy, v5.0)
    ↓
CHECK constraint: balance >= 0
    ↓
GREATEST(balance - amount, 0) prevents underflow
    ↓
Float-related categories excluded from personal wallet sync
```

### ⚠️ Trigger-Only Wallet Policy (v5.0)

**CRITICAL RULE**: The `sync_wallet_from_ledger` trigger is the **sole writer** for `wallets.balance`. All edge functions are **strictly forbidden** from manually updating wallet balances (e.g., `.update({ balance: currentBalance - amount })`).

**Why**: Manual wallet updates combined with ledger inserts (which fire the trigger) cause **double-deduction/credit bugs** — the balance changes twice for a single operation. This was identified and fixed in `approve-deposit` (v4.x) and `agent-deposit` (v5.0).

**Pattern for edge functions:**
```typescript
// ✅ CORRECT: Only insert ledger entry — trigger handles wallet
await supabase.from('general_ledger').insert({
  user_id, amount, direction: 'cash_out', category: '...',
  transaction_group_id: crypto.randomUUID()
});

// ❌ FORBIDDEN: Manual wallet update (causes double-deduction)
await supabase.from('wallets').update({ balance: current - amount });
```

**Wallet creation**: Use `ensureWalletExists()` pattern — `upsert` with `ignoreDuplicates: true` to ensure wallet row exists without touching balance.

## 20.2 Wallet UI (`src/components/wallet/`)

### UI Design: Wallet Interface
- **Wallet Card**: Glassmorphism card with animated balance counter
- **Action Buttons**: Circular icon buttons (Deposit, Transfer, Withdraw, Pay)
- **Statement**: Scrollable list with direction/category filters
- **Full-Screen Sheet**: `FullScreenWalletSheet.tsx` — Full-screen wallet experience
- **Floating Button**: `FloatingWalletButton.tsx` — Persistent wallet access FAB

| Component | Purpose |
|-----------|---------|
| `WalletCard.tsx` | Main wallet display card |
| `CollapsibleWalletCard.tsx` | Collapsible wallet card |
| `AnimatedBalance.tsx` | Animated balance counter |
| `FullScreenWalletSheet.tsx` | Full-screen wallet sheet |
| `FloatingWalletButton.tsx` | Persistent wallet access FAB |
| `WalletStatement.tsx` | Transaction statement with filters |
| `WalletLedgerStatement.tsx` | Ledger-backed statement |
| `WalletBreakdown.tsx` | Balance breakdown by category |
| `WalletDisclaimer.tsx` | Wallet terms disclaimer |
| `LedgerEntryDetailDrawer.tsx` | Ledger entry detail drawer |
| `TransactionReceipt.tsx` | Transaction receipt |
| `RecentBalanceChanges.tsx` | Recent balance changes |
| `RecentAutoCharges.tsx` | Recent auto-charge deductions |

### Financial Service Components
| Component | Purpose |
|-----------|---------|
| `DepositDialog.tsx` | Deposit funds (MoMo/Bank/Agent Cash) |
| `SendMoneyDialog.tsx` | Send money to another user |
| `WithdrawRequestDialog.tsx` | Request withdrawal |
| `WithdrawalStepTracker.tsx` | Withdrawal progress tracker |
| `RequestMoneyDialog.tsx` | Request money from another user |
| `PayLandlordDialog.tsx` | Pay landlord directly |
| `BillPaymentDialog.tsx` | Bill payment |
| `FoodMarketDialog.tsx` | Food market purchase |
| `PendingRequestsDialog.tsx` | View pending requests |
| `UserDepositRequests.tsx` | User's deposit history |
| `UserWithdrawalRequests.tsx` | User's withdrawal history |
| `ProxyPartnerFunds.tsx` | Proxy partner ROI delivery tab (Proxy Partners wallet tab) |
| `AgentRentRequestsWalletSection.tsx` | Rent requests in wallet context |
| `MyReferralsCount.tsx` | Referral count display |

### Wallet Statement Features
- **Direction Filters**: 💰 Money In / 📤 Money Out
- **Category Chips**: Filter by transaction type with counts
- **Plain English Explanations**: Every transaction has a human-readable description
  - e.g., "Your daily rent installment was automatically deducted from your wallet"
- **Date Grouping**: Transactions grouped by day
- **Clear Filter**: Reset all filters

### Financial Services

| Service | Flow |
|---------|------|
| **Deposit** | Choose channel (MoMo/Bank/Agent Cash) → Enter amount → Submit TID → Pending approval |
| **Transfer** | Search recipient → Enter amount → Optimistic lock check → Atomic debit/credit |
| **Withdrawal** | Select payout method → Enter amount → Single-step Financial Ops approval (TID/receipt/bank ref required) |

### Deposit Channels
- **Mobile Money**: TID mandatory, provider selection (MTN, Airtel), Merchant Codes: 090777/4380664
- **Bank Transfer**: Reference number mandatory (Equity Bank)
- **Agent Cash**: Receipt auto-prefixed with 'RCT'

### Withdrawal Constraints
- Working hours restriction
- Minimum balance requirement
- Amount slider + quick-payout chips

## 20.3 Specialized Wallets

| Wallet Type | Purpose |
|-------------|---------|
| **Personal Wallet** | User's liquid funds |
| **Landlord Float** | Agent's escrow for landlord payments (separate from personal) |
| **Rent Management Pool** | Collective supporter capital |

## 20.4 Ledger Scope Isolation

| Scope | Visibility | Purpose |
|-------|-----------|---------|
| `wallet` | Users see | Personal fund movements |
| `platform` | Staff only | Internal operations |
| `bridge` | Both | Capital inflows, disbursements |

## 20.5 Financial Safety

| Rule | Enforcement |
|------|-------------|
| Optimistic locking | Balance checked before deduction |
| 60-second cooldown | Prevents rapid-fire financial operations |
| Non-negative balances | CHECK constraint + trigger + app-level check |
| Rollback on failure | Balances restored if subsequent operations fail |
| Direct edits blocked | RLS denies client-side UPDATE on wallets |

## 20.6 Backend Edge Functions

- **`wallet-transfer`**: Peer-to-peer transfer
- **`agent-deposit`**: Agent deposit processing
- **`agent-withdrawal`**: Agent withdrawal
- **`approve-deposit`**: Deposit approval (with auto rent repayment)
- **`approve-wallet-operation`**: Generic approval (with auto rent repayment on deposit)
- **`reject-withdrawal`**: Rejection with reason
- **`cfo-direct-credit`**: CFO manual credit
- **`manual-collect-rent`**: Tenant Ops manual collection with mandatory reason
- **`wallet-deduction`**: Financial Ops wallet deduction (mandatory reason, creates ledger + audit entries)
- **`seed-test-funds`**: Test environment seeding

---

# 21. Ledger & Accounting Engine

## 21.1 Core Ledger Tables

| Table | Purpose |
|-------|---------|
| `ledger_accounts` | Account definitions (USER_OWNED, OBLIGATION, SYSTEM_CONTROL, REVENUE, EXPENSE, SETTLEMENT) |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Individual debit/credit entries (append-only) |
| `transaction_approvals` | Multi-level approval records |
| `general_ledger` | Central ledger for all financial events |

## 21.2 Double-Entry Rules

- Every financial action creates matching debit AND credit entries
- Entries are APPEND-ONLY (never edited or deleted)
- Corrections via new reversing entries only
- All entries assigned `ledger_scope` via `auto_assign_ledger_scope` trigger
- Revenue recognized only when service obligation fulfilled (no upfront recognition)

## 21.3 Six Specialized Ledgers

### 1. Suspense Ledger
- Holds unmatched/unreconciled funds
- Auto-populated when deposits can't be matched
- Resolution workflow for clearing suspense items

### 2. Default & Recovery Ledger
- Tracks tenant defaults
- Records recovery actions and partial payments
- Default rate calculation

### 3. Supporter Capital Ledger
- Manages supporter fund lifecycle
- Tracks: deposits, deployments, returns, withdrawals
- Capital utilization metrics

### 4. Commission Accrual Ledger
- Agent commission lifecycle
- Stages: earned → accrued → approved → paid
- Accrual vs. cash basis tracking

### 5. Fee Revenue Ledger
- Platform income tracking
- Categories: access fees, request fees, service income
- Revenue recognition timing

### 6. Settlement & Reconciliation Ledger
- External provider matching
- Channel balance verification
- MoMo/Bank statement reconciliation

## 21.4 Financial Statements

| Statement | Route | Component | Purpose |
|-----------|-------|-----------|---------|
| Income Statement | `/financial-statement` | `IncomeStatementView.tsx` | Revenue vs. expenses |
| Cash Flow Statement | `/financial-statement` | `CashFlowView.tsx` | Cash movement analysis |
| Balance Sheet | `/financial-statement` | `BalanceSheetView.tsx` | Assets, obligations, equity |
| Facilitated Volume | `/financial-statement` | `FacilitatedVolumeView.tsx` | Rent volume metrics |
| Revenue Chart | — | `RevenueChart.tsx` | Revenue visualization |

## 21.5 Transaction Categories

### Cash In
| Category | Description |
|----------|-------------|
| `tenant_access_fee` | One-time tenant onboarding fee |
| `tenant_request_fee` | Per-request processing fee |
| `rent_repayment` | Daily rent installment |
| `supporter_facilitation_capital` | Supporter pool contribution |
| `agent_remittance` | Agent cash remittance |
| `platform_service_income` | Miscellaneous platform revenue |
| `wallet_deposit` | Generic wallet deposit |
| `agent_commission` | Agent commission credit |
| `referral_bonus` | Referral reward |
| `pending_portfolio_topup` | Queued portfolio top-up |
| `angel_pool_commission` | Agent commission for Angel Pool investment facilitation (1%) |
| `balance_correction` | Reversal of double-deduction or other balance correction |

### Cash Out
| Category | Description |
|----------|-------------|
| `rent_facilitation_payout` | Landlord rent disbursement |
| `supporter_platform_rewards` | Monthly supporter rewards |
| `agent_commission_payout` | Agent commission payment |
| `transaction_platform_expenses` | Processing costs |
| `operational_expenses` | General operations |
| `wallet_to_investment` | Portfolio deployment |
| `rent_float_funding` | Agent landlord float funding |
| `landlord_float_payout` | Landlord payout from float |
| `coo_proxy_investment` | COO proxy investment for partner |
| `pool_rent_deployment` | Pool deployment to tenant |
| `wallet_transfer` | Peer-to-peer transfer |
| `marketing_expense` | Agent commissions & bonuses as platform marketing cost |
| `withdrawal_pending` | Wallet pre-deduction at withdrawal request time |
| `withdrawal_reversal` | Refund of pre-deducted funds on withdrawal rejection |
| `proxy_partner_withdrawal` | Proxy partner ROI withdrawal for delivery |
| `rent_principal_collected` | Proportional rent principal from collection |
| `access_fee_collected` | Proportional access fee from collection |
| `registration_fee_collected` | Proportional registration fee from collection |

## 21.6 Key Database Triggers

| Trigger | Purpose |
|---------|---------|
| `sync_wallet_from_ledger` | **SOLE WRITER** for wallet balances. Auto-sync from ledger entries (only when `transaction_group_id` is set). Edge functions MUST NOT manually update wallets. |
| `sync_collection_to_ledger` | Proportional revenue recognition: splits daily collections into `rent_principal_collected`, `access_fee_collected`, `registration_fee_collected` based on rent request fee ratios |
| `auto_assign_ledger_scope` / `set_ledger_scope()` | Classify entries as wallet/platform/bridge. Routes `marketing_expense` → `platform` scope automatically. Routes float categories to `bridge` scope |
| `trg_enforce_property_chain` | Blocks incomplete property chains |
| `trg_auto_assign_landlord_on_rent_request` | Auto-assigns landlord |

### `set_ledger_scope()` Routing Logic

```sql
IF category IN ('rent_float_funding','landlord_float_payout','agent_advance_*') THEN
  scope = 'bridge'
ELSIF category = 'marketing_expense' THEN
  scope = 'platform'
ELSIF ledger_scope IS NULL THEN
  scope = 'wallet'  -- default
END IF;
```

## 21.7 Key RPCs

| Function | Purpose |
|----------|---------|
| `record_rent_request_repayment()` | Atomic repayment: updates rent_requests.amount_repaid, landlords receivables, creates general_ledger entry. Accepts optional `transaction_group_id`. |
| `credit_agent_rent_commission()` | Credits 10% commission split with paired double-entry per agent role. Idempotent via `rent_request_id` + `repayment_amount` check. |
| `credit_agent_event_bonus()` | Credits flat-fee event bonuses with double-entry marketing expense pattern. |
| `credit_proxy_approval()` | Idempotent proxy partner ROI credit with MD5-based deterministic UUID. Prevents duplicate credits on re-approval. |

## 21.8 Ledger Account Hierarchy

| Group | Purpose | Allow Negative? |
|-------|---------|----------------|
| USER_OWNED | User wallets | No |
| OBLIGATION | Debts/commitments | Yes |
| SYSTEM_CONTROL | Buffer/escrow | Varies |
| REVENUE | Deferred/recognized | No |
| EXPENSE | Costs/rewards | No |
| SETTLEMENT | Banking operations | Varies |

---

# 22. Property & Housing

## 22.1 Welile Homes (Daily Rent Marketplace)

### Listing Flow
```
Agent in field
    ↓
Registers property:
  - GPS coordinates (mandatory)
  - Photos (HouseImageUploader)
  - Monthly rent amount
  - Landlord details
  - LC1 Chairperson details (must match village)
    ↓
Listing appears on /find-a-house immediately
    ↓
Badge: "Pending Verification" or "Verified"
    ↓
Landlord Ops Manager reviews:
  - Approve → listing stays active
  - Reject → status set to 'rejected' with mandatory reason (≥10 chars)
    ↓
Rejected listings pushed back to agent dashboard with red indicator
    ↓
Agent can fix issues and "Relist" (status → 'available')
    ↓
Discovery: PostGIS spatial indexing (GIST) for proximity
    ↓
Leaflet map with MarkerCluster for dense areas
```

### Property Chain (Enforced)
```
Agent → Landlord → Property → Tenant
    ↓
Missing any link → blocked by trg_enforce_property_chain
```

## 22.2 UI Pages

| Route | Purpose |
|-------|---------|
| `/find-a-house` | Map-based property discovery |
| `/house/:id` | Property detail with photos, daily rate |
| `/welile-homes` | Property management |
| `/welile-homes-dashboard` | Welile Homes analytics |
| `/share-location` | GPS sharing for verification |
| `/landlord-welile-homes` | Landlord property view |

## 22.3 UI Components

- `src/components/house/` — Property cards, detail views, image gallery
- `src/components/welile-homes/` — Welile Homes specific components
- `src/components/map/` — Map integration (Leaflet + MarkerCluster)
- `src/components/viewing/ViewingCheckinCard.tsx` — GPS check-in for viewings
- `src/components/verification/VerifyLandlordButton.tsx` — Landlord verification
- `src/components/verification/VerifyTenantButton.tsx` — Tenant verification

## 22.4 Backend

- **`vacancy-alerts`**: Notify agents of vacancies
- **`verify-viewing-checkin`**: GPS check-in verification
- **`viewing-confirmation-sms`**: SMS after property viewing
- **`og-house`**: Open Graph meta for property sharing

---

# 23. Marketplace & E-Commerce

## 23.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/marketplace` | Product browsing |
| `/categories` | Category browsing |
| `/flash-sales` | Time-limited deals |
| `/shop-entry` | Shop entry point |
| `/wishlist` | Saved products |
| `/order-history` | Past orders |
| `/seller/:id` | Seller profile |

## 23.2 Components

- `MarketplaceSection.tsx` — Main marketplace layout
- `ProductCard.tsx` — Product display
- `ProductDetailDialog.tsx` — Full product view
- `CartDrawer.tsx` — Shopping cart
- `CategoryCarousel.tsx` / `CategoryManager.tsx` — Category browsing
- `FlashSaleCountdown.tsx` — Sale timer
- `AddProductDialog.tsx` / `EditProductDialog.tsx` — Product management
- `AgentProductsSection.tsx` — Agent's product listings

## 23.3 Backend

- **`product-purchase`**: Process marketplace purchase
- **`vendor-mark-receipt`**: Mark vendor receipt

---

# 24. Chat & Messaging

## 24.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/chat` | Chat interface |
| `/chat-invite` | Chat invitation links |

## 24.2 Components

- `ChatDrawer.tsx` — Main chat interface
- `ChatWindow.tsx` — Message thread
- `ChatList.tsx` — Conversation list
- `ChatButton.tsx` / `FloatingChatButton.tsx` — Chat access buttons
- `NewChatSearch.tsx` — Start new conversation
- `MessageReactions.tsx` — Emoji reactions
- `TypingIndicator.tsx` — Typing status
- `ReadReceipt.tsx` — Message read status
- `BroadcastMessageDialog.tsx` — Mass messaging
- `WhatsAppRequestButton.tsx` — WhatsApp integration

---

# 25. AI Assistant

## 25.1 Components

- `WelileAIChatButton.tsx` — AI chat trigger
- `WelileAIChatDrawer.tsx` — AI chat interface
- `EarningPredictionCard.tsx` — AI earning predictions

## 25.2 AI-Powered Features (Manager Dashboard)

- `AIBrainDashboard.tsx` — AI-powered insights dashboard
- `AIRecommendationCard.tsx` — AI action recommendations
- `AISessionHistory.tsx` — AI interaction history
- `AIUserExperienceReport.tsx` — AI-generated UX report

## 25.3 Backend

- **`welile-ai-chat`**: AI-powered assistant using Lovable AI models
- Conversation history stored in `ai_chat_messages` table
- Context-aware responses based on user role and data

---

# 26. Receipts & QR Scanning

## 26.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/my-receipts` | Receipt history |

## 26.2 Components

- `QuickReceiptForm.tsx` — Quick receipt entry
- `QRScanner.tsx` — QR code scanning (html5-qrcode)
- `ReceiptStatusTimeline.tsx` — Receipt processing status
- `DashboardReceiptPrompt.tsx` — Dashboard receipt prompt

## 26.3 Backend

- **`scan-receipt`**: OCR receipt scanning via AI

---

# 27. Loans & Credit System

## 27.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/my-loans` | Loan status and management |

## 27.2 Components

| Component | Purpose |
|-----------|---------|
| `LoanProductsSection.tsx` | Available loan products |
| `LoanProductCard.tsx` | Individual loan display |
| `AgentLoanProducts.tsx` | Agent-specific loan products |
| `CreateLoanProductDialog.tsx` | Create new loan product (admin) |
| `FoodShoppingLoansSection.tsx` | Food/shopping micro-loans |
| `CreditAccessCard.tsx` / `CreditAccessDrawSheet.tsx` | Credit limit display |
| `CreditRequestSheet.tsx` | Credit request submission |
| `LoanProgressWidget.tsx` | Progress tracking |

## 27.3 Backend

- **`approve-loan-application`**: Loan approval processing
- **`process-credit-daily-charges`**: Daily credit charges
- **`process-credit-draw`**: Credit drawdown
- **`batch-recalculate-credit-limits`**: Recalculate all limits

---

# 28. Referral & Gamification

## 28.1 Components

- `ReferralLeaderboard.tsx` — Top referrers ranking
- `ReferralStatsCard.tsx` — Personal referral stats
- `RewardHistoryBadges.tsx` — Earned badges display
- `AchievementBadges.tsx` — Achievement system
- `ShareableAchievementCard.tsx` — Shareable achievements
- `PaymentStreakCalendar.tsx` — Payment streak visualization
- `Confetti.tsx` — Celebration animation

## 28.2 Gamification Features

- **Collection Streaks**: Consecutive collection days → multiplier (up to 1.20x)
- **Badges**: Performance-based badges stored in `agent_collection_streaks.badges`
- **Leaderboards**: Referral, collection, ROI rankings
- **Achievement Cards**: Shareable social cards for milestones

---

# 29. Notifications & Realtime

## 29.1 Realtime Channels (Supabase Realtime)

**Enabled for (trimmed to 3 tables for scale):**
- `messages` — Chat messages
- `wallets` — Balance updates
- `force_refresh_signals` — Cache invalidation

**Disabled for (security + performance):**
- Wallet balances (direct), Financial transactions, Profiles, notifications, deposit_requests, and 14 other tables removed for ~80% broadcast overhead reduction

## 29.2 Notification Types

- Rent payment reminders
- Approval status updates
- Commission earned alerts
- System announcements
- Investment activation notices
- Partner investment approvals
- Viewing confirmations
- Vacancy alerts

## 29.3 Communication Channels

| Channel | Edge Function |
|---------|--------------|
| SMS | `send-collection-sms`, `rent-reminders`, `payment-reminder`, `sms-otp`, `viewing-confirmation-sms` |
| Push | `send-push-notification` |
| WhatsApp | `whatsapp-login-link` |
| Email | `send-supporter-agreement-email`, `auth-email-hook` |

## 29.4 UI Components

- `NotificationBell.tsx` / `NotificationsModal.tsx` — In-app notifications
- `SupporterNotificationsFeed.tsx` — Supporter-specific feed
- `WhatsNewModal.tsx` — Feature announcements
- `ConnectionStatus.tsx` — Connection state indicator
- `OfflineBanner.tsx` — Offline warning

---

# 30. Settings & Profile

## 30.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/settings` | User settings |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

## 30.2 Components

### Profile Management
- `src/components/profile/` — Profile editing, avatar upload
- `UserAvatar.tsx` — Avatar display

### Settings
- `src/components/settings/` — Settings panels
- `ThemeToggle.tsx` / `AnimatedThemeToggle.tsx` — Dark/light mode
- `HighContrastToggle.tsx` — Accessibility contrast
- `LanguageSwitcher.tsx` / `LocaleSwitcher.tsx` — Language selection
- `CurrencyConverter.tsx` / `CurrencySwitcher.tsx` — Currency preferences
- `GlobalSettingsToolbar.tsx` — Floating settings toolbar

---

# 31. Vendor Portal

## 31.1 Route: `/vendor-portal`

- **`vendor-login`**: Vendor authentication
- **`vendor-mark-receipt`**: Mark receipt as processed
- `VendorAnalytics.tsx` — Vendor performance tracking

---

# 32. PWA & Offline

## 32.1 Progressive Web App

- Service Worker via `vite-plugin-pwa`
- App name: **Welile.com** on all devices
- Install prompts: `PWAInstallPrompt.tsx`, `AdaptiveInstallGuide.tsx`, `IOSInstallGuide.tsx`
- iOS optimizations: `IOSOptimizations.tsx`, `IOSLinkHandler.tsx`, `IOSShareReceiver.tsx`
- Pull to refresh: `PullToRefresh.tsx`
- Location permission gate: `LocationPermissionGate.tsx`
- Manifests: `manifest.webmanifest`, `manifest.json`, `manager-manifest.json` — all name/short_name set to "Welile.com"
- iOS meta: `apple-mobile-web-app-title` dynamically set via `useManagerPWAInstall.ts`

## 32.2 Offline Strategy

| Data Type | Strategy | Cached Locally? |
|-----------|----------|----------------|
| Financial data | Network-first | ❌ Never |
| Profile/UI data | Offline-first | ✅ IndexedDB + localStorage |
| Notifications | Realtime | ✅ Temporary |

**Offline Queue**: Non-financial actions stored locally → background sync → server validation → UI update

## 32.3 Error Handling

- `ChunkErrorBoundary.tsx` — Lazy-load error recovery
- `ConnectionStatus.tsx` — Network state monitoring
- `OfflineBanner.tsx` — Offline notification
- `ScrollToTopButton.tsx` — Scroll-to-top FAB

---

# 33. Angel Pool Investment System

## 33.1 Route: `/angel-pool`

### UI Design: Angel Pool
- **Layout**: Investment-focused with hero card
- **Hero**: `AngelHeroCard.tsx` — Pool stats with progress bar
- **Calculator**: ROI/share calculator
- **Activity Feed**: Investment history

## 33.2 Components

| Component | Purpose |
|-----------|---------|
| `AngelPoolDashboard.tsx` | Main Angel Pool view |
| `AngelHeroCard.tsx` | Pool overview hero card |
| `AngelCalculator.tsx` | Share/ROI calculator |
| `AngelActivityFeed.tsx` | Investment activity feed |
| `AngelInvestorCard.tsx` | Individual investor card |
| `CapitalOpportunityEntry.tsx` | Investment entry point |
| `InvestmentSelectionSheet.tsx` | Investment amount selection |
| `AngelPoolManagementPanel.tsx` | CEO/CFO management panel |
| Agreement components | `src/components/angel-pool/agreement/` |

## 33.3 Pool Configuration (Stored in `angel_pool_config`)

| Parameter | Default |
|-----------|---------|
| Total shares | 25,000 |
| Price per share | UGX 20,000 |
| Pool equity | 8% |
| Total pool target | UGX 500M |

## 33.4 Investment Flow

```
Investor selects share count
    ↓
angel-pool-invest Edge Function:
  1. Validates wallet balance
  2. Checks remaining capacity (max 25,000 total shares)
  3. Records shares in angel_pool_investments
  4. Creates cash_out ledger entry
    ↓
Ownership calculation:
  - Pool % = (shares / 25,000) * 100
  - Company % = (shares / 25,000) * 8
```

## 33.5 Management (CEO Exclusive)

- Modify pool configuration (total shares, price, equity %)
- Manage shareholders (delete, suspend, edit shares)
- Audit-logged dialogs requiring mandatory 10-character reason
- Real-time KPI metrics and shareholder distribution charts
- Sortable/exportable shareholder list

---

# 34. Edge Functions (Backend Logic)

## 34.1 Complete Function Registry

### Authentication & Identity
| Function | Purpose |
|----------|---------|
| `auth-email-hook` | Custom auth email templates |
| `otp-login` | OTP verification |
| `sms-otp` | Send SMS OTP |
| `whatsapp-login-link` | WhatsApp magic link |
| `admin-reset-password` | Staff password reset |
| `password-reset-sms` | SMS password recovery |
| `vendor-login` | Vendor portal authentication |
| `provision-staff-passwords` | Bulk staff password provisioning |
| `bulk-password-reset` | Mass password reset |
| `diagnose-auth` | Auth diagnostics utility |

### User Management
| Function | Purpose |
|----------|---------|
| `register-tenant` | Tenant registration |
| `register-employee` | Staff registration |
| `register-proxy-funder` | Register funder via proxy agent/manager |
| `delete-user` | User deletion with audit |
| `transfer-tenant` | Agent-to-agent tenant transfer |
| `user-snapshot` | Generate user data snapshot |

### Financial - Deposits & Withdrawals
| Function | Purpose |
|----------|---------|
| `agent-deposit` | Process agent deposit |
| `agent-withdrawal` | Process agent withdrawal |
| `approve-deposit` | Approve pending deposit (with auto rent repayment) |
| `approve-wallet-operation` | Generic wallet operation approval (with auto rent repayment) |
| `reject-withdrawal` | Reject withdrawal with reason |
| `wallet-transfer` | Peer-to-peer transfer (ledger-only, no direct wallet updates) |
| `cfo-direct-credit` | CFO manual credit |
| `manual-collect-rent` | Tenant Ops manual collection (mandatory reason) |
| `wallet-deduction` | Financial Ops wallet deduction (mandatory reason) |

### Financial - Rent Operations
| Function | Purpose |
|----------|---------|
| `approve-rent-request` | Multi-stage rent approval |
| `delete-rent-request` | Cancel rent request |
| `fund-rent-pool` | Wallet → Pool |
| `fund-tenant-from-pool` | Pool → Approved request |
| `fund-tenants` | Batch tenant funding |
| `disburse-rent-to-landlord` | Record landlord payment |
| `fund-agent-landlord-float` | CFO funds agent float |
| `auto-charge-wallets` | Daily rent auto-deductions (06:00 UTC cron) |
| `check-repayment-status` | Repayment validation |
| `retry-no-smartphone-charges` | Retry failed charges for non-smartphone users |
| `tenant-pay-rent` | Direct tenant wallet-to-rent payment |

### Financial - Investments
| Function | Purpose |
|----------|---------|
| `create-investor-portfolio` | New portfolio |
| `portfolio-topup` | Add to portfolio |
| `manager-portfolio-topup` | Manager-initiated topup |
| `coo-wallet-to-portfolio` | COO wallet-to-portfolio direct transfer |
| `apply-pending-topups` | Process queued portfolio topups |
| `agent-invest-for-partner` | Agent proxy investment |
| `coo-invest-for-partner` | COO proxy investment |
| `activate-supporter` | Supporter activation |
| `create-supporter-invite` | Generate invite |
| `register-proxy-funder` | Register funder via proxy |
| `supporter-account-action` | Account management |
| `angel-pool-invest` | Angel Pool share investment |
| `agent-angel-pool-invest` | Agent-facilitated Angel Pool investment (1% agent commission) |

### HR Operations
| Function | Purpose |
|----------|---------|
| `hr-approve-leave` | Approve/reject leave requests |
| `hr-issue-disciplinary` | Issue disciplinary records |
| `hr-submit-payroll` | Submit and process payroll batches |

### Financial - Rewards & Processing
| Function | Purpose |
|----------|---------|
| `process-monthly-rewards` | Monthly supporter rewards |
| `process-supporter-roi` | ROI calculation |
| `process-investment-interest` | Interest processing |
| `approve-listing-bonus` | Listing bonus approval |
| `credit-listing-bonus` | Award listing bonus |
| `credit-landlord-registration-bonus` | Landlord reg bonus |
| `credit-landlord-verification-bonus` | Verification bonus |

### Financial - Platform Operations
| Function | Purpose |
|----------|---------|
| `platform-expense-transfer` | Expense disbursement |
| `batch-process-financials` | Bulk operations |
| `process-agent-advance-deductions` | Advance repayments |
| `process-credit-daily-charges` | Credit line charges |
| `process-credit-draw` | Credit drawdown |
| `batch-recalculate-credit-limits` | Recalculate limits |
| `refresh-daily-stats` | Snapshot refresh |
| `seed-test-funds` | Test data |
| `notify-managers` | Fire-and-forget manager notification hub |

### Communications
| Function | Purpose |
|----------|---------|
| `send-collection-sms` | Collection confirmation SMS |
| `send-push-notification` | Push notifications |
| `send-supporter-agreement-email` | Legal agreement email |
| `send-funder-statement` | Funder portfolio statement |
| `rent-reminders` | Rent due reminders |
| `payment-reminder` | Payment reminders |
| `notify-watchers` | Watchlist notifications |
| `viewing-confirmation-sms` | Property viewing SMS |
| `vacancy-alerts` | Vacancy notifications |

### Utilities & Integrations
| Function | Purpose |
|----------|---------|
| `scan-receipt` | OCR receipt scanning |
| `export-database` | Data export |
| `import-partners` | Bulk partner import (up to 200/batch) |
| `validate-payload` | Input validation |
| `welile-ai-chat` | AI assistant |
| `ussd-callback` | USSD integration |
| `partner-ops-automation` | Partner automation (maturity alerts, renewals) |
| `product-purchase` | Marketplace purchase |
| `vendor-mark-receipt` | Vendor receipt marking |
| `approve-loan-application` | Loan approval |
| `verify-viewing-checkin` | GPS check-in |
| `og-house` | Open Graph meta for property sharing |

---

# 35. Security & RLS

## 35.1 Row-Level Security

- **All tables** have RLS enabled
- Users can only read/write their own data
- `has_role()` SECURITY DEFINER function for role checks (avoids RLS recursion)
- Service-role access for Edge Functions on critical operations
- `search_path = public` on critical functions to prevent hijacking

## 35.2 Financial Security

| Rule | Enforcement |
|------|-------------|
| No direct wallet edits | RLS denies client-side UPDATE on wallets |
| No direct ledger writes | Only service-role Edge Functions can write |
| Optimistic locking | Balance checked before deduction |
| 60-second cooldown | Prevents rapid-fire financial operations |
| Non-negative balances | CHECK constraint + trigger + app-level check |
| Rollback on failure | Balances restored if subsequent operations fail |

## 35.3 Access Isolation

| Role | Can See | Cannot See |
|------|---------|------------|
| Tenant | Own rent status, payment schedule | Other users, platform internals |
| Agent | Own registrations, earnings, zone | Other agents' data, financial ledgers |
| Supporter | Virtual houses, portfolio, payment health | Tenant/landlord/agent identities |
| Manager | Flows, queues, risk, solvency | Editable balances |
| Executive | Role-specific dashboards | Cross-role data (enforced by RoleGuard) |

## 35.4 Administrative Permissions

| Action | Allowed Roles |
|--------|---------------|
| Role assignment | super_admin, manager, cto |
| Ops department mapping | super_admin, manager, cto |
| Account freezing/deletion | super_admin, manager, cto, coo |
| Deposit approval/rejection | manager, coo, cfo, super_admin, operations |
| Portfolio admin actions | coo, manager |
| Manual rent collection | operations (tenant_ops) |
| Wallet-to-portfolio transfer | coo, manager, super_admin |
| Angel Pool config | ceo |

## 35.5 Audit Trail

- All admin actions logged to `audit_logs`
- Mandatory 10-character audit reason
- Immutable append-only log
- Viewable via Audit Log Viewer (`/audit-log`)
- Role change history via `RoleHistoryViewer`

---

# 36. Database Schema Overview

## 36.1 Core Tables

### User & Identity
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (name, phone, email, avatar, territory, is_frozen, has_smartphone) |
| `user_roles` | Role assignments (separate from profiles) |
| `wallets` | User wallet balances (derived from ledger) |
| `role_access_requests` | Pending role upgrade requests |

### Financial Core
| Table | Purpose |
|-------|---------|
| `general_ledger` | Central financial event log (with ledger_scope) |
| `ledger_accounts` | Account definitions |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Double-entry debit/credit records |
| `transaction_approvals` | Multi-level approvals |
| `pending_wallet_operations` | Queued operations awaiting approval |
| `pre_registered_tids` | Pre-registered transaction IDs for auto-matching |
| `deposit_requests` | Deposit request processing |
| `wallet_transactions` | Peer-to-peer transfer records |

### Investment
| Table | Purpose |
|-------|---------|
| `investor_portfolios` | Investment portfolio records |
| `portfolio_renewals` | Portfolio renewal history |
| `supporter_roi_payments` | ROI distribution history |
| `supporter_invites` | Invitation lifecycle & activation tokens |
| `investment_withdrawal_requests` | Capital exit with 90-day cooldown |
| `partner_escalations` | System-generated partner alerts |
| `angel_pool_config` | Angel Pool configuration |
| `angel_pool_investments` | Angel Pool share records |

### Rent System
| Table | Purpose |
|-------|---------|
| `rent_requests` | Rent facilitation requests (6-stage pipeline) |
| `repayments` | Individual repayment records |
| `landlords` | Landlord records with receivables |
| `disbursement_records` | Disbursement tracking |
| `subscription_charges` | Auto-charge subscription records |

### Agent Operations
| Table | Purpose |
|-------|---------|
| `agent_collections` | Rent collection records |
| `agent_visits` | GPS check-in records |
| `agent_earnings` | Earnings log |
| `agent_commission_payouts` | Commission payout requests |
| `agent_float_limits` | Float allocation & usage |
| `agent_landlord_float` | Landlord float balances |
| `agent_float_withdrawals` | Float withdrawal records |
| `agent_float_funding` | Float funding history |
| `agent_landlord_payouts` | Landlord payout records |
| `agent_landlord_assignments` | Agent-landlord links |
| `agent_delivery_confirmations` | Delivery proof |
| `agent_tasks` | Assigned tasks |
| `agent_escalations` | Escalation tickets |
| `agent_goals` | Monthly targets |
| `agent_receipts` | Payment receipts |
| `agent_rebalance_records` | Float rebalancing |
| `agent_collection_streaks` | Gamification streaks |
| `agent_incentive_bonuses` | Bonus records |
| `agent_advances` | Cash advances |
| `agent_advance_ledger` | Advance repayment tracking |
| `agent_advance_topups` | Advance topups |
| `agent_subagents` | Sub-agent relationships |
| `service_centre_setups` | Service Centre submissions |
| `financial_agents` | Tagged agents for financial expense categories |
| `proxy_agent_assignments` | Proxy agent-partner assignment management |

### HR & People
| Table | Purpose |
|-------|---------|
| `leave_requests` | HR leave request management (annual, sick, personal, maternity, paternity) |
| `disciplinary_records` | HR disciplinary tracking (warnings, suspensions, terminations) |
| `payroll_batches` | HR payroll processing batches |

### Platform Operations
| Table | Purpose |
|-------|---------|
| `audit_logs` | Immutable audit trail |
| `daily_platform_stats` | Cached daily snapshots |
| `notifications` | User notifications |
| `ai_chat_messages` | AI assistant history |
| `referrals` | Referral tracking |
| `referral_rewards` | Referral reward records |
| `cashout_agents` | Tagged agents for payout routing |
| `cfo_threshold_alerts` | CFO risk alerts |
| `commission_accrual_ledger` | Commission lifecycle tracking |

## 36.2 Key Views

| View | Purpose |
|------|---------|
| `manager_profiles` | Manager-relevant profile data |
| `referral_leaderboard` | Referral rankings |
| `user_financial_summaries` | Financial overview per user |

## 36.3 Key RPCs (Database Functions)

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Role check (SECURITY DEFINER) |
| `get_financial_ops_pulse()` | Financial ops metrics |
| `get_paginated_transactions()` | Paginated transaction search |
| `get_reconciliation_summary()` | Daily reconciliation |
| `get_chain_health_summary()` | Property chain health |
| `record_rent_request_repayment()` | Atomic repayment recording |
| `credit_agent_rent_commission()` | 10% agent commission (wallet + ledger + earnings) |
| `credit_agent_event_bonus()` | Event bonus with double-entry |
| `auto_route_rent_funds()` | Fund routing fallback |
| `detect_velocity_abuse(window_min, threshold)` | Server-side velocity abuse detection |
| `credit_proxy_approval()` | Idempotent proxy partner ROI credit (MD5-based deterministic UUID) |

---

# 37. Known Issues & Technical Debt

## 37.1 Double-Credit Bug (CRITICAL — Identified 2026-03-26, **RESOLVED v3.2**)

**Three overlapping wallet update paths caused duplicate credits. Fixed via Single-Writer Principle.**

### Root Cause
No single source of truth for wallet mutation — some paths used trigger-based sync, others used direct wallet updates, and some did both.

### Resolution: Single-Writer Principle (v3.2)

**Rule**: Each wallet mutation type gets exactly ONE owner. Callers must not duplicate what the callee already does.

#### Fix 1: `wallet-transfer` Edge Function → Ledger-Only
- **Before**: Manual `.update()` on both wallets + ledger inserts WITHOUT `transaction_group_id`
- **After**: Two `general_ledger` entries with shared `transaction_group_id` → `sync_wallet_from_ledger` trigger handles both wallet balance changes atomically

#### Fix 2: `credit_agent_rent_commission` RPC → Sole Commission Writer
- **Before**: RPC did direct `INSERT INTO wallets ON CONFLICT UPDATE` + ledger (no txn_group_id). Callers also independently credited wallet → 2-4× overpayment
- **After**: Uses `transaction_group_id` on ledger insert so trigger handles wallet credit. Added idempotency guard.

#### Fix 3: `record_rent_request_repayment` RPC → Optional `transaction_group_id`
- **Before**: RPC inserted ledger without `transaction_group_id`. Callers also inserted their own entries → duplicates
- **After**: Accepts optional `p_transaction_group_id` parameter. Backward-compatible.

### Enforced Rules (Post-Fix, strengthened in v5.0)
1. Wallet balance changes happen **only** via `sync_wallet_from_ledger` trigger — **never via manual `.update()`** (Trigger-Only Policy, v5.0)
2. RPCs own their domain: `credit_agent_rent_commission` is the sole commission writer; `record_rent_request_repayment` is the sole repayment writer
3. Edge functions must **not** duplicate what an RPC they call already does
4. `auto-charge-wallets` uses manual `.update()` without `transaction_group_id` (sole exception — single-writer for tenant deductions)

## 37.2 Double-Deduction Bug (CRITICAL — Identified 2026-04-07, **RESOLVED v5.0**)

**`agent-deposit` edge function manually deducted agent wallet AND inserted ledger entries, causing the `sync_wallet_from_ledger` trigger to deduct again.**

### Root Cause
The `agent-deposit` function had the same bug class as the `approve-deposit` fix. It:
1. **Manually subtracted** from agent wallet: `balance = balance - amount`
2. **Inserted `cash_out` ledger entry** → trigger fired → deducted again

This caused 50k to become 100k and 10k to become 20k deductions for affected agents.

Additionally, `creditWalletDirect()` manually credited recipient wallets before ledger entries were inserted, risking double-credits on the receiving side.

### Resolution (v5.0)

1. **Removed all manual wallet updates** from `agent-deposit` edge function (lines 403-418, 516-531)
2. **Replaced `creditWalletDirect()` with `ensureWalletExists()`** — upsert with `ignoreDuplicates: true` (only ensures wallet row exists; balance managed exclusively by trigger)
3. **Data correction**: Inserted `balance_correction` ledger entry of 60k for affected agent to reverse excess deductions
4. **Established Trigger-Only Policy**: All edge functions are now forbidden from manual wallet balance manipulation

### Impact
- Affected agent (Akampurira Onesmus) had 60k excess deducted — corrected via `cash_in` / `balance_correction` ledger entry
- `sync_wallet_from_ledger` trigger automatically restored correct balance

---

# 38. HR Dashboard Workflows

## 38.1 Route: `/hr/dashboard`

### UI Design: HR Dashboard
- **Layout**: Tabbed interface via `ExecutiveDashboardLayout` with `role="hr"`
- **Mobile**: Responsive tab strip with icon + label
- **Sub-views**: 8 tabs (Overview, Employees, User Management, Leave, Payroll, Disciplinary, Audit, Departments)

## 38.2 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `HROverview.tsx` | `src/components/hr/` | Overview KPIs with navigation to sub-views |
| `HREmployeeDirectory.tsx` | `src/components/hr/` | Searchable employee directory |
| `HREmployeeDetailDrawer.tsx` | `src/components/hr/` | Employee detail side drawer |
| `HRUserManagement.tsx` | `src/components/hr/` | HR-specific user management tools |
| `HRLeaveManagement.tsx` | `src/components/hr/` | Leave request management (approve/reject) |
| `HRPayroll.tsx` | `src/components/hr/` | Payroll batch processing |
| `HRDisciplinary.tsx` | `src/components/hr/` | Disciplinary record management (warnings, suspensions, terminations) |
| `HRAudit.tsx` | `src/components/hr/` | HR-specific audit trail (filters `hr_%` action types) |
| `HRDepartments.tsx` | `src/components/hr/` | Department management |

## 38.3 Leave Management Flow

```
Employee submits leave request (type: annual/sick/personal/maternity/paternity)
    ↓
Leave request stored in leave_requests table (status: 'pending')
    ↓
HR Manager reviews in HRLeaveManagement:
  - Employee name, leave type, dates, reason
    ↓
hr-approve-leave Edge Function:
  1. Validates leave request exists and is pending
  2. Updates status to 'approved' or 'rejected'
  3. Records reviewer and timestamp
  4. Creates hr_leave_approved/hr_leave_rejected audit log entry
    ↓
Employee notified of decision
```

## 38.4 Payroll Flow

```
HR prepares payroll batch in HRPayroll
    ↓
hr-submit-payroll Edge Function:
  1. Creates payroll_batches record
  2. Processes employee salary calculations
  3. Generates ledger entries for payments
  4. Records hr_payroll_submitted audit log
    ↓
CFO reviews payroll batch for final approval
    ↓
Payments disbursed to employee wallets
```

## 38.5 Disciplinary Flow

```
HR Manager initiates disciplinary action in HRDisciplinary
    ↓
hr-issue-disciplinary Edge Function:
  1. Creates disciplinary_records entry (type: warning/suspension/termination)
  2. Records severity, description, evidence
  3. Creates hr_disciplinary_issued audit log entry
    ↓
Employee record updated with disciplinary history
    ↓
For terminations: triggers account freeze workflow
```

## 38.6 Access Control

- **Required role**: `hr`
- HR role is a Staff-level role, accessed via `/hr/dashboard`
- HR audit trail shows only `hr_%` prefixed action types
- All HR actions logged to `audit_logs` with `hr_` prefix

## 38.7 Employee Profiles

| Route | Purpose |
|-------|---------|
| `/hr/profiles/:userId` | Individual employee profile deep-dive |

## 38.8 Backend Edge Functions

- **`hr-approve-leave`**: Process leave request approval/rejection with audit trail
- **`hr-issue-disciplinary`**: Issue disciplinary records (warning, suspension, termination)
- **`hr-submit-payroll`**: Submit and process payroll batches

---

# Appendix A: Offline-First Strategy

| Data Type | Strategy | Cached Locally? |
|-----------|----------|----------------|
| Financial data | Network-first | ❌ Never |
| Profile/UI data | Offline-first | ✅ IndexedDB + localStorage |
| Notifications | Realtime | ✅ Temporary |

**Offline Queue**: Non-financial actions stored locally → background sync → server validation → UI update

---

# Appendix B: Performance Targets

| Metric | Target |
|--------|--------|
| DB reads per session | ≤ 3 |
| Cache hit rate | ≥ 90% |
| Edge function p95 latency | < 300ms |
| Scale target | 40M+ users |
| Dashboard snapshot cache | 10 minutes |

---

# Appendix C: Forbidden Anti-Patterns

- ❌ Direct wallet balance edits
- ❌ Manual wallet balance updates in edge functions (e.g., `.update({ balance: current - amount })`) — use ledger inserts only; trigger handles balance
- ❌ Business logic in UI components
- ❌ Offline financial updates
- ❌ Duplicate logic across Edge Functions
- ❌ Revenue recognition without fulfillment
- ❌ Silent financial corrections
- ❌ Supporter seeing tenant/agent identities
- ❌ Unversioned APIs
- ❌ "Fix balance" buttons
- ❌ User lists in supporter UI
- ❌ Storing roles on profiles table
- ❌ Client-side admin checks (localStorage)
- ❌ Anonymous sign-ups
- ❌ Multiple wallet update paths for same operation

---

# Appendix D: UI Component Registry

### Layout & Navigation
- `ExecutiveDashboardLayout` — Unified sidebar for executive dashboards
- `MobileBottomNav` — Bottom navigation bar (5 icons)
- `CollapsibleQuickNav` / `QuickNavGrid` — Quick navigation grid
- `AppBreadcrumb` — Breadcrumb navigation
- `PageTransition` — Route transitions (framer-motion)
- `NavLink` — Active-aware navigation links

### Shared Components
- `MetricCard` — Standardized metric display
- `KPICard` — Executive KPI card
- `AnimatedCard` / `AnimatedList` — Motion-enhanced components
- `StatusIndicator` — Status dots/badges
- `SwipeableRow` — Swipeable list items
- `ParticleBackground` — Decorative background
- `WelileLogo` — Brand logo
- `WhatsAppPhoneLink` — WhatsApp deep links
- `SignupPauseBanner` — Signup pause notification
- `DeferredExtras` — Lazy-loaded non-critical components
- `DashboardGuide` — Contextual dashboard help
- `FloatingActionButton` — Quick actions FAB
- `FloatingToolbar` — Contextual toolbar
- `FloatingShareButton` — Share button FAB
- `ShareAppButton` — App share button
- `ScrollToTopButton` — Scroll-to-top FAB
- `PullToRefresh` — Pull-to-refresh behavior
- `TransactionForm` / `TransactionList` — Transaction entry/display
- `FoodReceiptPromoCard` — Food receipt promo
- `LoanLimitPromoCard` — Loan limit promo
- `CurrencyConverter` / `CurrencySwitcher` — Currency tools
- `MobileQuickMenu` — Quick menu for mobile

### Skeleton Loading
- `src/components/skeletons/` — Loading state placeholders for all card types

---

# Appendix E: Governing Principles

1. **Dignity before growth** — User trust is paramount
2. **Systems over heroics** — Reliable architecture over manual fixes
3. **Calm over urgency** — Stability over speed
4. **Trust over shortcuts** — No bypassing audit trails
5. **Outcomes over optics** — Real metrics only
6. **Auditability over convenience** — Every action traceable
7. **Correctness over speed** — Financial accuracy first
8. **Solvency over growth** — Never compromise liquidity

---

# Appendix F: UI Design System

## Color Tokens (HSL)
- `--primary`: Welile Purple (#7214c9)
- `--primary-foreground`: White
- `--background`: White (light) / Dark (dark mode)
- `--foreground`: Dark text / Light text
- `--muted`: Gray backgrounds
- `--accent`: Accent highlights
- `--destructive`: Red for errors/deletes

## Typography
- Display: Bold headings with `text-lg` to `text-2xl`
- Body: `text-sm` for mobile, `text-base` for desktop

## Component Patterns
- **Card-based Navigation**: Quick Nav Grid (2-col mobile, 4-col desktop)
- **Touch Targets**: Minimum 44px for all interactive elements
- **Active State**: `active:scale-95` with `touch-manipulation` for haptic feel
- **Badge Counts**: Real-time counts on navigation cards
- **Committed State**: White check icon on colored background
- **Glassmorphism**: Used for hero cards (supporter dashboard)
- **Collapsible Sections**: Expandable sections for content-heavy pages
- **Bottom Sheets**: Used for detail views on mobile (vaul)
- **Skeleton Loading**: Placeholder loading states for all cards

## Responsive Breakpoints
- **Mobile (<768px)**: Single-column, 2-col nav grids, bottom nav
- **Tablet (768-1024px)**: 3-col grids, sidebar navigation
- **Desktop (>1024px)**: 4-col grids, full sidebar, wider content

---

# Appendix G: Changelog (v2.0 → v5.0)

| Feature | Version | Change |
|---------|---------|--------|
| Tenant Ops Dashboard | v3.0 | NEW — Full Section 14 with card-based navigation |
| Partner Ops Dashboard | v3.0 | NEW — Full Section 15 with card-based navigation |
| Manual Rent Collection | v3.0 | Added mandatory reason (≥10 chars) |
| COO Wallet-to-Portfolio | v3.0 | NEW — Direct transfer |
| Funder Statement | v3.0 | NEW — `send-funder-statement` edge function |
| Double-Credit Bug | v3.2 | RESOLVED — Single-Writer Principle |
| Agent Commission Model | v3.3 | CORRECTED — 10% total commission with proper split |
| Marketing Expense Pattern | v3.3 | NEW — All agent earnings as marketing expenses |
| `credit_agent_event_bonus` RPC | v3.3 | NEW — Flat-fee bonus with double-entry |
| Service Centre Workflow | v3.3 | NEW — Photo/GPS submission and verification |
| Agent Commission Benefits Page | v3.3 | NEW — Plain-language explainer |
| Withdrawal Pipeline | v3.3 | SIMPLIFIED — Single-step Financial Ops approval |
| Agent Ops Dashboard | v4.0 | DOCUMENTED — Quick Nav Grid with 14 sub-views |
| Landlord Ops Dashboard | v4.0 | NEW SECTION — Chain health, property map, viewing scheduler |
| Angel Pool System | v4.0 | NEW SECTION — Full investment system documentation |
| All Wallet Components | v4.0 | DOCUMENTED — 26 wallet components catalogued |
| All Agent Components | v4.0 | DOCUMENTED — 86 agent components catalogued |
| All Supporter Components | v4.0 | DOCUMENTED — 58 supporter components catalogued |
| UI Design System | v4.0 | NEW — Appendix F with design tokens and patterns |
| Financial Ops Components | v4.0 | DOCUMENTED — 13 Financial Ops components |
| CFO Components | v4.0 | DOCUMENTED — 23 CFO-specific components |
| COO Components | v4.0 | DOCUMENTED — 14 COO-specific components |
| Manager Components | v4.0 | DOCUMENTED — 100+ manager components |
| AI Features | v4.0 | DOCUMENTED — 4 AI-powered manager components |
| PWA Branding | v4.0 | UPDATED — App name "Welile.com" on all devices |
| Edge Functions | v4.0 | COMPLETE — All 81 edge functions documented |
| **Trigger-Only Wallet Policy** | **v5.0** | **ENFORCED — `sync_wallet_from_ledger` is sole writer for wallet balances; manual updates forbidden** |
| **Double-Deduction Bug Fix** | **v5.0** | **RESOLVED — `agent-deposit` patched to remove manual wallet subtraction** |
| **HR Dashboard** | **v5.0** | **NEW SECTION 38 — Full HR module with 9 components, 3 edge functions** |
| **Agent-Facilitated Angel Pool** | **v5.0** | **NEW — `agent-angel-pool-invest` edge function with 1% commission** |
| **Proxy Partner Payout Management** | **v5.0** | **NEW — `ProxyPartnerFunds` component, `proxy_partner_withdrawal` category** |
| **Financial Agent Requisitions** | **v5.0** | **NEW — `AgentRequisitionForm` + `CFOAgentRequisitions` approval queue** |
| **CFO Dashboard Expansion** | **v5.0** | **EXPANDED — 20+ tabs (ROI Requests, Advances, Float Management, Rankings, etc.)** |
| **Proportional Revenue Recognition** | **v5.0** | **NEW — `sync_collection_to_ledger` trigger splits collections** |
| **Deterministic Idempotency** | **v5.0** | **NEW — `credit_proxy_approval` RPC with MD5-based UUID** |
| **Financial Separation of Powers** | **v5.0** | **DOCUMENTED — CFO (inbound) vs Financial Ops (outbound)** |
| **New DB Tables** | **v5.0** | **NEW — `leave_requests`, `disciplinary_records`, `payroll_batches`, `financial_agents`, `proxy_agent_assignments`** |
| **Edge Functions** | **v5.0** | **EXPANDED — 89 total edge functions (4 new: HR + Angel Pool)** |
| **HR Role** | **v5.0** | **NEW — 15 total roles (added `hr` to Staff group)** |

---

*End of Document — Version 5.0*
