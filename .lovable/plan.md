

# Fix: Widen the Next Payout Date Input

The date input on the partner portfolio detail view (line 1622) is set to `w-36` which is too narrow — the date text gets clipped.

## Change

**File:** `src/components/coo/COOPartnersPage.tsx` (line 1622)

Change the input width from `w-36` to `w-48`:

```tsx
// Before
className="h-7 w-36 text-xs"

// After
className="h-7 w-48 text-xs"
```

One line change, no other files affected.

