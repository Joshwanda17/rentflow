## Goal
Change the back arrow button in the `/find-a-house` page header so it always navigates to `/dashboard/tenant`, instead of using browser history or falling back to `/`.

## Current state
In `src/pages/FindAHouse.tsx` (line ~screened at line 930), the back button currently uses:
```tsx
onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
```
This can send users to unrelated pages when they opened `/find-a-house` from a deep link, SMS, WhatsApp, or campaign redirect.

## Change
Update the `onClick` handler on the back button to unconditionally route to the tenant dashboard:
```tsx
onClick={() => navigate('/dashboard/tenant')}
```

## Files affected
- `src/pages/FindAHouse.tsx` — single line change in the header back arrow.

## Verification
- Build/typecheck via the harness.
- Optionally open `/find-a-house` in the preview and confirm the back arrow navigates to `/dashboard/tenant`.