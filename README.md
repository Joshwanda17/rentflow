# Welile — Africa's Rent Facilitation Platform

[![Stack](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)](https://react.dev)
[![Backend](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-green?style=flat-square&logo=supabase)](https://supabase.com)

Welile is a Ugandan rent-facilitation and fintech platform. Tenants who can't pay rent as a lump sum get a **Rent Plan**: Welile pays the landlord up front and the tenant repays daily over 7–120 days. Field **agents** originate, verify, and collect. **Supporters** (retail funders/partners) supply capital and earn **Returns**. Every shilling is double-entry accounted through a central ledger.

* **Production URL:** [https://welile.tech](https://welile.tech)
* **Source repository:** [github.com/weliletenants-sys/welilereceipts-com-98bba33b](https://github.com/weliletenants-sys/welilereceipts-com-98bba33b) (this repo — managed via [Lovable](https://lovable.dev))

> Regulatory terminology is mandatory in user-facing copy: *Rent Plan* (not loan), *Supporter* (not lender), *Returns* (not ROI).

For the full canonical architecture reference (data model, ledger internals, subsystem inventory, operational rules), see [`SYSTEM_CONTEXT.md`](./SYSTEM_CONTEXT.md) — it is kept in sync with the live database and is the source of truth ahead of this file.

---

## 🚀 Key Capabilities

### 🏢 For Tenants
* **Rent Financing:** Access instant rent advances and pay back in flexible, structured installments.
* **Trust Profiles:** Build a verifiable tenant score to qualify for larger rent plans and better rates.
* **Mobile Wallet:** Seamless deposits, withdrawals, and payments powered by MTN & Airtel Mobile Money.

### 🏠 For Landlords
* **Guaranteed Rent:** Minimize default risk with guaranteed payout programs.
* **Property Listings:** List and verify residential units for local search.
* **Automated Ledgers:** Live tenant payment reconciliation, print-ready payout receipts, and automated tax accounting.

### 💰 For Funders (Supporters)
* **Capital Growth:** Fund verified tenant rent plans and earn Returns.
* **Portfolio Analytics:** Real-time visibility into active pools, compounding yields, maturity profiles, and risk distribution.

---

## 🛠️ Architecture & Technology Stack

The platform is engineered as a secure, responsive PWA optimized for performance on mobile browsers and low-bandwidth connections.

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript | Lazy-loaded routes with retry/concurrency limiting, offline-first React Query. |
| **Styling & UI** | Tailwind CSS, shadcn/ui | Radix UI primitives, dark/light themes, responsive mobile design. |
| **Database & Auth** | Supabase (PostgreSQL) | Row Level Security policies, SECURITY DEFINER RPCs, database triggers. The frontend never writes ledger/wallet state directly — enforced at build time by `scripts/guard-frontend-ledger-writes.mjs`. |
| **Serverless** | Supabase Edge Functions (Deno) | Money movement, transactional email (Mailgun), SMS (Yoola / Africa's Talking / LANA), PDF generation, MoMo reconciliation. |
| **Third-Party APIs** | Google Maps, MTN/Airtel Mobile Money | Location-based search, mobile money payment rails. |

---

## 📦 Project Structure

```text
├── .github/                 # CI/CD workflows
├── docs/                    # Architecture & API documentation
├── mem/, .lovable/          # Lovable project memory (business rules, architecture notes)
├── public/                  # Manifests, icons, PWA configuration, sitemaps
├── scripts/                 # Build-time guards, sitemap/dist generation, verification
├── src/
│   ├── components/          # Reusable UI component library (shadcn) + feature components
│   ├── hooks/                # Custom React hooks (auth, wallet, ops)
│   ├── integrations/         # Supabase client + generated schema types
│   ├── lib/                  # Calculation engines, PDF generators, helpers
│   └── pages/                 # Routed pages (per-persona dashboards, marketplace, landing)
├── supabase/
│   ├── functions/            # Edge Functions (API endpoints, cron jobs, emailers)
│   └── migrations/           # PostgreSQL schema migrations
├── e2e/                      # Playwright end-to-end tests
├── SYSTEM_CONTEXT.md         # Canonical architecture reference (start here)
├── tailwind.config.ts        # Design tokens, color system, layout themes
└── vite.config.ts            # Bundler build config and code-split definitions
```

---

## 💻 Developer Setup

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** or **bun** package manager

### Installation & Startup
```bash
# 1. Clone this repository
git clone https://github.com/weliletenants-sys/welilereceipts-com-98bba33b.git
cd welilereceipts-com-98bba33b

# 2. Install dependencies
npm install

# 3. Spin up local development server
npm run dev
```
The application will launch on [http://localhost:8080](http://localhost:8080).

### Build

```bash
npm run build      # runs build-time guards, generates the sitemap, builds, and verifies dist/
npm run guard:all   # run all build-time guards on demand
npm run test:e2e    # Playwright end-to-end tests
```

---

## 🌐 Deployment

The production app is a static SPA served through the Lovable proxy (`no-cache` on `index.html`); Edge Functions and database migrations deploy independently of the frontend build. Required environment variables:

* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_PUBLISHABLE_KEY`
* `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`

The canonical public domain is `welile.tech`. `scripts/guard-legacy-domain.mjs` fails the build if any shipping file references a legacy domain (see `scripts/site-domains.mjs`).
