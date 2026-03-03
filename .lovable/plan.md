

## Plan: Add Payment Merchant Codes Below Username

The user profile greeting section currently shows: Avatar → "Welcome back" → Name + Verified badge. The goal is to add MTN and Airtel merchant codes below the username in a compact, tap-to-copy pill design — similar to how fintech apps show quick-access account numbers.

### Design Approach

Below the name + verified badge line, add a row of two compact merchant code pills:

```text
Welcome back 👋
SSENKAALI ✓ Verified

  [🟡 MTN  090777 📋]  [🔴 Airtel  4380664 📋]
```

Each pill:
- Small rounded chip/badge style (not full cards)
- Left: colored dot or small logo indicator (yellow for MTN, red for Airtel)
- Center: provider abbreviation + merchant code in mono font
- Right: tiny copy icon
- Tap → copies code to clipboard + shows toast confirmation
- Subtle border, no heavy backgrounds — keeps the greeting area clean

### Implementation

**File: `src/components/supporter/MerchantCodePills.tsx`** (new)
- Standalone component with two pills for MTN (090777) and Airtel (4380664)
- `navigator.clipboard.writeText()` on tap with sonner toast feedback
- Compact sizing: `h-7 text-[11px] px-2 rounded-full` with `font-mono` for the code
- Uses existing `Copy` / `CheckCircle2` icons from lucide

**File: `src/components/dashboards/SupporterDashboard.tsx`** (edit)
- Import and place `<MerchantCodePills />` directly below the name/verified line (after line 329, inside the `<div>` wrapper)
- No layout changes needed — it naturally stacks below the name

### Visual Details
- MTN pill: yellow-500 left dot, subtle yellow border
- Airtel pill: red-500 left dot, subtle red border
- Both use `bg-muted/50` background for a soft, non-intrusive look
- Gap between pills: `gap-1.5`, row uses `flex flex-wrap`
- Copied state: icon briefly switches to checkmark for 1.5s

