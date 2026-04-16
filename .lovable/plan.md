

# Fix: Agent Rent Request "Submit" Button Not Working for Some Users

## Problem Identified

From the screenshot and code analysis, several issues cause the Submit button to appear functional but silently fail:

1. **Strict phone validation blocks submission silently** — The regex `^0[3-9][0-9]{8}$` requires exactly 10 digits. The screenshot shows "0789 999" (7 digits) which would fail. The toast error may be missed on mobile (small, auto-dismissing).

2. **LC1 phone is validated even when incomplete** — If an agent types a partial LC1 phone (e.g. "0789 999"), it passes the `lc1Phone.trim()` check but fails `isValidUgPhone`, blocking submission with only a brief toast.

3. **GPS timeout blocks some devices** — `enableHighAccuracy: true` with 20s timeout can hang on older phones. While GPS capture is separate from submit, agents on slow devices may experience UI freezes.

4. **No inline validation feedback** — All validation errors are toast-only. On mobile, toasts can be obscured by the keyboard or dismissed too quickly, making it seem like "nothing happens."

## Plan

### Step 1: Add inline validation indicators on the confirm step
- Show red border + helper text below each invalid field (tenant phone, landlord phone, LC1 phone) instead of relying solely on toasts.
- Highlight which specific field is blocking submission.

### Step 2: Make LC1 phone validation more lenient
- Allow LC1 phone to be empty OR valid 10-digit format. Don't block on partial input — if the agent typed something but it's incomplete, show a warning but allow submission (LC1 phone is supplementary data).

### Step 3: Add a visible error summary before submit
- When `handleSubmit` detects validation failures, display a persistent red alert box at the top of the confirm step listing all issues, so the agent can see exactly what needs fixing.

### Step 4: Prevent double-tap / loading state edge case
- Ensure the `loading` state is set immediately at the top of `handleSubmit` (before async operations) and cleared properly in all error paths to prevent the button from appearing stuck.

### Technical Details

**File**: `src/components/agent/AgentRentRequestDialog.tsx`

- Add `validationErrors` state array that gets populated by `handleSubmit` before returning early
- Render errors as a red alert box above the submit button
- Change LC1 phone validation: if `lc1Phone.trim()` has content but isn't valid, show warning but don't block
- Add red `border-destructive` class to inputs that failed validation
- Move `setLoading(true)` above all validation so the button shows "Submitting..." immediately, then `setLoading(false)` on validation failure

