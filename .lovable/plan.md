

Looking at `TenantWalletHeroCard.tsx`, the card uses `.portfolio-hero-card` class for the background and hardcoded `text-white` / `text-white/XX` / `bg-white/XX` throughout. When the background token resolves light, white text disappears.

Need to verify `.portfolio-hero-card` definition and confirm `--primary` is dark so `text-primary-foreground` is the right token.
<lov-tool-use id="toolu_vrtx_01X97CWTABZ7xg4Kad5gGCVW" name="code--search_files" integration-id="code" data="{\"query\": \"portfolio-hero-card\", \"include_patterns\": \"*.css\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_0117CBdJoEQ9anfs7shMNDJe" name="code--search_files" integration-id="code" data="{\"query\": \"portfolio-hero-card\", \"include_patterns\": \"*.css,*.tsx\"}">
</lov-tool-use>
The CSS has the dark gradient defined. The screenshot shows white-on-white which means the gradient isn't applying — likely the screenshot is from the `TenantWalletHeroCard` rendering correctly in CSS but the user sees broken theme. Actually since gradient exists, the issue is the user wants `text-white` swapped for semantic tokens regardless.

<lov-plan>
## Plan: Replace hardcoded `text-white` with semantic tokens in hero cards

The `.portfolio-hero-card` CSS sets `color: hsl(var(--primary-foreground))` and a purple gradient background, but the children override with hardcoded `text-white` / `bg-white/*`. When the gradient fails to render (theme/CSS variable conflict), white text becomes invisible on light surfaces.

### Fix
Swap hardcoded white classes for semantic tokens that resolve correctly against `--primary-foreground`:
- `text-white` → `text-primary-foreground`
- `text-white/70`, `text-white/60`, `text-white/50`, `text-white/40` → `text-primary-foreground/70` etc.
- `bg-white/15`, `bg-white/10`, `bg-white/[0.06]`, `bg-white/[0.04]` → `bg-primary-foreground/15` etc.
- Keep accent colors (`text-emerald-300`, `text-amber-300`) as-is — those are intentional highlights.

### Files to update
1. `src/components/tenant/TenantWalletHeroCard.tsx` (the one in the screenshot)
2. `src/components/landlord/LandlordWalletHeroCard.tsx`
3. `src/components/agent/AgentWalletHeroCard.tsx`
4. `src/components/supporter/PortfolioSummaryCards.tsx`
5. `src/components/wallet/UnifiedWalletHeroCard.tsx`
6. `src/pages/AngelPool.tsx` (the inline hero block)

### Note on the CSS class itself
`.portfolio-hero-card` already declares `color: hsl(var(--primary-foreground))` — so even if a future theme tweak changes the gradient, text will stay readable because semantic tokens follow the foreground variable.

### Out of scope
- No layout, spacing, or copy changes.
- No changes to the gradient itself.
- Decorative `bg-white/*` overlays will be converted too so decorations remain visible on any background.
