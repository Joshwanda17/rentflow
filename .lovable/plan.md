# Flutter Rebuild Workflow — Codex-Ready Specification

## Goal

Produce a single importable workflow package at `/mnt/documents/welile-flutter-workflow/` that Codex (and a human Flutter engineer) can follow to rebuild the Welile app natively in Flutter while matching the **exact look and feel, theme, and data flow** of the current web application.

The output is **documentation + machine-readable specs only** — no Flutter code is added to this repo.

---

## What gets generated

```text
/mnt/documents/welile-flutter-workflow/
├── README.md                          Entry point + how Codex should consume this
├── 00-codex-workflow.yaml             Step-by-step guided workflow Codex executes
├── 01-architecture.md                 Layered architecture (UI → Repo → API → Supabase)
├── 02-design-system.md                Colors, typography, spacing, radii, shadows, motion
├── 03-theme/
│   ├── theme_tokens.json              Machine-readable design tokens (light + dark)
│   ├── app_theme.dart                 Drop-in ThemeData (Material 3) for both modes
│   └── color_swatches.md              Visual reference of every semantic color
├── 04-component-mapping.md            Web component → Flutter widget equivalence table
├── 05-api/
│   ├── base.md                        Base URL, headers, auth contract, errors, CORS
│   ├── auth.md                        Email/password, Google, Apple, OTP, password reset
│   ├── endpoints.md                   All 137 Edge Functions grouped by domain
│   ├── catalog.json                   Copied from existing /mnt/documents/welile-api-docs
│   └── dart-client/
│       ├── welile_api_client.dart     Reference Dart client skeleton (Dio + Supabase)
│       └── auth_repository.dart       Reference auth repository
├── 06-data-models.md                  Core domain models (Profile, Wallet, Ledger, etc.)
├── 07-screens.md                      Screen inventory mapped to web routes & roles
├── 08-state-management.md             Riverpod structure, offline cache, realtime
├── 09-security-and-compliance.md      RLS rules, role gating, UGX, audit, trust score
└── 10-acceptance-checklist.md         Per-feature done criteria for Codex self-verify
```

---

## Workflow sections (high level)

### 1. Codex workflow file (`00-codex-workflow.yaml`)
A guided, step-ordered YAML Codex can iterate through. Each step has: `id`, `title`, `inputs`, `outputs`, `acceptance`, `references` (links to the other docs). Phases:

1. Project bootstrap (Flutter 3.x, packages: `supabase_flutter`, `flutter_riverpod`, `go_router`, `dio`, `freezed`, `flutter_secure_storage`, `google_sign_in`, `sign_in_with_apple`, `intl`, `cached_network_image`).
2. Apply theme + tokens from `03-theme/`.
3. Implement auth flows from `05-api/auth.md`.
4. Implement repositories per domain (wallet, rent, agent, supporter, executive).
5. Build screens in role order (tenant → landlord → agent → supporter → staff → executive).
6. Wire offline cache + realtime channels.
7. Run acceptance checklist.

### 2. API integration spec (`05-api/`)
Sourced from the existing `/mnt/documents/welile-api-docs/` (137 endpoints already documented) and re-shaped for Flutter consumers:

- **Base URL**: `https://wirntoujqoyjobfhyelc.functions.supabase.co`
- **Supabase URL**: `https://wirntoujqoyjobfhyelc.supabase.co`
- **Anon key** (publishable, safe to ship): the `VITE_SUPABASE_PUBLISHABLE_KEY` value from `.env`
- **Project ref**: `wirntoujqoyjobfhyelc`
- **Headers**: `apikey: <ANON_KEY>`, `Authorization: Bearer <USER_JWT>`, `Content-Type: application/json`
- **Auth flows**: email/password (signUp/signIn), Google OAuth, Apple OAuth, phone OTP (via `sms-otp` + `otp-login` edge functions), password reset (`resetPasswordForEmail` → `/update-password`), WhatsApp magic link (`whatsapp-login-link`).
- **Endpoint catalog**: full list of 137 functions grouped into 14 domains (Auth, Wallet & Ledger, Rent, Agent, Supporter, Tenant, Landlord, Partner Ops, Financial Ops, Executive, HR, Notifications, AI, Utility). Each entry: method, path, required role, request shape, response shape, sample `curl`, sample Dart call.
- **Realtime channels**: `wallets`, `notifications`, `system_events` — Flutter equivalents using `supabase.channel(...).on(...)`.
- **RPCs to call from Flutter**: `get_user_available_balance`, `has_role`, `capture_trust_signal`, `create_ledger_transaction` (via edge functions only — never direct).

### 3. Theme & design system (`02-design-system.md` + `03-theme/`)
Extracted verbatim from `src/critical.css` and `tailwind.config.ts`:

**Brand color** (Welile purple): `hsl(271 81% 56%)` → `#8B3DD9`

| Token | Light | Dark |
|---|---|---|
| primary | `271 81% 56%` `#8B3DD9` | `271 81% 65%` `#A968E3` |
| background | `210 20% 98%` `#F8F9FB` | `222 47% 8%` `#0B1020` |
| foreground | `222 47% 11%` `#0F172A` | `210 20% 98%` `#F8F9FB` |
| card | `#FFFFFF` | `#141A2E` |
| success | `142 71% 45%` `#1FAD52` | `142 71% 50%` `#23C75D` |
| warning | `38 92% 50%` `#F5A105` | `38 92% 55%` `#F7AE26` |
| destructive | `0 72% 51%` `#DC2A2A` | same |
| border | `220 13% 91%` `#E3E6EC` | `222 30% 18%` `#1F2740` |
| header-bg | primary | `271 81% 35%` `#5C2092` |
| gradient | 271 81% 56% → 271 81% 45% | 65% → 50% |

Radius: `0.75rem` (12px) base, sm 8, md 10, lg 12, xl 16, 2xl 20.
Shadows: soft `0 1px 2px rgba(0,0,0,.04)`, card `0 1px 3px + 0 4px 12px`, glow `0 0 20px hsl(primary/.25)`.
Typography: **Plus Jakarta Sans** (display + body), **JetBrains Mono** (numbers/balances). Numeric values use `fontFeatures: [FontFeature.tabularFigures()]`.
Motion: 150 ms standard, easing `Curves.easeOutCubic`, press scale `0.98`, hover lift `-1px`.
Mobile patterns to preserve: WhatsApp-style sticky purple header, list items with left icon + title + trailing meta, FAB at bottom-right (above bottom-nav), bottom sheets for actions, pull-to-refresh, skeleton loaders.

Deliverable: `app_theme.dart` exporting `lightTheme` and `darkTheme` `ThemeData` (Material 3, `useMaterial3: true`, `colorScheme.fromSeed(seedColor: Color(0xFF8B3DD9))` overridden with the tokens above) plus `WelileColors`, `WelileSpacing`, `WelileRadii`, `WelileTextStyles` constant classes.

### 4. Component mapping (`04-component-mapping.md`)
Side-by-side table, e.g.:

| Web (shadcn/Tailwind) | Flutter |
|---|---|
| `<Card>` `.elevated-card` | `Card(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), surfaceTintColor: Colors.transparent)` wrapped in `Material` with the card shadow |
| `<Button variant="default">` | `FilledButton` with primary color |
| `<Button variant="outline">` | `OutlinedButton` |
| `.wa-header` | `AppBar` with `backgroundColor: WelileColors.headerBg`, white foreground |
| `.wa-fab` | `FloatingActionButton.extended` |
| `<Sheet>` | `showModalBottomSheet` with rounded top |
| Sonner toast | `flutter_toastification` or `ScaffoldMessenger` snackbar styled to match |
| `<Tabs>` | `TabBar` + `TabBarView` |
| `<Dialog>` | `showDialog` + `AlertDialog` |
| Skeleton | `shimmer` package with muted color |
| `lucide-react` icons | `lucide_icons` Flutter package |

### 5. Screens & roles (`07-screens.md`)
Mapped from `src/pages/` and `src/components/dashboards/`. Lists every route, the role(s) that see it, the data sources (queries + edge functions), and the Flutter screen filename to create. The 15 roles from memory are honored (Tenant, Landlord, Agent, Lending Agent, Supporter, Partner, Funder, Tenant Ops, Landlord Ops, Partner Ops, Financial Ops, HR, COO, CFO, CEO, CMO, CTO, Manager).

### 6. State, offline, realtime (`08-state-management.md`)
- **Riverpod** for DI + state.
- **`supabase_flutter`** for auth, realtime, storage.
- **`hive` + `flutter_secure_storage`** for offline cache (non-financial data only — financial data is network-first per `SYSTEM_ARCHITECTURE.md`).
- Background sync queue for offline agent collections (mirrors `src/lib/offlineCollectionDrafts.ts`).
- Realtime: subscribe to `wallets` and `notifications` only; never trust cached financial values — refetch on transition.

### 7. Security & compliance (`09-security-and-compliance.md`)
- UGX-only formatting helper.
- Role check via `has_role` RPC, never client-side flags.
- Trust score signals (`capture_trust_signal`) emitted on every observable user action.
- Withdrawal gate strictly through `get_user_available_balance`.
- Mandatory ≥10-char reason on privileged actions.
- Terminology: "Rent Plan", "Supporter", "Returns" (no "Loan", "Lender", "ROI" in UI).

### 8. Acceptance checklist (`10-acceptance-checklist.md`)
Per-screen and per-flow Done criteria Codex can self-verify (e.g. "Login with Google succeeds and routes to role-correct dashboard", "Wallet headline equals `get_user_available_balance` to the shilling", "Dark theme matches token table within ΔE < 2").

---

## Technical execution

A Python generator script at `/tmp/gen_flutter_workflow.py` will:

1. Read `src/critical.css`, `tailwind.config.ts`, `src/index.css` → emit `theme_tokens.json` + `app_theme.dart` + `02-design-system.md`.
2. Read `/mnt/documents/welile-api-docs/catalog.json` + 137 markdown files → emit `05-api/endpoints.md` and copy `catalog.json`.
3. Walk `src/pages/` and `src/components/dashboards/` → emit `07-screens.md` route table.
4. Emit static templated files for the architecture, component mapping, state, security, acceptance, and the Codex YAML workflow.
5. QA pass: re-open every generated `.md`, assert non-empty + minimum section count; print a summary.

Final deliverables surfaced as `<lov-artifact>` tags so the user can download:
- `welile-flutter-workflow.zip` (whole bundle)
- `00-codex-workflow.yaml`
- `app_theme.dart`
- `theme_tokens.json`

## Out of scope

- Writing actual Flutter screens or compiling a Flutter project.
- Modifying any file in this web codebase.
- Re-deriving API contracts from scratch — we reuse the existing 137-endpoint docs already in `/mnt/documents/welile-api-docs/`.
