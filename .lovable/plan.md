

## Refactor Deposit Dialog for Speed

### Problem
The deposit submission is slow due to heavy framer-motion animations, and the form does unnecessary work. The network logs also show excessive polling of `deposit_requests`, `withdrawal_requests`, and `money_requests` HEAD requests happening repeatedly on the wallet page, competing with the deposit insert.

### Plan

#### 1. Strip heavy animations from DepositDialog
- Remove `framer-motion` imports and all `motion.div` wrappers, `variants`, `formVariants`, `itemVariants`
- Replace with plain `div` elements -- the dialog already has open/close transitions from Radix
- Remove the `timeoutSignal` helper (unused after previous changes)
- This eliminates JS overhead during render and interaction

#### 2. Simplify the submit handler
- The current flow: validate -> insert -> wait for response -> show success
- Keep it exactly as-is but remove the `console.log` diagnostic lines for production cleanliness
- The insert is already a single Supabase call with no timeout -- this is correct

#### 3. Reduce competing network requests on the wallet page
- Identify where the repeated HEAD requests to `deposit_requests?status=eq.pending`, `withdrawal_requests?status=eq.pending`, `money_requests?status=eq.pending` originate (likely polling or multiple re-renders)
- These fire ~20+ times in the network log snapshot, competing for bandwidth on 2G/3G connections
- Find the wallet page component and ensure these queries use proper React Query `staleTime` (10min per architecture) so they don't re-fire on every render

#### Files to modify
- `src/components/wallet/DepositDialog.tsx` -- remove framer-motion, simplify to plain HTML/Radix
- Wallet page component (need to identify) -- fix excessive polling of pending counts

### Technical Details
- The framer-motion `AnimatePresence`, `motion.div`, staggered children, and spring transitions add significant JS overhead on low-end devices (Tecno, Itel)
- The success state can use a simple conditional render instead of `AnimatePresence mode="wait"`
- The provider cards, quick amounts, and form fields don't need individual animation variants
- Keeping the transaction ID live-check (debounced 600ms) as-is since it's already efficient

