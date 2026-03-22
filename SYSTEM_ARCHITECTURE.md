# Welile Platform — System Architecture

> **Welile Technologies Limited** is a rent-guarantee and rent-facilitation platform designed to scale across Africa and globally. It connects tenants, landlords, agents, supporters (funders), and institutional partners — acting as the system operator and guarantor.

**Last Updated:** March 2026  
**Version:** Production  
**Target Scale:** 40M+ users  

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Technology Stack](#2-technology-stack)
3. [Authentication & Role System](#3-authentication--role-system)
4. [Dashboard Architecture](#4-dashboard-architecture)
5. [Financial Engine & Ledger](#5-financial-engine--ledger)
6. [Rent Request Pipeline](#6-rent-request-pipeline)
7. [Edge Functions (Backend)](#7-edge-functions-backend)
8. [Data Architecture & Scaling](#8-data-architecture--scaling)
9. [Real-Time & Offline-First](#9-real-time--offline-first)
10. [Email & Notifications](#10-email--notifications)
11. [Security & RLS](#11-security--rls)
12. [UI/UX Architecture](#12-uiux-architecture)
13. [File & Component Map](#13-file--component-map)
14. [Governance & Compliance](#14-governance--compliance)
15. [Performance Targets](#15-performance-targets)
16. [Forbidden Anti-Patterns](#16-forbidden-anti-patterns)

---

## 1. Platform Overview

### 1.1 Business Model

Welile facilitates rent by connecting:

| Actor | Role |
|---|---|
| **Tenant** | Requests rent access; repays in daily instalments |
| **Landlord** | Receives verified rent payments; lists houses |
| **Agent** | Field operator — verifies tenants/landlords, collects payments, earns commissions |
| **Supporter (Funder)** | Provides upfront rent capital; earns ROI via repayment streams |
| **Manager / Executive** | Oversees operations, approvals, risk, and solvency |

Welile earns fees for infrastructure and guarantees. It does **not** sell loans — it facilitates rent and manages risk.

### 1.2 Core Product Flows

1. **Tenant applies for rent** → Agent verifies → Manager approves → Supporter funds → Landlord receives rent
2. **Tenant repays daily** → Agent collects → Platform distributes to supporter + fees
3. **Supporter earns ROI** on funded rent through structured repayment streams
4. **Agent earns commissions** on registrations, collections, and verifications

### 1.3 Key Metrics (North Star)

| Metric | Description |
|---|---|
| **Rent Secured (UGX/month)** | North Star metric |
| Active Virtual Houses | Houses with active rent coverage |
| Rent Success Rate | % of rent requests fully repaid |
| Payment Health Distribution | Breakdown of on-time vs late vs default |
| Capital Utilization | % of supporter capital actively deployed |
| Liquidity Buffer | Platform reserve coverage ratio |
| Default Rate | % of rent requests that defaulted |
| Cache Hit Rate | Target ≥ 90% |

---

## 2. Technology Stack

### 2.1 Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 (SWC plugin) |
| Styling | Tailwind CSS 3 + shadcn/ui components |
| State | React Query (TanStack Query v5) |
| Routing | React Router v6 |
| Animations | Framer Motion |
| Charts | Recharts |
| Maps | Leaflet + React Leaflet + PostGIS |
| PDF Generation | jsPDF |
| QR Codes | html5-qrcode, qrcode.react |
| PWA | vite-plugin-pwa (Service Worker) |
| Offline Storage | IndexedDB + localStorage |

### 2.2 Backend (Lovable Cloud / Supabase)

| Layer | Technology |
|---|---|
| Database | PostgreSQL (Supabase-managed) |
| Auth | Supabase Auth (email, OTP, password) |
| Edge Functions | Deno (Supabase Edge Functions) |
| Real-time | Supabase Realtime (PostgreSQL CDC) |
| Storage | Supabase Storage (receipts, photos, documents) |
| Email | Lovable Email Infrastructure (pgmq queue + auth-email-hook) |
| SMS | Africa's Talking API |
| AI | Lovable AI (Gemini / GPT models via edge functions) |
| Cron Jobs | pg_cron + pg_net |

### 2.3 External Integrations

| Service | Purpose |
|---|---|
| Africa's Talking | SMS OTP, payment reminders, collection SMS |
| Lovable Email | Auth emails, agreement copies, notifications |
| PostGIS | Geospatial queries for nearby house discovery |
| Web Push (VAPID) | Push notifications |

---

## 3. Authentication & Role System

### 3.1 Auth Flow

```
User → Email/Phone + Password → Supabase Auth
     → OTP Login (SMS via Africa's Talking)
     → Password Reset (SMS-based)
     → Session persisted in localStorage
     → Auto-refresh tokens
```

**Key files:**
- `src/hooks/useAuth.tsx` — Auth context provider
- `src/hooks/auth/roleManager.ts` — Role provisioning logic
- `src/hooks/auth/authOperations.ts` — Sign-in/out operations
- `src/lib/sessionCache.ts` — Session caching for instant boot

### 3.2 Role Definitions (14 Roles)

| Category | Roles |
|---|---|
| **Consumer** | `tenant`, `landlord`, `supporter`, `agent` |
| **Staff** | `manager`, `operations`, `employee` |
| **Executive** | `ceo`, `coo`, `cfo`, `cto`, `cmo`, `crm` |
| **System** | `super_admin` (God mode) |

Roles are stored in a **separate `user_roles` table** (never on the profile) with a `has_role()` security definer function to prevent recursive RLS.

### 3.3 Role Provisioning

- **Default roles:** New users receive `supporter`, `agent`, `tenant`, `landlord`
- **Internal/executive roles:** Assigned manually by `super_admin`, `manager`, or `cto` (requires authorization code)
- **Soft-delete:** Removing a role sets `enabled = false` instead of hard-deleting, preventing auto-reprovisioning on next login
- **Role Access Requests:** Tenants/agents can request access to additional dashboards; managers approve/deny

### 3.4 Dashboard Auto-Routing

```
Login → Check deployed capital
      → If ≥ UGX 100,000 → Default to Supporter dashboard
      → Otherwise → Check user's "Home Screen" preference
      → If "Auto" → Route to first available role
      → Staff roles → Auto-redirect to /staff portal
```

### 3.5 Staff Portal Isolation

Internal staff access is isolated via `/staff` route — a dedicated entry point for administrative roles. It performs post-login role verification and auto-redirects to the appropriate dashboard while rejecting unauthorized users. Administrative UI elements are **completely hidden** from consumer-facing views.

---

## 4. Dashboard Architecture

### 4.1 Consumer Dashboards

#### Tenant Dashboard (`src/components/dashboards/TenantDashboard.tsx`)
- Offline-first with local-first data loading
- Property discovery: "Find a House Nearby" hero CTA with live listing counts
- Nearby houses carousel (PostGIS-powered)
- Rent process tracker (lifecycle visualization)
- Suggested houses matching previous rent range
- Welile Homes housing fund (10% of rent payments)
- WhatsApp deep-links to agents from property cards
- Compact "Rent Access Limit" expandable strip

#### Supporter/Funder Dashboard (`src/components/dashboards/SupporterDashboard.tsx`)
- Portfolio summary cards (houses funded, rent secured, wallet balance, ROI)
- Virtual houses grid with funding status
- Agreement acceptance gate (one-time, with email confirmation)
- ROI calculator
- Funding opportunities feed
- Wallet integration (deposit/withdraw via Mobile Money)

#### Agent Dashboard (`src/components/dashboards/AgentDashboard.tsx`)
- Ultra-minimalist, wallet-centric interface
- Primary view: Name, AI ID, high-visibility wallet balance
- 6-button action grid: Pay Rent, Post Request, Tenants, List House, Credit, Agent Hub
- Agent Hub contains all secondary features
- Daily Rent Expected metric (aggregate portfolio repayment target)
- Collection streaks and incentive bonuses
- Float management and rebalancing

#### Landlord Dashboard (`src/components/dashboards/LandlordDashboard.tsx`)
- House listing management
- Rent payment tracking
- Tenant occupancy overview
- Verification status
- Registration/verification bonuses

### 4.2 Management Dashboards

#### Manager Dashboard (`src/components/dashboards/ManagerDashboard.tsx`)
- Event-driven, snapshot-based (calm UI, highlights action needs in <10 seconds)
- User management with server-side pagination (`search_users_paginated` RPC)
- Quick user lookup via GIN trigram indexes on phone suffixes
- Role and department assignment
- Investment accounts management (portfolio naming, funding, renewal)
- Audit logs and governance

#### Operations Dashboard (`src/pages/admin/Dashboard.tsx`)
- Single Role, Multi-Select Department architecture
- Departments: Agent, Landlord, Tenant, Partner
- Unified tabs for multi-department users
- Single-department users auto-redirected to specific sub-route

### 4.3 Executive Dashboards

| Role | Dashboard | Key Focus |
|---|---|---|
| CEO | `/ceo/dashboard` | Strategic command center, growth, staff performance |
| COO | `/coo/dashboard` | Financial ops authority, Stage 4 withdrawal sign-off |
| CFO | `/cfo/dashboard` | Solvency monitoring, Stage 2 withdrawal approval |
| CTO | `/cto/dashboard` | System health, DB latency monitoring (60s intervals) |
| CMO | `/cmo/dashboard` | Marketing analytics, attribution |
| CRM | `/crm/dashboard` | Customer support triage |

All executive dashboards use 10-minute snapshot cache and unified sidebar layout.

### 4.4 Financial Operations Command Center (`/admin/financial-ops`)

Designed for 1M+ daily transactions:

- **Live Pulse Strip:** Real-time counters for pending deposits/withdrawals
- **Priority Approval Queue:** Time-based urgency bands (Green <1h, Amber 1-4h, Red >4h)
- **User Inspection (RequestDetailSheet):** Full identity verification, wallet balance, transaction history, deposit success rates
- **High-Speed Transaction Search:** Multi-strategy lookup with batched profile resolution
- **Reconciliation:** 7-day cash-flow waterfall charts
- **Audit Feed:** Immutable operation log

---

## 5. Financial Engine & Ledger

### 5.1 Core Principle

> **All money movement MUST go through an append-only, double-entry ledger. Balances must NEVER be stored or edited directly.**

### 5.2 Ledger Tables

| Table | Purpose |
|---|---|
| `ledger_accounts` | Account registry (user wallets, system accounts, obligations) |
| `ledger_transactions` | Transaction headers (metadata, approval status) |
| `ledger_entries` | Individual debit/credit entries (append-only, immutable) |
| `general_ledger` | Central view combining all entries |
| `transaction_approvals` | Multi-stage approval records |

### 5.3 Account Hierarchy

| Group | Purpose | Negative Allowed |
|---|---|---|
| `USER_OWNED` | User wallets (supporter, tenant, agent, landlord) | ❌ Never |
| `OBLIGATION` | Debts, rent obligations, commitments | ✅ Yes |
| `SYSTEM_CONTROL` | Buffer accounts, escrow, rent pool | Depends |
| `REVENUE` | Deferred revenue, recognized revenue | Depends |
| `EXPENSE` | Costs, rewards, commissions | Depends |
| `SETTLEMENT` | Banking, mobile money settlement | Depends |

Standard templates: `SUPPORTER_WALLET`, `TENANT_RENT_OBLIGATION`, `BUFFER_ACCOUNT`

### 5.4 Wallet Synchronization

The `sync_wallet_from_ledger` database trigger automatically updates user wallet balances whenever a ledger entry with a `transaction_group_id` is inserted. This ensures wallets **always** reflect the ledger truth.

### 5.5 Ledger Scoping

Every ledger entry has a `ledger_scope`:

| Scope | Visibility | Example |
|---|---|---|
| `wallet` | User-facing | Deposit, withdrawal, rent payment received |
| `platform` | Internal only | Pool deployments, internal transfers |
| `bridge` | Both | Capital inflows affecting both user and platform |

User wallet history **explicitly excludes** `platform` scope entries and any transaction with description starting with "pool deployment".

### 5.6 Financial Safety Controls

- **Optimistic Locking:** Edge functions verify wallet balance matches expected state before committing
- **60-Second Cooldown:** Rapid-fire protection on financial operations
- **Rollback Mechanism:** Restores balances if subsequent operations fail
- **No Direct Balance Edits:** Managers cannot manually adjust balances; all changes via approved workflows
- **Ledger UI is Read-Only:** RLS prevents direct table updates

### 5.7 Risk & Solvency

- Buffer/escrow accounts maintained with coverage ratios
- Liquidity indicators monitored continuously
- If coverage drops below safe levels → system flags, alerts managers, and halts risky operations
- **Solvency > Growth** (non-negotiable)

---

## 6. Rent Request Pipeline

### 6.1 Six-Stage Approval Pipeline

```
Stage 1: Tenant Ops      → Agent assignment (Haversine distance)
Stage 2: Agent Ops        → Field verification (GPS, photos, signatures)
Stage 3: Landlord Ops     → Landlord verification
Stage 4: COO              → Operational sign-off
Stage 5: CFO              → Financial authorization
Stage 6: Disbursed        → Payout to landlord
```

This pipeline is the **primary operational priority** — positioned at the top of all executive dashboards.

### 6.2 Key Supporting Tables

- `rent_requests` — Core request tracking
- `credit_request_details` — Extended verification data (GPS, meter numbers, landlord info)
- `disbursement_records` — Payment delivery tracking
- `agent_delivery_confirmations` — Agent proof of delivery (photos, GPS, signatures)

### 6.3 Repayment Structure

- Daily instalments via approved payment channels (Mobile Money)
- Agent-collected payments tracked via `agent_collections`
- Collection streaks and incentive bonuses for agents
- Payment tokens for secure transaction verification

---

## 7. Edge Functions (Backend)

### 7.1 Financial Operations (17 functions)

| Function | Purpose |
|---|---|
| `approve-deposit` | Process deposit approvals |
| `approve-wallet-operation` | General wallet operation approval |
| `agent-deposit` | Agent-specific deposit handling |
| `agent-withdrawal` | Agent withdrawal processing |
| `wallet-transfer` | Inter-wallet transfers |
| `fund-rent-pool` | Deploy capital to rent pool |
| `fund-tenant-from-pool` | Allocate pool funds to tenant |
| `fund-tenants` | Direct tenant funding |
| `portfolio-topup` | Add funds to investor portfolio |
| `manager-portfolio-topup` | Manager-initiated portfolio funding |
| `create-investor-portfolio` | Initialize new investment portfolio |
| `process-supporter-roi` | Calculate and distribute supporter returns |
| `process-investment-interest` | Process interest accruals |
| `process-monthly-rewards` | Monthly reward distribution |
| `process-credit-daily-charges` | Daily credit access fee processing |
| `process-credit-draw` | Credit draw execution |
| `process-agent-advance-deductions` | Agent advance repayment deductions |

### 7.2 Rent & Tenant Operations (8 functions)

| Function | Purpose |
|---|---|
| `approve-rent-request` | Multi-stage rent request approval |
| `disburse-rent-to-landlord` | Landlord payout execution |
| `register-tenant` | New tenant onboarding |
| `transfer-tenant` | Tenant relocation management |
| `manual-collect-rent` | Manual rent collection processing |
| `auto-charge-wallets` | Automated daily wallet charges |
| `check-repayment-status` | Repayment monitoring |
| `delete-rent-request` | Request cancellation |

### 7.3 Agent Operations (4 functions)

| Function | Purpose |
|---|---|
| `agent-invest-for-partner` | Agent-initiated partner investment |
| `send-collection-sms` | Post-collection SMS confirmations |
| `activate-supporter` | Supporter account activation |
| `create-supporter-invite` | Generate supporter invite links |

### 7.4 Communication (8 functions)

| Function | Purpose |
|---|---|
| `sms-otp` | SMS OTP delivery via Africa's Talking |
| `otp-login` | OTP verification and login |
| `password-reset-sms` | SMS-based password reset |
| `payment-reminder` | Payment reminder dispatch |
| `rent-reminders` | Rent due date reminders |
| `send-push-notification` | Web push notifications (VAPID) |
| `vacancy-alerts` | Vacancy notification system |
| `viewing-confirmation-sms` | Property viewing confirmations |

### 7.5 Admin & Governance (8 functions)

| Function | Purpose |
|---|---|
| `admin-reset-password` | Admin password reset |
| `register-employee` | Staff onboarding |
| `delete-user` | Account deletion |
| `export-database` | Data export |
| `import-partners` | Bulk partner import |
| `refresh-daily-stats` | Daily statistics snapshot refresh |
| `user-snapshot` | User data snapshot generation |
| `batch-recalculate-credit-limits` | Bulk credit limit recalculation |

### 7.6 AI & Special (6 functions)

| Function | Purpose |
|---|---|
| `welile-ai-chat` | AI assistant (powered by Lovable AI models) |
| `scan-receipt` | AI-powered receipt scanning |
| `partner-ops-automation` | Partner operations automation |
| `coo-invest-for-partner` | COO-level partner investment |
| `supporter-account-action` | Supporter account management |
| `send-supporter-agreement-email` | Agreement terms email delivery |

### 7.7 Credit & Bonuses (5 functions)

| Function | Purpose |
|---|---|
| `approve-loan-application` | Loan/credit approval |
| `credit-landlord-registration-bonus` | Landlord registration incentive |
| `credit-landlord-verification-bonus` | Landlord verification incentive |
| `credit-listing-bonus` | House listing incentive |
| `seed-test-funds` | Development/testing utility |

### 7.8 Marketplace (3 functions)

| Function | Purpose |
|---|---|
| `product-purchase` | Product purchase processing |
| `vendor-login` | Vendor portal authentication |
| `vendor-mark-receipt` | Vendor receipt confirmation |

### 7.9 Email Infrastructure (1 function + shared templates)

| Function | Purpose |
|---|---|
| `auth-email-hook` | Auth email rendering + pgmq queue enqueue |
| `_shared/email-templates/` | React Email templates (signup, recovery, invite, magic-link, email-change, reauthentication) |

---

## 8. Data Architecture & Scaling

### 8.1 Database Design Principles

- **No foreign keys to `auth.users`** — User references go through `profiles` table
- **Profiles table** in public schema stores accessible user data (name, phone, avatar, verification status)
- **Nullable/default columns** considered on every table to prevent insert errors
- **Append-only** for all financial tables (no updates, no deletes)

### 8.2 Scaling Strategies (40M+ Users)

| Strategy | Implementation |
|---|---|
| **GIN Trigram Indexes** | Phone suffix searches (`pg_trgm` extension) |
| **PostGIS Spatial Indexes** | GIST indexes for nearby property discovery |
| **Recursive Fetching** | `.range()` logic to bypass 1,000-row default limit |
| **Batched IN Clauses** | Chunk ID sets into batches of 50 to prevent URL-too-long errors |
| **Server-Side Pagination** | `search_users_paginated` RPC for large user tables |
| **Approximate Counts** | `pg_class` for dashboard estimates |
| **Snapshot Caching** | 4-hour snapshots via `daily_platform_stats` |
| **Materialized Views** | Pre-computed aggregates with SELECT revoked from public/anon |

**Utility:** `src/lib/supabaseBatchUtils.ts` — Centralized batch fetching utilities

### 8.3 Key Database Tables (Partial)

#### Core
- `profiles` — User profiles (name, phone, avatar, verification)
- `user_roles` — Role assignments (separate from profiles)
- `wallets` — User wallet balances (synced from ledger)
- `notifications` — In-app notification queue

#### Financial
- `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `general_ledger`
- `investor_portfolios` — Supporter investment portfolios
- `deposit_requests`, `credit_access_draws`, `credit_access_limits`
- `agent_float_limits`, `agent_collections`, `agent_earnings`
- `agent_advances`, `agent_advance_ledger`, `agent_advance_topups`

#### Rent Operations
- `rent_requests` — Core rent request lifecycle
- `credit_request_details` — Extended verification data
- `disbursement_records` — Payout tracking
- `agent_delivery_confirmations` — Proof of delivery
- `agent_visits` — GPS-verified field visits

#### Agent Performance
- `agent_collection_streaks` — Gamification and streak tracking
- `agent_incentive_bonuses` — Bonus rewards
- `agent_goals` — Monthly targets
- `agent_tasks` — Task management
- `agent_escalations` — Issue escalation tracking
- `agent_receipts` — Collection receipts
- `agent_rebalance_records` — Float rebalancing
- `agent_commission_payouts` — Commission withdrawal tracking
- `agent_subagents` — Sub-agent hierarchy

#### Marketplace
- `products`, `cart_items` — E-commerce
- `daily_platform_stats` — Platform-wide analytics snapshots

#### Email
- `email_send_log` — Email delivery audit trail
- `supporter_agreement_acceptance` — Legal agreement records

#### Governance
- `audit_logs` — Centralized audit trail
- `cfo_threshold_alerts` — Financial threshold monitoring

---

## 9. Real-Time & Offline-First

### 9.1 Real-Time (Selective)

To maintain stability at scale, real-time is limited to **5 mission-critical tables:**

| Table | Purpose |
|---|---|
| `messages` | Chat |
| `wallets` | Balance updates |
| `force_refresh_signals` | Admin-triggered refreshes |
| `rent_requests` | Rent lifecycle updates |
| `profiles` | New user registrations |

A **global realtime kill switch** (`src/lib/disableRealtime.ts`) can silence all subscriptions.

### 9.2 Offline-First Architecture (WhatsApp-Style)

**Pattern:** Read from localStorage instantly → show stale data → background-fetch → update cache silently

| Component | Implementation |
|---|---|
| `useLocalFirstQuery` hook | Universal local-first data loading |
| `offlineDataStorage.ts` | IndexedDB persistence layer |
| `OfflineContext` | Global offline state management |
| Service Worker | PWA caching, offline page shell |
| `OfflineBanner` | Visual offline indicator |

**Applied to:** All consumer dashboards (Tenant, Supporter, Agent, Landlord), Settings page, Profile data

### 9.3 Performance Characteristics

- Dashboards paint instantly from cache, even on 2G networks
- Network fetch happens silently in background
- 5-minute stale time before re-fetching
- localStorage + in-memory cache dual layer
- Cache eviction when storage is full (oldest entries first)

---

## 10. Email & Notifications

### 10.1 Auth Emails

- Powered by Lovable Email Infrastructure
- React Email templates in `supabase/functions/_shared/email-templates/`
- Templates: Signup confirmation, password recovery, magic link, invite, email change, reauthentication
- Sender domain: `notify.welile.com` (from: `noreply@welile.com`)
- Queued via pgmq (`auth_emails` queue) for retry safety

### 10.2 Transactional Emails

- Supporter Agreement copy sent automatically on acceptance
- Queued via pgmq (`transactional_emails` queue)
- Idempotency keys prevent duplicate sends
- Dead-letter queue after 5 failed attempts

### 10.3 SMS Notifications

- Africa's Talking API for SMS delivery
- OTP verification, payment reminders, collection confirmations, rent reminders
- Viewing confirmation SMS for property viewings

### 10.4 Push Notifications

- Web Push via VAPID keys
- `send-push-notification` edge function
- Service Worker handles push events

### 10.5 In-App Notifications

- `notifications` table with real-time subscription
- Notification bell component in dashboard headers
- Types: welcome, agreement_email, payment, system alerts

---

## 11. Security & RLS

### 11.1 Row-Level Security (RLS) Architecture

- **All tables** have RLS enabled
- `has_role()` security definer function prevents recursive RLS checks
- System-only tables explicitly deny direct client-side writes
- OTP verifications have deny-all policy for authenticated users
- Materialized views have SELECT revoked from public/anon

### 11.2 Edge Function Security Pattern

```
Anon Client    → Verifies caller identity (auth.getUser())
Service Client → Performs data operations (bypasses RLS)
```

- UUID validation on all inputs
- Character limits enforced
- CORS headers include required Supabase client headers

### 11.3 Administrative Permission Matrix

| Action | Allowed Roles |
|---|---|
| Role assignment | `super_admin`, `manager`, `cto` |
| Operations dept mapping | `super_admin`, `manager`, `cto` |
| Account freeze/delete | `super_admin`, `manager`, `cto`, `coo` |
| Deposit approval | `manager`, `coo` |
| Withdrawal Stage 2 | `cfo` |
| Withdrawal Stage 4 | `coo` |

### 11.4 Consumer Isolation

- Supporters **never** see tenants, landlords, agents, user lists, names, phones, or IDs
- Supporters only see: Virtual Houses, rent amount, payment health, portfolio performance
- Tenants/landlords see only their own status and schedules
- Agents see only their registrations, tasks, earnings, and zones
- Admin UI elements completely hidden from consumer views

### 11.5 Financial Security

- No direct wallet/ledger updates via client
- All financial operations go through service-role Edge Functions
- Optimistic locking prevents race conditions
- 60-second cooldown on financial operations
- Append-only ledger (no updates, no deletes)

---

## 12. UI/UX Architecture

### 12.1 Design System

- **CSS Variables:** HSL-based semantic tokens in `index.css`
- **Tailwind Config:** Extended theme with custom colors, fonts, animations
- **shadcn/ui:** Customized component library (Button, Card, Dialog, Sheet, Tabs, etc.)
- **Dark/Light Mode:** Full theme support via `next-themes`
- **Logo Font:** Chewy
- **Icons:** Lucide React (professional, consistent)

### 12.2 Responsive Strategy

- Mobile-first design (primary users on smartphones)
- Tab-based Settings page (renders only active tab's DOM)
- `PullToRefresh` component for mobile UX
- Bottom navigation bar on mobile
- Minimum 44px touch targets

### 12.3 Key UI Components

| Component | Purpose |
|---|---|
| `DashboardHeader` | Universal dashboard header with role switching |
| `BottomRoleSwitcher` | Mobile role navigation |
| `PullToRefresh` | Mobile-native refresh gesture |
| `UserAvatar` | Consistent avatar display |
| `MetricCard` | Standardized metric display |
| `AnimatedCard` / `AnimatedList` | Motion-enhanced UI elements |
| `ChunkErrorBoundary` | Graceful error handling per section |
| `OfflineBanner` | Network status indicator |
| `ConnectionStatus` | Real-time connection indicator |
| `WelileLogo` | Brand mark component |

### 12.4 PWA (Progressive Web App)

- Full PWA support with Service Worker
- Install prompts (iOS-specific guide included)
- Offline page shell
- Cache-first strategy for static assets
- Background sync for pending operations

### 12.5 Accessibility

- High contrast mode (`useHighContrast`)
- Font size adjustment (`useFontSize`)
- Language switching (`useLanguage`)
- Currency conversion (`useCurrency`)
- Haptic feedback (`useHapticSettings`)
- Biometric auth support (`useBiometricAuth`)
- PIN auth support (`usePinAuth`)

---

## 13. File & Component Map

### 13.1 Source Structure

```
src/
├── assets/                    # Static images, logos
├── components/
│   ├── admin/                 # Admin-specific components
│   ├── agent/                 # Agent dashboard components
│   ├── ai-chat/               # AI assistant UI
│   ├── ai-id/                 # AI ID system
│   ├── auth/                  # Auth forms, guards
│   ├── cfo/                   # CFO dashboard components
│   ├── chat/                  # Messaging system
│   ├── coo/                   # COO dashboard components
│   ├── dashboards/            # 5 main dashboards (Tenant, Supporter, Agent, Landlord, Manager)
│   ├── executive/             # Executive hub shared components
│   ├── financial-ops/         # Financial operations command center
│   ├── house/                 # House listing components
│   ├── investment/            # Investment/portfolio components
│   ├── landlord/              # Landlord-specific components
│   ├── layout/                # Layout wrappers
│   ├── loans/                 # Credit access components
│   ├── manager/               # Manager tools and user management
│   ├── map/                   # Leaflet map components
│   ├── marketplace/           # E-commerce components
│   ├── payments/              # Payment processing UI
│   ├── profile/               # Profile management
│   ├── receipts/              # Receipt scanning and display
│   ├── rent/                  # Rent request and tracking
│   ├── reviews/               # House review system
│   ├── settings/              # Settings page sections
│   ├── shared/                # Shared utility components
│   ├── skeletons/             # Loading skeleton components
│   ├── supporter/             # Supporter dashboard components + agreement
│   ├── tenant/                # Tenant-specific components + agreement
│   ├── ui/                    # shadcn/ui base components
│   ├── verification/          # Verification checklist components
│   ├── viewing/               # Property viewing components
│   ├── wallet/                # Wallet UI components
│   └── welile-homes/          # Welile Homes housing fund
├── hooks/
│   ├── auth/                  # Auth-related hooks (roleManager, types, operations)
│   ├── useAuth.tsx            # Main auth context
│   ├── useProfile.ts          # Profile data (local-first)
│   ├── useWallet.ts           # Wallet state management
│   ├── useLocalFirstQuery.ts  # Universal offline-first hook
│   └── ... (60+ hooks)
├── integrations/
│   └── supabase/
│       ├── client.ts          # Auto-generated Supabase client
│       └── types.ts           # Auto-generated database types
├── lib/
│   ├── sessionCache.ts        # Session caching for instant boot
│   ├── offlineDataStorage.ts  # IndexedDB persistence
│   ├── supabaseBatchUtils.ts  # Batch fetching utilities
│   ├── disableRealtime.ts     # Realtime kill switch
│   ├── rentCalculations.ts    # Rent math utilities
│   ├── creditFeeCalculations.ts # Credit fee math
│   ├── haptics.ts             # Haptic feedback
│   ├── phoneUtils.ts          # Phone number formatting
│   └── ... (35+ utilities)
├── pages/
│   ├── admin/                 # Admin pages (Dashboard, FinancialOps, Users)
│   ├── ceo/                   # CEO dashboard page
│   ├── cfo/                   # CFO dashboard page
│   ├── cmo/                   # CMO dashboard page
│   ├── coo/                   # COO dashboard page
│   ├── crm/                   # CRM dashboard page
│   ├── cto/                   # CTO dashboard page
│   ├── Auth.tsx               # Authentication page
│   ├── Dashboard.tsx          # Main dashboard router
│   ├── Settings.tsx           # Tab-based settings page
│   ├── StaffPortal.tsx        # Staff-only entry point
│   └── ... (50+ pages)
└── main.tsx                   # App entry point

supabase/
├── functions/
│   ├── _shared/
│   │   └── email-templates/   # React Email templates
│   └── ... (65+ edge functions)
├── migrations/                # Database migrations (read-only)
└── config.toml                # Supabase configuration
```

---

## 14. Governance & Compliance

### 14.1 Audit Trail

- **`audit_logs` table** captures all sensitive actions
- Fields: `user_id`, `action_type`, `table_name`, `record_id`, `metadata`, `timestamp`
- Investment account changes require 10-character minimum audit reason
- All manager actions logged with full context

### 14.2 Legal Agreements

| Agreement | Role | Behavior |
|---|---|---|
| Tenant Agreement | Tenant | Must accept before rent requests |
| Agent Agreement | Agent | Must accept before field operations |
| Supporter Agreement | Supporter | One-time acceptance; email copy auto-sent |
| Landlord Agreement | Landlord | Must accept before listing |

Agreement acceptance records stored with IP address, device info, timestamp, and version.

### 14.3 Staff Performance Monitoring

- CEO and COO access Staff Performance panel
- Audit log heatmaps showing daily activity
- SLA compliance tracking (idle time, response rates)
- Per-staff operation metrics

### 14.4 Governing Principles

1. **Dignity before growth**
2. **Systems over heroics**
3. **Calm over urgency**
4. **Trust over shortcuts**
5. **Outcomes over optics**
6. **Auditability over convenience**

### 14.5 Conflict Resolution Rules

| Conflict | Winner |
|---|---|
| Speed vs Correctness | Correctness |
| Growth vs Solvency | Solvency |
| Convenience vs Auditability | Auditability |
| Emotion vs Principle | Principle |

---

## 15. Performance Targets

| Metric | Target |
|---|---|
| DB reads per session | ≤ 3 |
| Cache hit rate | ≥ 90% |
| Edge function p95 latency | < 300ms |
| DB latency (healthy) | < 300ms |
| DB latency (degraded) | > 1000ms |
| Dashboard initial paint | < 1s (from cache) |
| Snapshots | Rebuildable at any time |
| Import timeout | 25s (for slow networks) |
| Realtime tables | Max 5 (whitelisted) |

---

## 16. Forbidden Anti-Patterns

These patterns are **strictly prohibited** across the entire codebase:

| Anti-Pattern | Why |
|---|---|
| Editable wallet balances | Balances are ledger-derived, never stored directly |
| "Fix balance" buttons | All corrections via reversing ledger entries |
| Manual balance adjustments | No manager can directly edit a balance |
| User lists in supporter UI | Supporters see only anonymized virtual houses |
| Revenue without fulfillment | Revenue recognized only when service obligation met |
| Silent financial corrections | Every correction must be auditable |
| Logic bypassing ledger | If money moves without ledger entries, it's invalid |
| Direct `auth.users` queries | Use `profiles` table instead |
| Hardcoded admin checks (localStorage) | Always server-side role verification |
| `find /` or full filesystem scans | Scope all searches to project directory |
| Anonymous signups | Always standard email/password auth |
| Storing roles on profiles table | Roles in separate `user_roles` table only |

---

## Appendix A: Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Auto-configured | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auto-configured | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Auto-configured | Project identifier |
| `SUPABASE_URL` | Edge function env | Server-side Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function env | Service role (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Edge function env | Anon key for auth verification |
| `AFRICASTALKING_API_KEY` | Secret | SMS API key |
| `AFRICASTALKING_USERNAME` | Secret | SMS API username |
| `LOVABLE_API_KEY` | Auto-managed | Lovable platform integration |
| `VAPID_PRIVATE_KEY` | Secret | Push notification signing |

---

## Appendix B: Route Map

### Consumer Routes
| Route | Page | Guard |
|---|---|---|
| `/` | Landing page | Public |
| `/auth` | Authentication | Public |
| `/dashboard` | Dashboard router | Auth required |
| `/settings` | Settings (tab-based) | Auth required |
| `/chat` | Messaging | Auth required |
| `/find-house` | Property discovery | Auth required |
| `/house/:id` | House detail | Auth required |
| `/rent-money` | Rent request flow | Auth required |
| `/my-loans` | Credit access | Auth required |
| `/calculator` | Rent calculator | Auth required |
| `/referrals` | Referral program | Auth required |
| `/marketplace` | E-commerce | Auth required |
| `/my-receipts` | Receipt history | Auth required |
| `/welile-homes` | Housing fund | Auth required |

### Staff Routes
| Route | Page | Guard |
|---|---|---|
| `/staff` | Staff Portal | Role guard (staff roles only) |
| `/admin/dashboard` | Admin dashboard | `manager`, `super_admin` |
| `/admin/financial-ops` | Financial ops center | `manager`, `coo`, `cfo` |
| `/admin/users` | User management | `manager`, `super_admin` |
| `/ceo/dashboard` | CEO dashboard | `ceo` |
| `/coo/dashboard` | COO dashboard | `coo` |
| `/cfo/dashboard` | CFO dashboard | `cfo` |
| `/cto/dashboard` | CTO dashboard | `cto` |
| `/cmo/dashboard` | CMO dashboard | `cmo` |
| `/crm/dashboard` | CRM dashboard | `crm` |
| `/operations` | Operations hub | `operations` |

---

*This document is the single source of truth for the Welile platform architecture. All development must conform to these specifications.*
