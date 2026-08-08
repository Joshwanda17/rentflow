---
name: Canonical domain is welileapp.com
description: welileapp.com is the single canonical public domain; welile.tech and welilereceipts.com are legacy and must never appear in shipping code
type: constraint
---
The one canonical public origin is `https://welileapp.com`.

- Never hardcode an origin in components/functions — always use `getPublicOrigin()` (`src/lib/getPublicOrigin.ts`) on the client, or the canonical constant on the server.
- Legacy hostnames forbidden in shipping code (enforced by `scripts/guard-legacy-domain.mjs`): `welile.tech`, `welilereceipts.com`, `welilereciept.com`, `welilereceipts-com.lovable.app`.
- Overridable per deployment via `VITE_CANONICAL_ORIGIN` / `SITE_CANONICAL_DOMAIN`.

**Why:** shared links, SEO canonicals, sitemaps and email/SMS links must all resolve on the live domain.
