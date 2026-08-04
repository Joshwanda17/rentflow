# Welile (RentFlow) — Africa's Rent Facilitation Platform

[![Deploy Status](https://img.shields.io/badge/Netlify-Live-success?style=flat-square&logo=netlify)](https://welile.tech)
[![Stack](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)](https://react.dev)
[![Backend](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-green?style=flat-square&logo=supabase)](https://supabase.com)

Welile is a decentralized fintech and rent facilitation ecosystem designed for emerging markets across Africa. The platform connects tenants, landlords, agents, and funders—enabling tenants to access credit to pay rent, landlords to receive guaranteed cash flow, and funders to grow capital through managed micro-lending portfolios.

* **Production URL:** [https://welile.tech](https://welile.tech)
* **Target Repository:** [github.com/Joshwanda17/rentflow](https://github.com/Joshwanda17/rentflow)

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
* **Capital Growth:** Fund verified tenant rent plans and earn yields.
* **Portfolio Analytics:** Real-time visibility into active pools, compounding yields, maturity profiles, and risk distribution.

---

## 🛠️ Architecture & Technology Stack

The platform is engineered as a secure, responsive serverless web application optimized for performance on both mobile browsers and low-bandwidth connections.

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript | Modern component architecture, pre-rendered routes, optimized code splitting. |
| **Styling & UI** | Tailwind CSS, shadcn/ui | Premium dark/light themes, Radix UI primitives, responsive mobile design. |
| **Database & Auth** | Supabase (PostgreSQL) | Secure session management, Row Level Security (RLS) policies, database triggers. |
| **Serverless** | Supabase Edge Functions | Transactional emails (Resend), MoMo API integrations, PDF generation. |
| **Third-Party APIs** | Google Maps, MoMo SDK | Location-based search, MTN/Airtel payment gateway integrations. |

---

## 📦 Project Structure

```text
├── .git/
├── .github/                 # CI/CD workflows and automated guards
├── docs/                    # API definitions and documentation
├── public/                  # Manifests, icons, PWA configurations, sitemaps
├── scripts/                 # Build-time optimization and verification utilities
├── src/
│   ├── components/          # Reusable UI component library (shadcn)
│   ├── hooks/               # Custom React hooks (auth, query hooks)
│   ├── integrations/        # Database client instantiation and schema definitions
│   ├── lib/                 # Logic engines (calculations, PDF generators, helpers)
│   └── pages/               # Routed pages (Dashboard, Landing, Market, etc.)
├── supabase/
│   ├── functions/           # Edge Functions (API endpoints, emailers)
│   └── migrations/          # PostgreSQL database schema migrations
├── tailwind.config.ts       # Design tokens, color system, and layout themes
└── vite.config.ts           # Bundler build config and Rollup code split definitions
```

---

## 💻 Developer Setup

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** or **bun** package manager

### Installation & Startup
```bash
# 1. Clone this repository
git clone https://github.com/Joshwanda17/rentflow.git
cd rentflow

# 2. Install dependencies
npm install

# 3. Spin up local development server
npm run dev
```
The application will launch on [http://localhost:8080](http://localhost:8080).

---

## 🔄 Rebrand & Sync Workflow

This codebase is managed upstream via Lovable (configured for the legacy domain `welileapp.com`), but builds and deploys in production under the domain `welile.tech` (`rentflow`).

To make sure updates are synchronized seamlessly without breaking domain references, the project uses a post-merge git automation.

### Sync Pipeline

```
┌──────────────┐     sync     ┌──────────────────┐    rebrand     ┌─────────────────┐
│   Lovable    │ ──────────── │  Local Workspace │ ─────────────  │  RentFlow Repo  │
│  (upstream)  │  git pull    │ (welileapp.com)  │ commit & push  │  (welile.tech)  │
└──────────────┘              └──────────────────┘                └─────────────────┘
```

1. **Automatic Sync:** When you run `git pull origin lovable`, the git post-merge hook (`.git/hooks/post-merge`) fires.
2. **Global Replacement:** The hook executes the rebrand pipeline, replacing all instances of `welileapp.com` with `welile.tech` across indexable routes, SEO meta tags, email templates, and manifests.
3. **Automated Commit:** All modified files are committed and force-pushed to the production repository (`rentflow`).
4. **Local Reset:** The local workspace is reset back to the default `origin/lovable` state to avoid merge conflicts on subsequent syncs.

*Manual Trigger:*
```bash
node "C:\Users\USER\Documents\welile-tools\sync-rebrand-push.mjs"
```

---

## 🚀 Netlify Deployment Configuration

The production application is continuously deployed to Netlify:

* **Build Command:** `npm run build`
* **Publish Directory:** `dist`
* **Production Environment Variables Required:**
  * `VITE_SUPABASE_URL`
  * `VITE_SUPABASE_PUBLISHABLE_KEY`
  * `VITE_SUPABASE_PROJECT_ID`
  * `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`
