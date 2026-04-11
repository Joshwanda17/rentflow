

# Plan: Generate Welile Platform Technical Documentation (DOCX)

## What
Create a comprehensive DOCX document covering the entire Welile platform — backend logic, frontend UI design, and system architecture — suitable for stakeholders, developers, and auditors.

## Document Structure
1. **Executive Summary** — Platform overview, mission, business model
2. **System Architecture** — 4-layer architecture (Client, API, Core Services, Database)
3. **Frontend Application** — PWA tech stack, role-based dashboards (5 public + 11 admin), routing, offline-first strategy, lazy loading
4. **Backend Logic** — 90+ Edge Functions organized by domain (finance, rent, agent, supporter, HR, operations), ledger-first financial pipeline, double-entry enforcement
5. **Database Design** — 145 tables, RLS security, ledger tables, wallet mutation guards, treasury controls
6. **Authentication & Role System** — 15 roles, public vs staff gating, atomic role switching, RoleGuard component
7. **Financial Architecture** — 4-layer security fortress, create_ledger_transaction RPC, wallet sync triggers, treasury controls
8. **Key Business Flows** — Rent approval pipeline (6 stages), tenant billing, agent commissions, supporter ROI, Angel Pool
9. **Security Architecture** — RLS on all tables, ledger write guards, wallet mutation guards, audit logging
10. **Scaling & Performance** — Snapshot caching, network-adaptive query config, service worker, offline queues

## Technical Approach
- Use `docx-js` (Node.js) to generate a professional DOCX with proper headings, tables, and styling
- Write to `/mnt/documents/Welile_Platform_Documentation.docx`
- QA by converting to images and inspecting

## Files Referenced
- `SYSTEM_ARCHITECTURE.md`, `src/App.tsx` (routing), `src/hooks/useAuth.tsx`, `src/lib/roleConstants.ts`
- `supabase/functions/` (90+ edge functions), `src/components/dashboards/` (5 dashboards)
- `src/core/services/`, `src/lib/formContracts/`, `src/components/auth/RoleGuard.tsx`
- Database schema (145 tables from security tool)
- All memory context (financial architecture, ledger enforcement, role management, etc.)

