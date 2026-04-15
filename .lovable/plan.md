

## Plan: Add Internship Program Link to Agent Header Menu

### What changes

**File: `src/components/DashboardHeader.tsx`**

Add a new dropdown menu item for "Internship Program" inside the `currentRole === 'agent'` block, right after the "Agent Commission Benefits" item (around line 229). It will use a `GraduationCap` icon and navigate to `/internship`. No authentication needed since `/internship` is already a public route.

```
- Import GraduationCap from lucide-react
- Add menu item after Agent Commission Benefits:
  icon: GraduationCap (purple themed to match)
  label: "Internship Program"  
  onClick: navigate('/internship')
  Visible only for agent role
```

Single file edit, minimal change.

