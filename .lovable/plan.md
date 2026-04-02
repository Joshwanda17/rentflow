

# Replace "Active" Badge with White Check Icon

## Change

In `src/components/supporter/FunderCapitalOpportunities.tsx`, replace the `<Badge>Active</Badge>` on the Tenant Support tab (lines 282–286) with a white `Check` icon from lucide-react.

### File: `src/components/supporter/FunderCapitalOpportunities.tsx`

**Line 282–286** — Replace:
```tsx
{portfolioCount >= 1 && (
  <Badge variant="success" size="sm" className="ml-1 text-[8px] px-1.5 py-0 uppercase tracking-wider">
    Active
  </Badge>
)}
```
With:
```tsx
{portfolioCount >= 1 && (
  <Check className="h-3.5 w-3.5 text-white" />
)}
```

Add `Check` to the existing lucide-react import.

### Files Modified
- `src/components/supporter/FunderCapitalOpportunities.tsx`

