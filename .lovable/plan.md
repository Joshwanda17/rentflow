

## Plan: Internship Application Funnel (Landing + Form + Auth Integration)

### What Gets Built

1. **New page: `/internship`** — Public landing + application form (no auth required)
2. **Agent sidebar link** — "Internship Program" item in `AgentMenuDrawer`
3. **Auth page integration** — Detect `?source=internship` and auto-highlight "I want to earn and learn", pre-fill name/phone/email from query params
4. **Fix Auth page** — Update agent role label from "I want to hustle" to "I want to earn and learn"
5. **Store submissions** — Save to a new `internship_applications` table for tracking

### Page Structure: `/internship`

Single-page layout, mobile-first, no auth:

- **Hero section**: "Earn While You Learn with Welile" + subtitle about skills, income, experience
- **Benefits cards**: 3 quick cards (Skills, Income, Experience)
- **Application form** (inline, not a separate step):
  - Full Name (required)
  - Phone Number (required)
  - Email (required)
  - "Why do you want to join Welile?" (required, textarea)
  - "What skills do you have?" (optional, textarea)
  - "Are you ready to learn and actively participate?" (required, Yes/No radio)
  - Referral Code (optional)
- **CTA button**: "Start My Journey"
- **On submit**: Save to `internship_applications` table, then redirect to `/auth?source=internship&intent=earn&role=agent&name=...&email=...&phone=...`

### Database

New table `internship_applications`:
- `id` (uuid, PK)
- `full_name` (text, not null)
- `phone` (text, not null)
- `email` (text)
- `motivation` (text)
- `skills` (text)
- `ready_to_learn` (boolean)
- `referral_code` (text)
- `created_at` (timestamptz)
- No RLS needed (public insert, admin-only read)

### Auth Page Changes

- Detect `source=internship` query param
- Auto-select agent role ("I want to earn and learn")
- Pre-fill fullName, phone, email from query params
- Auto-switch to sign-up mode
- Update `ROLE_OPTIONS` agent label from "I want to hustle" to "I want to earn and learn"

### Agent Sidebar

Add to the "More" category in `AgentMenuDrawer`:
```
{ icon: GraduationCap, label: 'Internship Program', description: 'Earn while you learn', path: '/internship' }
```

### Files Modified/Created

- **New**: `src/pages/Internship.tsx` — Landing + form page
- **Edit**: `src/App.tsx` — Add `/internship` route
- **Edit**: `src/components/agent/AgentMenuDrawer.tsx` — Add sidebar link
- **Edit**: `src/pages/Auth.tsx` — Update agent label, handle internship source + pre-fill
- **Migration**: Create `internship_applications` table

