

# Fix: Tooltip Label Mismatch in Agent Activity Chart

## Problem
The tooltip `formatter` checks `name === 'registrations'` and `name === 'earnings'`, but Recharts passes the `name` prop from each `<Bar>` component — which are `"New Agents"`, `"Earnings"`, and `"Collections"`. So the condition never matches `'registrations'`, causing all three series to display as "Collections" in the tooltip.

## Fix
**File:** `src/components/coo/AgentActivityChart.tsx` (lines 159-161)

Update the formatter to check against the display names that Recharts actually passes:

```typescript
formatter={(value: number, name: string) => {
  if (name === 'New Agents') return [value, 'New Agents'];
  return [`UGX ${value.toLocaleString()}`, name];
}}
```

This ensures:
- **New Agents** (purple) → shows count (no UGX prefix)
- **Earnings** (green) → shows `UGX X`
- **Collections** (orange) → shows `UGX X`

Single line change, no other files affected.

