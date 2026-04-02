

# Change Agent Commission Benefits Tab Color to #7214c9

## Change

Update the "Agent Commission Benefits" menu item in `src/components/DashboardHeader.tsx` to use `#7214c9` instead of the default `primary` color.

### File: `src/components/DashboardHeader.tsx` (lines 223-224)

Replace:
```tsx
<div className="p-1.5 rounded-lg bg-primary/10">
  <Coins className="h-4 w-4 text-primary" />
</div>
```
With:
```tsx
<div className="p-1.5 rounded-lg" style={{ backgroundColor: 'rgba(114, 20, 201, 0.1)' }}>
  <Coins className="h-4 w-4" style={{ color: '#7214c9' }} />
</div>
```

### Files Modified
- `src/components/DashboardHeader.tsx`

