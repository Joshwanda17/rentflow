# Plan: Workspace Analysis Document

Produce a comprehensive analysis of this workspace and deliver it as both a **PDF** and **Word document** in `/mnt/documents/`, previewable inline.

## Deliverables
- `/mnt/documents/welile-workspace-analysis.pdf`
- `/mnt/documents/welile-workspace-analysis.docx`

Both files will be surfaced via `<presentation-artifact>` tags so you can preview/download them from chat.

## Document Contents

1. **Executive Summary** — what Welile is (Uganda-focused rent + fintech PWA on UGX), scale target (40M+ users), current maturity.
2. **Project Structure** — annotated tree of the top-level workspace:
   - `src/` (App entry, 122 pages, 130+ components, hooks, lib, core services, i18n, contexts, integrations)
   - `supabase/` (250 edge functions, 1,657 migrations, config)
   - `scripts/` (build-time guards: ledger writes, deposit purpose, legacy domain, canonical tags, sitemap)
   - `public/`, `e2e/`, `docs/`, `reconciliation/`, `mem/` (project memory), `backend/`
3. **Technology Stack**
   - Frontend: React 18, Vite 5, TypeScript 5, Tailwind v3, shadcn/ui (Radix), React Query, React Router, framer-motion, TipTap, Leaflet, react-virtual, i18n, PWA.
   - Backend: Lovable Cloud (Supabase) — Postgres, RLS, Edge Functions (Deno), Storage, Auth, Realtime.
   - Integrations: Lovable AI Gateway, Lovable MCP server (`src/lib/mcp`), Mailgun (email), Yoola (SMS), Africa's Talking, Inngest events, Prisma client, jsPDF/html2canvas/pptxgenjs for artifacts.
   - Tooling: ESLint, Playwright (e2e), Vitest (unit), Bun/tsx scripts, build guards.
4. **Architecture Deep-Dive** (from `SYSTEM_ARCHITECTURE.md`, `welile_architecture_guide.md`, `schema_architecture.md`, `mem/`):
   - Ledger Fortress — `general_ledger` as sole truth; `wallets` cache; `v_user_wallet_strict` pivot.
   - 3-bucket wallet model (withdrawable / float / advance) + routing v2 (`recipient_type`).
   - Event-driven architecture (`system_events`), Welile Trust Score, Agent Field Mandate.
   - 15-role isolation model; auth + RLS + `has_role()` security-definer pattern.
   - Financial separation of powers (CFO vs FinOps), rent pipeline, ROI, credit/vouch engine.
   - Offline-first PWA strategy; drift monitors and reconciliation jobs.
5. **Domain Modules Inventory** — grouped list of the notable page/component/edge-function clusters (agent ops, CFO, COO, landlord ops, tenant, supporter/angel pool, merchant, HR, CTO, CMO, CRM, executive, staff portal).
6. **Data Model Overview** — mermaid-derived summary of core tables (ledger, wallets, profiles, rent_requests, agent_*, deposits, withdrawals, supporter, referrals).
7. **Build, Test & Quality Gates** — build guards, Playwright e2e suites, vitest, security scan findings surface.
8. **Constraints & Conventions** — key rules from project memory (UGX only, no direct wallet writes, ledger serialization, SMS sender, no cache-recovery system, user-facing ledger filter, etc.).
9. **Appendix** — file/folder counts, key config files, glossary.

## Generation Approach
- Author content in Python using `reportlab` for the PDF (registered DejaVu Sans for accents, proper headings/tables/TOC) and `python-docx` (or docx-js) for the Word file — same content, formatted for each medium.
- Include a small ASCII/mermaid-style architecture diagram rendered as text blocks.
- Run mandatory QA: convert PDF pages to images and inspect for clipping/overlap; regenerate DOCX->PDF preview via LibreOffice and inspect.
- No app code changes.

Approve to generate.
