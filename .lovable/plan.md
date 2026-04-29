## What's actually happening

Operator picks **Muwanguzi Fred** from the pending list. The recap card then shows:

- Depositor: Muwanguzi Fred ✅ (from the picked row)
- Amount: UGX 10,000 ✅ (from the picked row)
- Original provider: AIRTEL ✅ (from the picked row)
- TID: **TID146037804148** ❌ (this is what the operator **typed** into the input — *not* the picked row's actual transaction_id)

The actual deposit Fred submitted is in the database with TID **TID146038124944** (a typo — the operator transposed "78" vs "81").

When she clicks **Verify & Match**, `handleVerify` ignores the picked row entirely and searches `deposit_requests` for `transaction_id ILIKE '%146037804148%'`, returning zero rows → "No Matching Deposit Found".

So the recap card is **misleading**: it surfaces the typed TID right next to the picked depositor's real name and amount, making it look like everything will line up. The operator has every reason to believe the click should succeed.

## Fix (3 changes, one pass)

### 1. The recap shows the picked row's REAL TID, not the typed one

When a depositor is picked, the "About to verify" recap pulls `transaction_id` from `pending.find(p.id === pickedId)` and renders it. If the operator has also typed a TID:

- match → show the TID once with a green check
- mismatch → show both ("Picked: TID146038124944" vs "You typed: TID146037804148") in red, with a "Use picked" button that overwrites the input

This kills the illusion of agreement before the click ever happens.

### 2. Picked row is the source of truth for Verify & Match

Refactor `handleVerify` so that **when `pickedId` is set**, the verify path skips the typed-TID search entirely and goes straight to that row by id, then runs the existing amount-match/profile-resolve/show-as-MatchResult logic. The typed TID is only used as the search key when no row is picked.

This makes the picked-from-list flow click-and-approve, exactly as the operator expects.

### 3. The typed-TID search stays for the no-pick case

Keep the existing `transaction_id` ILIKE / numeric / notes triple-search untouched as the fallback when the operator pastes a TID without picking from the list. No regressions for the original flow.

## Files

- **Edited**: `src/components/financial-ops/TidVerification.tsx`
  - Replace the TID line in the recap (~line 1822) with picked-row TID + mismatch indicator + "Use picked" action.
  - Update `handleVerify` (~line 782) to take a fast-path when `pickedId` is set: fetch that one row and build the same `MatchResult` shape.
  - Drop the `tid` requirement when a row is picked (operator doesn't have to retype a TID that's already on the row).

No DB changes. No edge function changes. The downstream `commitApprove` already operates on `match.id` so it's unaffected.

## Verification

- Pick a row, leave TID blank, enter the amount, click Verify & Match → match found, approve works.
- Pick a row, type a *wrong* TID → recap card shows the conflict in red BEFORE clicking, with the picked TID as the source of truth.
- Don't pick a row, type any TID → existing fallback search runs unchanged.
