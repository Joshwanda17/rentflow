## Goal
Keep the existing three demo cards in `RentDiscountCarousel` (Modern Apartments / Family House / City Studio) but make tapping the image or title open the real house detail page (`/house/:id`) for a matching real listing, instead of opening the generic Available Houses sheet.

## Current behavior (verified)
- `src/components/tenant/RentDiscountCarousel.tsx` renders 3 hardcoded cards; tap fires `onSelectHouse`.
- `src/components/dashboards/TenantDashboard.tsx:794` wires `onSelectHouse` to `openHousesSheet()` — always opens the full unfiltered list.
- Route `/house/:id` exists (`src/App.tsx:529` → `HouseDetail`).
- "Apply X%" button is unchanged (still a cosmetic toast + localStorage).

## Changes

1. **Add a target house id per demo card** in `RentDiscountCarousel.tsx`:
   ```ts
   interface RentalCard { id; title; area; monthlyRent; image; houseId?: string }
   ```
   Leave `houseId` empty in code — it will be picked from real data at runtime (next step) so we don't ship stale UUIDs.

2. **Resolve each card to a real listing at render time.** Add a small `useDemoRentalTargets()` hook in the same file (or `src/hooks/useDemoRentalTargets.ts`) that queries `house_listings` once (React Query, 10 min stale) using `PUBLIC_HOUSE_LISTING_COLUMNS` and picks one `status='available'` listing per card by simple rules:
   - Modern Apartments → first available in `district ilike 'Kampala'` with `sub_county ilike 'Ntinda'` (fallback: any Kampala available).
   - Family House → first available in `district ilike 'Kabale'` (fallback: any non-Kampala available).
   - City Studio → first available in `sub_county ilike 'Bukoto'` (fallback: any Kampala available).
   Returns `Record<cardId, houseId | null>`.

3. **Update tap handler** in `RentDiscountCarousel.tsx`:
   - Replace the current `onClick={() => { hapticTap(); onSelectHouse?.(); }}` on the image/title button with:
     - If a resolved `houseId` exists → `navigate(`/house/${houseId}`)` (use `useNavigate` from react-router-dom).
     - Else → fall back to existing `onSelectHouse?.()` so the generic sheet still opens (keeps behavior safe when no matching listing exists).
   - Keep the aria-label pointing at the specific card title.

4. **No changes** to:
   - The "Apply X%" button (still toast + localStorage).
   - `TenantDashboard.tsx` wiring (fallback path still works).
   - Any backend, RLS, or ledger code.

## Files touched
- `src/components/tenant/RentDiscountCarousel.tsx` (add hook usage, navigate on tap)
- (optional) `src/hooks/useDemoRentalTargets.ts` if extracted

## Out of scope
- Replacing the demo cards with fully dynamic real listings.
- Applying the discount to a real rent plan.
- Any change to the "View All" / Available Houses sheet.
